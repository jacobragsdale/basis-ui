//! Tables: columns addressed by stable slots, loaded and updated as diffs.

use std::ops::Range;
use std::sync::Arc;

use arrow_array::RecordBatch;
use arrow_schema::{Field, Schema, SchemaRef};
use rustc_hash::FxHashMap;

use crate::bitmap::Bitmap;
use crate::column::Column;
use crate::error::LoadError;
use crate::types::{ColumnType, Key};

/// What to do when a load repeats a primary key.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum DuplicatePolicy {
    /// Refuse the load.
    #[default]
    Error,
    /// Keep the last row with each key.
    LastWins,
}

/// How a table is keyed.
#[derive(Clone, Debug, Default)]
pub struct TableOptions {
    /// The primary key column, if any. Loads into a keyed table become updates,
    /// inserts and deletes by key. A table without a key is replaced wholesale.
    pub primary_key: Option<String>,
    /// What to do with repeated keys.
    pub duplicates: DuplicatePolicy,
}

/// The old images of rows that a change removed or overwrote, in the table's schema.
#[derive(Clone, Debug)]
pub struct RemovedRows {
    /// One column per table column, one row per removed or overwritten row.
    pub columns: Vec<Column>,
    /// Each row's insertion sequence number.
    pub seq: Vec<u64>,
}

impl RemovedRows {
    /// The number of rows.
    #[must_use]
    pub fn len(&self) -> usize {
        self.seq.len()
    }

    /// Returns `true` if no row was removed.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.seq.is_empty()
    }
}

/// What a load or update changed. Views apply it to stay current: they remove the
/// old images and add the current values of `added`.
#[derive(Clone, Debug)]
pub struct ChangeSet {
    /// The table's load version after the change.
    pub load_version: u64,
    /// Old images of deleted rows and of the previous values of updated rows.
    pub removed: RemovedRows,
    /// Slots holding inserted rows and the new values of updated rows.
    pub added: Vec<usize>,
}

/// A summary of a load, for the view's info panel.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct LoadReport {
    /// Rows in the load.
    pub rows: usize,
    /// Rows whose key was new.
    pub inserted: usize,
    /// Rows whose key existed with different values.
    pub updated: usize,
    /// Rows whose key existed with the same values.
    pub unchanged: usize,
    /// Rows deleted because their key was not in the load.
    pub deleted: usize,
    /// Per column, how many NaNs became nulls.
    pub nans_to_null: Vec<(String, usize)>,
    /// The table's load version after the load.
    pub load_version: u64,
}

/// Rows staged for a load into a table, a record batch at a time.
///
/// [`Table::staging`] starts one, sized for the rows the load will bring;
/// [`Staging::push`] converts each batch into the engine's columns as it
/// arrives, so the batch can be dropped once it returns; and
/// [`Table::load_staged`] or [`Table::upsert_staged`] applies the whole load,
/// checked whole first. The table is not touched until then, so a refused batch
/// leaves it as it was. A first load into an empty table keeps the staged
/// columns as the table's own, so its rows are copied once.
#[derive(Debug)]
pub struct Staging {
    schema: SchemaRef,
    columns: Vec<Column>,
    nans: Vec<usize>,
    /// Whether a batch was refused part of the way through its columns, which
    /// leaves them of different lengths.
    refused: bool,
}

impl Staging {
    /// Converts a batch's rows and adds them to the load.
    ///
    /// # Errors
    ///
    /// Returns an error if the batch's columns differ from the table's, or a value
    /// cannot be represented without loss. The staging then refuses every batch
    /// and cannot be applied: drop it.
    pub fn push(&mut self, batch: &RecordBatch) -> Result<(), LoadError> {
        let _phase = crate::profile::span("load: stage");
        assert!(!self.refused, "a staging that refused a batch is dropped");
        let pushed = self.push_columns(batch);
        self.refused = pushed.is_err();
        pushed
    }

    fn push_columns(&mut self, batch: &RecordBatch) -> Result<(), LoadError> {
        for field in batch.schema().fields() {
            if self.schema.index_of(field.name()).is_err() {
                return Err(LoadError::UnexpectedColumn {
                    column: field.name().clone(),
                });
            }
        }
        for (i, field) in self.schema.fields().iter().enumerate() {
            let array =
                batch
                    .column_by_name(field.name())
                    .ok_or_else(|| LoadError::MissingColumn {
                        column: field.name().clone(),
                    })?;
            self.nans[i] += self.columns[i].extend_from_arrow(field.name(), array.as_ref())?;
        }
        Ok(())
    }

    /// The rows staged so far.
    #[must_use]
    pub fn rows(&self) -> usize {
        self.columns.first().map_or(0, Column::len)
    }

    /// The staged columns, and per column how many NaNs became nulls.
    fn finish(self) -> (Vec<Column>, Vec<(String, usize)>) {
        let report = self
            .schema
            .fields()
            .iter()
            .zip(self.nans)
            .filter(|(_, n)| *n > 0)
            .map(|(f, n)| (f.name().clone(), n))
            .collect();
        (self.columns, report)
    }
}

/// A first load's key index: built while its keys were checked, or left for
/// the next load that needs it.
enum Index {
    Built(FxHashMap<Key, usize>),
    Deferred,
}

/// Returns `true` if `b` comes strictly after `a` in a total order of one
/// column's keys, so that keys that only ever rise are all distinct. A text
/// key's codes follow the order rows first use their text, so they rise only
/// while every row's text is new.
fn rises(a: Key, b: Key) -> bool {
    match (a, b) {
        (Key::Bool(a), Key::Bool(b)) => !a & b,
        (Key::Int(a), Key::Int(b)) | (Key::Ts(a), Key::Ts(b)) => a < b,
        (Key::Float(a), Key::Float(b)) => a < b,
        (Key::Decimal(a), Key::Decimal(b)) => a < b,
        (Key::Str(a), Key::Str(b)) => a < b,
        (Key::Date(a), Key::Date(b)) => a < b,
        _ => false,
    }
}

/// A table.
#[derive(Clone, Debug)]
pub struct Table {
    schema: SchemaRef,
    columns: Vec<Column>,
    live: Bitmap,
    seq: Vec<u64>,
    free: Vec<usize>,
    key_column: Option<usize>,
    index: FxHashMap<Key, usize>,
    /// Whether `index` holds every live key; a first load whose keys cannot
    /// repeat leaves it to the next load that looks a key up.
    indexed: bool,
    options: TableOptions,
    next_seq: u64,
    load_version: u64,
}

impl Table {
    /// Creates an empty table.
    ///
    /// # Errors
    ///
    /// Returns an error if a column type is unsupported or the primary key is not a
    /// column.
    pub fn new(schema: &Schema, options: TableOptions) -> Result<Self, LoadError> {
        let mut fields = Vec::with_capacity(schema.fields().len());
        let mut columns = Vec::with_capacity(schema.fields().len());
        for field in schema.fields() {
            let ty = ColumnType::from_arrow(field.data_type()).ok_or_else(|| {
                LoadError::UnsupportedType {
                    column: field.name().clone(),
                    data_type: field.data_type().clone(),
                }
            })?;
            // The field's metadata stays, such as the display format an API declares.
            fields.push(
                Field::new(field.name(), ty.to_arrow(), true)
                    .with_metadata(field.metadata().clone()),
            );
            columns.push(Column::new(ty));
        }
        let key_column = match &options.primary_key {
            Some(name) => Some(
                schema
                    .index_of(name)
                    .map_err(|_| LoadError::UnknownKeyColumn(name.clone()))?,
            ),
            None => None,
        };
        Ok(Self {
            schema: Arc::new(Schema::new(fields)),
            columns,
            live: Bitmap::new(),
            seq: Vec::new(),
            free: Vec::new(),
            key_column,
            index: FxHashMap::default(),
            indexed: true,
            options,
            next_seq: 0,
            load_version: 0,
        })
    }

    /// The table's schema, with every column nullable.
    #[must_use]
    pub fn schema(&self) -> &SchemaRef {
        &self.schema
    }

    /// The number of live rows.
    #[must_use]
    pub fn num_rows(&self) -> usize {
        self.live.count_ones()
    }

    /// The number of slots, live or free.
    #[must_use]
    pub fn num_slots(&self) -> usize {
        self.live.len()
    }

    /// Increments with every load or update, starting from zero for an empty table.
    #[must_use]
    pub fn load_version(&self) -> u64 {
        self.load_version
    }

    /// Returns the index of the named column.
    #[must_use]
    pub fn column_index(&self, name: &str) -> Option<usize> {
        self.schema.index_of(name).ok()
    }

    /// Returns a column by index.
    #[must_use]
    pub fn column(&self, index: usize) -> &Column {
        &self.columns[index]
    }

    /// The primary key column, if the table has one.
    #[must_use]
    pub fn key_column(&self) -> Option<usize> {
        self.key_column
    }

    /// Returns `true` if `slot` holds a live row.
    #[must_use]
    pub fn is_live(&self, slot: usize) -> bool {
        self.live.get(slot)
    }

    /// Iterates over live slots in slot order.
    pub fn live_slots(&self) -> impl Iterator<Item = usize> + '_ {
        self.live.ones()
    }

    /// Iterates over live slots within `range`, in order.
    pub fn live_slots_in(&self, range: Range<usize>) -> impl Iterator<Item = usize> + '_ {
        self.live.ones_in(range)
    }

    /// Returns the insertion sequence number of `slot`. Rows that are updated keep
    /// their number; inserted rows get the next one.
    #[must_use]
    pub fn seq(&self, slot: usize) -> u64 {
        self.seq[slot]
    }

    /// Replaces the table's contents with `batches`.
    ///
    /// For a keyed table the load is a diff: rows with new keys are inserted, rows
    /// whose values changed are updated in place, and rows whose keys are missing
    /// are deleted. A table without a key deletes everything and inserts the load.
    /// The whole load is validated before anything changes, so a refused load leaves
    /// the table as it was.
    ///
    /// # Errors
    ///
    /// Returns an error if the schema differs, a key is null or repeated, or a value
    /// cannot be represented without loss.
    pub fn load(&mut self, batches: &[RecordBatch]) -> Result<(LoadReport, ChangeSet), LoadError> {
        let staging = self.stage(batches)?;
        self.load_staged(staging)
    }

    /// Inserts or updates rows by key, leaving other rows alone. Without a key,
    /// every row is inserted.
    ///
    /// # Errors
    ///
    /// Returns the same errors as [`Table::load`].
    pub fn upsert(
        &mut self,
        batches: &[RecordBatch],
    ) -> Result<(LoadReport, ChangeSet), LoadError> {
        let staging = self.stage(batches)?;
        self.upsert_staged(staging)
    }

    /// Starts staging a load of about `rows` rows, which each column reserves room
    /// for at once.
    #[must_use]
    pub fn staging(&self, rows: usize) -> Staging {
        let columns = self
            .columns
            .iter()
            .map(|c| {
                let mut column = Column::new(c.ty.clone());
                column.reserve(rows);
                column
            })
            .collect();
        Staging {
            schema: Arc::clone(&self.schema),
            columns,
            nans: vec![0; self.columns.len()],
            refused: false,
        }
    }

    /// Applies a staged load as [`Table::load`] does.
    ///
    /// # Errors
    ///
    /// Returns an error if a key is null or repeated.
    ///
    /// # Panics
    ///
    /// Panics if `staging` was started by another table, or refused a batch.
    pub fn load_staged(&mut self, staging: Staging) -> Result<(LoadReport, ChangeSet), LoadError> {
        self.apply_staged(staging, true)
    }

    /// Applies a staged load as [`Table::upsert`] does.
    ///
    /// # Errors
    ///
    /// Returns an error if a key is null or repeated.
    ///
    /// # Panics
    ///
    /// Panics if `staging` was started by another table, or refused a batch.
    pub fn upsert_staged(
        &mut self,
        staging: Staging,
    ) -> Result<(LoadReport, ChangeSet), LoadError> {
        self.apply_staged(staging, false)
    }

    fn stage(&self, batches: &[RecordBatch]) -> Result<Staging, LoadError> {
        let mut staging = self.staging(batches.iter().map(RecordBatch::num_rows).sum());
        for batch in batches {
            staging.push(batch)?;
        }
        Ok(staging)
    }

    /// Returns the table-domain key for row `row` of a staged key column, or `None`
    /// if the key's text was never interned here, which makes it new.
    fn table_key(&self, staged_key: &Column, row: usize) -> Option<Key> {
        let key = staged_key.key(row);
        match key {
            Key::Str(_) => {
                let text = staged_key.text(key).expect("text key");
                let table_column = &self.columns[self.key_column.expect("keyed table")];
                table_column
                    .dictionary()
                    .and_then(|d| d.code(text))
                    .map(Key::Str)
            }
            other => Some(other),
        }
    }

    /// Checks a first load's keys and returns the index they make, or `None` if
    /// keys repeat and the last row with each wins, which the general path
    /// resolves. Keys that only ever rise, such as ids in the order they were
    /// issued, or text whose every row is new, cannot repeat, so their index
    /// waits for the first load that needs it, as one without a key does.
    fn first_index(&self, staged: &[Column]) -> Result<Option<Index>, LoadError> {
        let Some(k) = self.key_column else {
            return Ok(Some(Index::Deferred));
        };
        let staged_key = &staged[k];
        let rows = staged_key.len();
        let null = |row| LoadError::NullKey {
            column: self.schema.field(k).name().clone(),
            row,
        };
        let mut previous = Key::Null;
        let mut rising = true;
        for row in 0..rows {
            let key = staged_key.key(row);
            if key == Key::Null {
                return Err(null(row));
            }
            if row > 0 && !rises(previous, key) {
                rising = false;
                break;
            }
            previous = key;
        }
        if rising {
            return Ok(Some(Index::Deferred));
        }
        let mut index: FxHashMap<Key, usize> = FxHashMap::default();
        index.reserve(rows);
        let mut duplicates = 0;
        let mut examples = Vec::new();
        for row in 0..rows {
            let key = staged_key.key(row);
            if key == Key::Null {
                return Err(null(row));
            }
            if index.insert(key, row).is_some() {
                duplicates += 1;
                if examples.len() < 5 {
                    examples.push(format!("{:?}", staged_key.scalar(row)));
                }
            }
        }
        if duplicates == 0 {
            return Ok(Some(Index::Built(index)));
        }
        if self.options.duplicates == DuplicatePolicy::Error {
            return Err(LoadError::DuplicateKeys {
                column: self.schema.field(k).name().clone(),
                count: duplicates,
                examples,
            });
        }
        Ok(None)
    }

    /// Builds the key index if a first load deferred it.
    fn ensure_index(&mut self) {
        if self.indexed {
            return;
        }
        if let Some(k) = self.key_column {
            let column = &self.columns[k];
            self.index.reserve(self.live.len());
            for slot in self.live.ones() {
                self.index.insert(column.key(slot), slot);
            }
        }
        self.indexed = true;
    }

    /// Makes a first load's staged columns the table's own.
    fn adopt(
        &mut self,
        staged: Vec<Column>,
        index: Index,
        mut report: LoadReport,
    ) -> (LoadReport, ChangeSet) {
        let rows = report.rows;
        let removed = RemovedRows {
            columns: self
                .columns
                .iter()
                .map(|c| Column::new(c.ty.clone()))
                .collect(),
            seq: Vec::new(),
        };
        self.columns = staged;
        for column in &mut self.columns {
            column.refresh_ranks();
        }
        self.live.extend_ones(rows);
        let first = self.next_seq;
        self.next_seq += rows as u64;
        self.seq = (first..self.next_seq).collect();
        match index {
            Index::Built(index) => {
                self.index = index;
                self.indexed = true;
            }
            Index::Deferred => self.indexed = false,
        }
        self.load_version += 1;
        report.inserted = rows;
        report.load_version = self.load_version;
        (
            report,
            ChangeSet {
                load_version: self.load_version,
                removed,
                added: (0..rows).collect(),
            },
        )
    }

    fn apply_staged(
        &mut self,
        staging: Staging,
        replace: bool,
    ) -> Result<(LoadReport, ChangeSet), LoadError> {
        assert!(
            Arc::ptr_eq(&staging.schema, &self.schema),
            "a staged load applies to the table that started it"
        );
        assert!(
            !staging.refused,
            "a staging that refused a batch is dropped"
        );
        let (staged, nans_to_null) = staging.finish();
        let _phase = crate::profile::span("load: append");
        let rows = staged.first().map_or(0, Column::len);
        let mut report = LoadReport {
            rows,
            nans_to_null,
            ..LoadReport::default()
        };

        // A first load keeps the staged columns: each row lands in the slot of
        // its position, as the general path below would put it, with the same
        // text codes, since both intern in the order of the rows.
        if self.live.is_empty()
            && let Some(index) = self.first_index(&staged)?
        {
            return Ok(self.adopt(staged, index, report));
        }

        self.ensure_index();
        let staged = &staged;

        // Decide what happens to each staged row before changing anything.
        let mut keep: Vec<usize> = (0..rows).collect();
        let mut targets: Vec<Option<usize>> = vec![None; rows];
        if let Some(k) = self.key_column {
            let key_name = self.schema.field(k).name().clone();
            let staged_key = &staged[k];
            let mut first_row: FxHashMap<Key, usize> = FxHashMap::default();
            let mut duplicates = 0;
            let mut examples = Vec::new();
            let mut last_row: FxHashMap<Key, usize> = FxHashMap::default();
            for row in 0..rows {
                let key = staged_key.key(row);
                if key == Key::Null {
                    return Err(LoadError::NullKey {
                        column: key_name,
                        row,
                    });
                }
                if first_row.insert(key, row).is_some() {
                    duplicates += 1;
                    if examples.len() < 5 {
                        examples.push(format!("{:?}", staged_key.scalar(row)));
                    }
                }
                last_row.insert(key, row);
            }
            if duplicates > 0 {
                if self.options.duplicates == DuplicatePolicy::Error {
                    return Err(LoadError::DuplicateKeys {
                        column: key_name,
                        count: duplicates,
                        examples,
                    });
                }
                keep = (0..rows)
                    .filter(|&row| last_row[&staged_key.key(row)] == row)
                    .collect();
            }
            for &row in &keep {
                targets[row] = self
                    .table_key(staged_key, row)
                    .and_then(|key| self.index.get(&key).copied());
            }
        } else if replace {
            // Without a key, a load replaces every row.
        }

        // From here on nothing can fail.
        let mut removed = RemovedRows {
            columns: self
                .columns
                .iter()
                .map(|c| Column::new(c.ty.clone()))
                .collect(),
            seq: Vec::new(),
        };
        let mut added = Vec::new();
        let mut seen = Bitmap::new();
        for _ in 0..self.live.len() {
            seen.push(false);
        }
        let mut updates = Vec::new();
        let mut inserts = Vec::new();
        for &row in &keep {
            match targets[row] {
                Some(slot) => {
                    seen.set(slot, true);
                    let changed = (0..self.columns.len())
                        .any(|c| !self.columns[c].same_value(slot, &staged[c], row));
                    if changed {
                        updates.push((slot, row));
                    } else {
                        report.unchanged += 1;
                    }
                }
                None => inserts.push(row),
            }
        }
        let deletes: Vec<usize> = if replace {
            self.live.ones().filter(|&slot| !seen.get(slot)).collect()
        } else {
            Vec::new()
        };

        for &slot in updates.iter().map(|(slot, _)| slot).chain(&deletes) {
            for (c, column) in self.columns.iter().enumerate() {
                removed.columns[c].push_from(column, slot);
            }
            removed.seq.push(self.seq[slot]);
        }
        for &(slot, row) in &updates {
            for (c, column) in self.columns.iter_mut().enumerate() {
                column.set_from(slot, &staged[c], row);
            }
            added.push(slot);
        }
        for &slot in &deletes {
            self.live.set(slot, false);
            if let Some(k) = self.key_column {
                let key = self.columns[k].key(slot);
                self.index.remove(&key);
            }
            self.free.push(slot);
        }
        for &row in &inserts {
            let slot = match self.free.pop() {
                Some(slot) => {
                    for (c, column) in self.columns.iter_mut().enumerate() {
                        column.set_from(slot, &staged[c], row);
                    }
                    self.live.set(slot, true);
                    self.seq[slot] = self.next_seq;
                    slot
                }
                None => {
                    for (c, column) in self.columns.iter_mut().enumerate() {
                        column.push_from(&staged[c], row);
                    }
                    self.live.push(true);
                    self.seq.push(self.next_seq);
                    self.live.len() - 1
                }
            };
            self.next_seq += 1;
            if let Some(k) = self.key_column {
                let key = self.columns[k].key(slot);
                self.index.insert(key, slot);
            }
            added.push(slot);
        }
        for column in &mut self.columns {
            column.refresh_ranks();
        }
        for column in &mut removed.columns {
            column.refresh_ranks();
        }
        self.load_version += 1;
        report.inserted = inserts.len();
        report.updated = updates.len();
        report.deleted = deletes.len();
        report.load_version = self.load_version;
        Ok((
            report,
            ChangeSet {
                load_version: self.load_version,
                removed,
                added,
            },
        ))
    }
}

#[cfg(test)]
mod tests {
    use arrow_array::{ArrayRef, Int64Array, StringArray};
    use arrow_schema::DataType;

    use super::*;
    use crate::types::Scalar;

    fn schema() -> Arc<Schema> {
        Arc::new(Schema::new(vec![
            Field::new("id", DataType::Int64, true),
            Field::new("name", DataType::Utf8, true),
        ]))
    }

    fn batch(ids: &[Option<i64>], names: &[Option<&str>]) -> RecordBatch {
        let columns: Vec<ArrayRef> = vec![
            Arc::new(Int64Array::from(ids.to_vec())),
            Arc::new(StringArray::from(names.to_vec())),
        ];
        RecordBatch::try_new(schema(), columns).unwrap()
    }

    fn keyed() -> Table {
        Table::new(
            &schema(),
            TableOptions {
                primary_key: Some("id".into()),
                ..TableOptions::default()
            },
        )
        .unwrap()
    }

    /// Each live slot's values, in slot order, with its sequence number.
    fn rows(table: &Table) -> Vec<(usize, u64, Scalar, Scalar)> {
        table
            .live_slots()
            .map(|slot| {
                (
                    slot,
                    table.seq(slot),
                    table.column(0).scalar(slot),
                    table.column(1).scalar(slot),
                )
            })
            .collect()
    }

    #[test]
    fn a_first_load_fills_slots_in_row_order_and_indexes_every_key() {
        let mut table = keyed();
        let batches = [
            batch(&[Some(3), Some(1)], &[Some("c"), None]),
            batch(&[], &[]),
            batch(&[Some(2)], &[Some("a")]),
        ];
        let (report, change) = table.load(&batches).unwrap();
        assert_eq!(
            (report.rows, report.inserted, report.load_version),
            (3, 3, 1)
        );
        assert_eq!(change.added, vec![0, 1, 2]);
        assert!(change.removed.is_empty());
        let text = |t: &str| Scalar::Utf8(t.into());
        assert_eq!(
            rows(&table),
            vec![
                (0, 0, Scalar::Int64(3), text("c")),
                (1, 1, Scalar::Int64(1), Scalar::Null),
                (2, 2, Scalar::Int64(2), text("a")),
            ]
        );
        // The same rows again change nothing: every key is in the index.
        let (report, change) = table.load(&batches).unwrap();
        assert_eq!(
            (report.unchanged, report.inserted, report.deleted),
            (3, 0, 0)
        );
        assert!(change.added.is_empty());
        // A new row takes the next slot and number.
        let (report, _) = table.upsert(&[batch(&[Some(9)], &[Some("z")])]).unwrap();
        assert_eq!(report.inserted, 1);
        assert_eq!(rows(&table)[3], (3, 3, Scalar::Int64(9), text("z")));
    }

    #[test]
    fn keys_that_only_rise_are_indexed_by_the_first_load_that_needs_them() {
        for (ids, names) in [
            (
                vec![Some(1), Some(5), Some(9)],
                vec![Some("a"), Some("a"), None],
            ),
            (
                vec![Some(-3), Some(0), Some(1)],
                vec![None, None, Some("b")],
            ),
        ] {
            let mut table = keyed();
            table.load(&[batch(&ids, &names)]).unwrap();
            assert!(!table.indexed);
            // The same rows again change nothing, and one more is inserted.
            let mut more = ids.clone();
            more.push(Some(100));
            let mut more_names = names.clone();
            more_names.push(Some("z"));
            let (report, change) = table.load(&[batch(&more, &more_names)]).unwrap();
            assert_eq!(
                (report.unchanged, report.inserted, report.deleted),
                (3, 1, 0)
            );
            assert_eq!(change.added, vec![3]);
            assert!(table.indexed);
            // A key deleted by a load is gone from the index.
            let (report, _) = table.load(&[batch(&more[1..], &more_names[1..])]).unwrap();
            assert_eq!((report.unchanged, report.deleted), (3, 1));
            assert_eq!(table.index.len(), 3);
        }
        // Text keys whose every row is new rise too.
        let mut table = Table::new(
            &schema(),
            TableOptions {
                primary_key: Some("name".into()),
                ..TableOptions::default()
            },
        )
        .unwrap();
        table
            .load(&[batch(&[None, None], &[Some("b"), Some("a")])])
            .unwrap();
        assert!(!table.indexed);
        let (report, _) = table.upsert(&[batch(&[Some(1)], &[Some("a")])]).unwrap();
        assert_eq!((report.updated, report.inserted), (1, 0));
    }

    #[test]
    fn an_empty_first_load_leaves_an_empty_table_that_loads_later() {
        let mut table = keyed();
        let (report, change) = table.load(&[]).unwrap();
        assert_eq!(
            (report.rows, table.num_rows(), change.load_version),
            (0, 0, 1)
        );
        table.load(&[batch(&[], &[])]).unwrap();
        table.load(&[batch(&[Some(1)], &[Some("a")])]).unwrap();
        assert_eq!(table.num_rows(), 1);
        assert_eq!(table.load_version(), 3);
    }

    #[test]
    fn a_first_load_with_a_null_or_repeated_key_is_refused_and_leaves_the_table_empty() {
        let mut table = keyed();
        let null = table
            .load(&[batch(&[Some(1)], &[None]), batch(&[None], &[None])])
            .unwrap_err();
        assert_eq!(
            null,
            LoadError::NullKey {
                column: "id".into(),
                row: 1
            }
        );
        let repeated = table
            .load(&[
                batch(&[Some(1), Some(2)], &[None, None]),
                batch(&[Some(2), Some(1), Some(2)], &[None, None, None]),
            ])
            .unwrap_err();
        assert_eq!(
            repeated.to_string(),
            "column id has 3 duplicate primary keys, for example [\"Int64(2)\", \"Int64(1)\", \"Int64(2)\"]"
        );
        assert_eq!((table.num_slots(), table.load_version()), (0, 0));
    }

    #[test]
    fn repeated_keys_in_a_first_load_keep_the_last_row_when_the_last_wins() {
        let mut table = Table::new(
            &schema(),
            TableOptions {
                primary_key: Some("id".into()),
                duplicates: DuplicatePolicy::LastWins,
            },
        )
        .unwrap();
        table
            .load(&[
                batch(&[Some(1), Some(2)], &[Some("old"), Some("b")]),
                batch(&[Some(1)], &[Some("new")]),
            ])
            .unwrap();
        let names: Vec<Scalar> = rows(&table).into_iter().map(|row| row.3).collect();
        assert_eq!(
            names,
            [Scalar::Utf8("b".into()), Scalar::Utf8("new".into())]
        );
        // "old" was never the table's: only the rows kept are interned.
        assert_eq!(table.column(1).dictionary().unwrap().len(), 2);
    }

    #[test]
    fn a_keyed_reload_refused_in_its_last_batch_keeps_the_old_table() {
        let mut table = keyed();
        table
            .load(&[batch(&[Some(1), Some(2)], &[Some("a"), Some("b")])])
            .unwrap();
        let before = rows(&table);
        // The second batch repeats a key of the first.
        let repeated = [
            batch(&[Some(5), Some(2)], &[Some("x"), Some("y")]),
            batch(&[Some(5)], &[Some("z")]),
        ];
        assert!(matches!(
            table.load(&repeated),
            Err(LoadError::DuplicateKeys { count: 1, .. })
        ));
        // The second batch's column has another type.
        let other = Arc::new(Schema::new(vec![
            Field::new("id", DataType::Utf8, true),
            Field::new("name", DataType::Utf8, true),
        ]));
        let retyped = RecordBatch::try_new(
            other,
            vec![
                Arc::new(StringArray::from(vec!["7"])),
                Arc::new(StringArray::from(vec!["q"])),
            ],
        )
        .unwrap();
        let mut staging = table.staging(3);
        staging
            .push(&batch(&[Some(1), Some(3)], &[Some("c"), None]))
            .unwrap();
        assert!(matches!(
            staging.push(&retyped),
            Err(LoadError::TypeChanged { .. })
        ));
        let applied = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _ = table.clone().load_staged(staging);
        }));
        assert!(applied.is_err(), "a refused staging cannot be applied");
        assert_eq!(rows(&table), before);
        assert_eq!(table.load_version(), 1);
        assert_eq!(table.column(1).dictionary().unwrap().len(), 2);
    }

    #[test]
    #[should_panic(expected = "a staged load applies to the table that started it")]
    fn a_staging_belongs_to_its_table() {
        let staging = keyed().staging(0);
        let _ = keyed().load_staged(staging);
    }
}
