//! Running totals: Excel's "Running Total In", among siblings in their order.

// Amounts are in cents, written as dollars_cents.
#![allow(clippy::inconsistent_digit_grouping)]

use std::sync::Arc;

use arrow_array::cast::AsArray;
use arrow_array::types::Float64Type;
use arrow_array::{ArrayRef, Decimal128Array, Float64Array, RecordBatch, StringArray};
use arrow_schema::{DataType, Field, Schema};
use parallax_engine::view::{Comparison, GroupOrder, GroupSort, Having, TopN};
use parallax_engine::{
    Aggregate, CellValue, ConfigError, Measure, Scalar, ShowAs, Table, TableOptions, View,
    ViewConfig,
};

fn texts(values: &[Option<&str>]) -> ArrayRef {
    Arc::new(StringArray::from(values.to_vec()))
}

/// P&L explain by factor, in cents, with a few rows per factor, and their units.
fn attribution() -> Table {
    let factor = texts(&[
        Some("carry"),
        Some("carry"),
        Some("curve"),
        Some("spread"),
        Some("spread"),
        Some("fx"),
        None,
    ]);
    let currency = texts(&[
        Some("USD"),
        Some("USD"),
        Some("USD"),
        Some("USD"),
        Some("USD"),
        Some("EUR"),
        Some("USD"),
    ]);
    let pnl: ArrayRef = Arc::new(
        Decimal128Array::from(vec![
            Some(120_00),
            Some(30_05),
            Some(-410_10),
            Some(75_00),
            None,
            Some(12_34),
            Some(-1_00),
        ])
        .with_precision_and_scale(18, 2)
        .unwrap(),
    );
    let weight: ArrayRef = Arc::new(Float64Array::from(vec![
        Some(0.1),
        Some(0.2),
        Some(0.3),
        None,
        Some(1e16),
        Some(-1e16),
        Some(0.5),
    ]));
    let columns = vec![
        ("factor", factor),
        ("currency", currency),
        ("pnl", pnl),
        ("weight", weight),
    ];
    let schema = Schema::new(
        columns
            .iter()
            .map(|(name, a)| Field::new(*name, a.data_type().clone(), true))
            .collect::<Vec<_>>(),
    );
    let batch = RecordBatch::try_new(
        Arc::new(schema.clone()),
        columns.into_iter().map(|(_, a)| a).collect(),
    )
    .unwrap();
    let mut table = Table::new(&schema, TableOptions::default()).unwrap();
    table.load(&[batch]).unwrap();
    table
}

fn running(aggregate: Aggregate, column: &str) -> Measure {
    Measure::new(aggregate, column).show_as(ShowAs::RunningTotal)
}

/// Each visible row's label and its values, as the frame carries them.
fn rows(table: &Table, config: ViewConfig) -> Vec<(String, Vec<CellValue>)> {
    let mut view = View::new(table, config).unwrap();
    let n = view.num_rows(table);
    let labels: Vec<String> = view
        .window(table, 0..n, 0..1)
        .batch
        .column_by_name("__label")
        .unwrap()
        .as_string::<i32>()
        .iter()
        .map(|l| l.unwrap().to_owned())
        .collect();
    let cells = view.cells(table);
    let paths: Vec<Option<Vec<Scalar>>> = (0..n).map(|row| view.row_path(table, row)).collect();
    labels
        .into_iter()
        .zip(paths)
        .map(|(label, path)| {
            let values = match path {
                Some(path) => cells
                    .iter()
                    .find(|c| c.path == path && c.split.is_none())
                    .unwrap()
                    .values
                    .clone(),
                None => Vec::new(),
            };
            (label, values)
        })
        .collect()
}

fn by_factor(measures: Vec<Measure>) -> ViewConfig {
    ViewConfig {
        group_by: vec!["factor".into()],
        measures,
        ..ViewConfig::default()
    }
}

#[test]
fn sums_and_counts_run_among_siblings_in_their_order() {
    let t = attribution();
    let shown = rows(
        &t,
        by_factor(vec![
            Measure::new(Aggregate::Sum, "pnl"),
            running(Aggregate::Sum, "pnl"),
            running(Aggregate::Count, "pnl"),
            Measure::count_all().show_as(ShowAs::RunningTotal),
        ]),
    );
    let expected = [
        ("Total", [-173_71, -173_71, 6, 7]),
        ("carry", [150_05, 150_05, 2, 2]),
        ("curve", [-410_10, -260_05, 3, 3]),
        ("fx", [12_34, -247_71, 4, 4]),
        ("spread", [75_00, -172_71, 5, 6]),
        // Nulls sort last, and end on the grand total.
        ("(blank)", [-1_00, -173_71, 6, 7]),
    ];
    assert_eq!(shown.len(), expected.len());
    for ((label, values), (want_label, want)) in shown.iter().zip(expected) {
        assert_eq!(label, want_label);
        assert_eq!(
            values,
            &vec![
                CellValue::Decimal(want[0]),
                CellValue::Decimal(want[1]),
                CellValue::Count(want[2] as i64),
                CellValue::Count(want[3] as i64),
            ],
            "{label}"
        );
    }
}

#[test]
fn a_float_run_is_one_exact_sum_rounded_once() {
    let t = attribution();
    let shown = rows(&t, by_factor(vec![running(Aggregate::Sum, "weight")]));
    // carry 0.1 + 0.2; curve adds 0.3; fx adds -1e16; spread adds 1e16; the
    // blank adds 0.5. Adding the groups' rounded sums would lose the 0.6 to 1e16.
    let values: Vec<CellValue> = shown.iter().map(|(_, v)| v[0].clone()).collect();
    assert_eq!(
        values,
        vec![
            CellValue::Float(1.1),
            CellValue::Float(0.1 + 0.2),
            CellValue::Float(0.6),
            CellValue::Float(0.6 - 1e16),
            CellValue::Float(0.6),
            CellValue::Float(1.1),
        ]
    );
}

#[test]
fn a_run_follows_a_sort_by_another_measure() {
    let t = attribution();
    let shown = rows(
        &t,
        ViewConfig {
            group_sort: GroupSort {
                by: GroupOrder::Measure(0),
                descending: true,
            },
            ..by_factor(vec![
                Measure::new(Aggregate::Sum, "pnl"),
                running(Aggregate::Sum, "pnl"),
            ])
        },
    );
    let labels: Vec<&str> = shown.iter().map(|(l, _)| l.as_str()).collect();
    assert_eq!(
        labels,
        ["Total", "carry", "spread", "fx", "(blank)", "curve"]
    );
    let runs: Vec<CellValue> = shown.iter().map(|(_, v)| v[1].clone()).collect();
    assert_eq!(
        runs,
        [-173_71, 150_05, 225_05, 237_39, 236_39, -173_71].map(CellValue::Decimal)
    );
}

#[test]
fn other_ends_the_run_on_the_parents_total() {
    let t = attribution();
    let mut view = View::new(
        &t,
        ViewConfig {
            top_n: Some(TopN {
                n: 2,
                measure: 0,
                largest: true,
                other: true,
            }),
            ..by_factor(vec![
                Measure::new(Aggregate::Sum, "pnl"),
                running(Aggregate::Sum, "pnl"),
            ])
        },
    )
    .unwrap();
    let n = view.num_rows(&t);
    let frame = view.window(&t, 0..n, 0..2).batch;
    let labels: Vec<&str> = frame
        .column_by_name("__label")
        .unwrap()
        .as_string::<i32>()
        .iter()
        .flatten()
        .collect();
    assert_eq!(labels, ["Total", "carry", "spread", "Other"]);
    let runs = frame
        .column_by_name("sum(pnl) running total")
        .unwrap()
        .as_primitive::<arrow_array::types::Decimal128Type>();
    let runs: Vec<i128> = (0..n).map(|i| runs.value(i)).collect();
    assert_eq!(runs, [-173_71, 150_05, 225_05, -173_71]);
}

#[test]
fn groups_an_aggregate_filter_hides_take_no_part() {
    let t = attribution();
    let shown = rows(
        &t,
        ViewConfig {
            having: vec![Having {
                measure: 0,
                op: Comparison::Gt,
                value: 0.0,
            }],
            ..by_factor(vec![
                Measure::new(Aggregate::Sum, "pnl"),
                running(Aggregate::Sum, "pnl"),
            ])
        },
    );
    let runs: Vec<(&str, CellValue)> = shown
        .iter()
        .map(|(l, v)| (l.as_str(), v[1].clone()))
        .collect();
    assert_eq!(
        runs,
        [
            ("Total", CellValue::Decimal(-173_71)),
            ("carry", CellValue::Decimal(150_05)),
            ("fx", CellValue::Decimal(162_39)),
            ("spread", CellValue::Decimal(237_39)),
        ]
    );
    // A hidden group has no running total.
    let mut view = View::new(
        &t,
        ViewConfig {
            having: vec![Having {
                measure: 0,
                op: Comparison::Gt,
                value: 0.0,
            }],
            ..by_factor(vec![
                Measure::new(Aggregate::Sum, "pnl"),
                running(Aggregate::Sum, "pnl"),
            ])
        },
    )
    .unwrap();
    let curve = view
        .cells(&t)
        .into_iter()
        .find(|c| c.path == [Scalar::Utf8("curve".into())])
        .unwrap();
    assert_eq!(curve.values[1], CellValue::Null);
}

#[test]
fn a_run_across_units_is_mixed() {
    let t = attribution();
    let shown = rows(
        &t,
        by_factor(vec![
            running(Aggregate::Sum, "pnl").with_unit_column("currency"),
        ]),
    );
    let runs: Vec<(&str, CellValue)> = shown
        .iter()
        .map(|(l, v)| (l.as_str(), v[0].clone()))
        .collect();
    assert_eq!(
        runs,
        [
            ("Total", CellValue::Mixed),
            ("carry", CellValue::Decimal(150_05)),
            ("curve", CellValue::Decimal(-260_05)),
            ("fx", CellValue::Mixed),
            ("spread", CellValue::Mixed),
            ("(blank)", CellValue::Mixed),
        ]
    );
}

#[test]
fn a_run_keeps_its_column_type_and_format() {
    let t = attribution();
    let mut view = View::new(
        &t,
        by_factor(vec![
            running(Aggregate::Sum, "weight"),
            Measure::count_all().show_as(ShowAs::RunningTotal),
        ]),
    )
    .unwrap();
    let frame = view.window(&t, 0..2, 0..2).batch;
    let schema = frame.schema();
    let sum = schema.field_with_name("sum(weight) running total").unwrap();
    assert_eq!(sum.data_type(), &DataType::Float64);
    let count = schema.field_with_name("count(*) running total").unwrap();
    assert_eq!(count.data_type(), &DataType::Int64);
    // Not a percentage, as shares are.
    let text = frame.column_by_name("sum(weight) running total#text");
    let text = text.map(|c| c.as_string::<i32>().value(1).to_owned());
    assert_eq!(text.as_deref(), Some("0.30"));
    let values = frame
        .column_by_name("sum(weight) running total")
        .unwrap()
        .as_primitive::<Float64Type>();
    assert_eq!(values.value(1), 0.1 + 0.2);
}

#[test]
fn aggregates_that_do_not_add_are_refused() {
    let t = attribution();
    for aggregate in [
        Aggregate::Mean,
        Aggregate::Min,
        Aggregate::Max,
        Aggregate::Median,
        Aggregate::DistinctCount,
        Aggregate::Variance,
        Aggregate::First,
    ] {
        let err = View::new(&t, by_factor(vec![running(aggregate.clone(), "pnl")])).unwrap_err();
        assert!(
            matches!(err, ConfigError::RunningTotal { .. }),
            "{aggregate:?}: {err}"
        );
        assert!(err.to_string().contains("only sums and counts"), "{err}");
    }
    let weighted = Measure::weighted_mean("pnl", "weight").show_as(ShowAs::RunningTotal);
    assert!(View::new(&t, by_factor(vec![weighted])).is_err());
}

#[test]
fn groups_are_not_sorted_filtered_or_ranked_by_a_running_total() {
    let t = attribution();
    let measures = vec![
        Measure::new(Aggregate::Sum, "pnl"),
        running(Aggregate::Sum, "pnl"),
    ];
    let sorted = ViewConfig {
        group_sort: GroupSort {
            by: GroupOrder::Measure(1),
            descending: false,
        },
        ..by_factor(measures.clone())
    };
    let filtered = ViewConfig {
        having: vec![Having {
            measure: 1,
            op: Comparison::Lt,
            value: 0.0,
        }],
        ..by_factor(measures.clone())
    };
    let ranked = ViewConfig {
        top_n: Some(TopN {
            n: 2,
            measure: 1,
            largest: true,
            other: true,
        }),
        ..by_factor(measures.clone())
    };
    for (config, word) in [
        (sorted, "sorted"),
        (filtered, "filtered"),
        (ranked, "ranked"),
    ] {
        let err = View::new(&t, config).unwrap_err();
        assert!(matches!(err, ConfigError::RunningTotal { .. }), "{err}");
        assert!(err.to_string().contains(word), "{err}");
    }
    // A flat view's total shows its value only.
    let totals = ViewConfig {
        totals: vec![running(Aggregate::Sum, "pnl")],
        ..ViewConfig::default()
    };
    assert!(matches!(
        View::new(&t, totals).unwrap_err(),
        ConfigError::Total { .. }
    ));
}

#[test]
fn column_pivots_run_down_each_column() {
    let t = attribution();
    let mut view = View::new(
        &t,
        ViewConfig {
            split_by: vec!["currency".into()],
            ..by_factor(vec![running(Aggregate::Sum, "pnl")])
        },
    )
    .unwrap();
    let cells = view.cells(&t);
    let at = |factor: Option<&str>, currency: &str| {
        let path = vec![factor.map_or(Scalar::Null, |f| Scalar::Utf8(f.into()))];
        cells
            .iter()
            .find(|c| c.path == path && c.split == Some(vec![Scalar::Utf8(currency.into())]))
            .map(|c| c.values[0].clone())
    };
    assert_eq!(at(Some("carry"), "USD"), Some(CellValue::Decimal(150_05)));
    assert_eq!(at(Some("curve"), "USD"), Some(CellValue::Decimal(-260_05)));
    assert_eq!(at(Some("fx"), "EUR"), Some(CellValue::Decimal(12_34)));
    assert_eq!(at(Some("spread"), "USD"), Some(CellValue::Decimal(-185_05)));
    assert_eq!(at(None, "USD"), Some(CellValue::Decimal(-186_05)));
}
