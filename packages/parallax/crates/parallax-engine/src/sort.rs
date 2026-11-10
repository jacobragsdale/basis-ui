//! The orders of a flat view's rows, sorted on integer keys and kept by the
//! table for its current load.
//!
//! A flat view orders its rows by its sort columns, each in its direction with
//! nulls last whichever the direction, then by the table's key, or failing that
//! by insertion: the tie order, which no two rows share, so every sort has one
//! answer. Each sort column's values become an integer that sorts as they do:
//! a text code's rank in the column's order, an integer or a date with its sign
//! bit flipped, a float's bits in IEEE 754's total order with negative zero as
//! zero, a decimal less the column's least value. The rows, in tie order, are
//! then sorted stably by that integer, a byte at a time, skipping the bytes
//! every row shares, and by the narrowest integer that holds the values' range.
//!
//! The table keeps the last few orders it sorted, cleared whenever its rows
//! change. A column's order records where each run of equal values starts, so
//! the other direction is its runs taken backwards, each run's rows kept in tie
//! order and the nulls kept last, without sorting again; a sort on several
//! columns is a stable pass for each, from the last to the first, on each
//! column's dense rank, read from its order. A filter walks the kept order.

use std::sync::{Arc, Mutex, PoisonError};

use crate::bitmap::Bitmap;
use crate::column::{Column, Values};
use crate::order::{Order, Orders};
use crate::table::Table;

/// How many orders a table keeps, besides its tie order: a column's two
/// directions and two more. Each holds four bytes a row.
const KEPT: usize = 4;

/// One sort column: the table column, largest first, and the view's order for
/// a text column if it is not the engine's text order.
type Part = (usize, bool, Option<Order>);

/// An order of a table's live rows.
#[derive(Debug)]
pub(crate) struct Sorted {
    /// Every live slot, in order.
    pub(crate) slots: Vec<u32>,
    /// For an order on one column, its runs of equal values.
    runs: Option<Runs>,
}

/// Where an order on one column changes value.
#[derive(Debug)]
struct Runs {
    /// A bit for each slot of the non-null rows, set where a value starts.
    starts: Bitmap,
    /// The number of distinct values.
    count: u32,
    /// The rows at the end whose value is null.
    nulls: usize,
}

/// The orders a table keeps for its current rows. A clone of a table starts
/// with none.
#[derive(Debug, Default)]
pub(crate) struct SortCache(Mutex<Kept>);

#[derive(Debug, Default)]
struct Kept {
    /// The table's load version and slots when these were sorted.
    stamp: (u64, usize),
    ties: Option<Arc<Sorted>>,
    /// The most recently used last.
    orders: Vec<(Vec<Part>, Arc<Sorted>)>,
}

impl Clone for SortCache {
    fn clone(&self) -> Self {
        Self::default()
    }
}

impl SortCache {
    /// Forgets every order, after the table's rows changed.
    pub(crate) fn clear(&mut self) {
        *self.0.get_mut().unwrap_or_else(PoisonError::into_inner) = Kept::default();
    }

    fn kept(&self, table: &Table) -> std::sync::MutexGuard<'_, Kept> {
        let mut kept = self.0.lock().unwrap_or_else(PoisonError::into_inner);
        let stamp = (table.load_version(), table.num_slots());
        if kept.stamp != stamp {
            *kept = Kept {
                stamp,
                ..Kept::default()
            };
        }
        kept
    }

    fn find(&self, table: &Table, parts: &[Part]) -> Option<Arc<Sorted>> {
        let mut kept = self.kept(table);
        if parts.is_empty() {
            return kept.ties.clone();
        }
        let at = kept.orders.iter().position(|(p, _)| p == parts)?;
        let entry = kept.orders.remove(at);
        let sorted = Arc::clone(&entry.1);
        kept.orders.push(entry);
        Some(sorted)
    }

    fn keep(&self, table: &Table, parts: Vec<Part>, sorted: &Arc<Sorted>) {
        let mut kept = self.kept(table);
        if parts.is_empty() {
            kept.ties = Some(Arc::clone(sorted));
            return;
        }
        kept.orders.retain(|(p, _)| *p != parts);
        if kept.orders.len() == KEPT {
            kept.orders.remove(0);
        }
        kept.orders.push((parts, Arc::clone(sorted)));
    }
}

/// The table's live rows in the order of `sort`, as a flat view sorts them,
/// sorted now or kept from an earlier sort of the same rows.
pub(crate) fn sorted(table: &Table, sort: &[(usize, bool)], orders: &Orders) -> Arc<Sorted> {
    let parts: Vec<Part> = sort
        .iter()
        .map(|&(c, descending)| (c, descending, orders.ranked(c).map(|(o, _)| o.clone())))
        .collect();
    order_of(table, &parts, orders)
}

fn order_of(table: &Table, parts: &[Part], orders: &Orders) -> Arc<Sorted> {
    let cache = table.sorts();
    if let Some(sorted) = cache.find(table, parts) {
        return sorted;
    }
    let sorted = Arc::new(match parts {
        [] => ties(table),
        [(c, descending, order)] => {
            let other = (*c, !descending, order.clone());
            match cache.find(table, std::slice::from_ref(&other)) {
                Some(opposite) => reversed(&opposite),
                None if *descending => reversed(&order_of(table, &[other], orders)),
                None => {
                    let _phase = crate::profile::span("sort: a column");
                    by_column(table, *c, orders, &order_of(table, &[], orders).slots)
                }
            }
        }
        _ => by_columns(table, parts, orders),
    });
    cache.keep(table, parts.to_vec(), &sorted);
    sorted
}

/// The live slots in tie order: by the table's key, or by insertion.
fn ties(table: &Table) -> Sorted {
    let _phase = crate::profile::span("sort: ties");
    let mut slots: Vec<u32> = table
        .live_slots()
        .map(|s| u32::try_from(s).expect("fewer than 2^32 slots"))
        .collect();
    match table.key_column() {
        // A key is never null and never repeats.
        Some(k) => {
            sort_column(table.column(k), None, &mut slots);
        }
        None => {
            sort_by(&mut slots, |s| table.seq(s as usize));
        }
    }
    Sorted { slots, runs: None }
}

/// The live slots in the ascending order of column `c`, nulls last, from the
/// slots in tie order.
fn by_column(table: &Table, c: usize, orders: &Orders, ties: &[u32]) -> Sorted {
    let column = table.column(c);
    let (mut slots, nulls): (Vec<u32>, Vec<u32>) = ties
        .iter()
        .copied()
        .partition(|&s| column.is_valid(s as usize));
    let ranks = orders.ranked(c).map(|(_, ranks)| ranks);
    let (starts, count) = sort_column(column, ranks, &mut slots);
    let null_rows = nulls.len();
    slots.extend(nulls);
    Sorted {
        slots,
        runs: Some(Runs {
            starts,
            count,
            nulls: null_rows,
        }),
    }
}

/// Sorts `slots`, none of them null, stably by their values in `column`, or for
/// text by `ranks` if given, each code's place, or else the dictionary's text
/// order. Returns where each run of equal values starts, and their number.
fn sort_column(column: &Column, ranks: Option<&[u32]>, slots: &mut Vec<u32>) -> (Bitmap, u32) {
    const SIGN: u64 = 1 << 63;
    match &column.values {
        Values::Boolean(v) => sort_by(slots, |s| u64::from(v[s as usize])),
        Values::Int64(v) | Values::Timestamp(v) => sort_by(slots, |s| v[s as usize] as u64 ^ SIGN),
        Values::Date32(v) => sort_by(slots, |s| u64::from(v[s as usize] as u32 ^ (1 << 31))),
        Values::Float64(v) => sort_by(slots, |s| float_key(v[s as usize])),
        Values::Utf8 { codes, dictionary } => match ranks {
            Some(ranks) => sort_by(slots, |s| u64::from(ranks[codes[s as usize] as usize])),
            None => sort_by(slots, |s| u64::from(dictionary.rank(codes[s as usize]))),
        },
        Values::Decimal(v) => {
            let (least, most) = slots
                .iter()
                .map(|&s| v[s as usize])
                .fold((i128::MAX, i128::MIN), |(lo, hi), x| (lo.min(x), hi.max(x)));
            let offset = |s: u32| v[s as usize].wrapping_sub(least) as u128;
            if slots.is_empty() || most.wrapping_sub(least) as u128 <= u128::from(u64::MAX) {
                sort_by(slots, |s| offset(s) as u64)
            } else {
                // Wider than a word: the low word, then stably the high one.
                sort_by(slots, |s| offset(s) as u64);
                sort_by(slots, |s| (offset(s) >> 64) as u64);
                let mut starts = Bitmap::new();
                starts.reserve(slots.len());
                let mut count = 0;
                for (i, &s) in slots.iter().enumerate() {
                    let start = i == 0 || v[s as usize] != v[slots[i - 1] as usize];
                    count += u32::from(start);
                    starts.push(start);
                }
                (starts, count)
            }
        }
    }
}

/// A float's place in IEEE 754's total order, as `f64::total_cmp` orders it,
/// with negative zero as zero, as the engine's keys hold it.
fn float_key(value: f64) -> u64 {
    let bits = if value == 0.0 { 0 } else { value.to_bits() };
    // Negative floats count down: flip all but the sign, then the sign.
    bits ^ ((((bits as i64) >> 63) as u64) >> 1) ^ (1 << 63)
}

/// Sorts `slots` stably by `key`, a byte at a time, as `u32`s when the keys'
/// range fits one. Returns where each run of equal keys starts, and their
/// number.
fn sort_by(slots: &mut Vec<u32>, key: impl Fn(u32) -> u64) -> (Bitmap, u32) {
    let (least, most) = slots
        .iter()
        .map(|&s| key(s))
        .fold((u64::MAX, 0), |(lo, hi), k| (lo.min(k), hi.max(k)));
    if slots.is_empty() || most - least <= u64::from(u32::MAX) {
        let mut keys: Vec<u32> = slots.iter().map(|&s| (key(s) - least) as u32).collect();
        radix(slots, &mut keys);
        runs(&keys)
    } else {
        let mut keys: Vec<u64> = slots.iter().map(|&s| key(s) - least).collect();
        radix(slots, &mut keys);
        runs(&keys)
    }
}

/// Where each run of equal sorted keys starts, and their number.
fn runs<K: Digits>(keys: &[K]) -> (Bitmap, u32) {
    let mut starts = Bitmap::new();
    starts.reserve(keys.len());
    let mut count = 0;
    for (i, key) in keys.iter().enumerate() {
        let start = i == 0 || *key != keys[i - 1];
        count += u32::from(start);
        starts.push(start);
    }
    (starts, count)
}

/// An unsigned integer sorted a byte at a time.
trait Digits: Copy + Default + Ord {
    const BYTES: usize;
    fn byte(self, at: usize) -> usize;
}

impl Digits for u32 {
    const BYTES: usize = 4;
    fn byte(self, at: usize) -> usize {
        (self >> (8 * at)) as usize & 0xff
    }
}

impl Digits for u64 {
    const BYTES: usize = 8;
    fn byte(self, at: usize) -> usize {
        (self >> (8 * at)) as usize & 0xff
    }
}

/// Sorts `slots` stably by `keys`, which it sorts beside them: least
/// significant byte first, skipping a byte every key shares, and nothing at all
/// for keys already in order.
fn radix<K: Digits>(slots: &mut Vec<u32>, keys: &mut Vec<K>) {
    let n = keys.len();
    if keys.is_sorted() {
        return;
    }
    let mut counts = [[0usize; 256]; 8];
    for &key in keys.iter() {
        for (at, count) in counts.iter_mut().enumerate().take(K::BYTES) {
            count[key.byte(at)] += 1;
        }
    }
    let mut spare_keys = vec![K::default(); n];
    let mut spare_slots = vec![0u32; n];
    for (at, count) in counts.iter().enumerate().take(K::BYTES) {
        if count.contains(&n) {
            continue;
        }
        let mut next = [0usize; 256];
        let mut sum = 0;
        for (place, &c) in next.iter_mut().zip(count) {
            *place = sum;
            sum += c;
        }
        for (&key, &slot) in keys.iter().zip(slots.iter()) {
            let place = &mut next[key.byte(at)];
            spare_keys[*place] = key;
            spare_slots[*place] = slot;
            *place += 1;
        }
        std::mem::swap(keys, &mut spare_keys);
        std::mem::swap(slots, &mut spare_slots);
    }
}

/// An order on one column, the other way: its runs backwards, each run's rows
/// in the order they were, and the nulls still last.
fn reversed(sorted: &Sorted) -> Sorted {
    let _phase = crate::profile::span("sort: reverse");
    let runs = sorted.runs.as_ref().expect("an order on one column");
    let values = sorted.slots.len() - runs.nulls;
    let mut slots = Vec::with_capacity(sorted.slots.len());
    let mut starts = Bitmap::new();
    starts.reserve(values);
    let mut end = values;
    for i in (0..values).rev() {
        if runs.starts.get(i) {
            slots.extend_from_slice(&sorted.slots[i..end]);
            starts.push(true);
            for _ in i + 1..end {
                starts.push(false);
            }
            end = i;
        }
    }
    slots.extend_from_slice(&sorted.slots[values..]);
    Sorted {
        slots,
        runs: Some(Runs {
            starts,
            count: runs.count,
            nulls: runs.nulls,
        }),
    }
}

/// The order of a sort on several columns: from the tie order, a stable pass
/// for each column from the last to the first, on its values' dense ranks.
fn by_columns(table: &Table, parts: &[Part], orders: &Orders) -> Sorted {
    let _phase = crate::profile::span("sort: columns");
    let mut slots = order_of(table, &[], orders).slots.clone();
    let mut spare = vec![0u32; slots.len()];
    let mut rank = vec![0u32; table.num_slots()];
    for (c, descending, order) in parts.iter().rev() {
        let column = order_of(table, &[(*c, false, order.clone())], orders);
        let runs = column.runs.as_ref().expect("an order on one column");
        let values = column.slots.len() - runs.nulls;
        // Each value's place in this direction; nulls last.
        let mut r = 0;
        for (i, &s) in column.slots[..values].iter().enumerate() {
            if i > 0 && runs.starts.get(i) {
                r += 1;
            }
            rank[s as usize] = if *descending { runs.count - 1 - r } else { r };
        }
        for &s in &column.slots[values..] {
            rank[s as usize] = runs.count;
        }
        let mut next = vec![0usize; runs.count as usize + 2];
        for &s in &slots {
            next[rank[s as usize] as usize + 1] += 1;
        }
        for i in 1..next.len() {
            next[i] += next[i - 1];
        }
        for &s in &slots {
            let place = &mut next[rank[s as usize] as usize];
            spare[*place] = s;
            *place += 1;
        }
        std::mem::swap(&mut slots, &mut spare);
    }
    Sorted { slots, runs: None }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use arrow_array::{
        ArrayRef, BooleanArray, Date32Array, Decimal128Array, Float64Array, Int64Array,
        RecordBatch, StringArray, TimestampMicrosecondArray,
    };
    use arrow_schema::{DataType, Field, Schema, TimeUnit};
    use proptest::prelude::*;

    use super::*;
    use crate::table::TableOptions;
    use crate::view::compare_slots;

    /// The columns: a key, then one of each type the engine sorts.
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
    /// from few values, so that ties are common. `None` is null.
    type Row = (i64, [Option<u8>; 7]);

    const FLOATS: [f64; 10] = [
        f64::NEG_INFINITY,
        -1.5,
        -0.0,
        0.0,
        5e-324,
        2.5,
        f64::INFINITY,
        f64::MAX,
        -f64::MAX,
        1.0,
    ];
    const TEXTS: [&str; 10] = ["b", "A", "a", "1Y", "3M", "AA", "BBB-", "", "10Y", "B"];
    /// Decimals whose range passes a word, which sort on two.
    const DECIMALS: [i128; 10] = [
        i128::MIN + 1,
        -170_141_183_460_469_231_731_687_303_715,
        -5,
        0,
        5,
        1 << 70,
        i128::MAX,
        123,
        -123,
        1 << 64,
    ];

    fn batch(rows: &[Row], wide: bool) -> RecordBatch {
        let pick = |i: usize| rows.iter().map(move |(_, v)| v[i].map(usize::from));
        let columns: Vec<ArrayRef> = vec![
            Arc::new(Int64Array::from_iter_values(rows.iter().map(|r| r.0))),
            Arc::new(Int64Array::from_iter(
                pick(0).map(|v| v.map(|v| [i64::MIN, -3, 0, 7, i64::MAX][v % 5])),
            )),
            Arc::new(Float64Array::from_iter(
                pick(1).map(|v| v.map(|v| FLOATS[v % 10])),
            )),
            Arc::new(StringArray::from_iter(
                pick(2).map(|v| v.map(|v| TEXTS[v % 10])),
            )),
            Arc::new(
                Decimal128Array::from_iter(pick(3).map(|v| {
                    v.map(|v| {
                        if wide {
                            DECIMALS[v % 10]
                        } else {
                            v as i128 * 37 - 100
                        }
                    })
                }))
                .with_precision_and_scale(38, 2)
                .expect("a decimal"),
            ),
            Arc::new(Date32Array::from_iter(
                pick(4).map(|v| v.map(|v| [-719_162, -1, 0, 20_000][v % 4])),
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

    /// The live slots in the order the comparison sort gives, today's and the
    /// reference.
    fn compared(table: &Table, sort: &[(usize, bool)], orders: &Orders) -> Vec<u32> {
        let mut slots: Vec<usize> = table.live_slots().collect();
        slots.sort_by(|&a, &b| compare_slots(table, (sort, orders), a, b));
        slots.into_iter().map(|s| s as u32).collect()
    }

    fn rows(keys: impl Strategy<Value = i64>) -> impl Strategy<Value = Vec<Row>> {
        prop::collection::vec(
            (
                keys,
                prop::array::uniform7(prop::option::weighted(0.8, 0..10u8)),
            ),
            0..40,
        )
    }

    fn sorts() -> impl Strategy<Value = Vec<Vec<(usize, bool)>>> {
        prop::collection::vec(
            prop::collection::vec((1..NAMES.len(), any::<bool>()), 0..4),
            1..8,
        )
    }

    fn orders_for(table: &Table, which: u8) -> Orders {
        let order = match which % 5 {
            0 => return Orders::default(),
            1 => Order::Tenor,
            2 => Order::Rating,
            3 => Order::Values(vec!["a".into(), "1Y".into(), "b".into()]),
            _ => Order::By("n".into()),
        };
        let map = BTreeMap::from([("s".to_owned(), order)]);
        Orders::compile(table, &map).expect("an order")
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(300))]

        /// Every sort, kept or not, toggled or on several columns, orders the rows
        /// as the comparison sort does, before and after a reload changes them.
        #[test]
        fn sorts_on_keys_order_rows_as_the_comparison_sort_does(
            keyed in any::<bool>(),
            wide in any::<bool>(),
            which in any::<u8>(),
            grow in any::<bool>(),
            first in rows(-30..30i64),
            second in rows(-30..30i64),
            specs in sorts(),
        ) {
            let dedupe = |rows: Vec<Row>| {
                let mut seen = std::collections::HashSet::new();
                rows.into_iter().filter(|r| seen.insert(r.0)).collect::<Vec<_>>()
            };
            let (first, second) = (dedupe(first), dedupe(second));
            let options = TableOptions {
                primary_key: keyed.then(|| "id".to_owned()),
                ..TableOptions::default()
            };
            let mut table = Table::new(&schema(), options).expect("a table");
            if grow {
                // A progressive load: sorted after its first half is published,
                // while its second half is added, and once that is published.
                let half = first.len() / 2;
                table.extend(&batch(&first[..half], wide)).expect("a batch");
                table.publish();
                for step in 0..3 {
                    if step == 1 {
                        table.extend(&batch(&first[half..], wide)).expect("a batch");
                    } else if step == 2 {
                        table.publish();
                    }
                    let orders = orders_for(&table, which);
                    for sort in &specs {
                        let got = sorted(&table, sort, &orders);
                        prop_assert_eq!(&got.slots, &compared(&table, sort, &orders));
                    }
                }
                table.finish_growth();
            } else {
                table.load(&[batch(&first, wide)]).expect("a load");
            }
            for reload in [false, true] {
                if reload {
                    // A keyed reload deletes, updates and inserts, reusing slots;
                    // an unkeyed upsert appends.
                    if keyed {
                        table.load(&[batch(&second, wide)]).expect("a reload");
                    } else {
                        table.upsert(&[batch(&second, wide)]).expect("an upsert");
                    }
                }
                let orders = orders_for(&table, which);
                for sort in &specs {
                    let got = sorted(&table, sort, &orders);
                    prop_assert_eq!(&got.slots, &compared(&table, sort, &orders), "{:?}", sort);
                }
            }
        }
    }

    #[test]
    fn a_kept_order_is_forgotten_when_the_rows_change() {
        let options = TableOptions {
            primary_key: Some("id".to_owned()),
            ..TableOptions::default()
        };
        let mut table = Table::new(&schema(), options).expect("a table");
        let row = |id: i64, n: u8| (id, [Some(n); 7]);
        table
            .load(&[batch(&[row(1, 3), row(2, 1), row(3, 2)], false)])
            .expect("a load");
        let orders = Orders::default();
        let by_n = [(1, false)];
        assert_eq!(sorted(&table, &by_n, &orders).slots, [1, 2, 0]);
        let kept = sorted(&table, &by_n, &orders);
        assert!(Arc::ptr_eq(&kept, &sorted(&table, &by_n, &orders)));
        table
            .load(&[batch(&[row(1, 3), row(2, 4), row(3, 2)], false)])
            .expect("a reload");
        assert_eq!(sorted(&table, &by_n, &orders).slots, [2, 0, 1]);
        assert_eq!(sorted(&table, &[(1, true)], &orders).slots, [1, 0, 2]);
    }

    #[test]
    fn float_keys_order_as_total_cmp_does_with_negative_zero_as_zero() {
        let values = [
            f64::from_bits(0xfff8_0000_0000_0001),
            -f64::NAN,
            f64::NEG_INFINITY,
            -1e300,
            -1.0,
            -f64::MIN_POSITIVE,
            -5e-324,
            0.0,
            5e-324,
            1.0,
            f64::MAX,
            f64::INFINITY,
            f64::NAN,
        ];
        for pair in values.windows(2) {
            assert_eq!(
                float_key(pair[0]).cmp(&float_key(pair[1])),
                pair[0].total_cmp(&pair[1]),
                "{pair:?}"
            );
        }
        assert_eq!(float_key(-0.0), float_key(0.0));
    }

    #[test]
    fn a_radix_sort_is_stable_and_skips_the_bytes_keys_share() {
        let mut slots: Vec<u32> = (0..1000).collect();
        let mut keys: Vec<u64> = (0..1000u64).map(|i| (i * 7919 % 13) << 40).collect();
        let mut expected: Vec<(u64, u32)> = keys.iter().copied().zip(slots.clone()).collect();
        expected.sort_by_key(|&(k, _)| k);
        radix(&mut slots, &mut keys);
        let got: Vec<(u64, u32)> = keys.into_iter().zip(slots).collect();
        assert_eq!(got, expected);
    }
}
