//! Dates and instants past the calendar a chart can draw: the grid shows them as
//! out of range, and a chart leaves them out as it does a null, rather than
//! trapping the engine.

#![allow(missing_docs)]

use std::sync::Arc;

use arrow_array::{ArrayRef, Date32Array, Float64Array, RecordBatch, TimestampMicrosecondArray};
use arrow_schema::{DataType, Field, Schema};
use parallax_engine::calendar::{Market, epoch_days, from_epoch_days};
use parallax_engine::chart::{
    ChartConfig, ChartKind, ChartRequest, ChartView, OhlcColumns, PointColumns, XAxis,
};
use parallax_engine::{Table, TableOptions};

/// A table of `x` and a price for each, `x` a date column or a timestamp one.
fn table(x: ArrayRef) -> Table {
    let prices: Vec<f64> = (0..x.len()).map(|i| 100.0 + i as f64).collect();
    let schema = Schema::new(vec![
        Field::new("x", x.data_type().clone(), true),
        Field::new("price", DataType::Float64, true),
    ]);
    let batch = RecordBatch::try_new(
        Arc::new(schema),
        vec![x, Arc::new(Float64Array::from(prices)) as ArrayRef],
    )
    .unwrap();
    let mut table = Table::new(&batch.schema(), TableOptions::default()).unwrap();
    table.load(&[batch]).unwrap();
    table
}

fn config(kind: ChartKind, axis: XAxis) -> ChartConfig {
    let ohlc = matches!(kind, ChartKind::Candlestick | ChartKind::Ohlc).then(|| OhlcColumns {
        open: "price".into(),
        high: "price".into(),
        low: "price".into(),
        close: "price".into(),
    });
    ChartConfig {
        kind,
        x: "x".into(),
        y: if ohlc.is_some() {
            Vec::new()
        } else {
            vec!["price".into()]
        },
        series: None,
        ohlc,
        filters: Vec::new(),
        axis,
        indicators: Vec::new(),
        volume: None,
        compare: false,
        events: None,
        points: PointColumns::default(),
        orders: std::collections::BTreeMap::new(),
        market: Market::Nyse,
        session: None,
    }
}

fn request(x: Option<(f64, f64)>) -> ChartRequest {
    ChartRequest {
        x,
        y: None,
        width: 800,
        height: 300,
    }
}

fn day(text: &str) -> i32 {
    epoch_days(text.parse().unwrap())
}

/// Dates a chart can draw, and three it cannot: past 9999-12-31, before
/// -9999-01-01, and the least a Date32 holds.
fn dates() -> ArrayRef {
    Arc::new(Date32Array::from(vec![
        day("2026-11-02"),
        day("2026-11-03"),
        day("2026-11-04"),
        day("9999-12-31") + 1,
        -4_371_588,
        i32::MIN,
        i32::MAX,
    ]))
}

#[test]
fn dates_past_jiffs_range_are_left_out_of_every_kind_of_chart() {
    let table = table(dates());
    for kind in [
        ChartKind::Line,
        ChartKind::Scatter,
        ChartKind::Candlestick,
        ChartKind::Ohlc,
    ] {
        for axis in [XAxis::Value, XAxis::Trading] {
            let view = ChartView::new(&table, config(kind, axis)).unwrap();
            let (from, to) = view.x_extent().unwrap();
            assert!(to - from < 10.0, "{kind:?} {axis:?}: only 2026 is drawn");
            let reduced = view.reduce(&table, &request(None));
            assert!(!reduced.ticks.is_empty(), "{kind:?} {axis:?}");
        }
    }
}

#[test]
fn instants_past_jiffs_range_are_left_out_of_a_chart() {
    let micros = |text: &str| {
        format!("{text}[America/New_York]")
            .parse::<jiff::Zoned>()
            .unwrap()
            .timestamp()
            .as_microsecond()
    };
    let times = vec![
        micros("2026-11-02T10:00"),
        micros("2026-11-02T11:00"),
        micros("2026-11-03T10:00"),
        // An "infinity" sent as the largest integer, and nanoseconds read as
        // microseconds.
        i64::MAX,
        i64::MIN,
        micros("2026-11-02T10:00") * 1_000,
    ];
    let x: ArrayRef = Arc::new(TimestampMicrosecondArray::from(times).with_timezone("UTC"));
    let table = table(x);
    for kind in [ChartKind::Line, ChartKind::Candlestick] {
        for axis in [XAxis::Value, XAxis::Trading] {
            let view = ChartView::new(&table, config(kind, axis)).unwrap();
            let reduced = view.reduce(&table, &request(None));
            assert!(!reduced.ticks.is_empty(), "{kind:?} {axis:?}");
        }
    }
}

#[test]
fn a_zoom_past_the_calendar_draws_without_trapping() {
    let table = table(dates());
    for axis in [XAxis::Value, XAxis::Trading] {
        let view = ChartView::new(&table, config(ChartKind::Line, axis)).unwrap();
        for x in [
            (
                f64::from(day("2026-01-01")),
                f64::from(day("9999-12-31")) + 1e6,
            ),
            (-5_000_000.0, 0.0),
            (-1e300, 1e300),
            (f64::from(i32::MIN), f64::from(i32::MAX)),
        ] {
            let _ = view.reduce(&table, &request(Some(x)));
        }
    }
    let times: ArrayRef =
        Arc::new(TimestampMicrosecondArray::from(vec![0, 3_600_000_000]).with_timezone("UTC"));
    let instants = self::table(times);
    for axis in [XAxis::Value, XAxis::Trading] {
        let view = ChartView::new(&instants, config(ChartKind::Candlestick, axis)).unwrap();
        for x in [
            (-1e300, 1e300),
            (i64::MIN as f64, i64::MAX as f64),
            (0.0, 1e19),
        ] {
            let _ = view.reduce(&instants, &request(Some(x)));
        }
    }
}

#[test]
fn a_day_number_past_the_calendar_reads_as_its_last_day() {
    assert_eq!(from_epoch_days(i32::MAX), "9999-12-31".parse().unwrap());
    assert_eq!(from_epoch_days(i32::MIN), "-009999-01-01".parse().unwrap());
    assert_eq!(epoch_days(from_epoch_days(20_759)), 20_759);
}
