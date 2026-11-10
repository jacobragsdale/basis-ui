//! The parallax engine for the browser.
//!
//! A [`Worker`] hosts tables and one protocol session inside a Web Worker. The
//! page sends it protobuf messages and gets the replies a native session gives,
//! byte for byte, which the transcript test checks. The worker never reads a
//! clock; callers pass times in.
//!
//! An app loads its own Arrow bytes within the row limit its caller passes: whole
//! with [`Worker::load_table`], or a piece at a time as they arrive, with
//! [`Worker::begin_load`] and the calls after it, so that a first load's views
//! show its rows batch by batch. Views export as Excel or CSV with
//! [`Worker::export_xlsx`] and [`Worker::export_csv`], which read the table the
//! worker already holds.

use std::collections::BTreeMap;
use std::io::Write;
use std::sync::{Arc, RwLock};

use parallax_engine::Staging;
use parallax_engine::format::Formatter;
use parallax_engine::{Table, TableOptions};
use parallax_export::{ExportSource, ReadTable, write_csv, write_xlsx};
use parallax_protocol::ipc::{Pieces, Step, StreamBatches, StreamSource, stream_rows_of};
use parallax_protocol::layout::Layout;
use parallax_session::{
    Catalog, LoadStatus, MemoryCatalog, Session, SharedTable, TableState, read_table,
};
use wasm_bindgen::prelude::*;

/// Bytes of CSV the worker hands the page at a time, so that an export never
/// holds the whole file in WebAssembly memory.
pub const CSV_CHUNK_BYTES: usize = 1 << 20;

/// The most rows one step of a load reads: a record batch is read a slice at
/// a time, so that a first load shows its first rows, and the worker answers
/// the page between steps, without waiting for the whole of a large batch.
pub const SLICE_ROWS: usize = 16_384;

/// How many times over a first load's rows grow between the publishes that
/// hand them to its views: each publish rebuilds every view and redraws it on
/// the page, which on a slow desktop costs more than reading the rows, so a
/// load of 1,000,000 rows publishes at 16,384, 65,536 and 262,144 rows, then at
/// its end.
pub const PUBLISH_GROWTH: u64 = 4;

/// The source time of a table whose source gave none, as frames carry it.
const NO_SOURCE_TIME: i64 = 0;

/// How a load of an app's Arrow bytes is keyed, stamped and limited.
#[derive(Clone, Debug)]
pub struct Load {
    /// The primary key column of a new table, so that reloads apply as diffs. A
    /// reload keeps the table's key.
    pub primary_key: Option<String>,
    /// When the app received the bytes, in microseconds since the Unix epoch.
    pub now_micros: i64,
    /// When the source was read, if the app says so outside the stream; it
    /// overrides the stream's own status. Without either the table has no
    /// source time, 0, rather than the time the bytes arrived, which would make
    /// data days old read as current.
    pub source_as_of_micros: Option<i64>,
    /// The most rows the table may hold; a stream of more is refused before it is
    /// decoded.
    pub max_rows: u64,
}

/// Where a load stands after a step, as the page reports it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Progress {
    /// The rows read so far.
    pub rows: u64,
    /// The rows the stream holds: counted from its headers when it was whole
    /// before any of it was read, or else estimated from the bytes the page
    /// expects and the rows those read so far hold; `None` when neither is known.
    pub expected_rows: Option<u64>,
    /// Whether `expected_rows` is an estimate.
    pub estimated: bool,
    /// Whether the rows read so far show in the table's views: a first load's
    /// do, published batch by batch; a reload's views keep the table before it
    /// until it ends and applies whole.
    pub shown: bool,
    /// Whether this step published rows to the views, which the next refresh
    /// brings them.
    pub published: bool,
    /// Whether the next message has not all arrived, so the step read nothing.
    pub waiting: bool,
    /// Whether the stream has ended: finish the load.
    pub ended: bool,
}

impl Progress {
    /// The progress as a JavaScript object of the same fields, in camel case;
    /// `expectedRows` is null when unknown.
    fn to_js(self) -> JsValue {
        let object = js_sys::Object::new();
        let set = |key: &str, value: JsValue| {
            js_sys::Reflect::set(&object, &JsValue::from_str(key), &value)
                .expect("a plain object takes any field");
        };
        set("rows", JsValue::from_f64(self.rows as f64));
        set(
            "expectedRows",
            self.expected_rows
                .map_or(JsValue::NULL, |rows| JsValue::from_f64(rows as f64)),
        );
        set("estimated", JsValue::from_bool(self.estimated));
        set("shown", JsValue::from_bool(self.shown));
        set("published", JsValue::from_bool(self.published));
        set("waiting", JsValue::from_bool(self.waiting));
        set("ended", JsValue::from_bool(self.ended));
        object.into()
    }
}

/// A stream's pieces, as the page hands them over.
type Arriving = Pieces<Box<dyn StreamSource>>;

/// Where a load's rows go.
enum Target {
    /// A first load before its first record batch: the table is made from the
    /// stream's schema when the batch comes.
    First,
    /// A first load, which the table's views see as it arrives: the table is in
    /// the catalog, holding `shown` rows the views have been handed.
    Growing { state: SharedTable, shown: u64 },
    /// A reload of a table, staged whole and applied once the stream ends: until
    /// then its views keep the table as it was.
    Reload {
        existing: SharedTable,
        staging: Option<Staging>,
    },
}

/// A load under way.
struct Loading {
    batches: StreamBatches<Arriving>,
    load: Load,
    /// The stream's length, if the page knows it before it all arrives, as a
    /// response's `Content-Length` says.
    expected_bytes: Option<u64>,
    /// The rows, counted from the headers when the stream was whole before any
    /// of it was read.
    counted: Option<u64>,
    /// Whether a step has read the stream yet.
    started: bool,
    /// The rows staged or published.
    rows: u64,
    /// The rest of the record batch being read, from the row a step reaches next.
    pending: Option<(arrow_array::RecordBatch, usize)>,
    /// The rows the table or staging has room for: reserved once from the rows
    /// expected, and again only if the rows outgrow it, since each time copies
    /// every column.
    room: usize,
    /// The load's status from the schema's metadata, and its source time, once
    /// the schema is read.
    status: Option<(LoadStatus, i64)>,
    target: Target,
}

impl Loading {
    /// The rows the stream holds, counted or estimated, and whether estimated.
    fn expected(&self) -> (Option<u64>, bool) {
        if let Some(rows) = self.counted {
            return (Some(rows), false);
        }
        let read = self.batches.position();
        match self.expected_bytes {
            Some(bytes) if self.rows > 0 && read > 0 => {
                let estimate = (self.rows as f64 * bytes as f64 / read as f64).round() as u64;
                (Some(estimate.max(self.rows)), true)
            }
            _ => (None, false),
        }
    }

    fn progress(&self, published: bool, waiting: bool, ended: bool) -> Progress {
        let (expected_rows, estimated) = self.expected();
        Progress {
            rows: self.rows,
            expected_rows,
            estimated,
            shown: matches!(self.target, Target::Growing { .. }),
            published,
            waiting,
            ended,
        }
    }
}

/// Tables and a protocol session, for one page.
#[wasm_bindgen]
pub struct Worker {
    catalog: Arc<MemoryCatalog>,
    session: Session,
    /// The loads under way, by dataset.
    loads: BTreeMap<String, Loading>,
}

#[wasm_bindgen]
impl Worker {
    /// Creates a worker with no tables.
    #[wasm_bindgen(constructor)]
    #[must_use]
    pub fn new() -> Self {
        let catalog = Arc::new(MemoryCatalog::new());
        let session = Session::new(Arc::clone(&catalog) as Arc<dyn Catalog>);
        Self {
            catalog,
            session,
            loads: BTreeMap::new(),
        }
    }

    /// Loads or reloads dataset `name` from an app's Arrow IPC stream, all of it
    /// at once, as [`Worker::load`] does. Returns the table's rows. The stream
    /// stays in the page's memory: the load copies its headers to count its rows,
    /// then one message at a time into WebAssembly's.
    ///
    /// # Errors
    ///
    /// Returns the reason the load is refused.
    #[wasm_bindgen(js_name = loadTable)]
    pub fn load_table(
        &mut self,
        name: &str,
        arrow_ipc: &js_sys::Uint8Array,
        primary_key: Option<String>,
        now_micros: f64,
        source_as_of_micros: Option<f64>,
        max_rows: u32,
    ) -> Result<u64, JsError> {
        self.load(
            name,
            JsBytes(arrow_ipc.clone()),
            &load_of(primary_key, now_micros, source_as_of_micros, max_rows),
        )
        .map_err(|e| JsError::new(&e))
    }

    /// Starts loading or reloading dataset `name` from a stream whose bytes
    /// follow with [`Worker::add_load_bytes`], as [`Worker::begin`] does.
    /// `expected_bytes` is the stream's length, if the page knows it.
    ///
    /// # Errors
    ///
    /// Returns the reason the load cannot start.
    #[wasm_bindgen(js_name = beginLoad)]
    pub fn begin_load(
        &mut self,
        name: &str,
        primary_key: Option<String>,
        now_micros: f64,
        source_as_of_micros: Option<f64>,
        max_rows: u32,
        expected_bytes: Option<f64>,
    ) -> Result<(), JsError> {
        self.begin(
            name,
            load_of(primary_key, now_micros, source_as_of_micros, max_rows),
            expected_bytes.map(|b| b as u64),
        )
        .map_err(|e| JsError::new(&e))
    }

    /// Adds the next piece of a load's stream, which stays in the page's memory
    /// until a step reads past it.
    ///
    /// # Errors
    ///
    /// Returns an error if no load of `name` is under way.
    #[wasm_bindgen(js_name = addLoadBytes)]
    pub fn add_load_bytes(
        &mut self,
        name: &str,
        piece: &js_sys::Uint8Array,
    ) -> Result<(), JsError> {
        self.add_bytes(name, Box::new(JsBytes(piece.clone())))
            .map_err(|e| JsError::new(&e))
    }

    /// Says that every piece of a load's stream has come.
    ///
    /// # Errors
    ///
    /// Returns an error if no load of `name` is under way.
    #[wasm_bindgen(js_name = endLoadBytes)]
    pub fn end_load_bytes(&mut self, name: &str) -> Result<(), JsError> {
        self.end_bytes(name).map_err(|e| JsError::new(&e))
    }

    /// Reads the next record batch of a load, as [`Worker::step`] does, and
    /// returns where the load stands, as an object of [`Progress`]'s fields.
    ///
    /// # Errors
    ///
    /// Returns the reason the load is refused; it is then over.
    #[wasm_bindgen(js_name = stepLoad)]
    pub fn step_load(&mut self, name: &str) -> Result<JsValue, JsError> {
        self.step(name)
            .map(Progress::to_js)
            .map_err(|e| JsError::new(&e))
    }

    /// Ends a load whose stream has ended, as [`Worker::finish`] does, and
    /// returns the table's rows.
    ///
    /// # Errors
    ///
    /// Returns the reason the load is refused; it is then over.
    #[wasm_bindgen(js_name = finishLoad)]
    pub fn finish_load(&mut self, name: &str) -> Result<u64, JsError> {
        self.finish(name).map_err(|e| JsError::new(&e))
    }

    /// Gives up a load, as [`Worker::abandon`] does.
    #[wasm_bindgen(js_name = abandonLoad)]
    pub fn abandon_load(&mut self, name: &str) {
        self.abandon(name);
    }

    /// Writes the layout's view as an Excel workbook, held in memory, and returns
    /// its bytes. The layout names its dataset and parameters; `load_version` is
    /// the load the screen shows, and an export of any other load is refused. A
    /// view of more than `max_cells` cells is refused before anything is written,
    /// since each costs about 190 bytes of memory that WebAssembly never returns.
    ///
    /// # Errors
    ///
    /// Returns the reason the export cannot be made.
    #[wasm_bindgen(js_name = exportXlsx)]
    pub fn export_xlsx(
        &self,
        layout_json: &str,
        load_version: Option<f64>,
        max_cells: u32,
    ) -> Result<Vec<u8>, JsError> {
        let mut out = std::io::Cursor::new(Vec::new());
        self.write_xlsx_to(
            layout_json,
            load_version.map(|v| v as u64),
            max_cells as usize,
            &mut out,
        )
        .map_err(|e| JsError::new(&e))?;
        Ok(out.into_inner())
    }

    /// Writes the layout's view as CSV, handing `sink` the bytes in chunks of about
    /// [`CSV_CHUNK_BYTES`] as a `Uint8Array` each, and returns how many bytes it
    /// wrote. The layout and `load_version` work as in [`Worker::export_xlsx`].
    ///
    /// # Errors
    ///
    /// Returns the reason the export cannot be made, or the error `sink` threw.
    #[wasm_bindgen(js_name = exportCsv)]
    pub fn export_csv(
        &self,
        layout_json: &str,
        load_version: Option<f64>,
        sink: &js_sys::Function,
    ) -> Result<f64, JsError> {
        let mut chunks = Chunks::new(CSV_CHUNK_BYTES, |chunk: &[u8]| {
            sink.call1(&JsValue::NULL, &js_sys::Uint8Array::from(chunk))
                .map(|_| ())
                .map_err(|e| std::io::Error::other(describe(&e)))
        });
        self.write_csv_to(layout_json, load_version.map(|v| v as u64), &mut chunks)
            .map_err(|e| JsError::new(&e))?;
        Ok(chunks.written() as f64)
    }

    /// Handles one encoded client message and returns the encoded replies.
    #[must_use]
    pub fn handle(&mut self, message: &[u8]) -> js_sys::Array {
        to_array(self.session.handle_bytes(message))
    }

    /// Brings open views up to date with reloaded tables and returns the pushed
    /// messages.
    #[must_use]
    pub fn refresh(&mut self) -> js_sys::Array {
        use prost::Message;
        to_array(
            self.session
                .refresh()
                .iter()
                .map(Message::encode_to_vec)
                .collect(),
        )
    }
}

impl Worker {
    /// Loads or reloads dataset `name` from an app's Arrow IPC stream, all of it
    /// at once, and returns the table's rows: [`Worker::begin`], the whole stream
    /// as one piece, and a step at a time to its end.
    ///
    /// # Errors
    ///
    /// Returns the reason the load is refused, as [`Worker::step`] and
    /// [`Worker::finish`] do. A refused reload keeps the table as it was.
    pub fn load<S: StreamSource + 'static>(
        &mut self,
        name: &str,
        arrow_ipc: S,
        load: &Load,
    ) -> Result<u64, String> {
        self.begin(name, load.clone(), None)?;
        self.add_bytes(name, Box::new(arrow_ipc))?;
        self.end_bytes(name)?;
        while !self.step(name)?.ended {}
        self.finish(name)
    }

    /// Starts loading or reloading dataset `name` from a stream whose pieces
    /// follow, with [`Worker::add_bytes`] as they arrive and [`Worker::end_bytes`]
    /// once they all have; [`Worker::step`] reads them a record batch at a time,
    /// and [`Worker::finish`] ends the load.
    ///
    /// A first load shows as it arrives: its table joins the catalog with its
    /// first batch, and each step that publishes hands the rows read so far to
    /// its views, which the next [`Worker::refresh`] brings up to date. A reload
    /// of an existing dataset is staged whole and checked before it changes the
    /// table, so its views keep the table as it was until the load finishes, and
    /// a refused reload leaves it so. `expected_bytes` is the stream's length, if
    /// the page knows it, from which the rows expected are estimated.
    ///
    /// # Errors
    ///
    /// Returns an error if a load of `name` is already under way.
    pub fn begin(
        &mut self,
        name: &str,
        load: Load,
        expected_bytes: Option<u64>,
    ) -> Result<(), String> {
        if self.loads.contains_key(name) {
            return Err(format!(
                "{name} is already loading; wait for that load to end"
            ));
        }
        let target = match self.catalog.get(name) {
            Some(existing) => Target::Reload {
                existing,
                staging: None,
            },
            None => Target::First,
        };
        let max_rows = load.max_rows;
        self.loads.insert(
            name.to_owned(),
            Loading {
                batches: StreamBatches::open(Pieces::new()).with_row_limit(max_rows),
                load,
                expected_bytes,
                counted: None,
                started: false,
                rows: 0,
                pending: None,
                room: 0,
                status: None,
                target,
            },
        );
        Ok(())
    }

    /// Adds the next piece of a load's stream.
    ///
    /// # Errors
    ///
    /// Returns an error if no load of `name` is under way.
    pub fn add_bytes(&mut self, name: &str, piece: Box<dyn StreamSource>) -> Result<(), String> {
        self.loading(name)?.batches.source_mut().push(piece);
        Ok(())
    }

    /// Says that every piece of a load's stream has come.
    ///
    /// # Errors
    ///
    /// Returns an error if no load of `name` is under way.
    pub fn end_bytes(&mut self, name: &str) -> Result<(), String> {
        self.loading(name)?.batches.source_mut().end();
        Ok(())
    }

    /// Reads the next record batch of a load, if it has all arrived, and returns
    /// where the load stands.
    ///
    /// The first step of a stream that is whole counts its rows from the
    /// headers, and a stream of more than the load's `max_rows` is refused before
    /// any of it is decoded; a stream still arriving is refused at the first
    /// batch whose header takes it past them, before that batch is copied. Each
    /// batch is copied out of the page's pieces, decoded in place and added to
    /// the table or the reload's staging, then freed, as are the pieces read
    /// past; a step reads at most [`SLICE_ROWS`] rows of a batch, and the next
    /// step the rest. A first load publishes its first slice at once, then each
    /// time its rows have grown [`PUBLISH_GROWTH`] times over since, so its views
    /// rebuild a few times rather than once for each batch.
    ///
    /// # Errors
    ///
    /// Returns the reason the load is refused: too many rows, an invalid stream
    /// or status, or rows the table refuses. The load is then over: a first
    /// load's table leaves the catalog, and a refused reload keeps the table as it
    /// was, its views shown the failure.
    pub fn step(&mut self, name: &str) -> Result<Progress, String> {
        let stepped = self.step_once(name);
        if stepped.is_err() {
            self.abandon(name);
        }
        stepped
    }

    /// Ends a load whose stream has ended, and returns the table's rows. A first
    /// load publishes its last rows and counts the NaNs its status says the API
    /// blanked; a reload applies whole, as a diff for a keyed table, to its views
    /// at the next [`Worker::refresh`].
    ///
    /// # Errors
    ///
    /// Returns the reason the load is refused, such as keys a reload repeats; the
    /// load is then over, as a refused step's is.
    pub fn finish(&mut self, name: &str) -> Result<u64, String> {
        let finished = self.finish_once(name);
        if finished.is_err() {
            self.abandon(name);
        }
        finished.map_err(|e| format!("{name}: {e}"))
    }

    /// Gives up a load, as when its stream failed on its way to the page: a first
    /// load's table leaves the catalog, and a reload's table stays as it was.
    pub fn abandon(&mut self, name: &str) {
        if let Some(loading) = self.loads.remove(name)
            && !matches!(loading.target, Target::Reload { .. })
        {
            self.catalog.remove(name);
        }
    }

    fn loading(&mut self, name: &str) -> Result<&mut Loading, String> {
        self.loads
            .get_mut(name)
            .ok_or_else(|| format!("{name} has no load under way"))
    }

    fn step_once(&mut self, name: &str) -> Result<Progress, String> {
        let loading = self.loading(name)?;
        let most = loading.load.max_rows;
        let fix = "a table in the browser holds; have its API filter or aggregate the data to fit";
        let too_many = |rows: Option<u64>| match rows {
            Some(rows) => format!("{name} has {rows} rows, more than the {most} {fix}"),
            None => format!("{name} has more than the {most} rows {fix}"),
        };
        if !loading.started && loading.batches.source().is_whole() {
            let rows =
                stream_rows_of(loading.batches.source()).map_err(|e| format!("{name}: {e}"))?;
            if rows > most {
                return Err(too_many(Some(rows)));
            }
            loading.counted = Some(rows);
        }
        loading.started = true;
        let (batch, at) = match loading.pending.take() {
            Some(pending) => pending,
            None => {
                let step = match loading.batches.step() {
                    Ok(step) => step,
                    Err(_) if loading.batches.past_limit() => return Err(too_many(None)),
                    Err(error) => return Err(format!("{name}: {error}")),
                };
                let reached = loading.batches.position();
                loading.batches.source_mut().release(reached);
                match step {
                    Step::Waiting => return Ok(loading.progress(false, true, false)),
                    Step::End => return Ok(loading.progress(false, false, true)),
                    Step::Batch(batch) => (batch, 0),
                }
            }
        };
        // A slice of the batch, with the rest kept for the next steps: zero-copy.
        let length = (batch.num_rows() - at).min(SLICE_ROWS);
        let slice = batch.slice(at, length);
        if at + length < batch.num_rows() {
            loading.pending = Some((batch, at + length));
        }
        let published = self
            .take_batch(name, &slice)
            .map_err(|e| format!("{name}: {e}"))?;
        Ok(self.loading(name)?.progress(published, false, false))
    }

    /// Adds a record batch to its load, and returns whether it published rows.
    fn take_batch(&mut self, name: &str, batch: &arrow_array::RecordBatch) -> Result<bool, String> {
        let catalog = Arc::clone(&self.catalog);
        let loading = self.loads.get_mut(name).expect("a load under way");
        let schema = loading
            .batches
            .schema()
            .expect("a batch comes after the schema");
        if loading.status.is_none() {
            loading.status = Some(status_of(&schema, &loading.load)?);
        }
        let as_of = loading.status.as_ref().map_or(NO_SOURCE_TIME, |(_, t)| *t);
        let now = loading.load.now_micros;
        loading.rows += batch.num_rows() as u64;
        let rows = loading.rows;
        let needed = usize::try_from(rows).unwrap_or(usize::MAX);
        if needed > loading.room {
            loading.room = room_for(rows, loading.expected());
        }
        let room = loading.room;
        let locked = || "the table is unavailable after an internal error".to_owned();
        match &mut loading.target {
            Target::First => {
                let options = TableOptions {
                    primary_key: loading.load.primary_key.clone(),
                    ..TableOptions::default()
                };
                let mut table = Table::new(&schema, options).map_err(|e| e.to_string())?;
                table.reserve(room);
                let mut state = TableState::new(table, now, as_of);
                state.extend(batch).map_err(|e| e.to_string())?;
                state.publish();
                let state = Arc::new(RwLock::new(state));
                catalog.insert(name, Arc::clone(&state));
                loading.target = Target::Growing { state, shown: rows };
                Ok(true)
            }
            Target::Growing { state, shown } => {
                let mut state = state.write().map_err(|_| locked())?;
                state.table.reserve(room);
                state.extend(batch).map_err(|e| e.to_string())?;
                // Each time the rows have grown fourfold, so views rebuild, and the
                // page draws them, a few times rather than for each batch.
                let due = rows >= shown.saturating_mul(PUBLISH_GROWTH);
                if due {
                    state.publish();
                    *shown = rows;
                }
                Ok(due)
            }
            Target::Reload { existing, staging } => {
                let mut state = existing.write().map_err(|_| locked())?;
                let staging = staging.get_or_insert_with(|| state.table.staging(room));
                if let Err(error) = staging.push(batch) {
                    // Rows the table refuses are a failed refresh, which its views
                    // show; a broken stream never reached the table.
                    state.refused(&error, now);
                    return Err(error.to_string());
                }
                Ok(false)
            }
        }
    }

    fn finish_once(&mut self, name: &str) -> Result<u64, String> {
        let loading = self.loading(name)?;
        if !matches!(
            loading.batches.step().map_err(|e| e.to_string())?,
            Step::End
        ) {
            return Err("the load was finished before its stream ended".to_owned());
        }
        let loading = self.loads.remove(name).expect("a load under way");
        let schema = loading
            .batches
            .schema()
            .ok_or_else(|| "the stream has no schema".to_owned())?;
        let (status, as_of) = match loading.status {
            Some(status) => status,
            None => status_of(&schema, &loading.load)?,
        };
        let now = loading.load.now_micros;
        let locked = || "the table is unavailable after an internal error".to_owned();
        match loading.target {
            Target::First => {
                // A stream with no rows: an empty table of its schema.
                let options = TableOptions {
                    primary_key: loading.load.primary_key.clone(),
                    ..TableOptions::default()
                };
                let table = Table::new(&schema, options).map_err(|e| e.to_string())?;
                let staging = table.staging(0);
                let mut state = TableState::from_staging(table, staging, now, as_of)
                    .map_err(|e| e.to_string())?;
                state.count_upstream_nans(&status.nans_to_null);
                let rows = state.table.num_rows() as u64;
                self.catalog.insert(name, Arc::new(RwLock::new(state)));
                Ok(rows)
            }
            Target::Growing { state, .. } => {
                let mut state = state.write().map_err(|_| locked())?;
                state.finish_growth();
                state.count_upstream_nans(&status.nans_to_null);
                Ok(state.table.num_rows() as u64)
            }
            Target::Reload { existing, staging } => {
                let mut state = existing.write().map_err(|_| locked())?;
                let staging = staging.unwrap_or_else(|| state.table.staging(0));
                let report = state
                    .reload_staged(staging, now, as_of)
                    .map_err(|e| e.to_string())?;
                state.count_upstream_nans(&status.nans_to_null);
                Ok(report.rows as u64)
            }
        }
    }

    /// Writes the layout's view as an Excel workbook to `out`, refusing a view of
    /// more than `max_cells` cells.
    ///
    /// # Errors
    ///
    /// Returns the reason the export cannot be made.
    pub fn write_xlsx_to<W: Write + std::io::Seek + Send>(
        &self,
        layout_json: &str,
        load_version: Option<u64>,
        max_cells: usize,
        out: W,
    ) -> Result<(), String> {
        let (shared, layout, source) = self.export_source(layout_json, load_version)?;
        write_xlsx(&shared, &layout, &source, Some(max_cells), out).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Writes the layout's view as CSV to `out`, then flushes it.
    ///
    /// # Errors
    ///
    /// Returns the reason the export cannot be made.
    pub fn write_csv_to<W: Write>(
        &self,
        layout_json: &str,
        load_version: Option<u64>,
        mut out: W,
    ) -> Result<(), String> {
        let (shared, layout, source) = self.export_source(layout_json, load_version)?;
        write_csv(&shared, &layout, &source, &mut out).map_err(|e| e.to_string())?;
        out.flush().map_err(|e| format!("writing the export: {e}"))
    }

    /// Handles one encoded client message and returns the encoded replies, as
    /// [`Worker::handle`] does for JavaScript.
    #[must_use]
    pub fn handle_bytes(&mut self, message: &[u8]) -> Vec<Vec<u8>> {
        self.session.handle_bytes(message)
    }

    fn export_source(
        &self,
        layout_json: &str,
        load_version: Option<u64>,
    ) -> Result<(Shared, Layout, ExportSource), String> {
        let layout = Layout::from_json(layout_json).map_err(|e| e.to_string())?;
        // A first load's rows so far are not the table: a file has no status bar
        // to say more are coming.
        if self
            .loads
            .get(&layout.dataset)
            .is_some_and(|l| !matches!(l.target, Target::Reload { .. }))
        {
            return Err(format!(
                "{} is still loading; export it once it has loaded",
                layout.dataset
            ));
        }
        let table = self.catalog.open(&layout.dataset, &layout.parameters)?;
        let as_of_micros = read_table(&table)?.source_as_of_micros();
        let as_of = if as_of_micros == NO_SOURCE_TIME {
            "unknown".to_owned()
        } else {
            let time = Formatter::default().timestamp(as_of_micros, true);
            format!("{time} New York")
        };
        let source = ExportSource {
            dataset: layout.dataset.clone(),
            as_of,
            load_version,
        };
        Ok((Shared(table), layout, source))
    }
}

impl Default for Worker {
    fn default() -> Self {
        Self::new()
    }
}

/// A writer that hands its bytes on in chunks of at least `size` bytes, the last
/// one on flush, so that a large output is never held whole.
pub struct Chunks<F: FnMut(&[u8]) -> std::io::Result<()>> {
    buffer: Vec<u8>,
    size: usize,
    send: F,
    written: u64,
}

impl<F: FnMut(&[u8]) -> std::io::Result<()>> Chunks<F> {
    /// A writer that calls `send` with each chunk of about `size` bytes.
    pub fn new(size: usize, send: F) -> Self {
        Self {
            buffer: Vec::with_capacity(size),
            size,
            send,
            written: 0,
        }
    }

    /// The bytes handed on so far.
    #[must_use]
    pub fn written(&self) -> u64 {
        self.written
    }

    fn send_buffer(&mut self) -> std::io::Result<()> {
        if self.buffer.is_empty() {
            return Ok(());
        }
        (self.send)(&self.buffer)?;
        self.written += self.buffer.len() as u64;
        self.buffer.clear();
        Ok(())
    }
}

impl<F: FnMut(&[u8]) -> std::io::Result<()>> Write for Chunks<F> {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.buffer.extend_from_slice(bytes);
        if self.buffer.len() >= self.size {
            self.send_buffer()?;
        }
        Ok(bytes.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.send_buffer()
    }
}

/// How much an estimate of a stream's rows is raised before the table makes
/// room for them, in hundredths: the bytes read so far include the schema, so
/// the estimate falls a little short, and room that falls short at the last
/// batch doubles every column.
const ESTIMATE_MARGIN_PERCENT: u64 = 3;

/// The rows a load makes room for once it has read `rows`: those counted, or
/// those estimated with a margin, and never fewer than it has read.
fn room_for(rows: u64, (expected, estimated): (Option<u64>, bool)) -> usize {
    let expected = expected.map_or(rows, |e| {
        if estimated {
            e + e * ESTIMATE_MARGIN_PERCENT / 100
        } else {
            e
        }
    });
    usize::try_from(expected.max(rows)).unwrap_or(usize::MAX)
}

/// A load's status from its stream's schema, and its source time: the time the
/// page passes, or else the stream's, or else none.
fn status_of(schema: &arrow_schema::Schema, load: &Load) -> Result<(LoadStatus, i64), String> {
    let status = LoadStatus::from_schema(schema).map_err(|e| e.to_string())?;
    let as_of = load
        .source_as_of_micros
        .or(status.source_as_of_micros)
        .unwrap_or(NO_SOURCE_TIME);
    Ok((status, as_of))
}

/// A load's options, from the page's arguments.
fn load_of(
    primary_key: Option<String>,
    now_micros: f64,
    source_as_of_micros: Option<f64>,
    max_rows: u32,
) -> Load {
    Load {
        primary_key,
        now_micros: now_micros as i64,
        source_as_of_micros: source_as_of_micros.map(|m| m as i64),
        max_rows: u64::from(max_rows),
    }
}

/// Bytes the page holds, read from WebAssembly a piece at a time.
struct JsBytes(js_sys::Uint8Array);

impl StreamSource for JsBytes {
    fn len(&self) -> usize {
        self.0.length() as usize
    }

    fn read(&self, at: usize, out: &mut [u8]) {
        let end = at + out.len();
        self.0.subarray(at as u32, end as u32).copy_to(out);
    }
}

/// A table that exports read under its lock.
struct Shared(SharedTable);

/// A read lock on a shared table, seen as its table.
struct Guard<'a>(std::sync::RwLockReadGuard<'a, TableState>);

impl std::ops::Deref for Guard<'_> {
    type Target = Table;

    fn deref(&self) -> &Table {
        &self.0.table
    }
}

impl ReadTable for Shared {
    type Guard<'a> = Guard<'a>;

    fn read(&self) -> Result<Guard<'_>, String> {
        read_table(&self.0).map(Guard)
    }
}

/// What a JavaScript exception says.
fn describe(error: &JsValue) -> String {
    error
        .dyn_ref::<js_sys::Error>()
        .map_or_else(|| format!("{error:?}"), |e| String::from(e.message()))
}

fn to_array(messages: Vec<Vec<u8>>) -> js_sys::Array {
    messages
        .into_iter()
        .map(|m| JsValue::from(js_sys::Uint8Array::from(m.as_slice())))
        .collect()
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use std::collections::HashMap;

    use arrow_array::{Float64Array, Int64Array, RecordBatch, StringArray};
    use arrow_schema::{DataType, Field, Schema};
    use parallax_protocol::v1::{
        ClientMessage, OpenView, ServerMessage, SetViewport, TableStatus, client_message,
        server_message::Body,
    };
    use parallax_session::LOAD_METADATA;
    use prost::Message;

    use super::*;

    /// An app's stream of `rows` rows in batches of at most 1,000, with `status`
    /// in its schema metadata; every seventh price is NaN.
    fn stream(rows: i64, status: Option<&str>) -> Vec<u8> {
        stream_in(rows, 1_000, status)
    }

    /// [`stream`]'s rows in batches of at most `batch_rows`, and every eleventh
    /// ticker null.
    fn stream_in(rows: i64, batch_rows: i64, status: Option<&str>) -> Vec<u8> {
        let fields = vec![
            Field::new("id", DataType::Int64, false),
            Field::new("ticker", DataType::Utf8, true),
            Field::new("price", DataType::Float64, true),
        ];
        let metadata: HashMap<String, String> = status
            .map(|s| [(LOAD_METADATA.to_owned(), s.to_owned())].into())
            .unwrap_or_default();
        let schema = Arc::new(Schema::new_with_metadata(fields, metadata));
        let mut out = Vec::new();
        let mut writer = arrow_ipc::writer::StreamWriter::try_new(&mut out, &schema).unwrap();
        for start in (0..rows).step_by(batch_rows as usize) {
            let ids: Vec<i64> = (start..(start + batch_rows).min(rows)).collect();
            let batch = RecordBatch::try_new(
                Arc::clone(&schema),
                vec![
                    Arc::new(Int64Array::from(ids.clone())),
                    Arc::new(StringArray::from_iter(
                        ids.iter()
                            .map(|i| (i % 11 != 3).then(|| format!("T{}", i % 13))),
                    )),
                    Arc::new(Float64Array::from_iter_values(
                        ids.iter()
                            .map(|&i| if i % 7 == 0 { f64::NAN } else { i as f64 / 4.0 }),
                    )),
                ],
            )
            .unwrap();
            writer.write(&batch).unwrap();
        }
        writer.finish().unwrap();
        drop(writer);
        out
    }

    fn load(max_rows: u64) -> Load {
        Load {
            primary_key: None,
            now_micros: 5_000,
            source_as_of_micros: None,
            max_rows,
        }
    }

    fn send(worker: &mut Worker, request_id: u64, body: client_message::Body) -> Vec<Body> {
        let bytes = ClientMessage {
            request_id,
            body: Some(body),
        }
        .encode_to_vec();
        worker
            .handle_bytes(&bytes)
            .iter()
            .map(|reply| {
                ServerMessage::decode(reply.as_slice())
                    .unwrap()
                    .body
                    .unwrap()
            })
            .collect()
    }

    /// Opens a flat view of `dataset` and returns its status and first frame's
    /// source time.
    fn open(worker: &mut Worker, view_id: u32, dataset: &str) -> (TableStatus, i64) {
        let mut replies = send(
            worker,
            u64::from(view_id) * 2,
            client_message::Body::OpenView(OpenView {
                view_id,
                dataset: dataset.into(),
                parameters: HashMap::new(),
                layout_json: r#"{"version":1}"#.into(),
            }),
        );
        replies.extend(send(
            worker,
            u64::from(view_id) * 2 + 1,
            client_message::Body::SetViewport(SetViewport {
                view_id,
                first_row: 0,
                row_count: 10,
                first_column: 0,
                column_count: 3,
            }),
        ));
        let status = replies
            .iter()
            .find_map(|r| match r {
                Body::ViewOpened(o) => o.status.clone(),
                _ => None,
            })
            .unwrap_or_else(|| panic!("{replies:?}"));
        let as_of = replies
            .iter()
            .find_map(|r| match r {
                Body::Frame(f) => Some(f.source_as_of_micros),
                _ => None,
            })
            .unwrap_or_else(|| panic!("{replies:?}"));
        (status, as_of)
    }

    #[test]
    fn a_load_is_refused_past_the_row_limit_before_it_is_decoded() {
        let mut worker = Worker::new();
        assert_eq!(
            worker.load("at", stream(2_500, None), &load(2_500)),
            Ok(2_500)
        );
        let error = worker
            .load("past", stream(2_501, None), &load(2_500))
            .unwrap_err();
        assert_eq!(
            error,
            "past has 2501 rows, more than the 2500 a table in the browser holds; have its API filter or aggregate the data to fit"
        );
        // A stream whose headers claim more rows than its data holds is refused
        // by its headers alone.
        let mut cut = stream(3_000, None);
        cut.truncate(cut.len() / 2);
        assert!(worker.load("cut", cut, &load(2_500)).is_err());
        assert!(
            worker
                .load("garbage", b"not arrow".to_vec(), &load(10))
                .unwrap_err()
                .starts_with("garbage: ")
        );
    }

    #[test]
    fn the_status_comes_from_the_streams_metadata_unless_the_app_passes_it() {
        let mut worker = Worker::new();
        let status = r#"{"source_as_of_micros": 1200, "nans_to_null": [["price", 5]]}"#;
        worker
            .load("app", stream(70, Some(status)), &load(100))
            .unwrap();
        let (opened, as_of) = open(&mut worker, 1, "app");
        assert_eq!(as_of, 1_200);
        assert_eq!(opened.loaded_at_micros, 5_000);
        // Ten NaNs in the stream, every seventh of 70 rows, and five the API blanked.
        let nans: Vec<(String, u64)> = opened
            .nans_to_null
            .iter()
            .map(|c| (c.column.clone(), c.count))
            .collect();
        assert_eq!(nans, vec![("price".to_owned(), 15)]);
        // Without a status the table has no source time, never the time the app
        // received the bytes, and a time the app passes wins over the stream's.
        worker.load("plain", stream(10, None), &load(100)).unwrap();
        assert_eq!(open(&mut worker, 2, "plain").1, 0);
        let passed = Load {
            source_as_of_micros: Some(900),
            ..load(100)
        };
        worker
            .load("passed", stream(10, Some(status)), &passed)
            .unwrap();
        assert_eq!(open(&mut worker, 3, "passed").1, 900);
        // A malformed status refuses the load, naming the dataset.
        let bad = stream(10, Some(r#"{"nans_to_null": [["volume", 1]]}"#));
        assert_eq!(
            worker.load("bad", bad, &load(100)).unwrap_err(),
            "bad: the load status counts NaNs in volume, which the data does not have"
        );
    }

    #[test]
    fn a_second_load_reloads_the_table_for_its_open_views() {
        let mut worker = Worker::new();
        worker.load("app", stream(50, None), &load(100)).unwrap();
        let (first, _) = open(&mut worker, 1, "app");
        assert_eq!(first.rows, 50);
        let status = r#"{"source_as_of_micros": 7000}"#;
        assert_eq!(
            worker.load("app", stream(80, Some(status)), &load(100)),
            Ok(80)
        );
        let pushed: Vec<Body> = worker
            .session
            .refresh()
            .into_iter()
            .filter_map(|m| m.body)
            .collect();
        assert!(
            pushed
                .iter()
                .any(|b| matches!(b, Body::Frame(f) if f.total_rows == 80 && f.source_as_of_micros == 7_000)),
            "{pushed:?}"
        );
        // A reload past the limit leaves the table as it was.
        assert!(worker.load("app", stream(101, None), &load(100)).is_err());
        assert_eq!(open(&mut worker, 2, "app").0.rows, 80);
    }

    /// The total rows of each frame a refresh pushes.
    fn refreshed_rows(worker: &mut Worker) -> Vec<u64> {
        worker
            .session
            .refresh()
            .into_iter()
            .filter_map(|m| match m.body {
                Some(Body::Frame(f)) => Some(f.total_rows),
                _ => None,
            })
            .collect()
    }

    /// Steps a load until it waits or ends, and returns the progress of each
    /// step that read a batch.
    fn step_all(worker: &mut Worker, name: &str) -> Vec<Progress> {
        let mut read = Vec::new();
        loop {
            let progress = worker.step(name).unwrap();
            if progress.waiting || progress.ended {
                return read;
            }
            read.push(progress);
        }
    }

    #[test]
    fn a_first_load_shows_its_rows_as_they_arrive() {
        let bytes = stream(10_000, None);
        let mut worker = Worker::new();
        let keyed = Load {
            primary_key: Some("id".into()),
            ..load(20_000)
        };
        worker
            .begin("app", keyed, Some(bytes.len() as u64))
            .unwrap();
        let mut pieces = bytes.chunks(4_096);
        // Nothing shows before the first batch has all come.
        worker
            .add_bytes("app", Box::new(pieces.next().unwrap().to_vec()))
            .unwrap();
        assert!(step_all(&mut worker, "app").is_empty());
        assert!(worker.catalog.get("app").is_none());
        let mut shown = Vec::new();
        let mut opened = false;
        for piece in pieces {
            worker.add_bytes("app", Box::new(piece.to_vec())).unwrap();
            for progress in step_all(&mut worker, "app") {
                assert!(progress.shown && progress.estimated, "{progress:?}");
                // The estimate comes from the bytes: every batch is the same size.
                let expected = progress.expected_rows.unwrap();
                assert!((9_800..=10_200).contains(&expected), "{progress:?}");
                if !progress.published {
                    continue;
                }
                if opened {
                    shown.extend(refreshed_rows(&mut worker));
                } else {
                    // A view opens on the rows so far.
                    let (status, _) = open(&mut worker, 1, "app");
                    shown.push(status.rows);
                    opened = true;
                }
            }
        }
        // A file of the rows so far would read as the whole table.
        let layout = r#"{"version":1,"dataset":"app"}"#;
        let refused = worker.write_csv_to(layout, None, Vec::new()).unwrap_err();
        assert_eq!(
            refused,
            "app is still loading; export it once it has loaded"
        );
        worker.end_bytes("app").unwrap();
        assert!(worker.step("app").unwrap().ended);
        assert_eq!(worker.finish("app"), Ok(10_000));
        shown.extend(refreshed_rows(&mut worker));
        // Published at the first batch, then each time the rows grew fourfold, and at the end.
        assert_eq!(shown, vec![1_000, 4_000, 10_000]);
        assert!(worker.write_csv_to(layout, None, Vec::new()).is_ok());
        // A reload by key applies as a diff to the table the load grew.
        assert_eq!(
            worker.load("app", stream(10_000, None), &load(20_000)),
            Ok(10_000)
        );
    }

    #[test]
    fn a_large_batch_is_read_a_slice_at_a_time_into_the_same_table() {
        let rows = SLICE_ROWS as i64 * 2 + 500;
        let mut sliced = Worker::new();
        sliced.begin("app", load(100_000), None).unwrap();
        sliced
            .add_bytes("app", Box::new(stream_in(rows, rows, None)))
            .unwrap();
        sliced.end_bytes("app").unwrap();
        let read: Vec<(u64, bool)> = step_all(&mut sliced, "app")
            .iter()
            .map(|p| (p.rows, p.published))
            .collect();
        let slice = SLICE_ROWS as u64;
        assert_eq!(
            read,
            vec![(slice, true), (slice * 2, false), (rows as u64, false)]
        );
        assert_eq!(sliced.finish("app"), Ok(rows as u64));
        // The same rows in small batches, which no step slices, export the same.
        let mut whole = Worker::new();
        whole
            .load("app", stream_in(rows, 1_000, None), &load(100_000))
            .unwrap();
        let csv = |worker: &Worker| {
            let mut out = Vec::new();
            worker
                .write_csv_to(r#"{"version":1,"dataset":"app"}"#, None, &mut out)
                .unwrap();
            out
        };
        assert_eq!(csv(&sliced), csv(&whole));
    }

    #[test]
    fn a_whole_stream_is_counted_before_it_is_read_and_one_arriving_as_it_comes() {
        let mut worker = Worker::new();
        worker.begin("whole", load(5_000), None).unwrap();
        worker
            .add_bytes("whole", Box::new(stream(3_000, None)))
            .unwrap();
        worker.end_bytes("whole").unwrap();
        let first = worker.step("whole").unwrap();
        assert_eq!(
            (first.rows, first.expected_rows, first.estimated),
            (1_000, Some(3_000), false)
        );
        // A stream arriving is refused at the batch that takes it past the limit,
        // before that batch is read, and its table leaves the catalog.
        let bytes = stream(3_000, None);
        worker.begin("arriving", load(2_500), None).unwrap();
        let (first, rest) = bytes.split_at(bytes.len() - 108);
        worker
            .add_bytes("arriving", Box::new(first.to_vec()))
            .unwrap();
        assert_eq!(step_all(&mut worker, "arriving").len(), 2);
        assert!(worker.catalog.get("arriving").is_some());
        worker
            .add_bytes("arriving", Box::new(rest.to_vec()))
            .unwrap();
        assert_eq!(
            worker.step("arriving").unwrap_err(),
            "arriving has more than the 2500 rows a table in the browser holds; have its API filter or aggregate the data to fit"
        );
        assert!(worker.catalog.get("arriving").is_none());
        assert!(worker.step("arriving").is_err());
        // The same stream whole is refused by its count, before any of it is read.
        worker.begin("counted", load(2_500), None).unwrap();
        worker.add_bytes("counted", Box::new(bytes)).unwrap();
        worker.end_bytes("counted").unwrap();
        assert!(
            worker
                .step("counted")
                .unwrap_err()
                .starts_with("counted has 3000 rows")
        );
        assert!(worker.catalog.get("counted").is_none());
    }

    #[test]
    fn a_first_load_refused_part_way_leaves_no_table_behind() {
        let mut worker = Worker::new();
        let keyed = Load {
            primary_key: Some("id".into()),
            ..load(20_000)
        };
        // Ids 0 to 1,999, then 0 to 999 again.
        let mut bytes = stream(2_000, None);
        bytes.truncate(bytes.len() - 8);
        let again = stream(1_000, None);
        worker.begin("app", keyed.clone(), None).unwrap();
        worker.add_bytes("app", Box::new(bytes)).unwrap();
        assert_eq!(step_all(&mut worker, "app").len(), 2);
        // The second batch is read, and waits for the next publish.
        assert_eq!(open(&mut worker, 1, "app").0.rows, 1_000);
        // The second stream's schema message is not a batch: skip it.
        let schema_end = again.len() - stream_rows_body(&again);
        worker
            .add_bytes("app", Box::new(again[schema_end..].to_vec()))
            .unwrap();
        let error = worker.step("app").unwrap_err();
        assert!(
            error.starts_with("app: column id has 1000 duplicate primary keys"),
            "{error}"
        );
        assert!(worker.catalog.get("app").is_none());
        // A page that gives up a load leaves no table either, and loads again.
        worker.begin("app", keyed.clone(), None).unwrap();
        worker
            .add_bytes("app", Box::new(stream(2_000, None)))
            .unwrap();
        assert!(!step_all(&mut worker, "app").is_empty());
        worker.abandon("app");
        assert!(worker.catalog.get("app").is_none());
        assert_eq!(worker.load("app", stream(500, None), &keyed), Ok(500));
    }

    /// The bytes of a stream after its schema message.
    fn stream_rows_body(bytes: &[u8]) -> usize {
        let schema_only = stream(0, None);
        // The schema message, without the end-of-stream marker.
        bytes.len() - (schema_only.len() - 8)
    }

    #[test]
    fn a_reload_shows_nothing_until_it_has_all_arrived_and_been_checked() {
        let mut worker = Worker::new();
        let keyed = Load {
            primary_key: Some("id".into()),
            ..load(20_000)
        };
        worker.load("app", stream(50, None), &keyed).unwrap();
        assert_eq!(open(&mut worker, 1, "app").0.rows, 50);
        let bytes = stream(3_000, None);
        worker
            .begin("app", keyed.clone(), Some(bytes.len() as u64))
            .unwrap();
        worker.add_bytes("app", Box::new(bytes)).unwrap();
        let read = step_all(&mut worker, "app");
        assert_eq!(read.len(), 3);
        assert!(read.iter().all(|p| !p.shown && !p.published), "{read:?}");
        // The views still show the table as it was, and it exports.
        assert!(refreshed_rows(&mut worker).is_empty());
        let layout = r#"{"version":1,"dataset":"app"}"#;
        assert!(worker.write_csv_to(layout, None, Vec::new()).is_ok());
        worker.end_bytes("app").unwrap();
        assert!(worker.step("app").unwrap().ended);
        assert_eq!(worker.finish("app"), Ok(3_000));
        assert_eq!(refreshed_rows(&mut worker), vec![3_000]);
        // A reload whose last batch repeats a key is refused whole, and the views
        // keep the table as it was.
        let mut repeated = stream(2_000, None);
        repeated.truncate(repeated.len() - 8);
        let again = stream(1_000, None);
        repeated.extend_from_slice(&again[again.len() - stream_rows_body(&again)..]);
        assert!(
            worker
                .load("app", repeated, &keyed)
                .unwrap_err()
                .contains("duplicate primary keys")
        );
        assert!(refreshed_rows(&mut worker).is_empty());
        assert_eq!(open(&mut worker, 2, "app").0.rows, 3_000);
    }

    #[test]
    fn exports_read_the_loaded_table_and_csv_comes_in_chunks() {
        let mut worker = Worker::new();
        worker
            .load("app", stream(3_000, None), &load(10_000))
            .unwrap();
        let layout = r#"{"version":1,"dataset":"app"}"#;
        let mut whole = Vec::new();
        worker.write_csv_to(layout, None, &mut whole).unwrap();
        assert!(whole.starts_with("\u{feff}id,ticker,price\n".as_bytes()));
        let mut chunks: Vec<Vec<u8>> = Vec::new();
        let mut writer = Chunks::new(1_024, |chunk: &[u8]| {
            chunks.push(chunk.to_vec());
            Ok(())
        });
        worker.write_csv_to(layout, None, &mut writer).unwrap();
        assert_eq!(writer.written(), whole.len() as u64);
        drop(writer);
        assert!(chunks.len() > 20, "{}", chunks.len());
        // Every chunk but the last is at least the chunk size, and at most one line more.
        for chunk in &chunks[..chunks.len() - 1] {
            assert!(
                (1_024..1_024 + 64).contains(&chunk.len()),
                "{}",
                chunk.len()
            );
        }
        assert_eq!(chunks.concat(), whole);

        // 3,001 rows with the header by 3 columns, of the load the screen shows:
        // the first load published its first batch, then at its end.
        let shown = read_table(&worker.catalog.get("app").unwrap())
            .unwrap()
            .table
            .load_version();
        assert_eq!(shown, 2);
        let mut xlsx = std::io::Cursor::new(Vec::new());
        worker
            .write_xlsx_to(layout, Some(shown), 9_003, &mut xlsx)
            .unwrap();
        assert!(xlsx.into_inner().starts_with(b"PK"));
        let error = worker
            .write_xlsx_to(layout, None, 9_002, std::io::Cursor::new(Vec::new()))
            .unwrap_err();
        assert!(error.contains("9003 cells, more than the 9002"), "{error}");
        assert!(error.ends_with("export it as CSV instead"), "{error}");
        // The load the screen shows must be the table's.
        let stale = worker
            .write_xlsx_to(
                layout,
                Some(shown - 1),
                9_003,
                std::io::Cursor::new(Vec::new()),
            )
            .unwrap_err();
        assert!(
            stale.contains("reloaded since the screen showed it"),
            "{stale}"
        );
        assert!(
            worker
                .write_csv_to(r#"{"version":1,"dataset":"nope"}"#, None, Vec::new())
                .unwrap_err()
                .contains("unknown dataset nope")
        );
    }
}
