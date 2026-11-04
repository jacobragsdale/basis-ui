//! Row filters with SQL semantics: a comparison with a null value is not true.
//!
//! A filter on a text column decides each distinct string once. It keeps whether
//! each dictionary code passes in a bitmap, which grows as the dictionary does,
//! so testing a row reads its code and one bit. Removed rows carry dictionaries of
//! their own, so they are tested on their text.

use std::cmp::Ordering;

use rustc_hash::FxHashSet;

use crate::bitmap::Bitmap;
use crate::column::Column;
use crate::dictionary::Dictionary;
use crate::error::ConfigError;
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

/// A filter checked against rows.
#[derive(Clone, Debug)]
pub(crate) struct CompiledFilter {
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
        let mut compiled = Self { parts };
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
