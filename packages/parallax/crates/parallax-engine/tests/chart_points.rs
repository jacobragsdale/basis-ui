//! A scatter plot's dots: every row in the range shown up to the cap, a density
//! past it, sizes that zooming keeps, and the fit line reduced as lines are.

#![allow(missing_docs)]

use std::sync::Arc;

use arrow_array::{ArrayRef, Float64Array, RecordBatch, StringArray};
use arrow_schema::{DataType, Field, Schema};
use parallax_engine::chart::{
    ChartConfig, ChartData, ChartKind, ChartRequest, ChartView, Dot, MAX_POINTS, PointColumns,
    XAxis,
};
use parallax_engine::{Scalar, Table, TableOptions};
use proptest::prelude::*;

/// A row of a bond table: x, y, its size, its fitted y, and its sector.
type Row = (f64, Option<f64>, Option<f64>, Option<f64>, &'static str);

fn table(rows: &[Row]) -> Table {
    let floats = |pick: fn(&Row) -> Option<f64>| -> ArrayRef {
        Arc::new(Float64Array::from(
            rows.iter().map(pick).collect::<Vec<_>>(),
        ))
    };
    let batch = RecordBatch::try_new(
        Arc::new(Schema::new(vec![
            Field::new("x", DataType::Float64, false),
            Field::new("y", DataType::Float64, true),
            Field::new("size", DataType::Float64, true),
            Field::new("fit", DataType::Float64, true),
            Field::new("sector", DataType::Utf8, false),
            Field::new("cusip", DataType::Utf8, false),
        ])),
        vec![
            floats(|r| Some(r.0)),
            floats(|r| r.1),
            floats(|r| r.2),
            floats(|r| r.3),
            Arc::new(StringArray::from(
                rows.iter().map(|r| r.4).collect::<Vec<_>>(),
            )),
            Arc::new(StringArray::from(
                (0..rows.len())
                    .map(|i| format!("C{i:08}"))
                    .collect::<Vec<_>>(),
            )),
        ],
    )
    .unwrap();
    let mut table = Table::new(&batch.schema(), TableOptions::default()).unwrap();
    table.load(&[batch]).unwrap();
    table
}

fn scatter() -> ChartConfig {
    ChartConfig {
        kind: ChartKind::Scatter,
        x: "x".into(),
        y: vec!["y".into()],
        series: None,
        ohlc: None,
        filters: Vec::new(),
        axis: XAxis::Value,
        indicators: Vec::new(),
        volume: None,
        compare: false,
        events: None,
        orders: std::collections::BTreeMap::new(),
        points: PointColumns {
            size: Some("size".into()),
            id: Some("cusip".into()),
            tooltip: vec!["sector".into()],
            fit: Some("fit".into()),
        },
    }
}

fn request(x: Option<(f64, f64)>) -> ChartRequest {
    ChartRequest {
        x,
        y: None,
        width: 400,
        height: 200,
    }
}

/// `n` rows spread over x and y, every third with no size.
fn spread(n: usize) -> Vec<Row> {
    (0..n)
        .map(|i| {
            let x = (i * 37 % 1_000) as f64;
            let y = Some((i * 53 % 997) as f64);
            let size = (i % 3 != 0).then_some(i as f64);
            (x, y, size, Some(x / 2.0), "Corp")
        })
        .collect()
}

fn dots(data: ChartData) -> Vec<(Option<Scalar>, Vec<Dot>)> {
    match data {
        ChartData::Points { series, .. } => series,
        other => panic!("not dots: {other:?}"),
    }
}

#[test]
fn every_row_is_a_dot_up_to_the_cap_and_a_density_past_it() {
    let at_cap = table(&spread(MAX_POINTS));
    let view = ChartView::new(&at_cap, scatter()).unwrap();
    let series = dots(view.reduce(&at_cap, &request(None)).data);
    assert_eq!(series.len(), 1);
    let mut slots: Vec<usize> = series[0].1.iter().map(|d| d.slot).collect();
    assert!(
        series[0].1.windows(2).all(|d| d[0].x <= d[1].x),
        "in x order"
    );
    slots.sort_unstable();
    slots.dedup();
    assert_eq!(slots.len(), MAX_POINTS, "each row once");

    let past = table(&spread(MAX_POINTS + 1));
    let view = ChartView::new(&past, scatter()).unwrap();
    let ChartData::Density { counts, .. } = view.reduce(&past, &request(None)).data else {
        panic!("not a density")
    };
    assert_eq!(
        counts.iter().map(|&c| c as usize).sum::<usize>(),
        MAX_POINTS + 1
    );

    // Zoomed in to fewer rows than the cap, the same chart draws dots again:
    // exactly the rows inside the range.
    let shown = dots(view.reduce(&past, &request(Some((100.0, 300.0)))).data);
    let expected = spread(MAX_POINTS + 1)
        .iter()
        .filter(|r| (100.0..=300.0).contains(&r.0))
        .count();
    assert_eq!(shown[0].1.len(), expected);
    assert!(shown[0].1.iter().all(|d| (100.0..=300.0).contains(&d.x)));
}

#[test]
fn rows_without_a_y_are_not_drawn_and_count_for_nothing() {
    let mut rows = spread(MAX_POINTS);
    rows.extend((0..10).map(|i| (f64::from(i), None, Some(1.0), None, "Corp")));
    let t = table(&rows);
    let view = ChartView::new(&t, scatter()).unwrap();
    let series = dots(view.reduce(&t, &request(None)).data);
    assert_eq!(series[0].1.len(), MAX_POINTS);
}

#[test]
fn sizes_are_shares_of_the_largest_magnitude_in_the_whole_chart() {
    let rows = [
        (0.0, Some(1.0), Some(-4.0), None, "Corp"),
        (1.0, Some(1.0), Some(1.0), None, "Corp"),
        (2.0, Some(1.0), Some(2.0), None, "Corp"),
        (3.0, Some(1.0), None, None, "Corp"),
        (4.0, Some(1.0), Some(0.0), None, "Corp"),
    ];
    let t = table(&rows);
    let view = ChartView::new(&t, scatter()).unwrap();
    let sizes = |x: Option<(f64, f64)>| -> Vec<Option<f64>> {
        dots(view.reduce(&t, &request(x)).data)[0]
            .1
            .iter()
            .map(|d| d.size)
            .collect()
    };
    assert_eq!(
        sizes(None),
        [Some(1.0), Some(0.25), Some(0.5), None, Some(0.0)]
    );
    // Zooming past the largest keeps the others' sizes.
    assert_eq!(
        sizes(Some((1.0, 4.0))),
        [Some(0.25), Some(0.5), None, Some(0.0)]
    );
    // Without a size column, no dot has a size.
    let plain = ChartView::new(
        &t,
        ChartConfig {
            points: PointColumns::default(),
            ..scatter()
        },
    )
    .unwrap();
    assert!(
        dots(plain.reduce(&t, &request(None)).data)[0]
            .1
            .iter()
            .all(|d| d.size.is_none())
    );
}

#[test]
fn series_split_the_dots_and_each_has_its_fit_line() {
    let rows = [
        (1.0, Some(5.0), None, Some(4.0), "Gov"),
        (2.0, Some(6.0), None, Some(5.0), "Corp"),
        (3.0, Some(7.0), None, Some(6.0), "Gov"),
        (4.0, Some(9.0), None, Some(8.0), "Corp"),
    ];
    let t = table(&rows);
    let view = ChartView::new(
        &t,
        ChartConfig {
            series: Some("sector".into()),
            ..scatter()
        },
    )
    .unwrap();
    let reduced = view.reduce(&t, &request(None));
    let keys: Vec<Option<Scalar>> = reduced.fits.iter().map(|f| f.0.clone()).collect();
    let corp = Some(Scalar::Utf8("Corp".into()));
    let gov = Some(Scalar::Utf8("Gov".into()));
    assert_eq!(keys, [corp.clone(), gov.clone()], "in key order");
    let series = dots(reduced.data);
    assert_eq!(series[0].0, corp);
    assert_eq!(
        series[0].1.iter().map(|d| d.x).collect::<Vec<_>>(),
        [2.0, 4.0]
    );
    assert_eq!(
        series[1].1.iter().map(|d| d.y).collect::<Vec<_>>(),
        [5.0, 7.0]
    );
    let fit: Vec<(f64, f64)> = reduced.fits[1].1.iter().map(|p| (p.x, p.y)).collect();
    assert_eq!(fit, [(1.0, 4.0), (3.0, 6.0)]);
}

#[test]
fn the_y_range_holds_the_fit_line_as_well_as_the_dots() {
    let rows = [
        (1.0, Some(5.0), None, Some(2.0), "Corp"),
        (2.0, Some(6.0), None, Some(9.0), "Corp"),
    ];
    let t = table(&rows);
    let view = ChartView::new(&t, scatter()).unwrap();
    let ChartData::Points { y, .. } = view.reduce(&t, &request(None)).data else {
        panic!("not dots")
    };
    assert_eq!(y, (2.0, 9.0));
}

#[test]
fn dots_belong_to_scatter_plots_and_their_columns_must_fit() {
    let t = table(&spread(10));
    let refuse = |config: ChartConfig| ChartView::new(&t, config).unwrap_err().to_string();
    assert!(
        refuse(ChartConfig {
            kind: ChartKind::Line,
            ..scatter()
        })
        .contains("scatter")
    );
    let with = |points: PointColumns| ChartConfig {
        points,
        ..scatter()
    };
    assert!(
        refuse(with(PointColumns {
            size: Some("sector".into()),
            ..PointColumns::default()
        }))
        .contains("size")
    );
    assert!(
        refuse(with(PointColumns {
            fit: Some("cusip".into()),
            ..PointColumns::default()
        }))
        .contains("fitted curve")
    );
    assert!(
        refuse(with(PointColumns {
            id: Some("isin".into()),
            ..PointColumns::default()
        }))
        .contains("isin")
    );
    assert!(
        refuse(with(PointColumns {
            tooltip: vec!["issuer".into()],
            ..PointColumns::default()
        }))
        .contains("issuer")
    );
}

/// The pixel column of `x`, as the engine computes it.
fn column(x: f64, from: f64, to: f64, width: u32) -> i64 {
    if x < from {
        return -1;
    }
    if x > to {
        return i64::from(width);
    }
    (((x - from) / (to - from) * f64::from(width)).floor() as i64).min(i64::from(width) - 1)
}

/// The lowest and highest y a polyline reaches in each pixel column, where a NaN
/// breaks it.
fn coverage(points: &[(f64, f64)], from: f64, to: f64, width: u32) -> Vec<Option<(f64, f64)>> {
    let mut out: Vec<Option<(f64, f64)>> = vec![None; width as usize];
    let mut reach = |c: i64, y: f64| {
        if c >= 0 && c < i64::from(width) {
            let slot = &mut out[c as usize];
            *slot = Some(slot.map_or((y, y), |(lo, hi)| (lo.min(y), hi.max(y))));
        }
    };
    for &(x, y) in points {
        if !y.is_nan() {
            reach(column(x, from, to, width), y);
        }
    }
    for pair in points.windows(2) {
        let ((ax, ay), (bx, by)) = (pair[0], pair[1]);
        if ay.is_nan() || by.is_nan() {
            continue;
        }
        let (ca, cb) = (column(ax, from, to, width), column(bx, from, to, width));
        for k in ca + 1..=cb {
            let edge = from + (to - from) * k as f64 / f64::from(width);
            let y = if bx == ax {
                ay
            } else {
                ay + (by - ay) * ((edge - ax) / (bx - ax))
            };
            reach(k - 1, y);
            reach(k, y);
        }
    }
    out
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(300))]

    /// M4's guarantee for the fit line: it reaches the same lowest and highest
    /// value in every pixel column as the line through every fitted row, in
    /// either of the scatter's forms.
    #[test]
    fn the_fit_line_covers_the_same_pixels_as_every_fitted_row(
        rows in prop::collection::vec((0u16..300, prop::option::weighted(0.9, -500.0f64..500.0)), 1..400),
        width in 1u32..120,
        window in prop::option::of((0u16..300, 1u16..300)),
    ) {
        let rows: Vec<Row> = rows
            .iter()
            .map(|&(x, fit)| (f64::from(x) / 3.0, Some(0.0), None, fit, "Corp"))
            .collect();
        let t = table(&rows);
        let view = ChartView::new(&t, scatter()).unwrap();
        let request = ChartRequest {
            x: window.map(|(a, span)| (f64::from(a) / 3.0, f64::from(a + span) / 3.0)),
            y: None,
            width,
            height: 100,
        };
        let reduced = view.reduce(&t, &request);
        let (from, to) = reduced.x;
        let mut all: Vec<(f64, f64)> =
            rows.iter().map(|r| (r.0, r.3.unwrap_or(f64::NAN))).collect();
        all.sort_by(|a, b| a.0.total_cmp(&b.0));
        let start = all.partition_point(|p| p.0 < from).saturating_sub(1);
        let end = (all.partition_point(|p| p.0 <= to) + 1).min(all.len());
        let mut full: Vec<(f64, f64)> = Vec::new();
        for &p in &all[start..end] {
            if !(p.1.is_nan() && full.last().is_some_and(|q: &(f64, f64)| q.1.is_nan())) {
                full.push(p);
            }
        }
        let kept: Vec<(f64, f64)> = reduced.fits[0].1.iter().map(|p| (p.x, p.y)).collect();
        prop_assert_eq!(coverage(&kept, from, to, width), coverage(&full, from, to, width));
    }
}
