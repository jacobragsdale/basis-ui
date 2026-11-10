//! Orders for text columns that know what they hold.
//!
//! Text sorts alphabetically, so a DV01 ladder reads `10Y, 1Y, 20Y, 2Y` and
//! ratings put `A` ahead of `AA`. A view can give a text column another order:
//!
//! - [`Order::Tenor`]: by length, `1D` before `1W`, `3M`, `1Y` and `10Y`, read as
//!   `@basis/ui/dates` reads a tenor: a whole number from 1 to 9999, then `D`, `W`,
//!   `M` or `Y` in either case, a month being a twelfth of a Julian year.
//! - [`Order::Rating`]: best first, on S&P's and Fitch's scale (`AAA` to `D`) and
//!   Moody's (`Aaa` to `C`), a notch of one equal to the same notch of the other.
//! - [`Order::Values`]: as listed.
//! - [`Order::By`]: by another column's smallest value among a key's rows, such
//!   as a bucket's shortest maturity.
//!
//! Keys an order cannot place, such as `NR` among ratings, come after the rest,
//! and keys it places alike, such as `12M` and `1Y`, follow each other in text
//! order; nulls come last, as they always do. Each order becomes a rank for every
//! string of the column's dictionary, so sorting compares integers, as text order
//! does.

use std::cmp::Ordering;

use crate::error::ConfigError;
use crate::table::Table;
use crate::types::{ColumnType, Key};

/// How a text column's values are ordered.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Order {
    /// Alphabetically, ignoring case: the engine's text order.
    Text,
    /// Tenors by length.
    Tenor,
    /// Credit ratings, best first.
    Rating,
    /// As listed; values not listed come after.
    Values(Vec<String>),
    /// By another column's smallest value among the key's rows.
    By(String),
}

/// A tenor's length in 48ths of a day, which holds a month, a twelfth of a Julian
/// year of 365.25 days, as a whole number: 1,461.
const DAY: u64 = 48;
const WEEK: u64 = 7 * DAY;
const MONTH: u64 = 1_461;
const YEAR: u64 = 12 * MONTH;

/// A tenor's length, by the grammar `@basis/ui/dates` reads: a whole number from 1
/// to 9999 and `D`, `W`, `M` or `Y`, in either case, around spaces. `None` for
/// anything else.
#[must_use]
pub fn tenor_length(text: &str) -> Option<u64> {
    let text = text.trim();
    let unit = text.chars().last()?;
    let digits = &text[..text.len() - unit.len_utf8()];
    if digits.is_empty() || digits.len() > 4 || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let count: u64 = digits.parse().ok()?;
    let per = match unit.to_ascii_uppercase() {
        'D' => DAY,
        'W' => WEEK,
        'M' => MONTH,
        'Y' => YEAR,
        _ => return None,
    };
    (count >= 1).then_some(count * per)
}

/// A tenor's length in years, a year being 365.25 days, or `None` for text that
/// is not a tenor.
#[must_use]
pub fn tenor_years(text: &str) -> Option<f64> {
    tenor_length(text).map(|length| length as f64 / YEAR as f64)
}

/// Each notch of the rating scales, best first: S&P's and Fitch's names, then
/// Moody's in upper case. Fitch's `RD` and S&P's `SD` are restricted and
/// selective defaults; Fitch's `DDD` and `DD`, its former default grades.
const NOTCHES: [&[&str]; 23] = [
    &["AAA"],
    &["AA+", "AA1"],
    &["AA", "AA2"],
    &["AA-", "AA3"],
    &["A+", "A1"],
    &["A", "A2"],
    &["A-", "A3"],
    &["BBB+", "BAA1"],
    &["BBB", "BAA2"],
    &["BBB-", "BAA3"],
    &["BB+", "BA1"],
    &["BB", "BA2"],
    &["BB-", "BA3"],
    &["B+", "B1"],
    &["B", "B2"],
    &["B-", "B3"],
    &["CCC+", "CAA1"],
    &["CCC", "CAA2"],
    &["CCC-", "CAA3"],
    &["CC", "CA"],
    &["C"],
    &["SD", "RD"],
    &["D", "DD", "DDD"],
];

/// A rating's notch, 0 for the best, or `None` for text that is not a rating, such
/// as `NR` or `WR`.
#[must_use]
pub fn rating_notch(text: &str) -> Option<u64> {
    let upper = text.trim().to_ascii_uppercase();
    NOTCHES
        .iter()
        .position(|names| names.contains(&upper.as_str()))
        .map(|notch| notch as u64)
}

/// A text column's order, compiled against a table: each dictionary code's rank.
#[derive(Clone, Debug)]
pub(crate) struct ColumnOrder {
    column: usize,
    order: Order,
    /// The column [`Order::By`] reads.
    by: Option<usize>,
    /// Each dictionary code's place in the order.
    ranks: Vec<u32>,
}

/// Where a key sits: placed keys by their place, then the rest; then text order.
type Place = (bool, u64);

impl ColumnOrder {
    fn compile(table: &Table, column: &str, order: &Order) -> Result<Self, ConfigError> {
        let index = table
            .column_index(column)
            .ok_or_else(|| ConfigError::UnknownColumn(column.to_owned()))?;
        let ty = table.column(index).column_type();
        if *ty != ColumnType::Utf8 {
            return Err(ConfigError::Order {
                column: column.to_owned(),
                reason: format!(
                    "is {}, and only text columns take an order; numbers and dates already sort by value",
                    ty.to_arrow()
                ),
            });
        }
        let by = match order {
            Order::By(other) => Some(
                table
                    .column_index(other)
                    .ok_or_else(|| ConfigError::UnknownColumn(other.clone()))?,
            ),
            _ => None,
        };
        let mut compiled = Self {
            column: index,
            order: order.clone(),
            by,
            ranks: Vec::new(),
        };
        compiled.refresh(table);
        Ok(compiled)
    }

    /// Ranks every string of the column's dictionary again, after a load.
    fn refresh(&mut self, table: &Table) {
        let column = table.column(self.column);
        let Some(dictionary) = column.dictionary() else {
            return;
        };
        let codes = dictionary.len() as u32;
        let mut order: Vec<u32> = (0..codes).collect();
        match (&self.order, self.by) {
            (Order::By(_), Some(by)) => {
                // Each code's smallest value of the other column, among live rows.
                let other = table.column(by);
                let mut least: Vec<Key> = vec![Key::Null; codes as usize];
                for slot in table.live_slots() {
                    let (Key::Str(code), value) = (column.key(slot), other.key(slot)) else {
                        continue;
                    };
                    let current = &mut least[code as usize];
                    if value != Key::Null
                        && (*current == Key::Null
                            || other.cmp_keys(value, *current) == Ordering::Less)
                    {
                        *current = value;
                    }
                }
                order.sort_by(|&a, &b| {
                    other
                        .cmp_keys(least[a as usize], least[b as usize])
                        .then_with(|| dictionary.rank(a).cmp(&dictionary.rank(b)))
                });
            }
            (order_kind, _) => {
                let place = |code: u32| -> Place {
                    let text = dictionary.get(code);
                    let placed = match order_kind {
                        Order::Text | Order::By(_) => Some(0),
                        Order::Tenor => tenor_length(text),
                        Order::Rating => rating_notch(text),
                        Order::Values(values) => {
                            values.iter().position(|v| v == text).map(|i| i as u64)
                        }
                    };
                    placed.map_or((true, 0), |p| (false, p))
                };
                let places: Vec<Place> = (0..codes).map(place).collect();
                order.sort_by(|&a, &b| {
                    places[a as usize]
                        .cmp(&places[b as usize])
                        .then_with(|| dictionary.rank(a).cmp(&dictionary.rank(b)))
                });
            }
        }
        self.ranks = vec![0; codes as usize];
        for (rank, &code) in order.iter().enumerate() {
            self.ranks[code as usize] = rank as u32;
        }
    }

    /// Compares two keys of the column: by rank, nulls last.
    fn cmp(&self, a: Key, b: Key) -> Ordering {
        match (a, b) {
            (Key::Str(x), Key::Str(y)) => self.ranks[x as usize].cmp(&self.ranks[y as usize]),
            (Key::Null, Key::Null) => Ordering::Equal,
            (Key::Null, _) => Ordering::Greater,
            (_, Key::Null) => Ordering::Less,
            _ => Ordering::Equal,
        }
    }
}

/// A view's orders for its text columns.
#[derive(Clone, Debug, Default)]
pub(crate) struct Orders(Vec<ColumnOrder>);

impl Orders {
    /// Compiles `orders` against `table`.
    ///
    /// # Errors
    ///
    /// Returns an error for an unknown column, a column that is not text, or an
    /// order by an unknown column.
    pub(crate) fn compile<'a>(
        table: &Table,
        orders: impl IntoIterator<Item = (&'a String, &'a Order)>,
    ) -> Result<Self, ConfigError> {
        orders
            .into_iter()
            .filter(|(_, order)| **order != Order::Text)
            .map(|(column, order)| ColumnOrder::compile(table, column, order))
            .collect::<Result<Vec<_>, _>>()
            .map(Self)
    }

    /// Ranks every ordered column's strings again, after the table changed.
    pub(crate) fn refresh(&mut self, table: &Table) {
        for order in &mut self.0 {
            order.refresh(table);
        }
    }

    /// The order the view gives text column `column`, if not the engine's text
    /// order, with each of its dictionary codes' places in it.
    pub(crate) fn ranked(&self, column: usize) -> Option<(&Order, &[u32])> {
        self.0
            .iter()
            .find(|o| o.column == column)
            .map(|o| (&o.order, o.ranks.as_slice()))
    }

    /// Compares two keys of table column `column` in its order: the engine's text
    /// order, or the order the view gives it. Nulls sort last.
    pub(crate) fn cmp(&self, table: &Table, column: usize, a: Key, b: Key) -> Ordering {
        match self.0.iter().find(|o| o.column == column) {
            Some(order) => order.cmp(a, b),
            None => table.column(column).cmp_keys(a, b),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tenors_read_as_basis_ui_reads_them() {
        // @basis/ui/dates' parseTenor cases.
        for (text, years) in [
            ("1D", 1.0 / 365.25),
            ("2W", 14.0 / 365.25),
            ("3M", 0.25),
            ("10Y", 10.0),
            (" 6m ", 0.5),
            ("30y", 30.0),
        ] {
            assert!((tenor_years(text).unwrap() - years).abs() < 1e-12, "{text}");
        }
        for text in [
            "", "M", "3", "3Q", "3 M", "-1Y", "1.5Y", "ON", "10000D", "0M",
        ] {
            assert_eq!(tenor_length(text), None, "{text:?}");
        }
        assert_eq!(tenor_length("12M"), tenor_length("1Y"));
        assert!(tenor_length("4W") < tenor_length("1M"));
        assert!(tenor_length("1M") < tenor_length("31D"));
    }

    #[test]
    fn ratings_match_notch_for_notch_across_the_agencies() {
        assert_eq!(rating_notch("AAA"), rating_notch("Aaa"));
        assert_eq!(rating_notch("BBB-"), rating_notch("Baa3"));
        assert_eq!(rating_notch("CCC+"), rating_notch("Caa1"));
        assert!(rating_notch("AA") < rating_notch("A"));
        assert!(rating_notch("A-") < rating_notch("BBB+"));
        assert!(rating_notch("C") < rating_notch("SD"));
        assert!(rating_notch("RD") < rating_notch("D"));
        assert_eq!(rating_notch(" bbb+ "), rating_notch("BBB+"));
        for text in ["NR", "WR", "A-1+", "P-1", "BBB+ (Negative)", ""] {
            assert_eq!(rating_notch(text), None, "{text:?}");
        }
    }
}
