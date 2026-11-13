//! Chart views in a session: updates, refusals and refreshes.

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use parallax_datagen::Dataset;
use parallax_datagen::positions::{Positions, PositionsOptions};
use parallax_engine::TableOptions;
use parallax_protocol::v1::{
    ClientMessage, OpenView, ServerMessage, SetChartWindow, SetViewport, UpdateView,
    client_message, server_message::Body,
};
use parallax_session::{MemoryCatalog, Session, SharedTable, TableState};
use prost::Message;

fn positions(seed: u64) -> arrow_array::RecordBatch {
    Positions::new(PositionsOptions {
        rows: 1_000,
        seed,
        securities: 100,
        ..PositionsOptions::default()
    })
    .unwrap()
    .batch(0..1_000)
}

fn session() -> (Session, SharedTable) {
    let first = positions(1);
    let state = TableState::from_batches(
        &first.schema(),
        &[first],
        TableOptions {
            primary_key: Some("position_id".into()),
            ..TableOptions::default()
        },
        1_000,
        900,
    )
    .unwrap();
    let table = Arc::new(RwLock::new(state));
    let catalog = Arc::new(MemoryCatalog::new());
    catalog.insert("positions", Arc::clone(&table));
    (Session::new(catalog), table)
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

const HISTOGRAM: &str = r#"{"chart":{"kind":"histogram","x":"beta"}}"#;

fn open_chart(session: &mut Session) {
    send(
        session,
        1,
        client_message::Body::OpenView(OpenView {
            view_id: 1,
            dataset: "positions".into(),
            parameters: HashMap::new(),
            layout_json: HISTOGRAM.into(),
        }),
    );
    let replies = send(
        session,
        2,
        client_message::Body::SetChartWindow(SetChartWindow {
            view_id: 1,
            width: 400,
            height: 200,
            ..SetChartWindow::default()
        }),
    );
    assert!(
        matches!(replies.as_slice(), [Body::ChartFrame(_)]),
        "{replies:?}"
    );
}

fn update(session: &mut Session, request_id: u64, layout: &str) -> Vec<Body> {
    send(
        session,
        request_id,
        client_message::Body::UpdateView(UpdateView {
            view_id: 1,
            layout_json: layout.into(),
            config_version: request_id,
            viewport: None,
        }),
    )
}

#[test]
fn an_update_answers_with_the_chart_redrawn() {
    let (mut session, _) = session();
    open_chart(&mut session);
    // A display-only change keeps the reduction and still answers with a frame.
    let replies = update(
        &mut session,
        3,
        r#"{"chart":{"kind":"histogram","x":"beta","log_y":true},"formats":{"beta":{"decimals":3}}}"#,
    );
    let [Body::ChartFrame(frame)] = replies.as_slice() else {
        panic!("{replies:?}")
    };
    assert_eq!(frame.config_version, 3);
    // A change of column reduces again.
    let replies = update(
        &mut session,
        4,
        r#"{"chart":{"kind":"histogram","x":"market_value_usd"}}"#,
    );
    let [Body::ChartFrame(frame)] = replies.as_slice() else {
        panic!("{replies:?}")
    };
    assert_eq!(frame.series[0].column, "market_value_usd");
}

#[test]
fn a_chart_refuses_a_viewport_and_refreshes_without_errors() {
    let (mut session, table) = session();
    open_chart(&mut session);
    let replies = send(
        &mut session,
        3,
        client_message::Body::SetViewport(SetViewport {
            view_id: 1,
            first_row: 0,
            row_count: 10,
            first_column: 0,
            column_count: 5,
        }),
    );
    assert!(matches!(replies.as_slice(), [Body::Error(e)] if e.message.contains("is a chart")));
    table
        .write()
        .unwrap()
        .reload(&[positions(2)], 2_000, 1_900)
        .unwrap();
    let pushed: Vec<Body> = session
        .refresh()
        .into_iter()
        .map(|m| m.body.unwrap())
        .collect();
    assert!(
        matches!(pushed.as_slice(), [Body::TableStatus(_), Body::ChartFrame(f)] if f.pushed && f.load_version == 2),
        "{pushed:?}"
    );
    // A grid view turned into a chart forgets its viewport too.
    let replies = update(
        &mut session,
        4,
        r#"{"group_by":["fund"],"measures":[{"aggregate":"count_all"}]}"#,
    );
    assert!(replies.is_empty(), "no viewport yet: {replies:?}");
    send(
        &mut session,
        5,
        client_message::Body::SetViewport(SetViewport {
            view_id: 1,
            first_row: 0,
            row_count: 10,
            first_column: 0,
            column_count: 5,
        }),
    );
    // The new chart has no window yet, and no grid frame or error either.
    let replies = update(&mut session, 6, HISTOGRAM);
    assert!(replies.is_empty(), "{replies:?}");
    let replies = send(
        &mut session,
        7,
        client_message::Body::SetChartWindow(SetChartWindow {
            view_id: 1,
            width: 400,
            height: 200,
            ..SetChartWindow::default()
        }),
    );
    assert!(
        matches!(replies.as_slice(), [Body::ChartFrame(_)]),
        "{replies:?}"
    );
    table
        .write()
        .unwrap()
        .reload(&[positions(3)], 3_000, 2_900)
        .unwrap();
    let pushed = session.refresh();
    assert!(
        pushed
            .iter()
            .all(|m| !matches!(m.body, Some(Body::Error(_)))),
        "{pushed:?}"
    );
}

/// A brushed range's filters, built from the exact JSON a chart frame sends,
/// select the rows the chart drew there: the browser never has to format or
/// parse a date to link a chart to a grid.
mod brushes {
    use std::collections::HashMap;
    use std::sync::{Arc, RwLock};

    use arrow_array::cast::AsArray;
    use arrow_array::types::Date32Type;
    use arrow_array::{Array, RecordBatch};
    use parallax_datagen::Dataset;
    use parallax_datagen::prices::{Prices, PricesOptions};
    use parallax_engine::TableOptions;
    use parallax_protocol::ipc::decode_batches;
    use parallax_protocol::v1::{
        ChartFrame, OpenView, SetChartWindow, SetViewport, client_message, server_message::Body,
    };
    use parallax_session::{MemoryCatalog, Session, TableState};

    use super::send;

    fn session() -> (Session, RecordBatch) {
        let prices = Prices::new(PricesOptions {
            tickers: 2,
            securities: 200,
            ..PricesOptions::default()
        })
        .unwrap();
        let batch = prices.batch(0..prices.num_rows());
        let state = TableState::from_batches(
            &batch.schema(),
            std::slice::from_ref(&batch),
            TableOptions::default(),
            1,
            1,
        )
        .unwrap();
        let catalog = Arc::new(MemoryCatalog::new());
        catalog.insert("prices", Arc::new(RwLock::new(state)));
        (Session::new(catalog), batch)
    }

    fn open(session: &mut Session, view_id: u32, layout: &str) {
        let replies = send(
            session,
            u64::from(view_id) * 10,
            client_message::Body::OpenView(OpenView {
                view_id,
                dataset: "prices".into(),
                parameters: HashMap::new(),
                layout_json: layout.into(),
            }),
        );
        assert!(
            replies.iter().all(|r| !matches!(r, Body::Error(_))),
            "{replies:?}"
        );
    }

    fn chart(session: &mut Session, layout: &str) -> RecordBatch {
        open(session, 1, layout);
        let replies = send(
            session,
            11,
            client_message::Body::SetChartWindow(SetChartWindow {
                view_id: 1,
                width: 300,
                height: 200,
                ..SetChartWindow::default()
            }),
        );
        let [Body::ChartFrame(ChartFrame { batch, .. })] = replies.as_slice() else {
            panic!("{replies:?}")
        };
        decode_batches(batch).unwrap().remove(0)
    }

    /// How many rows a grid over `layout` holds.
    fn rows(session: &mut Session, view_id: u32, layout: &str) -> u64 {
        open(session, view_id, layout);
        let replies = send(
            session,
            u64::from(view_id) * 10 + 1,
            client_message::Body::SetViewport(SetViewport {
                view_id,
                first_row: 0,
                row_count: 1,
                first_column: 0,
                column_count: 1,
            }),
        );
        let [Body::Frame(frame)] = replies.as_slice() else {
            panic!("{replies:?}")
        };
        frame.total_rows
    }

    fn texts(batch: &RecordBatch, name: &str) -> Vec<String> {
        let column = batch.column_by_name(name).unwrap().as_string::<i32>();
        (0..column.len())
            .map(|i| column.value(i).to_owned())
            .collect()
    }

    /// A day since the epoch as `"YYYY-MM-DD"` JSON, worked out here rather
    /// than by the engine's formatter.
    fn day_json(days: i32) -> String {
        let z = i64::from(days) + 719_468;
        let era = z.div_euclid(146_097);
        let doe = z - era * 146_097;
        let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let day = doy - (153 * mp + 2) / 5 + 1;
        let month = if mp < 10 { mp + 3 } else { mp - 9 };
        let year = yoe + era * 400 + i64::from(month <= 2);
        format!("\"{year:04}-{month:02}-{day:02}\"")
    }

    /// The rows of `ticker` whose date's JSON passes `keep`, counted from the
    /// generated data itself.
    fn expected(data: &RecordBatch, ticker: &str, keep: impl Fn(&str) -> bool) -> u64 {
        let tickers = data.column_by_name("ticker").unwrap().as_string::<i32>();
        let dates = data
            .column_by_name("date")
            .unwrap()
            .as_primitive::<Date32Type>();
        (0..data.num_rows())
            .filter(|&i| tickers.value(i) == ticker && keep(&day_json(dates.value(i))))
            .count() as u64
    }

    fn grid(ticker: &str, filters: &str) -> String {
        format!(r#"{{"filters":[{{"column":"ticker","op":"eq","value":"{ticker}"}},{filters}]}}"#)
    }

    #[test]
    fn candle_buckets_select_their_days() {
        let (mut session, data) = session();
        let ticker = data
            .column_by_name("ticker")
            .unwrap()
            .as_string::<i32>()
            .value(0)
            .to_owned();
        let candles = chart(
            &mut session,
            &format!(
                r#"{{"filters":[{{"column":"ticker","op":"eq","value":"{ticker}"}}],"chart":{{"kind":"candlestick","x":"date","axis":"trading","ohlc":{{"open":"open","high":"high","low":"low","close":"close"}}}}}}"#
            ),
        );
        let (starts, ends) = (texts(&candles, "x_json"), texts(&candles, "end_json"));
        assert!(starts.len() > 20, "{} buckets", starts.len());
        // Buckets tile the axis: each ends where the next starts.
        assert_eq!(starts[1..], ends[..ends.len() - 1]);
        // Buckets of a week or more, so a brush over a few holds many days.
        let (low, high) = (&starts[3], &ends[8]);
        let want = expected(&data, &ticker, |d| d >= low.as_str() && d < high.as_str());
        assert!(want > 20, "{want} days");
        let filters = format!(
            r#"{{"column":"date","op":"ge","value":{low}}},{{"column":"date","op":"lt","value":{high}}}"#
        );
        assert_eq!(rows(&mut session, 2, &grid(&ticker, &filters)), want);
        // Every bucket together selects every day.
        let all = format!(
            r#"{{"column":"date","op":"ge","value":{}}},{{"column":"date","op":"lt","value":{}}}"#,
            starts[0],
            ends[ends.len() - 1]
        );
        assert_eq!(
            rows(&mut session, 3, &grid(&ticker, &all)),
            expected(&data, &ticker, |_| true)
        );
    }

    #[test]
    fn line_points_select_the_days_between_them() {
        let (mut session, data) = session();
        let ticker = data
            .column_by_name("ticker")
            .unwrap()
            .as_string::<i32>()
            .value(0)
            .to_owned();
        let line = chart(
            &mut session,
            &format!(
                r#"{{"filters":[{{"column":"ticker","op":"eq","value":"{ticker}"}}],"chart":{{"kind":"line","x":"date","y":["close"],"axis":"trading"}}}}"#
            ),
        );
        let points = texts(&line, "x_json");
        // The line is reduced to what 300 pixels show, so its points skip days.
        let days = expected(&data, &ticker, |_| true);
        assert!(
            (points.len() as u64) < days,
            "{} points of {days} days",
            points.len()
        );
        let (low, high) = (&points[10], &points[100]);
        let filters = format!(
            r#"{{"column":"date","op":"ge","value":{low}}},{{"column":"date","op":"le","value":{high}}}"#
        );
        let want = expected(&data, &ticker, |d| d >= low.as_str() && d <= high.as_str());
        assert!(want > 90, "{want} days");
        assert_eq!(rows(&mut session, 2, &grid(&ticker, &filters)), want);
    }
}

/// Indicators in chart frames: their lines with the engine's text, and each
/// candle's volume, checked against the generated rows.
mod indicators {
    use std::collections::HashMap;
    use std::sync::{Arc, RwLock};

    use arrow_array::cast::AsArray;
    use arrow_array::types::{Date32Type, Float64Type, UInt32Type};
    use arrow_array::{Array, RecordBatch};
    use parallax_datagen::Dataset;
    use parallax_datagen::prices::{Prices, PricesOptions};
    use parallax_engine::TableOptions;
    use parallax_protocol::ipc::decode_batches;
    use parallax_protocol::v1::{
        ChartFrame, OpenView, SetChartWindow, client_message, server_message::Body,
    };
    use parallax_session::{MemoryCatalog, Session, TableState};

    use super::send;

    fn session() -> (Session, RecordBatch) {
        let prices = Prices::new(PricesOptions {
            tickers: 1,
            securities: 200,
            ..PricesOptions::default()
        })
        .unwrap();
        let batch = prices.batch(0..prices.num_rows());
        let state = TableState::from_batches(
            &batch.schema(),
            std::slice::from_ref(&batch),
            TableOptions::default(),
            1,
            1,
        )
        .unwrap();
        let catalog = Arc::new(MemoryCatalog::new());
        catalog.insert("prices", Arc::new(RwLock::new(state)));
        (Session::new(catalog), batch)
    }

    fn open(session: &mut Session, layout: &str) -> Vec<Body> {
        send(
            session,
            1,
            client_message::Body::OpenView(OpenView {
                view_id: 1,
                dataset: "prices".into(),
                parameters: HashMap::new(),
                layout_json: layout.into(),
            }),
        )
    }

    fn frame(session: &mut Session, width: u32) -> ChartFrame {
        let replies = send(
            session,
            2,
            client_message::Body::SetChartWindow(SetChartWindow {
                view_id: 1,
                width,
                height: 300,
                ..SetChartWindow::default()
            }),
        );
        match replies.as_slice() {
            [Body::ChartFrame(frame)] => frame.clone(),
            other => panic!("{other:?}"),
        }
    }

    const CANDLES: &str = r#"{"chart": {"kind": "candlestick", "x": "date", "axis": "trading",
        "ohlc": {"open": "open", "high": "high", "low": "low", "close": "close"}, "volume": "volume",
        "indicators": [{"kind": "sma", "period": 50}, {"kind": "rsi"}, {"kind": "volume"}]}}"#;

    #[test]
    fn frames_carry_indicator_lines_with_their_text() {
        let (mut session, _) = session();
        open(&mut session, CANDLES);
        let f = frame(&mut session, 600);
        let names: Vec<(u32, &str)> = f
            .indicator_lines
            .iter()
            .map(|l| (l.indicator, l.line.as_str()))
            .collect();
        assert_eq!(names, vec![(0, "sma"), (1, "rsi")]);
        let lines = decode_batches(&f.indicator_batch).unwrap().remove(0);
        let ids = lines
            .column_by_name("line")
            .unwrap()
            .as_primitive::<UInt32Type>();
        let ys = lines
            .column_by_name("y")
            .unwrap()
            .as_primitive::<Float64Type>();
        let y_texts = lines.column_by_name("y_text").unwrap().as_string::<i32>();
        let x_texts = lines.column_by_name("x_text").unwrap().as_string::<i32>();
        for i in 0..lines.num_rows() {
            if ys.value(i).is_nan() {
                assert!(y_texts.is_null(i));
                continue;
            }
            // Prices show two decimals, as the close does; the RSI two as well.
            let text = y_texts.value(i).replace(',', "");
            assert!(
                (text.parse::<f64>().unwrap() - ys.value(i)).abs() <= 0.005,
                "{text} for {}",
                ys.value(i)
            );
            assert_eq!(text.split('.').nth(1).map(str::len), Some(2));
            assert!(!x_texts.is_null(i));
            if ids.value(i) == 1 {
                assert!((0.0..=100.0).contains(&ys.value(i)));
            }
        }
    }

    #[test]
    fn each_candle_carries_its_exact_volume() {
        let (mut session, data) = session();
        open(&mut session, CANDLES);
        let f = frame(&mut session, 800);
        assert_eq!(f.interval, "month");
        let candles = decode_batches(&f.batch).unwrap().remove(0);
        let starts = candles.column_by_name("x_json").unwrap().as_string::<i32>();
        let volume_texts = candles
            .column_by_name("volume_text")
            .unwrap()
            .as_string::<i32>();
        let volumes = candles
            .column_by_name("volume")
            .unwrap()
            .as_primitive::<Float64Type>();
        // Each month's rows, summed here from the generated data.
        let dates = data
            .column_by_name("date")
            .unwrap()
            .as_primitive::<Date32Type>();
        let traded = data
            .column_by_name("volume")
            .unwrap()
            .as_primitive::<arrow_array::types::Int64Type>();
        // A day since the epoch's year and month (Howard Hinnant's algorithm).
        let month = |days: i32| {
            let z = i64::from(days) + 719_468;
            let era = z.div_euclid(146_097);
            let doe = z - era * 146_097;
            let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
            let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
            let mp = (5 * doy + 2) / 153;
            let m = if mp < 10 { mp + 3 } else { mp - 9 };
            (yoe + era * 400 + i64::from(m <= 2), m)
        };
        let mut sums: HashMap<(i64, i64), i64> = HashMap::new();
        for i in 0..data.num_rows() {
            if !traded.is_null(i) {
                *sums.entry(month(dates.value(i))).or_default() += traded.value(i);
            }
        }
        assert!(candles.num_rows() > 100);
        for i in 0..candles.num_rows() {
            let start: String = serde_json::from_str(starts.value(i)).unwrap();
            let parts: Vec<i64> = start.split('-').map(|p| p.parse().unwrap()).collect();
            let expected = sums[&(parts[0], parts[1])];
            assert_eq!(
                volume_texts.value(i).replace(',', ""),
                expected.to_string(),
                "{start}"
            );
            assert_eq!(volumes.value(i), expected as f64);
        }
    }

    #[test]
    fn a_layout_with_an_impossible_indicator_is_refused() {
        let (mut session, _) = session();
        let replies = open(
            &mut session,
            r#"{"chart": {"kind": "line", "x": "date", "y": ["close"],
                "indicators": [{"kind": "macd", "fast": 30, "slow": 10}]}}"#,
        );
        assert!(
            replies
                .iter()
                .any(|r| matches!(r, Body::Error(e) if e.message.contains("shorter"))),
            "{replies:?}"
        );
        let replies = open(
            &mut session,
            r#"{"chart": {"kind": "line", "x": "date", "y": ["close"], "indicators": [{"kind": "volume"}]}}"#,
        );
        assert!(
            replies
                .iter()
                .any(|r| matches!(r, Body::Error(e) if e.message.contains("candlestick"))),
            "{replies:?}"
        );
    }
}

/// Drawings in chart frames: each anchor's place on the axis, from the engine,
/// which alone can place a date on trading time.
mod drawings {
    use std::collections::HashMap;
    use std::sync::{Arc, RwLock};

    use arrow_array::RecordBatch;
    use parallax_datagen::Dataset;
    use parallax_datagen::prices::{Prices, PricesOptions};
    use parallax_engine::TableOptions;
    use parallax_protocol::v1::{
        ChartFrame, OpenView, SetChartWindow, UpdateView, client_message, server_message::Body,
    };
    use parallax_session::{MemoryCatalog, Session, TableState};

    use super::send;

    fn session() -> (Session, RecordBatch) {
        let prices = Prices::new(PricesOptions {
            tickers: 1,
            securities: 200,
            ..PricesOptions::default()
        })
        .unwrap();
        let batch = prices.batch(0..prices.num_rows());
        let state = TableState::from_batches(
            &batch.schema(),
            std::slice::from_ref(&batch),
            TableOptions::default(),
            1,
            1,
        )
        .unwrap();
        let catalog = Arc::new(MemoryCatalog::new());
        catalog.insert("prices", Arc::new(RwLock::new(state)));
        (Session::new(catalog), batch)
    }

    fn layout(drawings: &str) -> String {
        format!(
            r#"{{"chart": {{"kind": "candlestick", "x": "date", "axis": "trading",
                "ohlc": {{"open": "open", "high": "high", "low": "low", "close": "close"}},
                "drawings": {drawings}}}}}"#
        )
    }

    fn only_frame(replies: &[Body]) -> ChartFrame {
        match replies {
            [Body::ChartFrame(frame)] => frame.clone(),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn anchors_take_their_dates_places_on_the_trading_axis() {
        let (mut session, _) = session();
        // 2016-01-04 is the first trading day generated; a week later is five
        // trading days on, past a weekend; 2016-01-18 is Martin Luther King Day,
        // a holiday, which takes the place where the market next opens.
        let drawings = r#"[
            {"kind": "trend", "from": {"x": "2016-01-04", "y": 100}, "to": {"x": "2016-01-11", "y": 110}},
            {"kind": "horizontal", "y": 105},
            {"kind": "note", "at": {"x": "2016-01-18", "y": 99.5}, "text": "Holiday"}
        ]"#;
        send(
            &mut session,
            1,
            client_message::Body::OpenView(OpenView {
                view_id: 1,
                dataset: "prices".into(),
                parameters: HashMap::new(),
                layout_json: layout(drawings),
            }),
        );
        let frame = only_frame(&send(
            &mut session,
            2,
            client_message::Body::SetChartWindow(SetChartWindow {
                view_id: 1,
                width: 800,
                height: 300,
                ..SetChartWindow::default()
            }),
        ));
        let place = |frame: &ChartFrame, x: &str| {
            frame
                .anchors
                .iter()
                .find(|a| a.x_json == format!("\"{x}\""))
                .map(|a| a.position)
                .unwrap()
        };
        assert_eq!(frame.anchors.len(), 3);
        let [first, week, holiday] = [
            place(&frame, "2016-01-04"),
            place(&frame, "2016-01-11"),
            place(&frame, "2016-01-18"),
        ];
        assert_eq!(first, frame.extent_from);
        assert_eq!(week - first, 5.0);
        // The Tuesday after the holiday Monday is ten trading days on, and the
        // holiday takes its place.
        assert_eq!(holiday - first, 10.0);
        // Moving a drawing changes only how the chart is drawn: the anchors move,
        // and the answer still comes back.
        // An x value shared by two drawings is placed once.
        let moved = r#"[{"kind": "trend", "from": {"x": "2016-01-05", "y": 100}, "to": {"x": "2016-01-11", "y": 110}},
                        {"kind": "note", "at": {"x": "2016-01-11", "y": 120}, "text": "Here"}]"#;
        let frame = only_frame(&send(
            &mut session,
            3,
            client_message::Body::UpdateView(UpdateView {
                view_id: 1,
                layout_json: layout(moved),
                config_version: 3,
                viewport: None,
            }),
        ));
        assert_eq!(frame.anchors.len(), 2);
        assert_eq!(
            (place(&frame, "2016-01-05"), place(&frame, "2016-01-11")),
            (first + 1.0, week)
        );
        assert_eq!(frame.config_version, 3);
    }

    #[test]
    fn drawings_that_do_not_fit_the_axis_are_left_out_not_refused() {
        let (mut session, _) = session();
        let open = |session: &mut Session, layout_json: String| {
            send(
                session,
                1,
                client_message::Body::OpenView(OpenView {
                    view_id: 1,
                    dataset: "prices".into(),
                    parameters: HashMap::new(),
                    layout_json,
                }),
            )
        };
        let window = |session: &mut Session| {
            only_frame(&send(
                session,
                2,
                client_message::Body::SetChartWindow(SetChartWindow {
                    view_id: 1,
                    width: 400,
                    height: 300,
                    ..SetChartWindow::default()
                }),
            ))
        };
        // Anchors that are not dates, as after the x column changed, or have no
        // x, are not placed; the chart still opens, and the good anchor is placed.
        let replies = open(
            &mut session,
            layout(
                r#"[{"kind": "note", "at": {"x": "not a date", "y": 1}, "text": "x"},
                    {"kind": "trend", "from": {"x": null, "y": 1}, "to": {"x": "2016-01-05", "y": 2}}]"#,
            ),
        );
        assert!(
            !replies.iter().any(|r| matches!(r, Body::Error(_))),
            "{replies:?}"
        );
        let frame = window(&mut session);
        let placed: Vec<&str> = frame.anchors.iter().map(|a| a.x_json.as_str()).collect();
        assert_eq!(placed, vec![r#""2016-01-05""#]);
        // A note longer than a note can be is a mistake in the layout itself.
        let long = "x".repeat(501);
        let replies = open(
            &mut session,
            layout(&format!(
                r#"[{{"kind": "note", "at": {{"x": "2016-01-05", "y": 1}}, "text": "{long}"}}]"#
            )),
        );
        assert!(
            replies
                .iter()
                .any(|r| matches!(r, Body::Error(e) if e.message.contains("at most 500"))),
            "{replies:?}"
        );
        // A bar chart keeps its drawings in the layout without placing them.
        let replies = open(
            &mut session,
            r#"{"group_by": ["ticker"], "chart": {"kind": "bar", "drawings": [{"kind": "horizontal", "y": 1}]}}"#.into(),
        );
        assert!(
            !replies.iter().any(|r| matches!(r, Body::Error(_))),
            "{replies:?}"
        );
    }
}

/// Compare mode, event markers and measuring, over generated prices.
mod tools {
    use std::collections::HashMap;
    use std::sync::{Arc, RwLock};

    use arrow_array::cast::AsArray;
    use arrow_array::types::{Date32Type, Float64Type};
    use arrow_array::{Array, RecordBatch};
    use parallax_datagen::Dataset;
    use parallax_datagen::prices::{Prices, PricesOptions};
    use parallax_engine::TableOptions;
    use parallax_protocol::ipc::decode_batches;
    use parallax_protocol::v1::{
        ChartFrame, MeasureChart, OpenView, SetChartWindow, client_message, server_message::Body,
    };
    use parallax_session::{MemoryCatalog, Session, TableState};

    use super::send;

    fn session(tickers: usize) -> (Session, RecordBatch) {
        let prices = Prices::new(PricesOptions {
            tickers,
            securities: 200,
            ..PricesOptions::default()
        })
        .unwrap();
        let batch = prices.batch(0..prices.num_rows());
        let state = TableState::from_batches(
            &batch.schema(),
            std::slice::from_ref(&batch),
            TableOptions::default(),
            1,
            1,
        )
        .unwrap();
        let catalog = Arc::new(MemoryCatalog::new());
        catalog.insert("prices", Arc::new(RwLock::new(state)));
        (Session::new(catalog), batch)
    }

    fn open(session: &mut Session, layout: &str) -> ChartFrame {
        let replies = send(
            session,
            1,
            client_message::Body::OpenView(OpenView {
                view_id: 1,
                dataset: "prices".into(),
                parameters: HashMap::new(),
                layout_json: layout.into(),
            }),
        );
        assert!(
            !replies.iter().any(|r| matches!(r, Body::Error(_))),
            "{replies:?}"
        );
        match send(
            session,
            2,
            client_message::Body::SetChartWindow(SetChartWindow {
                view_id: 1,
                width: 800,
                height: 300,
                ..SetChartWindow::default()
            }),
        )
        .as_slice()
        {
            [Body::ChartFrame(frame)] => frame.clone(),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn compare_mode_writes_each_series_as_a_percentage_change() {
        let (mut session, _) = session(2);
        let frame = open(
            &mut session,
            r#"{"chart": {"kind": "line", "x": "date", "y": ["close"], "series": "ticker", "compare": true}}"#,
        );
        let batch = decode_batches(&frame.batch).unwrap().remove(0);
        let ys = batch
            .column_by_name("y")
            .unwrap()
            .as_primitive::<Float64Type>();
        let texts = batch.column_by_name("y_text").unwrap().as_string::<i32>();
        // Each series starts at its first value: 0 %.
        assert_eq!(texts.value(0), "0.00%");
        for i in 0..batch.num_rows() {
            if !ys.is_null(i) && !ys.value(i).is_nan() {
                let shown: f64 = texts
                    .value(i)
                    .trim_end_matches('%')
                    .replace(',', "")
                    .parse()
                    .unwrap();
                assert!(
                    (shown - ys.value(i)).abs() <= 0.005,
                    "{} for {}",
                    texts.value(i),
                    ys.value(i)
                );
            }
        }
    }

    #[test]
    fn events_mark_each_ticker_s_earnings_and_dividends() {
        let (mut session, data) = session(3);
        let frame = open(
            &mut session,
            r#"{"chart": {"kind": "line", "x": "date", "y": ["close"], "series": "ticker", "events": "event"}}"#,
        );
        let marked = data.column_by_name("event").unwrap();
        let expected = (0..data.num_rows()).filter(|&i| !marked.is_null(i)).count();
        assert_eq!(frame.events_total as usize, expected);
        assert_eq!(frame.events.len(), expected.min(500));
        // Each says whose it is and what it was, at its date.
        let first = &frame.events[0];
        assert!(
            first.text.contains(": Q") || first.text.contains(": Dividend"),
            "{}",
            first.text
        );
        assert!(first.x_text.starts_with("201"), "{}", first.x_text);
        assert!(frame.events.windows(2).all(|w| w[0].x <= w[1].x));
    }

    #[test]
    fn measuring_reads_the_closes_and_counts_the_trading_days_between() {
        let (mut session, data) = session(1);
        let frame = open(
            &mut session,
            r#"{"chart": {"kind": "candlestick", "x": "date", "axis": "trading",
                "ohlc": {"open": "open", "high": "high", "low": "low", "close": "close"}}}"#,
        );
        let first = frame.extent_from;
        let replies = send(
            &mut session,
            3,
            client_message::Body::MeasureChart(MeasureChart {
                view_id: 1,
                from: first + 20.2,
                to: first + 10.1,
                series: String::new(),
                y: String::new(),
            }),
        );
        let [Body::ChartMeasure(m)] = replies.as_slice() else {
            panic!("{replies:?}")
        };
        assert!(m.found);
        // Trading days 10 to 20 of the generated data: ten bars on.
        assert_eq!(
            (m.from_position - first, m.to_position - first, m.rows),
            (10.0, 20.0, 10)
        );
        let close = data
            .column_by_name("close")
            .unwrap()
            .as_primitive::<Float64Type>();
        let dates = data
            .column_by_name("date")
            .unwrap()
            .as_primitive::<Date32Type>();
        let (a, b) = (close.value(10), close.value(20));
        let number =
            |text: &str| -> f64 { text.replace(',', "").trim_end_matches('%').parse().unwrap() };
        assert!((number(&m.from_value) - a).abs() <= 0.005);
        assert!((number(&m.to_value) - b).abs() <= 0.005);
        assert!((number(&m.change) - (b - a)).abs() <= 0.005, "{}", m.change);
        assert!(
            (number(&m.percent) - (b / a - 1.0) * 100.0).abs() <= 0.005,
            "{}",
            m.percent
        );
        assert_eq!(
            dates.value(10) + 14,
            dates.value(20),
            "two weeks of trading days"
        );
        assert!(!m.from_x.is_empty() && !m.to_x.is_empty());
    }

    #[test]
    fn measuring_reads_the_y_column_it_names() {
        let (mut session, data) = session(1);
        open(
            &mut session,
            r#"{"chart": {"kind": "line", "x": "date", "y": ["close", "open"]}}"#,
        );
        let dates = data
            .column_by_name("date")
            .unwrap()
            .as_primitive::<Date32Type>();
        let mut measure = |y: &str| {
            let replies = send(
                &mut session,
                3,
                client_message::Body::MeasureChart(MeasureChart {
                    view_id: 1,
                    from: f64::from(dates.value(10)),
                    to: f64::from(dates.value(20)),
                    series: String::new(),
                    y: y.into(),
                }),
            );
            let [Body::ChartMeasure(m)] = replies.as_slice() else {
                panic!("{replies:?}")
            };
            m.clone()
        };
        let number = |text: &str| -> f64 { text.replace(',', "").parse().unwrap() };
        let value = |column: &str| {
            data.column_by_name(column)
                .unwrap()
                .as_primitive::<Float64Type>()
                .value(10)
        };
        // The first y column unless another is named.
        for (y, column) in [("", "close"), ("close", "close"), ("open", "open")] {
            let m = measure(y);
            assert!(m.found, "{y}");
            assert!(
                (number(&m.from_value) - value(column)).abs() <= 0.005,
                "{y}: {}",
                m.from_value
            );
        }
        assert_ne!(value("open"), value("close"));
        // A column the chart does not draw has nothing to measure.
        assert!(!measure("volume").found);
    }
}

mod waterfalls {
    use std::collections::HashMap;
    use std::sync::{Arc, RwLock};

    use arrow_array::cast::AsArray;
    use arrow_array::{Array, RecordBatch};
    use parallax_datagen::Dataset;
    use parallax_datagen::attribution::{Attribution, AttributionOptions, FACTORS};
    use parallax_engine::TableOptions;
    use parallax_protocol::ipc::decode_batches;
    use parallax_protocol::v1::{OpenView, SetViewport, client_message, server_message::Body};
    use parallax_session::{MemoryCatalog, Session, TableState};

    use super::send;

    fn session() -> Session {
        let attribution = Attribution::new(AttributionOptions::default()).unwrap();
        let batch = attribution.batch(0..attribution.num_rows());
        let state = TableState::from_batches(
            &batch.schema(),
            std::slice::from_ref(&batch),
            TableOptions::default(),
            1,
            1,
        )
        .unwrap();
        let catalog = Arc::new(MemoryCatalog::new());
        catalog.insert("attribution", Arc::new(RwLock::new(state)));
        Session::new(catalog)
    }

    /// The layout a waterfall's chart sends: the first measure's value and its
    /// running total, factors in an explain's order.
    fn layout(measure: &str) -> String {
        let order: Vec<String> = FACTORS.iter().map(|f| format!("\"{}\"", f.0)).collect();
        format!(
            r#"{{"group_by": ["factor"],
                "measures": [{{"column": "pnl_usd", "aggregate": "{measure}"}},
                             {{"column": "pnl_usd", "aggregate": "{measure}", "show_as": "running_total"}}],
                "orders": {{"factor": {{"values": [{}]}}}},
                "chart": {{"kind": "waterfall"}}}}"#,
            order.join(", ")
        )
    }

    fn open(session: &mut Session, layout: &str) -> Vec<Body> {
        send(
            session,
            1,
            client_message::Body::OpenView(OpenView {
                view_id: 1,
                dataset: "attribution".into(),
                parameters: HashMap::new(),
                layout_json: layout.into(),
            }),
        )
    }

    fn rows(session: &mut Session) -> RecordBatch {
        let replies = send(
            session,
            2,
            client_message::Body::SetViewport(SetViewport {
                view_id: 1,
                first_row: 0,
                row_count: 500,
                first_column: 0,
                column_count: 400,
            }),
        );
        let [Body::Frame(frame)] = replies.as_slice() else {
            panic!("{replies:?}")
        };
        decode_batches(&frame.batch).unwrap().remove(0)
    }

    fn texts(batch: &RecordBatch, name: &str) -> Vec<String> {
        let column = batch.column_by_name(name).unwrap().as_string::<i32>();
        (0..column.len())
            .map(|i| column.value(i).to_owned())
            .collect()
    }

    #[test]
    fn a_waterfalls_steps_run_in_the_layouts_order_and_end_on_the_total() {
        let mut session = session();
        let replies = open(&mut session, &layout("sum"));
        assert!(
            replies.iter().all(|r| !matches!(r, Body::Error(_))),
            "{replies:?}"
        );
        let batch = rows(&mut session);
        let labels = texts(&batch, "__label");
        let factors: Vec<&str> = FACTORS.iter().map(|f| f.0).collect();
        assert_eq!(labels[0], "Total");
        assert_eq!(labels[1..], factors[..]);
        let runs = texts(&batch, "sum(pnl_usd) running total#text");
        let sums = texts(&batch, "sum(pnl_usd)#text");
        // The first step runs from zero, and the last ends on the total, digit
        // for digit.
        assert_eq!(runs[1], sums[1]);
        assert_eq!(runs.last(), sums.first());
        assert_eq!(runs.first(), sums.first());
    }

    #[test]
    fn a_running_total_of_what_does_not_add_is_refused_with_the_reason() {
        let mut session = session();
        let replies = open(&mut session, &layout("mean"));
        let error = replies
            .iter()
            .find_map(|r| match r {
                Body::Error(e) => Some(e.message.clone()),
                _ => None,
            })
            .expect("an error");
        assert!(error.contains("only sums and counts add up"), "{error}");
    }
}

mod panes {
    use std::collections::HashMap;
    use std::sync::{Arc, RwLock};

    use arrow_array::Array;
    use arrow_array::cast::AsArray;
    use parallax_datagen::Dataset;
    use parallax_datagen::treasuries::{Curves, CurvesOptions};
    use parallax_engine::TableOptions;
    use parallax_protocol::ipc::decode_batches;
    use parallax_protocol::v1::{
        ChartFrame, OpenView, SetChartWindow, client_message, server_message::Body,
    };
    use parallax_session::{MemoryCatalog, Session, TableState};

    use super::send;

    fn session() -> Session {
        let curves = Curves::new(&CurvesOptions::default()).unwrap();
        let batch = curves.batch(0..curves.num_rows());
        let state = TableState::from_batches(
            &batch.schema(),
            std::slice::from_ref(&batch),
            TableOptions::default(),
            1,
            1,
        )
        .unwrap();
        let catalog = Arc::new(MemoryCatalog::new());
        catalog.insert("curves", Arc::new(RwLock::new(state)));
        Session::new(catalog)
    }

    fn open(session: &mut Session, layout: &str) -> Vec<Body> {
        send(
            session,
            1,
            client_message::Body::OpenView(OpenView {
                view_id: 1,
                dataset: "curves".into(),
                parameters: HashMap::new(),
                layout_json: layout.into(),
            }),
        )
    }

    const CURVES: &str = r#"{
        "filters": [{"column": "curve_date", "op": "in", "values": ["2026-11-30", "2026-11-27", "2026-01-02"]}],
        "formats": {"yield": {"percent": true, "decimals": 3}, "change": {"bps": true, "decimals": 1}},
        "chart": {"kind": "line", "x": "tenor", "y": ["yield"], "series": "curve_date", "axis": "tenor",
                  "panes": [{"columns": ["change"], "kind": "bar", "title": "Change"}]}
    }"#;

    #[test]
    fn a_pane_s_columns_arrive_as_series_of_their_own_in_their_format() {
        let mut session = session();
        let replies = open(&mut session, CURVES);
        assert!(
            replies.iter().all(|r| !matches!(r, Body::Error(_))),
            "{replies:?}"
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
        let [Body::ChartFrame(ChartFrame { batch, series, .. })] = replies.as_slice() else {
            panic!("{replies:?}")
        };
        // The plot's yields and the pane's changes, by date, none on the right:
        // the plot draws one column, so its series are named by date alone.
        let labels: Vec<(&str, &str, &str, bool)> = series
            .iter()
            .map(|s| (s.label.as_str(), s.column.as_str(), s.key.as_str(), s.right))
            .collect();
        for date in ["2026-01-02", "2026-11-27", "2026-11-30"] {
            assert!(
                labels.contains(&(date, "yield", date, false)),
                "{date} in {labels:?}"
            );
            let change = format!("change {date}");
            assert!(
                labels.contains(&(change.as_str(), "change", date, false)),
                "{change} in {labels:?}"
            );
        }
        let batch = decode_batches(batch).unwrap().remove(0);
        let ids = batch
            .column_by_name("series")
            .unwrap()
            .as_primitive::<arrow_array::types::UInt32Type>();
        let texts = batch.column_by_name("y_text").unwrap().as_string::<i32>();
        let ys = batch
            .column_by_name("y")
            .unwrap()
            .as_primitive::<arrow_array::types::Float64Type>();
        let of = |label: &str| series.iter().position(|s| s.label == label).unwrap() as u32;
        // Each change reads in basis points, each yield as a percentage.
        let change = of("change 2026-11-30");
        let changes: Vec<&str> = (0..batch.num_rows())
            .filter(|&r| ids.value(r) == change)
            .map(|r| texts.value(r))
            .collect();
        assert_eq!(changes.len(), 11, "a change per tenor");
        assert!(
            changes.iter().all(|t| t.ends_with("\u{a0}bp")),
            "{changes:?}"
        );
        let yields = of("2026-11-30");
        assert!(
            (0..batch.num_rows())
                .filter(|&r| ids.value(r) == yields)
                .all(|r| texts.value(r).ends_with('%'))
        );
        // The first day has no day before it: its change series has no values.
        let first = of("change 2026-01-02");
        assert!(
            (0..batch.num_rows())
                .filter(|&r| ids.value(r) == first)
                .all(|r| ys.value(r).is_nan() || texts.is_null(r))
        );
    }

    #[test]
    fn panes_the_chart_cannot_draw_are_refused() {
        let mut session = session();
        let replies = open(
            &mut session,
            r#"{"chart": {"kind": "line", "x": "tenor", "y": ["yield"], "axis": "tenor",
                          "panes": [{"columns": ["yield"]}]}}"#,
        );
        assert!(
            replies
                .iter()
                .any(|r| matches!(r, Body::Error(e) if e.message.contains("drawn once"))),
            "{replies:?}"
        );
    }
}

/// Opens view 1 with `layout` and returns the chart frame's series labels and keys.
fn labels_of(layout: &str) -> Vec<(String, String)> {
    let (mut session, _) = session();
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
        matches!(opened.as_slice(), [Body::ViewOpened(_)]),
        "{opened:?}"
    );
    let replies = send(
        &mut session,
        2,
        client_message::Body::SetChartWindow(SetChartWindow {
            view_id: 1,
            width: 400,
            height: 200,
            ..SetChartWindow::default()
        }),
    );
    let [Body::ChartFrame(frame)] = replies.as_slice() else {
        panic!("{replies:?}")
    };
    frame
        .series
        .iter()
        .map(|s| (s.label.clone(), s.key.clone()))
        .collect()
}

#[test]
fn one_plotted_column_names_its_series_by_value_alone() {
    let labels =
        labels_of(r#"{"chart":{"kind":"line","x":"beta","y":["delta"],"series":"long_short"}}"#);
    assert_eq!(
        labels,
        [
            ("Long".into(), "Long".into()),
            ("Short".into(), "Short".into())
        ]
    );
}

#[test]
fn several_columns_name_their_series_by_title_and_value() {
    let labels = labels_of(
        r#"{"chart":{"kind":"line","x":"beta","y":["delta"],"y_right":["volatility_30d"],
                     "series":"long_short"},
            "titles":{"delta":"Delta"}}"#,
    );
    assert_eq!(
        labels,
        [
            ("Delta Long".into(), "Long".into()),
            ("volatility_30d Long".into(), "Long".into()),
            ("Delta Short".into(), "Short".into()),
            ("volatility_30d Short".into(), "Short".into()),
        ]
    );
}

#[test]
fn a_title_names_an_unsplit_series_and_follows_a_display_change() {
    let (mut session, _) = session();
    let layout = r#"{"chart":{"kind":"line","x":"beta","y":["delta"]}}"#;
    send(
        &mut session,
        1,
        client_message::Body::OpenView(OpenView {
            view_id: 1,
            dataset: "positions".into(),
            parameters: HashMap::new(),
            layout_json: layout.into(),
        }),
    );
    send(
        &mut session,
        2,
        client_message::Body::SetChartWindow(SetChartWindow {
            view_id: 1,
            width: 400,
            height: 200,
            ..SetChartWindow::default()
        }),
    );
    // A title changes only the drawing, so the reduction stays and the label follows.
    let replies = update(
        &mut session,
        3,
        r#"{"chart":{"kind":"line","x":"beta","y":["delta"]},"titles":{"delta":"Delta"}}"#,
    );
    let [Body::ChartFrame(frame)] = replies.as_slice() else {
        panic!("{replies:?}")
    };
    let labels: Vec<(&str, &str)> = frame
        .series
        .iter()
        .map(|s| (s.label.as_str(), s.key.as_str()))
        .collect();
    assert_eq!(labels, [("Delta", "")]);
}

#[test]
fn a_refused_view_answers_later_requests_with_its_reason() {
    let (mut session, _) = session();
    let refused = send(
        &mut session,
        1,
        client_message::Body::OpenView(OpenView {
            view_id: 3,
            dataset: "positions".into(),
            parameters: HashMap::new(),
            layout_json: r#"{"titles":{"not_a_column":"X"}}"#.into(),
        }),
    );
    let [Body::Error(first)] = refused.as_slice() else {
        panic!("{refused:?}")
    };
    assert!(
        first
            .message
            .contains("not_a_column is neither a column nor a measure"),
        "{first:?}"
    );
    let later = send(
        &mut session,
        2,
        client_message::Body::SetViewport(SetViewport {
            view_id: 3,
            first_row: 0,
            row_count: 10,
            first_column: 0,
            column_count: 10,
        }),
    );
    let [Body::Error(again)] = later.as_slice() else {
        panic!("{later:?}")
    };
    assert_eq!(again.message, first.message);
    // Closed, the view is forgotten.
    send(
        &mut session,
        3,
        client_message::Body::CloseView(parallax_protocol::v1::CloseView { view_id: 3 }),
    );
    let gone = send(
        &mut session,
        4,
        client_message::Body::UpdateView(UpdateView {
            view_id: 3,
            layout_json: "{}".into(),
            config_version: 1,
            viewport: None,
        }),
    );
    assert!(
        matches!(gone.as_slice(), [Body::Error(e)] if e.message == "no view 3"),
        "{gone:?}"
    );
}
