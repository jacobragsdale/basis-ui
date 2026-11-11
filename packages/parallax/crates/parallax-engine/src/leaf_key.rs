//! A row's leaf key packed into one integer.
//!
//! A pivot aggregates each row into the cell of its leaf key: its values in the
//! group and split columns. Built as a boxed slice of [`Key`]s, that key is
//! allocated, hashed key by key and compared slice by slice for every row. When
//! every leaf column is text or boolean, its values are small codes, so the
//! whole key packs into one `u64` in mixed radix: each column a digit, 0 for
//! null, then a text value's dictionary code plus one, or false as 1 and true as
//! 2. Rows then hash and compare one integer, and the slice is built once for
//! each cell. The first column is the most significant digit, and each digit
//! orders its values as [`crate::view`]'s arrangement does, so packed keys sort
//! as their slices do.

use crate::bitmap::Bitmap;
use crate::column::Values;
use crate::table::Table;
use crate::types::Key;

/// One leaf column's digit: where its values are, and how many it can take.
enum Digit<'a> {
    Text {
        codes: &'a [u32],
        valid: &'a Bitmap,
        radix: u64,
    },
    Bool {
        values: &'a [bool],
        valid: &'a Bitmap,
    },
}

impl Digit<'_> {
    fn radix(&self) -> u64 {
        match self {
            Self::Text { radix, .. } => *radix,
            Self::Bool { .. } => 3,
        }
    }

    #[inline]
    fn of(&self, slot: usize) -> u64 {
        match self {
            Self::Text { codes, valid, .. } => {
                if valid.get(slot) {
                    u64::from(codes[slot]) + 1
                } else {
                    0
                }
            }
            Self::Bool { values, valid } => {
                if valid.get(slot) {
                    1 + u64::from(values[slot])
                } else {
                    0
                }
            }
        }
    }

    fn key(&self, digit: u64) -> Key {
        match (self, digit) {
            (_, 0) => Key::Null,
            // A digit came from a code below the dictionary's length.
            (Self::Text { .. }, d) => Key::Str((d - 1) as u32),
            (Self::Bool { .. }, d) => Key::Bool(d == 2),
        }
    }
}

/// Packs and unpacks the leaf keys of a table's rows over some columns.
pub(crate) struct LeafKeyer<'a> {
    digits: Vec<Digit<'a>>,
}

impl<'a> LeafKeyer<'a> {
    /// A keyer for `columns` of `table`, or `None` if a column is neither text
    /// nor boolean, or their values together are too many for a `u64`.
    pub(crate) fn new(table: &'a Table, columns: &[usize]) -> Option<Self> {
        let mut digits = Vec::with_capacity(columns.len());
        let mut span: u64 = 1;
        for &c in columns {
            let column = table.column(c);
            let digit = match &column.values {
                Values::Utf8 { codes, dictionary } => Digit::Text {
                    codes,
                    valid: &column.valid,
                    radix: u64::try_from(dictionary.len()).ok()?.checked_add(1)?,
                },
                Values::Boolean(values) => Digit::Bool {
                    values,
                    valid: &column.valid,
                },
                _ => return None,
            };
            span = span.checked_mul(digit.radix())?;
            digits.push(digit);
        }
        Some(Self { digits })
    }

    /// The packed key of `slot`.
    #[inline]
    pub(crate) fn pack(&self, slot: usize) -> u64 {
        self.digits
            .iter()
            .fold(0, |packed, digit| packed * digit.radix() + digit.of(slot))
    }

    /// The keys a packed key stands for, column by column.
    pub(crate) fn unpack(&self, mut packed: u64) -> Box<[Key]> {
        let mut keys = vec![Key::Null; self.digits.len()];
        for (key, digit) in keys.iter_mut().zip(&self.digits).rev() {
            *key = digit.key(packed % digit.radix());
            packed /= digit.radix();
        }
        keys.into_boxed_slice()
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use arrow_array::{ArrayRef, BooleanArray, Int64Array, RecordBatch, StringArray};
    use arrow_schema::{DataType, Field, Schema};

    use super::*;
    use crate::table::TableOptions;
    use crate::view::arrangement;

    fn table() -> Table {
        let schema = Arc::new(Schema::new(vec![
            Field::new("fund", DataType::Utf8, true),
            Field::new("long", DataType::Boolean, true),
            Field::new("ticker", DataType::Utf8, true),
            Field::new("n", DataType::Int64, true),
        ]));
        let funds = [
            Some("b"),
            None,
            Some("a"),
            Some("b"),
            Some(""),
            Some("a"),
            None,
            Some("c"),
        ];
        let longs = [
            Some(true),
            Some(false),
            None,
            Some(true),
            Some(false),
            None,
            Some(true),
            Some(false),
        ];
        let tickers = [
            Some("X"),
            Some("Y"),
            Some("X"),
            None,
            Some("Z"),
            Some("Y"),
            Some("X"),
            Some("Z"),
        ];
        let columns: Vec<ArrayRef> = vec![
            Arc::new(StringArray::from(funds.to_vec())),
            Arc::new(BooleanArray::from(longs.to_vec())),
            Arc::new(StringArray::from(tickers.to_vec())),
            Arc::new(Int64Array::from(vec![Some(1); 8])),
        ];
        let batch = RecordBatch::try_new(schema.clone(), columns).expect("a batch");
        let mut table = Table::new(&schema, TableOptions::default()).expect("a table");
        table.load(&[batch]).expect("a load");
        table
    }

    /// The keys of `slot` over `columns`, as a pivot builds them.
    fn keys(table: &Table, columns: &[usize], slot: usize) -> Vec<Key> {
        columns.iter().map(|&c| table.column(c).key(slot)).collect()
    }

    #[test]
    fn packs_text_and_booleans_and_unpacks_them_to_the_same_keys() {
        let table = table();
        let columns = [0, 1, 2];
        let keyer = LeafKeyer::new(&table, &columns).expect("text and booleans pack");
        for slot in table.live_slots() {
            assert_eq!(
                &*keyer.unpack(keyer.pack(slot)),
                keys(&table, &columns, slot)
            );
        }
    }

    #[test]
    fn packed_keys_sort_as_the_keys_do_column_by_column() {
        let table = table();
        let columns = [0, 1, 2];
        let keyer = LeafKeyer::new(&table, &columns).expect("text and booleans pack");
        let slots: Vec<usize> = table.live_slots().collect();
        for &a in &slots {
            for &b in &slots {
                let arranged = |slot| {
                    keys(&table, &columns, slot)
                        .iter()
                        .map(arrangement)
                        .collect::<Vec<_>>()
                };
                assert_eq!(
                    keyer.pack(a).cmp(&keyer.pack(b)),
                    arranged(a).cmp(&arranged(b)),
                    "slots {a} and {b}",
                );
            }
        }
    }

    #[test]
    fn packs_no_other_type() {
        let table = table();
        assert!(LeafKeyer::new(&table, &[0, 3]).is_none());
    }
}
