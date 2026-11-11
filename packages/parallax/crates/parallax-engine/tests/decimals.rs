//! Decimals are held in a word each while every value fits, and widen when one
//! does not: what a view computes is the same either way.

use std::sync::Arc;

use arrow_array::cast::AsArray;
use arrow_array::types::Decimal128Type;
use arrow_array::{Array, ArrayRef, Decimal128Array, Int64Array, RecordBatch};
use arrow_schema::{DataType, Field, Schema};
use parallax_engine::view::Sort;
use parallax_engine::{
    Aggregate, Filter, FilterOp, Measure, Scalar, Table, TableOptions, View, ViewConfig,
};

fn batch(values: &[Option<i128>]) -> RecordBatch {
    batch_from(0, values)
}

/// `values`, keyed from `first` on.
fn batch_from(first: i64, values: &[Option<i128>]) -> RecordBatch {
    let schema = Arc::new(Schema::new(vec![
        Field::new("id", DataType::Int64, false),
        Field::new("amount", DataType::Decimal128(38, 2), true),
    ]));
    let ids: Vec<i64> = (first..first + values.len() as i64).collect();
    let amounts = Decimal128Array::from(values.to_vec())
        .with_precision_and_scale(38, 2)
        .unwrap();
    let columns: Vec<ArrayRef> = vec![Arc::new(Int64Array::from(ids)), Arc::new(amounts)];
    RecordBatch::try_new(schema, columns).unwrap()
}

fn table(values: &[Option<i128>]) -> Table {
    let b = batch(values);
    let mut t = Table::new(
        &b.schema(),
        TableOptions {
            primary_key: Some("id".into()),
            ..TableOptions::default()
        },
    )
    .unwrap();
    t.load(&[b]).unwrap();
    t
}

/// The amounts of a flat view's rows, in its order.
fn amounts(table: &Table, config: ViewConfig) -> Vec<Option<i128>> {
    let mut view = View::new(table, config).unwrap();
    let rows = view.num_rows(table);
    let batch = view.window(table, 0..rows, 0..2).batch;
    let column = batch.column_by_name("amount").unwrap();
    let column = column.as_primitive::<Decimal128Type>();
    (0..rows)
        .map(|i| column.is_valid(i).then(|| column.value(i)))
        .collect()
}

fn sorted() -> ViewConfig {
    ViewConfig {
        sort: vec![Sort {
            column: "amount".into(),
            descending: false,
        }],
        ..ViewConfig::default()
    }
}

fn filtered(op: FilterOp) -> ViewConfig {
    ViewConfig {
        filters: vec![Filter::new("amount", op)],
        ..sorted()
    }
}

const HUGE: i128 = i64::MAX as i128 * 1_000;

#[test]
fn values_that_fit_a_word_sort_filter_and_sum_as_wide_ones_do() {
    let narrow = table(&[Some(500), None, Some(-7), Some(i64::MAX as i128), Some(0)]);
    assert_eq!(
        amounts(&narrow, sorted()),
        [Some(-7), Some(0), Some(500), Some(i64::MAX as i128), None]
    );
    // A key no word holds lies past every value.
    assert_eq!(
        amounts(&narrow, filtered(FilterOp::Lt(Scalar::Decimal(HUGE)))),
        [Some(-7), Some(0), Some(500), Some(i64::MAX as i128)]
    );
    assert!(amounts(&narrow, filtered(FilterOp::Gt(Scalar::Decimal(HUGE)))).is_empty());
    assert_eq!(
        amounts(&narrow, filtered(FilterOp::Gt(Scalar::Decimal(-HUGE)))).len(),
        4
    );
    assert!(amounts(&narrow, filtered(FilterOp::Eq(Scalar::Decimal(HUGE)))).is_empty());
    assert_eq!(
        amounts(
            &narrow,
            filtered(FilterOp::In(vec![
                Scalar::Decimal(500),
                Scalar::Decimal(HUGE)
            ]))
        ),
        [Some(500)]
    );
}

#[test]
fn a_value_past_a_word_widens_the_column_in_place() {
    let mut t = table(&[Some(500), Some(-7)]);
    // An update by key past a word, then a new row.
    t.upsert(&[batch(&[Some(500), Some(HUGE)])]).unwrap();
    assert_eq!(amounts(&t, sorted()), [Some(500), Some(HUGE)]);
    let mut grand = View::new(
        &t,
        ViewConfig {
            measures: vec![Measure::new(Aggregate::Sum, "amount")],
            ..ViewConfig::default()
        },
    )
    .unwrap();
    assert_eq!(
        grand.cells(&t)[0].values,
        [parallax_engine::CellValue::Decimal(HUGE + 500)]
    );
    // A load whose first batch fits and whose next does not.
    let mut mixed = table(&[]);
    mixed
        .load(&[
            batch(&[Some(1), Some(2)]),
            batch_from(2, &[Some(3), Some(-HUGE)]),
        ])
        .unwrap();
    assert_eq!(
        amounts(&mixed, sorted()),
        [Some(-HUGE), Some(1), Some(2), Some(3)]
    );
}
