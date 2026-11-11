//! Row filters with SQL semantics: a comparison with a null value is not true.
//!
//! A filter on a text column decides each distinct string once. It keeps whether
//! each dictionary code passes in a bitmap, which grows as the dictionary does,
//! so testing a row reads its code and one bit. Removed rows carry dictionaries of
//! their own, so they are tested on their text.
//!
//! A view tests the table's rows all at once: a loop for each column type and
//! operator over the column's values writes a bit for each row, 64 to a word,
//! which the validity's words then mask; the columns of a search are ORed and
//! a view's filters ANDed a word at a time. The table keeps the last few
//! filters' words until its rows change, so a filter added beside others, or a
//! sort changed under them, tests only what is new.

use std::cmp::Ordering;
use std::sync::{Arc, Mutex, PoisonError};

use rustc_hash::FxHashSet;

use crate::bitmap::Bitmap;
use crate::column::{Column, Decimals, Values};
use crate::dictionary::Dictionary;
use crate::error::ConfigError;
use crate::sort::float_key;
use crate::table::Table;
use crate::types::{ColumnType, Key, Scalar};

/// A condition on one column.
#[derive(Clone, Debug, PartialEq)]
pub enum FilterOp {
    /// Equal to the value.
    Eq(Scalar),
    /// Not equal to the value. Nulls do not match.
    Ne(Scalar),
    /// Less than the value.
    Lt(Scalar),
    /// Less than or equal to the value.
    Le(Scalar),
    /// Greater than the value.
    Gt(Scalar),
    /// Greater than or equal to the value.
    Ge(Scalar),
    /// One of the values. A null in the list matches nulls, as "(blank)" does in a
    /// spreadsheet's filter list.
    In(Vec<Scalar>),
    /// None of the values. Nulls do not match.
    NotIn(Vec<Scalar>),
    /// Null.
    IsNull,
    /// Not null.
    IsNotNull,
    /// Text containing the string, ignoring case.
    Contains(String),
    /// Text not containing the string, ignoring case. Nulls match, as blanks do
    /// in a spreadsheet's "does not contain".
    NotContains(String),
    /// Text starting with the string, ignoring case.
    StartsWith(String),
    /// Text ending with the string, ignoring case.
    EndsWith(String),
}

/// A filter on one column, or on several. A view keeps rows that pass every
/// filter; a filter on several columns passes when its condition holds in any of
/// them, as a search across columns does.
#[derive(Clone, Debug, PartialEq)]
pub struct Filter {
    /// The column tested.
    pub column: String,
    /// The condition.
    pub op: FilterOp,
    /// More columns the condition is tested in; the filter passes when it holds in
    /// `column` or in any of these.
    pub or_columns: Vec<String>,
}

impl Filter {
    /// Builds a filter.
    #[must_use]
    pub fn new(column: &str, op: FilterOp) -> Self {
        Self {
            column: column.to_owned(),
            op,
            or_columns: Vec::new(),
        }
    }

    /// Tests the condition in `columns` too: the filter passes when it holds in any.
    #[must_use]
    pub fn or_in(mut self, columns: &[&str]) -> Self {
        self.or_columns
            .extend(columns.iter().map(|&c| c.to_owned()));
        self
    }

    /// The columns tested, `column` first.
    pub fn columns(&self) -> impl Iterator<Item = &str> {
        std::iter::once(self.column.as_str()).chain(self.or_columns.iter().map(String::as_str))
    }
}

/// The words of the filters a table's views tested last, kept until its rows
/// change, the most recently used last.
#[derive(Debug, Default)]
pub(crate) struct FilterCache(Mutex<KeptWords>);

#[derive(Debug, Default)]
struct KeptWords {
    /// The table's load version and slots when these were computed.
    stamp: (u64, usize),
    filters: Vec<(Filter, Arc<Vec<u64>>)>,
}

/// The filters a table keeps the words of: one row filter each, about 125 kB
/// for 1,000,000 rows.
const KEPT_FILTERS: usize = 8;

impl Clone for FilterCache {
    fn clone(&self) -> Self {
        Self::default()
    }
}

impl FilterCache {
    /// Forgets every filter's words, after the table's rows changed.
    pub(crate) fn clear(&mut self) {
        *self.0.get_mut().unwrap_or_else(PoisonError::into_inner) = KeptWords::default();
    }

    /// The words of `filter` over `table`, kept or computed by `compute`.
    fn words(
        &self,
        table: &Table,
        filter: &Filter,
        compute: impl FnOnce() -> Vec<u64>,
    ) -> Arc<Vec<u64>> {
        let stamp = (table.load_version(), table.num_slots());
        {
            let mut kept = self.0.lock().unwrap_or_else(PoisonError::into_inner);
            if kept.stamp != stamp {
                *kept = KeptWords {
                    stamp,
                    filters: Vec::new(),
                };
            }
            if let Some(at) = kept.filters.iter().position(|(f, _)| f == filter) {
                let found = kept.filters.remove(at);
                let words = Arc::clone(&found.1);
                kept.filters.push(found);
                return words;
            }
        }
        let words = Arc::new(compute());
        let mut kept = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        if kept.stamp == stamp && !kept.filters.iter().any(|(f, _)| f == filter) {
            if kept.filters.len() == KEPT_FILTERS {
                kept.filters.remove(0);
            }
            kept.filters.push((filter.clone(), Arc::clone(&words)));
        }
        words
    }
}

/// A filter value converted to the column's representation.
#[derive(Clone, Debug)]
enum Operand {
    Key(Key),
    /// Text, and the same in lower case.
    Text(String, String),
}

#[derive(Clone, Debug)]
enum Test {
    Compare(Ordering, bool, Operand),
    /// Keys, texts, whether nulls match, and whether the test is negated.
    In(FxHashSet<Key>, FxHashSet<String>, bool, bool),
    Null(bool),
    /// Lower-case text; for each, whether the test is negated, in which case
    /// nulls match.
    Contains(String, bool),
    StartsWith(String),
    EndsWith(String),
}

impl Test {
    /// Whether a null passes.
    fn null(&self) -> bool {
        match self {
            Self::Null(negate) => !*negate,
            Self::In(_, _, nulls, _) => *nulls,
            Self::Contains(_, negate) => *negate,
            Self::Compare(..) | Self::StartsWith(_) | Self::EndsWith(_) => false,
        }
    }

    /// Whether a text passes, given it in lower case too.
    fn text(&self, text: &str, folded: &str) -> bool {
        match self {
            Self::Compare(ordering, negate, Operand::Text(t, t_folded)) => {
                let actual = folded.cmp(t_folded).then_with(|| text.cmp(t));
                (actual == *ordering) != *negate
            }
            Self::In(_, texts, _, negate) => texts.contains(text) != *negate,
            Self::Contains(needle, negate) => folded.contains(needle.as_str()) != *negate,
            Self::StartsWith(prefix) => folded.starts_with(prefix.as_str()),
            Self::EndsWith(suffix) => folded.ends_with(suffix.as_str()),
            Self::Compare(_, _, Operand::Key(_)) | Self::Null(_) => {
                unreachable!("text is tested only by text tests")
            }
        }
    }

    /// Whether a non-null key of `column` passes, reading text through its
    /// dictionary.
    fn key(&self, column: &Column, key: Key) -> bool {
        if let Self::Null(negate) = self {
            return *negate;
        }
        if let Some(text) = column.text(key) {
            return self.text(text, &text.to_lowercase());
        }
        match self {
            Self::Compare(ordering, negate, Operand::Key(k)) => {
                (column.cmp_keys(key, *k) == *ordering) != *negate
            }
            Self::In(keys, _, _, negate) => keys.contains(&key) != *negate,
            Self::Null(_)
            | Self::Compare(_, _, Operand::Text(..))
            | Self::Contains(..)
            | Self::StartsWith(_)
            | Self::EndsWith(_) => unreachable!("text tests are compiled for text columns only"),
        }
    }
}

/// The test of one column of a filter.
#[derive(Clone, Debug)]
struct Part {
    column: usize,
    test: Test,
    /// For a text column, whether each dictionary code passes, for the codes below
    /// its length.
    codes: Option<Bitmap>,
}

impl Part {
    /// Whether row `row` of `column` passes. `by_code` says that `column` is the
    /// table's own, whose dictionary the codes bitmap follows.
    fn passes(&self, column: &Column, row: usize, by_code: bool) -> bool {
        let key = column.key(row);
        if key == Key::Null {
            return self.test.null();
        }
        if by_code
            && let (Key::Str(code), Some(codes)) = (key, &self.codes)
            && (code as usize) < codes.len()
        {
            return codes.get(code as usize);
        }
        self.test.key(column, key)
    }

    /// A bit for each of the first `slots` slots of `column`, the table's own,
    /// set where the row passes, 64 to a word.
    fn words(&self, column: &Column, slots: usize) -> Vec<u64> {
        let mut words = match (&self.test, &column.values) {
            // A value passes "is not null", and fails "is null".
            (Test::Null(negate), _) => vec![if *negate { u64::MAX } else { 0 }; slots.div_ceil(64)],
            (_, Values::Utf8 { codes, dictionary }) => self.code_words(&codes[..slots], dictionary),
            (Test::Compare(ordering, negate, Operand::Key(key)), values) => {
                compare_words(values, slots, *ordering, *negate, *key)
            }
            (Test::In(keys, _, _, negate), values) => in_words(values, slots, keys, *negate),
            _ => unreachable!("text tests are compiled for text columns only"),
        };
        // A null slot holds a placeholder: the test decides it instead.
        let nulls = if self.test.null() { u64::MAX } else { 0 };
        for (word, &valid) in words.iter_mut().zip(column.valid.words()) {
            *word = (*word & valid) | (nulls & !valid);
        }
        if let Some(last) = words.last_mut()
            && !slots.is_multiple_of(64)
        {
            *last &= (1 << (slots % 64)) - 1;
        }
        words
    }

    /// The words of a text column's codes: whether each code passes, read from
    /// the codes decided, or decided here for codes the dictionary gained since.
    fn code_words(&self, codes: &[u32], dictionary: &Dictionary) -> Vec<u64> {
        let decided = self.codes.as_ref().expect("a text test decides codes");
        let pass: Vec<bool> = (0..dictionary.len())
            .map(|code| {
                if code < decided.len() {
                    decided.get(code)
                } else {
                    let code = code as u32;
                    self.test
                        .text(dictionary.get(code), dictionary.folded(code))
                }
            })
            .collect();
        let mut passing = pass.iter().enumerate().filter(|&(_, &p)| p);
        match (passing.next(), passing.next()) {
            (None, _) => vec![0; codes.len().div_ceil(64)],
            // One code, as an equality usually has: a comparison of codes.
            (Some((only, _)), None) => {
                let only = only as u32;
                pack(codes, |code| code == only)
            }
            _ if pass.iter().all(|&p| p) => pack(codes, |_| true),
            // A null's placeholder code may be past the dictionary.
            _ => pack(codes, |code| {
                pass.get(code as usize).copied().unwrap_or(false)
            }),
        }
    }

    /// Decides the codes the dictionary gained since the bitmap was last brought up
    /// to date.
    fn extend(&mut self, dictionary: &Dictionary) {
        let Some(codes) = &mut self.codes else {
            return;
        };
        for code in codes.len()..dictionary.len() {
            let code = code as u32;
            codes.push(
                self.test
                    .text(dictionary.get(code), dictionary.folded(code)),
            );
        }
    }
}

/// Packs whether each value passes into words, 64 values to a word, the first
/// in its lowest bit.
fn pack<T: Copy>(values: &[T], pass: impl Fn(T) -> bool) -> Vec<u64> {
    let word = |values: &[T]| {
        values
            .iter()
            .enumerate()
            .fold(0u64, |word, (i, &v)| word | u64::from(pass(v)) << i)
    };
    let (chunks, rest) = values.as_chunks::<64>();
    let mut words = Vec::with_capacity(values.len().div_ceil(64));
    words.extend(chunks.iter().map(|chunk| word(chunk)));
    if !rest.is_empty() {
        words.push(word(rest));
    }
    words
}

/// The words of a comparison, a loop for each operator, so that each holds one
/// comparison of two integers.
fn compare<T: Ord + Copy>(values: &[T], key: T, ordering: Ordering, negate: bool) -> Vec<u64> {
    match (ordering, negate) {
        (Ordering::Equal, false) => pack(values, |v| v == key),
        (Ordering::Equal, true) => pack(values, |v| v != key),
        (Ordering::Less, false) => pack(values, |v| v < key),
        (Ordering::Less, true) => pack(values, |v| v >= key),
        (Ordering::Greater, false) => pack(values, |v| v > key),
        (Ordering::Greater, true) => pack(values, |v| v <= key),
    }
}

/// The words of a comparison of the first `slots` values with `key`, as
/// [`Column::cmp_keys`] compares them: a float by its place in the total order.
fn compare_words(
    values: &Values,
    slots: usize,
    ordering: Ordering,
    negate: bool,
    key: Key,
) -> Vec<u64> {
    match (values, key) {
        (Values::Int64(v), Key::Int(k)) | (Values::Timestamp(v), Key::Ts(k)) => {
            compare(&v[..slots], k, ordering, negate)
        }
        (Values::Date32(v), Key::Date(k)) => compare(&v[..slots], k, ordering, negate),
        (Values::Decimal(Decimals::Wide(v)), Key::Decimal(k)) => {
            compare(&v[..slots], k, ordering, negate)
        }
        (Values::Decimal(Decimals::Narrow(v)), Key::Decimal(k)) => match i64::try_from(k) {
            Ok(k) => compare(&v[..slots], k, ordering, negate),
            // Every word lies on one side of a key that does not fit in one.
            Err(_) => {
                let above = k > 0;
                let passes = match ordering {
                    Ordering::Equal => false,
                    Ordering::Less => above,
                    Ordering::Greater => !above,
                };
                pack(&v[..slots], |_| passes != negate)
            }
        },
        (Values::Boolean(v), Key::Bool(k)) => compare(&v[..slots], k, ordering, negate),
        (Values::Float64(v), Key::Float(bits)) => {
            let k = float_key(f64::from_bits(bits));
            match (ordering, negate) {
                (Ordering::Equal, false) => pack(&v[..slots], |x| float_key(x) == k),
                (Ordering::Equal, true) => pack(&v[..slots], |x| float_key(x) != k),
                (Ordering::Less, false) => pack(&v[..slots], |x| float_key(x) < k),
                (Ordering::Less, true) => pack(&v[..slots], |x| float_key(x) >= k),
                (Ordering::Greater, false) => pack(&v[..slots], |x| float_key(x) > k),
                (Ordering::Greater, true) => pack(&v[..slots], |x| float_key(x) <= k),
            }
        }
        _ => unreachable!("an operand has its column's type"),
    }
}

/// The words of a list's test of `values`, each read as `key` reads it: one
/// comparison for a list of one, a search of the sorted list for more.
fn listed<T: Copy, U: Ord + Copy>(
    values: &[T],
    key: impl Fn(T) -> U,
    mut list: Vec<U>,
    negate: bool,
) -> Vec<u64> {
    list.sort_unstable();
    list.dedup();
    match list.as_slice() {
        [] => pack(values, |_| negate),
        &[only] => pack(values, |v| (key(v) == only) != negate),
        _ => pack(values, |v| list.binary_search(&key(v)).is_ok() != negate),
    }
}

/// The words of "in" or "not in" `keys`, over the first `slots` values.
fn in_words(values: &Values, slots: usize, keys: &FxHashSet<Key>, negate: bool) -> Vec<u64> {
    fn list<T>(keys: &FxHashSet<Key>, of: impl Fn(Key) -> Option<T>) -> Vec<T> {
        keys.iter().filter_map(|&k| of(k)).collect()
    }
    match values {
        Values::Int64(v) => {
            let list = list(keys, |k| if let Key::Int(i) = k { Some(i) } else { None });
            listed(&v[..slots], |x| x, list, negate)
        }
        Values::Timestamp(v) => {
            let list = list(keys, |k| if let Key::Ts(t) = k { Some(t) } else { None });
            listed(&v[..slots], |x| x, list, negate)
        }
        Values::Date32(v) => {
            let list = list(keys, |k| if let Key::Date(d) = k { Some(d) } else { None });
            listed(&v[..slots], |x| x, list, negate)
        }
        Values::Decimal(v) => {
            let list = list(keys, |k| {
                if let Key::Decimal(d) = k {
                    Some(d)
                } else {
                    None
                }
            });
            match v {
                Decimals::Narrow(v) => listed(&v[..slots], i128::from, list, negate),
                Decimals::Wide(v) => listed(&v[..slots], |x| x, list, negate),
            }
        }
        Values::Boolean(v) => {
            let list = list(keys, |k| if let Key::Bool(b) = k { Some(b) } else { None });
            listed(&v[..slots], |x| x, list, negate)
        }
        Values::Float64(v) => {
            let list = list(keys, |k| {
                if let Key::Float(bits) = k {
                    Some(float_key(f64::from_bits(bits)))
                } else {
                    None
                }
            });
            listed(&v[..slots], float_key, list, negate)
        }
        Values::Utf8 { .. } => unreachable!("text is tested by its codes"),
    }
}

/// A filter checked against rows.
#[derive(Clone, Debug)]
pub(crate) struct CompiledFilter {
    /// The filter compiled, by which the table keeps its words.
    filter: Filter,
    parts: Vec<Part>,
}

fn operand(column: &str, ty: &ColumnType, value: &Scalar) -> Result<Operand, ConfigError> {
    let bad = |reason: &str| ConfigError::Filter {
        column: column.to_owned(),
        reason: reason.to_owned(),
    };
    Ok(match (ty, value) {
        (_, Scalar::Null) => return Err(bad("compare with null using IsNull")),
        (ColumnType::Boolean, Scalar::Boolean(b)) => Operand::Key(Key::Bool(*b)),
        (ColumnType::Int64, Scalar::Int64(i)) => Operand::Key(Key::Int(*i)),
        (ColumnType::Float64, Scalar::Float64(f)) if !f.is_nan() => Operand::Key(Key::float(*f)),
        (ColumnType::Float64, Scalar::Int64(i)) => Operand::Key(Key::float(*i as f64)),
        (ColumnType::Decimal { .. }, Scalar::Decimal(d)) => Operand::Key(Key::Decimal(*d)),
        (ColumnType::Decimal { scale, .. }, Scalar::Int64(i)) => Operand::Key(Key::Decimal(
            i128::from(*i)
                .checked_mul(10i128.pow(*scale as u32))
                .ok_or_else(|| bad("value too large"))?,
        )),
        (ColumnType::Utf8, Scalar::Utf8(s)) => Operand::Text(s.clone(), s.to_lowercase()),
        (ColumnType::Date32, Scalar::Date32(d)) => Operand::Key(Key::Date(*d)),
        (ColumnType::Timestamp { .. }, Scalar::Timestamp(t)) => Operand::Key(Key::Ts(*t)),
        _ => return Err(bad(&format!("{value:?} does not match type {ty:?}"))),
    })
}

/// Compiles `op` for one column.
fn compile_test(name: &str, ty: &ColumnType, op: &FilterOp) -> Result<Test, ConfigError> {
    use std::cmp::Ordering::{Equal, Greater, Less};
    Ok(match op {
        FilterOp::Eq(v) => Test::Compare(Equal, false, operand(name, ty, v)?),
        FilterOp::Ne(v) => Test::Compare(Equal, true, operand(name, ty, v)?),
        FilterOp::Lt(v) => Test::Compare(Less, false, operand(name, ty, v)?),
        FilterOp::Ge(v) => Test::Compare(Less, true, operand(name, ty, v)?),
        FilterOp::Gt(v) => Test::Compare(Greater, false, operand(name, ty, v)?),
        FilterOp::Le(v) => Test::Compare(Greater, true, operand(name, ty, v)?),
        FilterOp::In(values) | FilterOp::NotIn(values) => {
            let negate = matches!(op, FilterOp::NotIn(_));
            let mut keys = FxHashSet::default();
            let mut texts = FxHashSet::default();
            let mut nulls = false;
            for v in values {
                // "In" may list null to match nulls; "not in" keeps SQL's rule
                // that nulls never match, so a null there is refused.
                if *v == Scalar::Null && !negate {
                    nulls = true;
                    continue;
                }
                match operand(name, ty, v)? {
                    Operand::Key(k) => {
                        keys.insert(k);
                    }
                    Operand::Text(t, _) => {
                        texts.insert(t);
                    }
                }
            }
            Test::In(keys, texts, nulls, negate)
        }
        FilterOp::IsNull => Test::Null(false),
        FilterOp::IsNotNull => Test::Null(true),
        FilterOp::Contains(s)
        | FilterOp::NotContains(s)
        | FilterOp::StartsWith(s)
        | FilterOp::EndsWith(s) => {
            if *ty != ColumnType::Utf8 {
                return Err(ConfigError::Filter {
                    column: name.to_owned(),
                    reason: "text matching needs a text column".into(),
                });
            }
            let folded = s.to_lowercase();
            match op {
                FilterOp::Contains(_) => Test::Contains(folded, false),
                FilterOp::NotContains(_) => Test::Contains(folded, true),
                FilterOp::StartsWith(_) => Test::StartsWith(folded),
                _ => Test::EndsWith(folded),
            }
        }
    })
}

impl CompiledFilter {
    pub fn compile(table: &Table, filter: &Filter) -> Result<Self, ConfigError> {
        let parts = filter
            .columns()
            .map(|name| {
                let column = table
                    .column_index(name)
                    .ok_or_else(|| ConfigError::UnknownColumn(name.to_owned()))?;
                let ty = table.column(column).column_type();
                let test = compile_test(name, ty, &filter.op)?;
                let codes =
                    (*ty == ColumnType::Utf8 && !matches!(test, Test::Null(_))).then(Bitmap::new);
                Ok(Part {
                    column,
                    test,
                    codes,
                })
            })
            .collect::<Result<_, ConfigError>>()?;
        let mut compiled = Self {
            filter: filter.clone(),
            parts,
        };
        compiled.prepare(table, true);
        Ok(compiled)
    }

    /// Brings the answers for each dictionary code up to date with `table`, after
    /// it gained strings. `fresh` decides every code again, for a table that may
    /// not be the one the filter last saw.
    pub fn prepare(&mut self, table: &Table, fresh: bool) {
        for part in &mut self.parts {
            if fresh && let Some(codes) = &mut part.codes {
                *codes = Bitmap::new();
            }
            if let Some(dictionary) = table.column(part.column).dictionary() {
                part.extend(dictionary);
            }
        }
    }

    /// A bit for each of `table`'s slots, set where the row passes, live or not,
    /// 64 to a word: kept by the table until its rows change. The answers for
    /// the dictionary's codes must have been prepared for `table`.
    pub fn words(&self, table: &Table) -> Arc<Vec<u64>> {
        table.filters().words(table, &self.filter, || {
            let slots = table.num_slots();
            let mut parts = self
                .parts
                .iter()
                .map(|p| p.words(table.column(p.column), slots));
            let mut words = parts.next().expect("a filter tests a column");
            for part in parts {
                for (word, other) in words.iter_mut().zip(part) {
                    *word |= other;
                }
            }
            words
        })
    }

    /// Returns `true` if table row `slot` passes.
    pub fn passes_table(&self, table: &Table, slot: usize) -> bool {
        self.parts
            .iter()
            .any(|p| p.passes(table.column(p.column), slot, true))
    }

    /// Returns `true` if row `row` passes, where `column` returns a table column's
    /// values for these rows, which need not share the table's dictionaries.
    pub fn passes<'a>(&self, column: impl Fn(usize) -> &'a Column, row: usize) -> bool {
        self.parts
            .iter()
            .any(|p| p.passes(column(p.column), row, false))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use arrow_array::{
        ArrayRef, BooleanArray, Date32Array, Decimal128Array, Float64Array, Int64Array,
        RecordBatch, StringArray, TimestampMicrosecondArray,
    };
    use arrow_schema::{DataType, Field, Schema, TimeUnit};
    use proptest::prelude::*;

    use super::*;
    use crate::table::TableOptions;

    /// The columns: a key, then one of each type the engine filters.
    const NAMES: [&str; 8] = ["id", "n", "x", "s", "d", "day", "ts", "b"];

    fn schema() -> Arc<Schema> {
        Arc::new(Schema::new(vec![
            Field::new("id", DataType::Int64, false),
            Field::new("n", DataType::Int64, true),
            Field::new("x", DataType::Float64, true),
            Field::new("s", DataType::Utf8, true),
            Field::new("d", DataType::Decimal128(38, 2), true),
            Field::new("day", DataType::Date32, true),
            Field::new("ts", DataType::Timestamp(TimeUnit::Microsecond, None), true),
            Field::new("b", DataType::Boolean, true),
        ]))
    }

    /// One row: its key and a small value for each other column, which picks
    /// from few values, so that a filter's operand often matches. `None` is null.
    type Row = (i64, [Option<u8>; 7]);

    const INTS: [i64; 5] = [i64::MIN, -3, 0, 7, i64::MAX];
    const FLOATS: [f64; 10] = [
        f64::NEG_INFINITY,
        -1.5,
        -0.0,
        0.0,
        f64::NAN,
        2.5,
        f64::INFINITY,
        -f64::NAN,
        -f64::MAX,
        1.0,
    ];
    const TEXTS: [&str; 10] = ["b", "A", "a", "1Y", "3M", "AA", "BBB-", "", "10Y", "Ba"];
    const DECIMALS: [i128; 6] = [i128::MIN + 1, -5, 0, 5, 1 << 70, i128::MAX];
    const DAYS: [i32; 4] = [-719_162, -1, 0, 20_000];

    fn batch(rows: &[Row]) -> RecordBatch {
        let pick = |i: usize| rows.iter().map(move |(_, v)| v[i].map(usize::from));
        let columns: Vec<ArrayRef> = vec![
            Arc::new(Int64Array::from_iter_values(rows.iter().map(|r| r.0))),
            Arc::new(Int64Array::from_iter(
                pick(0).map(|v| v.map(|v| INTS[v % 5])),
            )),
            Arc::new(Float64Array::from_iter(
                pick(1).map(|v| v.map(|v| FLOATS[v % 10])),
            )),
            Arc::new(StringArray::from_iter(
                pick(2).map(|v| v.map(|v| TEXTS[v % 10])),
            )),
            Arc::new(
                Decimal128Array::from_iter(pick(3).map(|v| v.map(|v| DECIMALS[v % 6])))
                    .with_precision_and_scale(38, 2)
                    .expect("a decimal"),
            ),
            Arc::new(Date32Array::from_iter(
                pick(4).map(|v| v.map(|v| DAYS[v % 4])),
            )),
            Arc::new(TimestampMicrosecondArray::from_iter(
                pick(5).map(|v| v.map(|v| v as i64 * 1_000_003 - 4_000_000)),
            )),
            Arc::new(BooleanArray::from_iter(
                pick(6).map(|v| v.map(|v| v % 2 == 0)),
            )),
        ];
        RecordBatch::try_new(schema(), columns).expect("a batch")
    }

    /// A value of column `column`, from its values and one more that no row
    /// holds, or of another type, which the filter refuses.
    fn value(column: usize, pick: u8) -> Scalar {
        let p = usize::from(pick);
        match (column, p % 12) {
            (_, 11) => Scalar::Boolean(true),
            (1, 10) => Scalar::Int64(8),
            (1, _) => Scalar::Int64(INTS[p % 5]),
            (2, 10) => Scalar::Int64(-3),
            (2, _) => Scalar::Float64(FLOATS[p % 10]),
            (3, 10) => Scalar::Utf8("zz".into()),
            (3, _) => Scalar::Utf8(TEXTS[p % 10].into()),
            (4, 10) => Scalar::Int64(7),
            (4, _) => Scalar::Decimal(DECIMALS[p % 6]),
            (5, 10) => Scalar::Date32(1),
            (5, _) => Scalar::Date32(DAYS[p % 4]),
            (6, 10) => Scalar::Timestamp(17),
            (6, _) => Scalar::Timestamp(p as i64 * 1_000_003 - 4_000_000),
            (_, _) => Scalar::Boolean(p % 2 == 0),
        }
    }

    /// A filter: an operator, a column, operands from its values, and more
    /// columns, picked from `spec`. Some are refused, as a column of the wrong
    /// type is.
    fn filter(spec: &(u8, u8, Vec<u8>, Vec<u8>)) -> Filter {
        let (op, column, picks, more) = spec;
        let column = 1 + usize::from(*column) % (NAMES.len() - 1);
        let one = value(column, picks.first().copied().unwrap_or(0));
        let many = || {
            picks
                .iter()
                .map(|&p| {
                    if p == 255 {
                        Scalar::Null
                    } else {
                        value(column, p)
                    }
                })
                .collect()
        };
        let needle = ["a", "", "1", "y", "BA", "zz"][picks.len() % 6].to_owned();
        let op = match op % 14 {
            0 => FilterOp::Eq(one),
            1 => FilterOp::Ne(one),
            2 => FilterOp::Lt(one),
            3 => FilterOp::Le(one),
            4 => FilterOp::Gt(one),
            5 => FilterOp::Ge(one),
            6 => FilterOp::In(many()),
            7 => FilterOp::NotIn(many()),
            8 => FilterOp::IsNull,
            9 => FilterOp::IsNotNull,
            10 => FilterOp::Contains(needle),
            11 => FilterOp::NotContains(needle),
            12 => FilterOp::StartsWith(needle),
            _ => FilterOp::EndsWith(needle),
        };
        let more: Vec<&str> = more
            .iter()
            .map(|&c| NAMES[1 + usize::from(c) % (NAMES.len() - 1)])
            .collect();
        Filter::new(NAMES[column], op).or_in(&more)
    }

    /// Checks that each filter's words hold, for every live row, what testing
    /// the row alone says, computed and kept.
    fn check(table: &Table, filters: &[Filter]) -> Result<(), TestCaseError> {
        for f in filters {
            let Ok(compiled) = CompiledFilter::compile(table, f) else {
                continue;
            };
            for _kept in 0..2 {
                let words = compiled.words(table);
                prop_assert_eq!(words.len(), table.num_slots().div_ceil(64));
                for slot in table.live_slots() {
                    let bit = words[slot / 64] >> (slot % 64) & 1 == 1;
                    prop_assert_eq!(
                        bit,
                        compiled.passes_table(table, slot),
                        "{:?} at {}",
                        f,
                        slot
                    );
                }
            }
        }
        Ok(())
    }

    fn rows(keys: impl Strategy<Value = i64>) -> impl Strategy<Value = Vec<Row>> {
        prop::collection::vec(
            (
                keys,
                prop::array::uniform7(prop::option::weighted(0.8, 0..10u8)),
            ),
            0..150,
        )
    }

    fn filters() -> impl Strategy<Value = Vec<(u8, u8, Vec<u8>, Vec<u8>)>> {
        prop::collection::vec(
            (
                any::<u8>(),
                any::<u8>(),
                prop::collection::vec(prop_oneof![9 => 0..12u8, 1 => Just(255u8)], 0..4),
                prop::collection::vec(any::<u8>(), 0..3),
            ),
            1..12,
        )
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(300))]

        /// Every filter's words, kept or not, pass the rows that testing each row
        /// alone passes, through a progressive load, a keyed reload and an upsert.
        #[test]
        fn words_pass_the_rows_each_row_passes(
            keyed in any::<bool>(),
            grow in any::<bool>(),
            first in rows(-80..80i64),
            second in rows(-80..80i64),
            specs in filters(),
        ) {
            let dedupe = |rows: Vec<Row>| {
                let mut seen = std::collections::HashSet::new();
                rows.into_iter().filter(|r| seen.insert(r.0)).collect::<Vec<_>>()
            };
            let (first, second) = (dedupe(first), dedupe(second));
            let filters: Vec<Filter> = specs.iter().map(filter).collect();
            let options = TableOptions {
                primary_key: keyed.then(|| "id".to_owned()),
                ..TableOptions::default()
            };
            let mut table = Table::new(&schema(), options).expect("a table");
            if grow {
                // A progressive load: filtered after its first half is published,
                // while its second half is added, and once that is published.
                let half = first.len() / 2;
                table.extend(&batch(&first[..half])).expect("a batch");
                table.publish();
                for step in 0..3 {
                    if step == 1 {
                        table.extend(&batch(&first[half..])).expect("a batch");
                    } else if step == 2 {
                        table.publish();
                    }
                    check(&table, &filters)?;
                }
                table.finish_growth();
            } else {
                table.load(&[batch(&first)]).expect("a load");
            }
            check(&table, &filters)?;
            // A keyed reload deletes, updates and inserts, reusing slots; an
            // unkeyed upsert appends.
            if keyed {
                table.load(&[batch(&second)]).expect("a reload");
            } else {
                table.upsert(&[batch(&second)]).expect("an upsert");
            }
            check(&table, &filters)?;
        }
    }

    #[test]
    fn a_filters_words_are_kept_until_the_rows_change() {
        let options = TableOptions {
            primary_key: Some("id".to_owned()),
            ..TableOptions::default()
        };
        let mut table = Table::new(&schema(), options).expect("a table");
        let row = |id: i64, n: u8| (id, [Some(n); 7]);
        table
            .load(&[batch(&[row(1, 3), row(2, 1), row(3, 3)])])
            .expect("a load");
        let threes = Filter::new("n", FilterOp::Eq(Scalar::Int64(7)));
        let compiled = CompiledFilter::compile(&table, &threes).expect("a filter");
        let kept = compiled.words(&table);
        assert_eq!(*kept, [0b101]);
        assert!(Arc::ptr_eq(&kept, &compiled.words(&table)));
        table
            .load(&[batch(&[row(1, 3), row(2, 3), row(3, 1)])])
            .expect("a reload");
        let compiled = CompiledFilter::compile(&table, &threes).expect("a filter");
        assert_eq!(*compiled.words(&table), [0b011]);
    }
}
