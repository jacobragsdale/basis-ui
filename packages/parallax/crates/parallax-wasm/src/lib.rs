//! The parallax engine for the browser.
//!
//! A [`Worker`] hosts tables and one protocol session inside a Web Worker. The
//! page sends it protobuf messages and gets the replies a native session gives,
//! byte for byte, which the transcript test checks. The worker never reads a
//! clock; callers pass times in.
//!
//! An app loads its own Arrow bytes with [`Worker::load_table`], within the row
//! limit its caller passes, and exports views as Excel or CSV with
//! [`Worker::export_xlsx`] and [`Worker::export_csv`], which read the table the
//! worker already holds.

use std::io::Write;
use std::sync::{Arc, RwLock};

use parallax_engine::format::Formatter;
use parallax_engine::{Table, TableOptions};
use parallax_export::{ExportSource, ReadTable, write_csv, write_xlsx};
use parallax_protocol::ipc::{decode_stream_in_place, stream_rows};
use parallax_protocol::layout::Layout;
use parallax_session::{
    Catalog, LoadStatus, MemoryCatalog, Session, SharedTable, TableState, read_table,
};
use wasm_bindgen::prelude::*;

/// Bytes of CSV the worker hands the page at a time, so that an export never
/// holds the whole file in WebAssembly memory.
pub const CSV_CHUNK_BYTES: usize = 1 << 20;

/// How a load of an app's Arrow bytes is keyed, stamped and limited.
#[derive(Clone, Debug)]
pub struct Load {
    /// The primary key column of a new table, so that reloads apply as diffs. A
    /// reload keeps the table's key.
    pub primary_key: Option<String>,
    /// When the app received the bytes, in microseconds since the Unix epoch.
    pub now_micros: i64,
    /// When the source was read, if the app says so outside the stream; it
    /// overrides the stream's own status.
    pub source_as_of_micros: Option<i64>,
    /// The most rows the table may hold; a stream of more is refused before it is
    /// decoded.
    pub max_rows: u64,
}

/// Tables and a protocol session, for one page.
#[wasm_bindgen]
pub struct Worker {
    catalog: Arc<MemoryCatalog>,
    session: Session,
}

#[wasm_bindgen]
impl Worker {
    /// Creates a worker with no tables.
    #[wasm_bindgen(constructor)]
    #[must_use]
    pub fn new() -> Self {
        let catalog = Arc::new(MemoryCatalog::new());
        let session = Session::new(Arc::clone(&catalog) as Arc<dyn Catalog>);
        Self { catalog, session }
    }

    /// Loads or reloads dataset `name` from an app's Arrow IPC stream, as
    /// [`Worker::load`] does. Returns the table's rows.
    ///
    /// # Errors
    ///
    /// Returns the reason the load is refused.
    #[wasm_bindgen(js_name = loadTable)]
    pub fn load_table(
        &mut self,
        name: &str,
        arrow_ipc: Vec<u8>,
        primary_key: Option<String>,
        now_micros: f64,
        source_as_of_micros: Option<f64>,
        max_rows: u32,
    ) -> Result<u64, JsError> {
        self.load(
            name,
            arrow_ipc,
            &Load {
                primary_key,
                now_micros: now_micros as i64,
                source_as_of_micros: source_as_of_micros.map(|m| m as i64),
                max_rows: u64::from(max_rows),
            },
        )
        .map_err(|e| JsError::new(&e))
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
    /// Loads or reloads dataset `name` from an app's Arrow IPC stream and returns
    /// the table's rows.
    ///
    /// The rows are counted from the stream's batch headers first, and a stream of
    /// more than `load.max_rows` is refused before any of it is decoded. The stream
    /// is then decoded in place, so its arrays point into `arrow_ipc` rather than
    /// copying it, and the bytes are freed once the table holds the rows. The
    /// stream's schema metadata may carry the load's status, as
    /// [`LoadStatus`] describes; without a source time, the status shows when the
    /// app received the bytes. A reload of an existing dataset applies as a diff to
    /// its open views on the next [`Worker::refresh`].
    ///
    /// # Errors
    ///
    /// Returns the reason the load is refused: too many rows, an invalid stream
    /// or status, or rows the table refuses.
    pub fn load(&mut self, name: &str, arrow_ipc: Vec<u8>, load: &Load) -> Result<u64, String> {
        let rows = stream_rows(&arrow_ipc).map_err(|e| format!("{name}: {e}"))?;
        if rows > load.max_rows {
            return Err(format!(
                "{name} has {rows} rows, more than the {} a table in the browser holds; have its API filter or aggregate the data to fit",
                load.max_rows
            ));
        }
        let (schema, batches) =
            decode_stream_in_place(arrow_ipc).map_err(|e| format!("{name}: {e}"))?;
        let status = LoadStatus::from_schema(&schema).map_err(|e| format!("{name}: {e}"))?;
        let as_of = load
            .source_as_of_micros
            .or(status.source_as_of_micros)
            .unwrap_or(load.now_micros);
        if let Some(existing) = self.catalog.get(name) {
            let mut state = existing
                .write()
                .map_err(|_| format!("{name} is unavailable after an internal error"))?;
            let report = state
                .reload(&batches, load.now_micros, as_of)
                .map_err(|e| format!("{name}: {e}"))?;
            state.count_upstream_nans(&status.nans_to_null);
            return Ok(report.rows as u64);
        }
        let mut state = TableState::from_batches(
            &schema,
            &batches,
            TableOptions {
                primary_key: load.primary_key.clone(),
                ..TableOptions::default()
            },
            load.now_micros,
            as_of,
        )
        .map_err(|e| format!("{name}: {e}"))?;
        state.count_upstream_nans(&status.nans_to_null);
        let rows = state.table.num_rows() as u64;
        self.catalog.insert(name, Arc::new(RwLock::new(state)));
        Ok(rows)
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
        let table = self.catalog.open(&layout.dataset, &layout.parameters)?;
        let as_of_micros = read_table(&table)?.source_as_of_micros();
        let as_of = Formatter::default().timestamp(as_of_micros, true);
        let source = ExportSource {
            dataset: layout.dataset.clone(),
            as_of: format!("{as_of} New York"),
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
        let fields = vec![
            Field::new("id", DataType::Int64, false),
            Field::new("ticker", DataType::Utf8, false),
            Field::new("price", DataType::Float64, true),
        ];
        let metadata: HashMap<String, String> = status
            .map(|s| [(LOAD_METADATA.to_owned(), s.to_owned())].into())
            .unwrap_or_default();
        let schema = Arc::new(Schema::new_with_metadata(fields, metadata));
        let mut out = Vec::new();
        let mut writer = arrow_ipc::writer::StreamWriter::try_new(&mut out, &schema).unwrap();
        for start in (0..rows).step_by(1_000) {
            let ids: Vec<i64> = (start..(start + 1_000).min(rows)).collect();
            let batch = RecordBatch::try_new(
                Arc::clone(&schema),
                vec![
                    Arc::new(Int64Array::from(ids.clone())),
                    Arc::new(StringArray::from_iter_values(
                        ids.iter().map(|i| format!("T{}", i % 13)),
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
        // Without a status, the source time is when the app received the bytes,
        // and a time the app passes wins over the stream's.
        worker.load("plain", stream(10, None), &load(100)).unwrap();
        assert_eq!(open(&mut worker, 2, "plain").1, 5_000);
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

        // 3,001 rows with the header by 3 columns.
        let mut xlsx = std::io::Cursor::new(Vec::new());
        worker
            .write_xlsx_to(layout, Some(1), 9_003, &mut xlsx)
            .unwrap();
        assert!(xlsx.into_inner().starts_with(b"PK"));
        let error = worker
            .write_xlsx_to(layout, None, 9_002, std::io::Cursor::new(Vec::new()))
            .unwrap_err();
        assert!(error.contains("9003 cells, more than the 9002"), "{error}");
        assert!(error.ends_with("export it as CSV instead"), "{error}");
        // The load the screen shows must be the table's.
        let stale = worker
            .write_xlsx_to(layout, Some(2), 9_003, std::io::Cursor::new(Vec::new()))
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
