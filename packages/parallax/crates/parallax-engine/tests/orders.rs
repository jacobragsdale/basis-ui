//! Orders of text columns, checked against DuckDB: tenors by length, ratings best
//! first, a listed order, and another column's smallest value, in groups at every
//! level, column pivots, flat and detail sorts, reloads and chart series.

mod common;

use std::collections::BTreeMap;
use std::sync::Arc;

use arrow_array::cast::AsArray;
use arrow_array::types::{Int32Type, Int64Type};
use arrow_array::{Array, ArrayRef, Float64Array, Int64Array, RecordBatch, StringArray};
use arrow_schema::{DataType, Field, Schema};
use common::{Picker, duck, query};
use parallax_engine::chart::{
    ChartConfig, ChartData, ChartKind, ChartRequest, ChartView, PointColumns, TenorSpacing, XAxis,
    tenor_position,
};
use parallax_engine::view::{GroupOrder, GroupSort, Sort, TopN};
use parallax_engine::{Measure, Order, Scalar, Table, TableOptions, View, ViewConfig};

const TENORS: &[&str] = &[
    "1D", "1W", "2W", "1M", "3M", "6M", "9m", "12M", "1Y", "18M", "2Y", "3Y", "5Y", "7Y", "10Y",
    "20Y", "30Y", " 4M ", "ON", "Spot", "",
];
const RATINGS: &[&str] = &[
    "AAA", "Aaa", "AA+", "Aa1", "AA", "AA-", "A+", "A1", "A", "A2", "A-", "BBB+", "Baa1", "BBB",
    "BBB-", "BB+", "Ba2", "B", "CCC+", "Caa1", "CC", "C", "SD", "D", "NR", "WR", "bbb",
];
const BUCKETS: &[&str] = &["Short", "Belly", "Long", "Ultra", "Cash"];

/// A table of `rows` rows keyed by `id`, with text columns that orders know.
fn batch(rows: usize, seed: u64) -> RecordBatch {
    let mut picker = Picker::new(seed);
    let mut text = |values: &[&str], nulls: usize| -> Vec<Option<String>> {
        (0..rows)
            .map(|_| {
                (picker.below(100) >= nulls).then(|| values[picker.below(values.len())].to_owned())
            })
            .collect()
    };
    let tenor = text(TENORS, 5);
    let rating = text(RATINGS, 5);
    let bucket = text(BUCKETS, 3);
    let years: Vec<Option<f64>> = (0..rows)
        .map(|i| (i % 11 != 0).then(|| ((i * 7_919) % 3_001) as f64 / 100.0))
        .collect();
    RecordBatch::try_new(
        Arc::new(Schema::new(vec![
            Field::new("id", DataType::Int64, false),
            Field::new("tenor", DataType::Utf8, true),
            Field::new("rating", DataType::Utf8, true),
            Field::new("bucket", DataType::Utf8, true),
            Field::new("years", DataType::Float64, true),
        ])),
        vec![
            Arc::new(Int64Array::from_iter_values(0..rows as i64)) as ArrayRef,
            Arc::new(StringArray::from(tenor)),
            Arc::new(StringArray::from(rating)),
            Arc::new(StringArray::from(bucket)),
            Arc::new(Float64Array::from(years)),
        ],
    )
    .unwrap()
}

fn table(batch: &RecordBatch) -> Table {
    let mut table = Table::new(
        &batch.schema(),
        TableOptions {
            primary_key: Some("id".into()),
            ..TableOptions::default()
        },
    )
    .unwrap();
    table.load(std::slice::from_ref(batch)).unwrap();
    table
}

/// A tenor's length in 48ths of a day, in SQL, written apart from the engine's
/// parser: null for text that is not a tenor.
fn tenor_sql(column: &str) -> String {
    let t = format!("upper(trim(\"{column}\"))");
    format!(
        "(CASE WHEN regexp_full_match({t}, '[0-9]{{1,4}}[DWMY]') \
          AND CAST(regexp_extract({t}, '^([0-9]+)', 1) AS BIGINT) >= 1 \
         THEN CAST(regexp_extract({t}, '^([0-9]+)', 1) AS BIGINT) * \
              CASE right({t}, 1) WHEN 'D' THEN 48 WHEN 'W' THEN 336 WHEN 'M' THEN 1461 ELSE 17532 END END)"
    )
}

/// A rating's notch, in SQL, from the agencies' scales as published: null for text
/// that is not a rating.
fn rating_sql(column: &str) -> String {
    let scale: &[&[&str]] = &[
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
    let cases: String = scale
        .iter()
        .enumerate()
        .flat_map(|(notch, names)| {
            names
                .iter()
                .map(move |n| format!(" WHEN '{n}' THEN {notch}"))
        })
        .collect();
    format!("(CASE upper(trim(\"{column}\")){cases} END)")
}

/// The SQL that orders a text column as `order` does, then by text, nulls last;
/// reversed with `descending`, nulls still last.
fn order_sql(column: &str, order: &Order, descending: bool) -> String {
    let dir = if descending { " DESC" } else { "" };
    let c = format!("\"{column}\"");
    let placed = match order {
        Order::Text => None,
        Order::Tenor => Some(tenor_sql(column)),
        Order::Rating => Some(rating_sql(column)),
        Order::Values(values) => Some(format!(
            "list_position([{}], {c})",
            values
                .iter()
                .map(|v| format!("'{v}'"))
                .collect::<Vec<_>>()
                .join(", ")
        )),
        Order::By(other) => Some(format!(
            "(SELECT min(o.\"{other}\") FROM t o WHERE o.{c} = t.{c})"
        )),
    };
    // Nulls of the whole key come last whatever the direction; keys the order
    // cannot place come after those it can.
    let mut keys = vec![format!("({c} IS NULL)")];
    if let Some(p) = placed {
        keys.push(format!("({p} IS NULL){dir}"));
        keys.push(format!("{p}{dir}"));
    }
    keys.push(format!("lower({c}){dir}"));
    keys.push(format!("{c}{dir}"));
    keys.join(", ")
}

fn orders(pairs: &[(&str, Order)]) -> BTreeMap<String, Order> {
    pairs
        .iter()
        .map(|(c, o)| ((*c).to_owned(), o.clone()))
        .collect()
}

/// The labels of a grouped view's groups at `depth`, top to bottom.
fn labels(view: &mut View, table: &Table, depth: i32) -> Vec<String> {
    let n = view.num_rows(table);
    let frame = view.window(table, 0..n, 0..1);
    let batch = &frame.batch;
    let label = batch.column_by_name("__label").unwrap().as_string::<i32>();
    let depths = batch
        .column_by_name("__depth")
        .unwrap()
        .as_primitive::<Int32Type>();
    (0..batch.num_rows())
        .filter(|&i| depths.value(i) == depth)
        .map(|i| label.value(i).to_owned())
        .collect()
}

/// The text DuckDB orders a column's distinct values in, as group labels read,
/// nulls as "(blank)".
fn duck_groups(conn: &duckdb::Connection, column: &str, order: &Order) -> Vec<String> {
    let sql = format!(
        "SELECT coalesce(\"{column}\", '(blank)') FROM (SELECT DISTINCT \"{column}\" FROM t) AS t \
         ORDER BY {}",
        order_sql(column, order, false)
    );
    query(conn, &sql)
        .iter()
        .flat_map(|b| {
            let c = b.column(0).as_string::<i32>();
            (0..c.len())
                .map(|i| c.value(i).to_owned())
                .collect::<Vec<_>>()
        })
        .collect()
}

#[test]
fn groups_follow_their_column_s_order_as_duckdb_orders_it() {
    for seed in 1..=4 {
        let data = batch(2_000, seed);
        let t = table(&data);
        let conn = duck(&data);
        for (column, order) in [
            ("tenor", Order::Tenor),
            ("rating", Order::Rating),
            (
                "bucket",
                Order::Values(vec!["Cash".into(), "Short".into(), "Long".into()]),
            ),
            ("bucket", Order::By("years".into())),
            ("rating", Order::Text),
        ] {
            let mut view = View::new(
                &t,
                ViewConfig {
                    group_by: vec![column.into()],
                    measures: vec![Measure::count_all()],
                    orders: orders(&[(column, order.clone())]),
                    ..ViewConfig::default()
                },
            )
            .unwrap();
            assert_eq!(
                labels(&mut view, &t, 1),
                duck_groups(&conn, column, &order),
                "seed {seed}, {column} by {order:?}"
            );
        }
    }
}

#[test]
fn flat_sorts_follow_the_order_both_ways_as_duckdb_sorts() {
    for seed in 1..=4 {
        let data = batch(1_500, seed);
        let t = table(&data);
        let conn = duck(&data);
        for (column, order) in [
            ("tenor", Order::Tenor),
            ("rating", Order::Rating),
            ("bucket", Order::By("years".into())),
        ] {
            for descending in [false, true] {
                let mut view = View::new(
                    &t,
                    ViewConfig {
                        columns: vec!["id".into()],
                        sort: vec![Sort {
                            column: column.into(),
                            descending,
                        }],
                        orders: orders(&[(column, order.clone())]),
                        ..ViewConfig::default()
                    },
                )
                .unwrap();
                let n = view.num_rows(&t);
                let frame = view.window(&t, 0..n, 0..1);
                let ours: Vec<i64> = frame
                    .batch
                    .column(0)
                    .as_primitive::<Int64Type>()
                    .values()
                    .to_vec();
                let sql = format!(
                    "SELECT id FROM t ORDER BY {}, id",
                    order_sql(column, &order, descending)
                );
                let theirs: Vec<i64> = query(&conn, &sql)
                    .iter()
                    .flat_map(|b| b.column(0).as_primitive::<Int64Type>().values().to_vec())
                    .collect();
                assert_eq!(ours, theirs, "seed {seed}, {column} by {order:?}\n{sql}");
            }
        }
    }
}

/// A small book: tenor buckets under ratings.
fn book() -> Table {
    let rows: &[(&str, &str, &str, f64)] = &[
        ("10Y", "A", "Corp", 9.5),
        ("1Y", "AA", "Govt", 1.0),
        ("2Y", "A", "Corp", 2.0),
        ("30Y", "AA", "Corp", 28.0),
        ("3M", "BBB", "Govt", 0.25),
        ("2Y", "AAA", "Muni", 2.2),
        ("10Y", "BBB", "Muni", 10.0),
        ("NR", "NR", "Corp", 4.0),
    ];
    let batch = RecordBatch::try_new(
        Arc::new(Schema::new(vec![
            Field::new("id", DataType::Int64, false),
            Field::new("tenor", DataType::Utf8, true),
            Field::new("rating", DataType::Utf8, true),
            Field::new("sector", DataType::Utf8, true),
            Field::new("years", DataType::Float64, true),
        ])),
        vec![
            Arc::new(Int64Array::from_iter_values(0..rows.len() as i64)) as ArrayRef,
            Arc::new(StringArray::from_iter_values(rows.iter().map(|r| r.0))),
            Arc::new(StringArray::from_iter_values(rows.iter().map(|r| r.1))),
            Arc::new(StringArray::from_iter_values(rows.iter().map(|r| r.2))),
            Arc::new(Float64Array::from_iter_values(rows.iter().map(|r| r.3))),
        ],
    )
    .unwrap();
    table(&batch)
}

fn book_orders() -> BTreeMap<String, Order> {
    orders(&[
        ("tenor", Order::Tenor),
        ("rating", Order::Rating),
        ("sector", Order::Values(vec!["Govt".into(), "Muni".into()])),
    ])
}

#[test]
fn every_level_and_column_pivot_takes_its_own_order() {
    let t = book();
    let mut view = View::new(
        &t,
        ViewConfig {
            group_by: vec!["rating".into(), "tenor".into()],
            split_by: vec!["sector".into()],
            measures: vec![Measure::count_all()],
            orders: book_orders(),
            expand_depth: 1,
            ..ViewConfig::default()
        },
    )
    .unwrap();
    assert_eq!(labels(&mut view, &t, 1), ["AAA", "AA", "A", "BBB", "NR"]);
    assert_eq!(
        labels(&mut view, &t, 2),
        ["2Y", "1Y", "30Y", "2Y", "10Y", "3M", "10Y", "NR"]
    );
    // The data columns come in the pivot's order: listed sectors, then the rest.
    let n = view.num_rows(&t);
    let frame = view.window(&t, 0..n, 0..10);
    let splits: Vec<String> = frame
        .batch
        .schema()
        .fields()
        .iter()
        .filter(|f| f.metadata().get("parallax.role").map(String::as_str) == Some("value"))
        .filter_map(|f| f.metadata().get("parallax.split").cloned())
        .collect();
    assert_eq!(splits.len(), 3, "{splits:?}");
    for (split, sector) in splits.iter().zip(["Govt", "Muni", "Corp"]) {
        assert!(split.contains(sector), "{splits:?}");
    }
}

#[test]
fn descending_reverses_the_order_and_top_n_keeps_other_last() {
    let t = book();
    let mut view = View::new(
        &t,
        ViewConfig {
            group_by: vec!["tenor".into()],
            measures: vec![Measure::count_all()],
            orders: book_orders(),
            group_sort: GroupSort {
                by: GroupOrder::Key,
                descending: true,
            },
            top_n: Some(TopN {
                n: 3,
                measure: 0,
                largest: true,
                other: true,
            }),
            ..ViewConfig::default()
        },
    )
    .unwrap();
    // The three largest by count: 10Y and 2Y with two rows each, and of those
    // with one, the first in the column's order, 3M; shown in descending tenor
    // order, then Other.
    assert_eq!(labels(&mut view, &t, 1), ["10Y", "2Y", "3M", "Other"]);
}

#[test]
fn detail_views_group_in_the_order_too() {
    let t = book();
    let mut view = View::new(
        &t,
        ViewConfig {
            group_by: vec!["sector".into()],
            sort: vec![Sort {
                column: "tenor".into(),
                descending: false,
            }],
            orders: book_orders(),
            detail: true,
            expand_depth: 1,
            ..ViewConfig::default()
        },
    )
    .unwrap();
    let n = view.num_rows(&t);
    let frame = view.window(&t, 0..n, 0..5);
    let tenor = frame
        .batch
        .column_by_name("tenor")
        .unwrap()
        .as_string::<i32>();
    let kinds = frame
        .batch
        .column_by_name("__kind")
        .unwrap()
        .as_string::<i32>();
    let rows: Vec<&str> = (0..frame.batch.num_rows())
        .filter(|&i| kinds.value(i) == "row")
        .map(|i| tenor.value(i))
        .collect();
    assert_eq!(labels(&mut view, &t, 1), ["Govt", "Muni", "Corp"]);
    assert_eq!(rows, ["3M", "1Y", "2Y", "10Y", "2Y", "10Y", "30Y", "NR"]);
}

#[test]
fn a_reload_places_new_values_in_the_order() {
    let mut t = book();
    let config = ViewConfig {
        group_by: vec!["tenor".into()],
        measures: vec![Measure::count_all()],
        orders: book_orders(),
        ..ViewConfig::default()
    };
    let mut view = View::new(&t, config).unwrap();
    let more = RecordBatch::try_new(
        Arc::new(Schema::new(vec![
            Field::new("id", DataType::Int64, false),
            Field::new("tenor", DataType::Utf8, true),
            Field::new("rating", DataType::Utf8, true),
            Field::new("sector", DataType::Utf8, true),
            Field::new("years", DataType::Float64, true),
        ])),
        vec![
            Arc::new(Int64Array::from(vec![0, 100, 101])) as ArrayRef,
            Arc::new(StringArray::from(vec!["15Y", "5Y", "6M"])),
            Arc::new(StringArray::from(vec!["A", "A", "A"])),
            Arc::new(StringArray::from(vec!["Corp", "Corp", "Corp"])),
            Arc::new(Float64Array::from(vec![15.0, 5.0, 0.5])),
        ],
    )
    .unwrap();
    let (_, changes) = t.load(std::slice::from_ref(&more)).unwrap();
    view.apply(&t, &changes);
    // Row 0's 10Y became 15Y; the reload's 5Y and 6M fall in their places.
    assert_eq!(labels(&mut view, &t, 1), ["6M", "5Y", "15Y"]);
}

#[test]
fn only_text_columns_take_an_order() {
    let t = book();
    let refuse = |column: &str, order: Order| {
        View::new(
            &t,
            ViewConfig {
                group_by: vec!["tenor".into()],
                measures: vec![Measure::count_all()],
                orders: orders(&[(column, order)]),
                ..ViewConfig::default()
            },
        )
        .unwrap_err()
        .to_string()
    };
    assert!(refuse("years", Order::Tenor).contains("only text columns take an order"));
    assert!(refuse("maturity", Order::Tenor).contains("maturity"));
    assert!(refuse("tenor", Order::By("coupon".into())).contains("coupon"));
}

fn curve(spacing: TenorSpacing) -> ChartConfig {
    ChartConfig {
        kind: ChartKind::Line,
        x: "tenor".into(),
        y: vec!["years".into()],
        series: Some("rating".into()),
        ohlc: None,
        filters: Vec::new(),
        axis: XAxis::Tenor(spacing),
        indicators: Vec::new(),
        volume: None,
        compare: false,
        events: None,
        orders: orders(&[("rating", Order::Rating)]),
        points: PointColumns::default(),
    }
}

#[test]
fn chart_series_follow_their_order_and_a_tenor_axis_places_tenors() {
    let t = book();
    let view = ChartView::new(&t, curve(TenorSpacing::Even)).unwrap();
    // Series in rating order; NR's one row has an x that is not a tenor, so it
    // takes no place on the axis, and makes no series.
    let keys: Vec<Scalar> = view.series_keys(&t);
    assert_eq!(
        keys,
        ["AAA", "AA", "A", "BBB"].map(|k| Scalar::Utf8(k.into()))
    );
    let request = ChartRequest {
        x: None,
        y: None,
        width: 600,
        height: 300,
    };
    let reduced = view.reduce(&t, &request);
    // "NR" is not a tenor, so its row takes no place; the rest sit at their
    // tenors, the standard ones a step apart.
    let ChartData::Series(series) = &reduced.data else {
        panic!("not lines")
    };
    let a = &series[2].1;
    assert_eq!(
        a.iter().map(|p| p.x).collect::<Vec<_>>(),
        [
            tenor_position(2.0, TenorSpacing::Even),
            tenor_position(10.0, TenorSpacing::Even)
        ]
    );
    assert_eq!(
        tenor_position(10.0, TenorSpacing::Even) - tenor_position(7.0, TenorSpacing::Even),
        1.0
    );
    assert_eq!(tenor_position(0.25, TenorSpacing::Even), 2.0);
    assert_eq!(
        tenor_position(4.0, TenorSpacing::Even),
        6.5,
        "4Y is halfway from 3Y to 5Y"
    );
    assert_eq!(tenor_position(15.0, TenorSpacing::Length), 15.0);
    let labels: Vec<&str> = reduced.ticks.iter().map(|t| t.label.as_str()).collect();
    assert_eq!(
        labels,
        [
            "3M", "6M", "1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "20Y", "30Y"
        ]
    );
    // A drawing anchored to "10Y" sits where 10Y does.
    assert_eq!(
        view.position(&Scalar::Utf8("10y".into())),
        Some(tenor_position(10.0, TenorSpacing::Even))
    );
}

#[test]
fn a_tenor_axis_by_length_thins_its_labels_from_the_long_end() {
    let t = book();
    let mut config = curve(TenorSpacing::Length);
    config.x = "years".into();
    config.y = vec!["years".into()];
    let view = ChartView::new(&t, config).unwrap();
    let reduced = view.reduce(
        &t,
        &ChartRequest {
            x: None,
            y: None,
            width: 400,
            height: 300,
        },
    );
    let labels: Vec<&str> = reduced.ticks.iter().map(|t| t.label.as_str()).collect();
    // 0.25 to 28 years over 400 px: from the long end, each label kept is at
    // least 36 px from the others, so 5Y, 2Y, 1Y and 3M give way.
    assert_eq!(labels, ["6M", "3Y", "7Y", "10Y", "20Y"]);
    let xs: Vec<f64> = reduced.ticks.iter().map(|t| t.x).collect();
    assert!(
        xs.windows(2)
            .all(|w| (w[1] - w[0]) * 400.0 / (reduced.x.1 - reduced.x.0) >= 36.0)
    );
}
