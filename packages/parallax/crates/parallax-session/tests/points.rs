//! A scatter's dots in a session: each value as the engine's text, the id as
//! exact JSON, and the fit lines in their own batch.

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use arrow_array::cast::AsArray;
use arrow_array::types::{Float64Type, Int64Type, UInt32Type};
use arrow_array::{Array, RecordBatch};
use parallax_datagen::Dataset;
use parallax_datagen::positions::{Positions, PositionsOptions};
use parallax_engine::format::Format;
use parallax_engine::{ColumnType, Formatter, Scalar, TableOptions};
use parallax_protocol::ipc::decode_batches;
use parallax_protocol::v1::{
    ChartFrame, ClientMessage, OpenView, ServerMessage, SetChartWindow, client_message,
    server_message::Body,
};
use parallax_session::{MemoryCatalog, Session, TableState};
use prost::Message;

fn positions() -> RecordBatch {
    Positions::new(PositionsOptions {
        rows: 2_000,
        seed: 7,
        securities: 300,
        ..PositionsOptions::default()
    })
    .unwrap()
    .batch(0..2_000)
}

fn send(session: &mut Session, request_id: u64, body: client_message::Body) -> Vec<Body> {
    let bytes = ClientMessage {
        request_id,
        body: Some(body),
    }
    .encode_to_vec();
    session
        .handle_bytes(&bytes)
        .iter()
        .map(|b| ServerMessage::decode(b.as_slice()).unwrap().body.unwrap())
        .collect()
}

fn frame(layout: &str) -> (ChartFrame, RecordBatch) {
    let data = positions();
    let state = TableState::from_batches(
        &data.schema(),
        std::slice::from_ref(&data),
        TableOptions::default(),
        1,
        1,
    )
    .unwrap();
    let catalog = Arc::new(MemoryCatalog::new());
    catalog.insert("positions", Arc::new(RwLock::new(state)));
    let mut session = Session::new(catalog);
    let opened = send(
        &mut session,
        1,
        client_message::Body::OpenView(OpenView {
            view_id: 1,
            dataset: "positions".into(),
            parameters: HashMap::new(),
            layout_json: layout.into(),
        }),
    );
    assert!(
        !opened.iter().any(|r| matches!(r, Body::Error(_))),
        "{opened:?}"
    );
    let replies = send(
        &mut session,
        2,
        client_message::Body::SetChartWindow(SetChartWindow {
            view_id: 1,
            width: 600,
            height: 300,
            ..SetChartWindow::default()
        }),
    );
    match replies.as_slice() {
        [Body::ChartFrame(frame)] => (frame.clone(), data),
        other => panic!("{other:?}"),
    }
}

const BONDS: &str = r#"{
    "filters": [{"column": "asset_class", "op": "eq", "value": "Bond"}],
    "formats": {"dv01_usd": {"decimals": 0}, "yield_to_maturity": {"percent": true, "decimals": 3}},
    "chart": {"kind": "scatter", "x": "duration", "y": ["yield_to_maturity"], "series": "fund",
              "size": "dv01_usd", "id": "position_id", "tooltip": ["security_name", "credit_rating"],
              "fit": "coupon_rate"}
}"#;

fn texts(batch: &RecordBatch, name: &str) -> Vec<Option<String>> {
    let column = batch.column_by_name(name).unwrap().as_string::<i32>();
    (0..column.len())
        .map(|i| column.is_valid(i).then(|| column.value(i).to_owned()))
        .collect()
}

#[test]
fn each_dot_carries_its_row_s_values_as_the_engine_writes_them() {
    let (frame, data) = frame(BONDS);
    let batch = decode_batches(&frame.batch).unwrap().remove(0);
    // Every bond with a duration and a yield is a dot.
    let kind = data
        .column_by_name("asset_class")
        .unwrap()
        .as_string::<i32>();
    let duration = data.column_by_name("duration").unwrap();
    let ytm = data.column_by_name("yield_to_maturity").unwrap();
    let bonds = (0..data.num_rows())
        .filter(|&i| kind.value(i) == "Bond" && duration.is_valid(i) && ytm.is_valid(i))
        .count();
    assert!(bonds > 50, "{bonds} bonds");
    assert_eq!(batch.num_rows(), bonds);
    assert!(frame.y_to > frame.y_from);
    assert!(!frame.series.is_empty());
    assert_eq!(frame.fits.len(), frame.series.len());

    let ids = data
        .column_by_name("position_id")
        .unwrap()
        .as_primitive::<Int64Type>();
    let row_of: HashMap<i64, usize> = (0..data.num_rows()).map(|i| (ids.value(i), i)).collect();
    let float = |name: &str, row: usize| -> Option<f64> {
        let c = data
            .column_by_name(name)
            .unwrap()
            .as_primitive::<Float64Type>();
        c.is_valid(row).then(|| c.value(row))
    };
    let text = |format: Format, value: Option<f64>| -> Option<String> {
        value.map(|v| {
            Formatter::new(&format)
                .unwrap()
                .scalar(&ColumnType::Float64, &Scalar::Float64(v))
        })
    };
    let percent = Format {
        percent: true,
        decimals: Some(3),
        ..Format::default()
    };
    let whole = Format {
        decimals: Some(0),
        ..Format::default()
    };
    let largest = (0..data.num_rows())
        .filter(|&i| kind.value(i) == "Bond" && duration.is_valid(i) && ytm.is_valid(i))
        .filter_map(|i| float("dv01_usd", i))
        .fold(0.0f64, |most, v| most.max(v.abs()));

    let (id_texts, id_json) = (texts(&batch, "id_text"), texts(&batch, "id_json"));
    let (x_texts, y_texts) = (texts(&batch, "x_text"), texts(&batch, "y_text"));
    let (size_texts, fit_texts) = (texts(&batch, "size_text"), texts(&batch, "fit_text"));
    let (names, ratings) = (texts(&batch, "tooltip_0"), texts(&batch, "tooltip_1"));
    let sizes = batch
        .column_by_name("size")
        .unwrap()
        .as_primitive::<Float64Type>();
    let series = batch
        .column_by_name("series")
        .unwrap()
        .as_primitive::<UInt32Type>();
    let funds = data.column_by_name("fund").unwrap().as_string::<i32>();
    for i in 0..batch.num_rows() {
        let id: i64 = id_json[i].as_deref().unwrap().parse().unwrap();
        let row = row_of[&id];
        // The id is written by its column's format, as a cell is.
        assert_eq!(id_texts[i], Some(Formatter::default().integer(id)));
        assert_eq!(x_texts[i], text(Format::default(), float("duration", row)));
        assert_eq!(
            y_texts[i],
            text(percent.clone(), float("yield_to_maturity", row))
        );
        assert_eq!(size_texts[i], text(whole.clone(), float("dv01_usd", row)));
        assert_eq!(
            fit_texts[i],
            text(Format::default(), float("coupon_rate", row))
        );
        let name = data
            .column_by_name("security_name")
            .unwrap()
            .as_string::<i32>();
        assert_eq!(names[i].as_deref(), Some(name.value(row)));
        let rating = data
            .column_by_name("credit_rating")
            .unwrap()
            .as_string::<i32>();
        assert_eq!(
            ratings[i].as_deref(),
            rating.is_valid(row).then(|| rating.value(row))
        );
        match float("dv01_usd", row) {
            Some(v) => assert_eq!(sizes.value(i), v.abs() / largest),
            None => assert!(sizes.value(i).is_nan()),
        }
        // Dots are grouped by series, and each series is its fund.
        let label = &frame.series[series.value(i) as usize].label;
        assert_eq!(label, funds.value(row));
    }
}

#[test]
fn fit_lines_travel_in_their_own_batch_with_their_text() {
    let (frame, _) = frame(BONDS);
    let fits = decode_batches(&frame.fit_batch).unwrap().remove(0);
    assert!(fits.num_rows() > 0);
    let series = fits
        .column_by_name("series")
        .unwrap()
        .as_primitive::<UInt32Type>();
    assert!(
        series.values().windows(2).all(|w| w[0] <= w[1]),
        "line by line"
    );
    assert!(frame.fits.iter().all(|f| f.column == "coupon_rate"));
    let ys = fits
        .column_by_name("y")
        .unwrap()
        .as_primitive::<Float64Type>();
    let y_texts = texts(&fits, "y_text");
    for (y, text) in ys.values().iter().zip(&y_texts) {
        assert_eq!(y.is_nan(), text.is_none(), "a break has no text");
    }
}

#[test]
fn a_scatter_without_a_fit_sends_no_fit_lines_and_a_density_past_the_cap() {
    let (frame, _) =
        frame(r#"{"chart": {"kind": "scatter", "x": "market_value_usd", "y": ["beta"]}}"#);
    assert!(frame.fits.is_empty() && frame.fit_batch.is_empty());
    let batch = decode_batches(&frame.batch).unwrap().remove(0);
    // 2,000 rows are dots; ids and sizes are absent.
    assert!(batch.num_rows() <= 2_000 && batch.column_by_name("x").is_some());
    assert!(texts(&batch, "id_json").iter().all(Option::is_none));
}

#[test]
fn an_x_axis_of_a_percentage_or_basis_points_reads_as_its_column_does() {
    let (shown, _) = frame(
        r#"{"formats": {"yield_to_maturity": {"percent": true, "decimals": 3}},
            "chart": {"kind": "scatter", "x": "yield_to_maturity", "y": ["duration"]}}"#,
    );
    let labels: Vec<&str> = shown.ticks.iter().map(|t| t.label.as_str()).collect();
    assert!(labels.len() > 2, "{labels:?}");
    assert!(labels.iter().all(|l| l.ends_with('%')), "{labels:?}");
    // As many decimals as the step needs: every label has the same number.
    let decimals = |l: &str| {
        l.trim_end_matches('%')
            .split('.')
            .nth(1)
            .map_or(0, str::len)
    };
    assert!(
        labels.windows(2).all(|w| decimals(w[0]) == decimals(w[1])),
        "{labels:?}"
    );
    let (shown, _) = frame(
        r#"{"formats": {"coupon_rate": {"bps": true}},
            "chart": {"kind": "scatter", "x": "coupon_rate", "y": ["duration"]}}"#,
    );
    assert!(
        shown.ticks.iter().all(|t| t.label.ends_with("\u{a0}bp")),
        "{:?}",
        shown.ticks
    );
    // A format without a style of its own keeps the engine's round numbers.
    let (shown, _) = frame(
        r#"{"formats": {"duration": {"decimals": 4}},
            "chart": {"kind": "scatter", "x": "duration", "y": ["coupon_rate"]}}"#,
    );
    assert!(
        shown.ticks.iter().all(|t| !t.label.contains('.')),
        "{:?}",
        shown.ticks
    );
}
