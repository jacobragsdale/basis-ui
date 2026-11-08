//! The protocol conversation, checked message by message.

use parallax_protocol::ipc::decode_batches;
use parallax_protocol::v1::{ServerMessage, server_message::Body};
use parallax_session::testing::{fingerprint, transcript};
use prost::Message;

fn decoded() -> Vec<ServerMessage> {
    transcript()
        .iter()
        .map(|b| ServerMessage::decode(b.as_slice()).unwrap())
        .collect()
}

#[test]
fn the_conversation_answers_every_request() {
    let messages = decoded();
    let kinds: Vec<&str> = messages
        .iter()
        .map(|m| match m.body.as_ref().unwrap() {
            Body::Welcome(_) => "welcome",
            Body::ViewOpened(_) => "opened",
            Body::Frame(_) => "frame",
            Body::Error(_) => "error",
            Body::TableStatus(_) => "status",
            Body::DistinctValues(_) => "distinct",
            Body::ChartFrame(_) => "chart",
            Body::ChartMeasure(_) => "measure",
        })
        .collect();
    assert_eq!(
        kinds,
        vec![
            "welcome", "opened", "frame", "frame", "frame", "distinct", "opened", "frame",
            // The reload: each open view gets its status, then a pushed frame.
            "status", "frame", "status", "frame", "error",
            // Two charts, each opened and reduced, then a viewport a chart refuses.
            "opened", "chart", "opened", "chart", "error",
            // A grid scrolled near its end, then two updates with their windows.
            "opened", "frame", "frame", "frame", // A grid grouped with its rows.
            "opened", "frame"
        ]
    );
    // The filter leaves fewer rows than the window skipped, so it is answered from
    // the top; the next update is answered where its window is.
    let first_rows: Vec<(u64, u64)> = messages
        .iter()
        .rev()
        .skip(2)
        .take(2)
        .map(|m| match m.body.as_ref().unwrap() {
            Body::Frame(f) => (m.request_id, f.first_row),
            other => panic!("a frame, got {other:?}"),
        })
        .collect();
    assert_eq!(first_rows, vec![(19, 10), (18, 0)]);
}

#[test]
fn frames_carry_versions_and_decode() {
    let messages = decoded();
    let frames: Vec<_> = messages
        .iter()
        .filter_map(|m| match m.body.as_ref().unwrap() {
            Body::Frame(f) => Some(f.clone()),
            _ => None,
        })
        .collect();
    // Before the update the pivot runs config version 0; after it, version 2.
    assert_eq!(frames[0].config_version, 0);
    assert_eq!(frames[2].config_version, 2);
    assert!(
        frames
            .iter()
            .take(4)
            .all(|f| f.load_version == 1 && !f.pushed)
    );
    let pushed: Vec<_> = frames.iter().filter(|f| f.pushed).collect();
    assert_eq!(pushed.len(), 2);
    assert!(
        pushed
            .iter()
            .all(|f| f.load_version == 2 && f.source_as_of_micros == 1_900)
    );
    for f in &frames {
        let batches = decode_batches(&f.batch).unwrap();
        assert_eq!(batches.len(), 1);
        assert!(batches[0].num_rows() as u64 <= f.total_rows);
    }
    // The pivot shows the grand total first.
    let first = decode_batches(&frames[0].batch).unwrap().remove(0);
    let kind = first.column_by_name("__kind").unwrap();
    let kind = arrow_array::cast::AsArray::as_string::<i32>(kind.as_ref());
    assert_eq!(kind.value(0), "total");
}

/// The value and display-text columns of a frame, paired by their index metadata.
fn text_columns(
    batch: &arrow_array::RecordBatch,
) -> Vec<(String, arrow_array::ArrayRef, Vec<String>)> {
    use arrow_array::Array;
    let schema = batch.schema();
    let role = |i: usize| {
        schema
            .field(i)
            .metadata()
            .get("parallax.role")
            .cloned()
            .unwrap_or_default()
    };
    let index = |i: usize| schema.field(i).metadata().get("parallax.index").cloned();
    (0..schema.fields().len())
        .filter(|&i| role(i) == "value")
        .map(|i| {
            let text = (0..schema.fields().len())
                .find(|&j| role(j) == "text" && index(j) == index(i))
                .expect("every value has display text");
            let text = arrow_array::cast::AsArray::as_string::<i32>(batch.column(text).as_ref());
            assert_eq!(text.len(), batch.column(i).len());
            let title = schema.field(i).metadata()["parallax.title"].clone();
            (
                title,
                batch.column(i).clone(),
                text.iter().map(|t| t.unwrap().to_owned()).collect(),
            )
        })
        .collect()
}

#[test]
fn frames_carry_display_text_in_the_layouts_formats() {
    use arrow_array::Array;
    let messages = decoded();
    let frames: Vec<_> = messages
        .iter()
        .filter_map(|m| match m.body.as_ref().unwrap() {
            Body::Frame(f) => Some(f.clone()),
            _ => None,
        })
        .collect();
    let pivot = decode_batches(&frames[0].batch).unwrap().remove(0);
    let columns = text_columns(&pivot);
    assert!(!columns.is_empty());
    let mut seen = [false; 4];
    for (title, values, text) in &columns {
        for (row, t) in text.iter().enumerate() {
            if values.is_null(row) {
                continue;
            }
            if title.ends_with("% of total") {
                seen[0] = true;
                assert!(t.ends_with('%'), "{title}: {t}");
            } else if title.ends_with("sum(market_value_usd)") {
                seen[1] = true;
                // Millions, one decimal, negatives in parentheses.
                let body = t.trim_start_matches('(').trim_end_matches(')');
                let number = body
                    .strip_suffix('M')
                    .unwrap_or_else(|| panic!("{title}: {t}"));
                assert_eq!(
                    number.split('.').nth(1).map(str::len),
                    Some(1),
                    "{title}: {t}"
                );
                assert!(!t.contains('-'), "{title}: {t}");
            } else if title.ends_with("mean(beta)") && !t.contains('∞') {
                seen[2] = true;
                assert_eq!(t.split('.').nth(1).map(str::len), Some(3), "{title}: {t}");
            } else if title.ends_with("count(*)") {
                seen[3] = true;
                assert!(!t.contains('.'), "{title}: {t}");
            }
        }
    }
    assert_eq!(seen, [true; 4], "every measure was checked");
    // Column pivots are titled by their values in display form.
    assert!(
        columns
            .iter()
            .any(|(title, _, _)| title.starts_with("Long | ")),
        "{:?}",
        columns.iter().map(|c| &c.0).collect::<Vec<_>>()
    );
    // The drill-through is a flat view; its dates show as dates.
    let flat = decode_batches(&frames[3].batch).unwrap().remove(0);
    let (_, _, dates) = text_columns(&flat)
        .into_iter()
        .find(|(title, _, _)| title == "as_of_date")
        .unwrap();
    assert!(
        dates
            .iter()
            .all(|d| d.len() == 10 && d.as_bytes()[4] == b'-'),
        "{dates:?}"
    );
}

#[test]
fn drill_through_opens_a_flat_view_of_the_group() {
    let messages = decoded();
    let opened: Vec<_> = messages
        .iter()
        .filter_map(|m| match m.body.as_ref().unwrap() {
            Body::ViewOpened(v) => Some(v.clone()),
            _ => None,
        })
        .collect();
    assert_eq!(opened[1].view_id, 2);
    let layout: serde_json::Value = serde_json::from_str(&opened[1].layout_json).unwrap();
    let filters = layout["filters"].as_array().unwrap();
    // The view's own filter plus one equality filter per group level.
    assert_eq!(filters.len(), 3, "{layout}");
    assert_eq!(filters[1]["column"], "fund");
    assert_eq!(filters[2]["column"], "sector");
}

#[test]
fn distinct_values_respect_search_and_limit() {
    let messages = decoded();
    let result = messages
        .iter()
        .find_map(|m| match m.body.as_ref().unwrap() {
            Body::DistinctValues(d) => Some(d.clone()),
            _ => None,
        })
        .unwrap();
    let batch = decode_batches(&result.values).unwrap().remove(0);
    assert!(batch.num_rows() <= 25);
    let tickers = arrow_array::cast::AsArray::as_string::<i32>(batch.column(0).as_ref());
    for t in tickers.iter().flatten() {
        assert!(t.to_lowercase().contains('a'), "{t}");
    }
}

#[test]
fn errors_name_the_problem() {
    let errors: Vec<String> = decoded()
        .into_iter()
        .filter_map(|m| match m.body.unwrap() {
            Body::Error(e) => Some(e.message),
            _ => None,
        })
        .collect();
    assert!(
        errors.iter().any(|e| e.contains("no_such_column")),
        "{errors:?}"
    );
    assert!(errors.last().unwrap().contains("is a chart"), "{errors:?}");
}

#[test]
fn chart_frames_carry_reduced_data_and_exact_text() {
    let charts: Vec<_> = decoded()
        .into_iter()
        .filter_map(|m| match m.body.unwrap() {
            Body::ChartFrame(f) => Some(f),
            _ => None,
        })
        .collect();
    assert_eq!(charts.len(), 2);
    // The histogram of beta, split by long and short, at 2,000 positions.
    let histogram = &charts[0];
    assert_eq!(histogram.view_id, 3);
    let labels: Vec<&str> = histogram.series.iter().map(|s| s.label.as_str()).collect();
    assert_eq!(labels, ["Long", "Short"], "one column: by value alone");
    assert!(!histogram.ticks.is_empty());
    let batch = decode_batches(&histogram.batch).unwrap().remove(0);
    let role = |b: &arrow_array::RecordBatch, name: &str| {
        b.schema().field_with_name(name).unwrap().metadata()["parallax.role"].clone()
    };
    assert_eq!(role(&batch, "count"), "count");
    let counts = arrow_array::cast::AsArray::as_primitive::<arrow_array::types::UInt64Type>(
        batch.column_by_name("count").unwrap().as_ref(),
    );
    assert_eq!(counts.len(), 2 * 50, "50 bins of 8 px per series");
    let total: u64 = counts.iter().flatten().sum();
    assert!(total > 1_000 && total <= 2_000, "{total}");
    let from_text = arrow_array::cast::AsArray::as_string::<i32>(
        batch.column_by_name("from_text").unwrap().as_ref(),
    );
    // Two decimals, as the layout's format says.
    assert!(
        from_text
            .iter()
            .flatten()
            .all(|t| t.split('.').nth(1).is_some_and(|d| d.len() == 2)),
        "{from_text:?}"
    );
    // Market value against beta as dots, each position with a beta one dot,
    // and a fit line per side.
    let dots = &charts[1];
    assert_eq!((dots.columns, dots.rows), (0, 0));
    assert!(dots.y_to > dots.y_from);
    let batch = decode_batches(&dots.batch).unwrap().remove(0);
    assert!(
        batch.num_rows() > 1_000 && batch.num_rows() <= 2_000,
        "{}",
        batch.num_rows()
    );
    for name in ["size", "id_json", "tooltip_0", "tooltip_1", "fit_text"] {
        assert_eq!(role(&batch, name), name);
    }
    assert_eq!(dots.fits.len(), 2);
    assert!(!dots.fit_batch.is_empty());
}

/// The WebAssembly test suite checks the same value, so both builds must answer
/// byte for byte the same.
pub const TRANSCRIPT_FINGERPRINT: u64 = 6_907_957_008_114_493_598;

#[test]
fn transcript_fingerprint_is_stable() {
    assert_eq!(fingerprint(&transcript()), TRANSCRIPT_FINGERPRINT);
}

mod races {
    use std::sync::{Arc, RwLock};

    use arrow_array::cast::AsArray;
    use arrow_array::types::Int64Type;
    use parallax_datagen::Dataset;
    use parallax_datagen::positions::{Positions, PositionsOptions};
    use parallax_engine::{Table, TableOptions, View, ViewConfig};
    use parallax_protocol::ipc::decode_batches;
    use parallax_protocol::v1::{
        ClientMessage, DrillThrough, OpenView, SetViewport, client_message, server_message::Body,
    };
    use parallax_session::{MemoryCatalog, Session, TableState};

    fn positions(rows: u64, seed: u64) -> arrow_array::RecordBatch {
        Positions::new(PositionsOptions {
            rows,
            seed,
            securities: 300,
            hostile: true,
            ..PositionsOptions::default()
        })
        .unwrap()
        .batch(0..rows)
    }

    fn setup(rows: u64) -> (Arc<RwLock<TableState>>, Session) {
        let batch = positions(rows, 21);
        let mut table = Table::new(
            &batch.schema(),
            TableOptions {
                primary_key: Some("position_id".into()),
                ..TableOptions::default()
            },
        )
        .unwrap();
        table.load(&[batch]).unwrap();
        let shared = Arc::new(RwLock::new(TableState::new(table, 1, 1)));
        let catalog = Arc::new(MemoryCatalog::new());
        catalog.insert("positions", Arc::clone(&shared));
        (shared, Session::new(catalog))
    }

    fn ask(session: &mut Session, body: client_message::Body) -> Vec<Body> {
        session
            .handle(ClientMessage {
                request_id: 1,
                body: Some(body),
            })
            .into_iter()
            .map(|m| m.body.unwrap())
            .collect()
    }

    fn viewport(view_id: u32) -> client_message::Body {
        client_message::Body::SetViewport(SetViewport {
            view_id,
            first_row: 0,
            row_count: 200,
            first_column: 0,
            column_count: 50,
        })
    }

    #[test]
    fn a_viewport_after_an_unseen_reload_reflects_the_new_load() {
        let (shared, mut session) = setup(1_000);
        let layout = r#"{"version":1,"sort":[{"column":"market_value_usd","descending":true}]}"#;
        ask(
            &mut session,
            client_message::Body::OpenView(OpenView {
                view_id: 1,
                dataset: "positions".into(),
                parameters: Default::default(),
                layout_json: layout.into(),
            }),
        );
        ask(&mut session, viewport(1));
        // A reload the session has not been told about: fewer rows, reused slots.
        shared
            .write()
            .unwrap()
            .reload(&[positions(600, 22)], 2, 2)
            .unwrap();
        let replies = ask(&mut session, viewport(1));
        let Body::Frame(frame) = &replies[0] else {
            panic!("{replies:?}")
        };
        assert_eq!(frame.load_version, 2);
        assert_eq!(frame.total_rows, 600);
        // The rows are exactly those of a view built fresh on the new table.
        let state = shared.read().unwrap();
        let mut fresh = View::new(
            &state.table,
            ViewConfig {
                sort: vec![parallax_engine::view::Sort {
                    column: "market_value_usd".into(),
                    descending: true,
                }],
                ..ViewConfig::default()
            },
        )
        .unwrap();
        let expected = fresh.window(&state.table, 0..200, 0..50).batch;
        let got = decode_batches(&frame.batch).unwrap().remove(0);
        let ids = |b: &arrow_array::RecordBatch| -> Vec<i64> {
            b.column_by_name("position_id")
                .unwrap()
                .as_primitive::<Int64Type>()
                .values()
                .to_vec()
        };
        assert_eq!(ids(&got), ids(&expected));
    }

    #[test]
    fn drilling_into_an_infinite_float_group_works() {
        use arrow_array::{Float64Array, Int64Array, RecordBatch};
        let batch = RecordBatch::try_from_iter([
            ("id", Arc::new(Int64Array::from(vec![1, 2, 3, 4, 5])) as _),
            (
                "x",
                Arc::new(Float64Array::from(vec![
                    f64::INFINITY,
                    1.0,
                    f64::INFINITY,
                    f64::NEG_INFINITY,
                    2.0,
                ])) as _,
            ),
        ])
        .unwrap();
        let mut table = Table::new(&batch.schema(), TableOptions::default()).unwrap();
        table.load(&[batch]).unwrap();
        let catalog = Arc::new(MemoryCatalog::new());
        catalog.insert("t", Arc::new(RwLock::new(TableState::new(table, 1, 1))));
        let mut session = Session::new(catalog);
        let layout = r#"{"version":1,"group_by":["x"],"measures":[{"aggregate":"count_all"}],
            "group_sort":{"by":"key","descending":true}}"#;
        ask(
            &mut session,
            client_message::Body::OpenView(OpenView {
                view_id: 1,
                dataset: "t".into(),
                parameters: Default::default(),
                layout_json: layout.into(),
            }),
        );
        // Descending key order puts +inf first, right after the grand total.
        let replies = ask(
            &mut session,
            client_message::Body::DrillThrough(DrillThrough {
                view_id: 1,
                row: 1,
                new_view_id: 2,
            }),
        );
        let Body::ViewOpened(opened) = &replies[0] else {
            panic!("drill-through failed: {replies:?}")
        };
        assert!(
            opened.layout_json.contains(r#""value":"inf""#),
            "{}",
            opened.layout_json
        );
        let replies = ask(&mut session, viewport(2));
        let Body::Frame(frame) = &replies[0] else {
            panic!("{replies:?}")
        };
        assert_eq!(frame.total_rows, 2, "the two rows with x = +inf");
    }
}

mod requests {
    use std::sync::{Arc, RwLock};

    use parallax_datagen::Dataset;
    use parallax_datagen::positions::{Positions, PositionsOptions};
    use parallax_engine::{Table, TableOptions};
    use parallax_protocol::ipc::decode_batches;
    use parallax_protocol::v1::{
        ClientMessage, FetchWindow, GridWindow, OpenView, SetExpanded, SetViewport, UpdateView,
        client_message::Body as C, server_message::Body,
    };
    use parallax_session::{MAX_FETCH_CELLS, MemoryCatalog, Session, TableState};

    fn session() -> Session {
        session_of(3_000)
    }

    fn session_of(rows: u64) -> Session {
        let batch = Positions::new(PositionsOptions {
            rows,
            seed: 5,
            securities: 200,
            ..PositionsOptions::default()
        })
        .unwrap()
        .batch(0..rows);
        let mut table = Table::new(&batch.schema(), TableOptions::default()).unwrap();
        table.load(&[batch]).unwrap();
        let catalog = Arc::new(MemoryCatalog::new());
        catalog.insert(
            "positions",
            Arc::new(RwLock::new(TableState::new(table, 1, 1))),
        );
        Session::new(catalog)
    }

    fn ask(session: &mut Session, request_id: u64, body: C) -> Vec<(u64, Body)> {
        session
            .handle(ClientMessage {
                request_id,
                body: Some(body),
            })
            .into_iter()
            .map(|m| (m.request_id, m.body.unwrap()))
            .collect()
    }

    fn open(session: &mut Session, layout: &str) -> Vec<(u64, Body)> {
        ask(
            session,
            1,
            C::OpenView(OpenView {
                view_id: 1,
                dataset: "positions".into(),
                parameters: Default::default(),
                layout_json: layout.into(),
            }),
        )
    }

    fn frame_rows(messages: &[(u64, Body)]) -> Option<(u64, usize)> {
        messages.iter().find_map(|(id, b)| match b {
            Body::Frame(f) => Some((*id, decode_batches(&f.batch).unwrap()[0].num_rows())),
            _ => None,
        })
    }

    #[test]
    fn a_fetched_window_does_not_move_the_viewport() {
        let mut s = session();
        open(&mut s, r#"{"columns":["position_id","fund"]}"#);
        let viewport = C::SetViewport(SetViewport {
            view_id: 1,
            first_row: 0,
            row_count: 10,
            first_column: 0,
            column_count: 2,
        });
        assert_eq!(frame_rows(&ask(&mut s, 2, viewport)), Some((2, 10)));
        let fetched = ask(
            &mut s,
            3,
            C::FetchWindow(FetchWindow {
                view_id: 1,
                first_row: 100,
                row_count: 500,
                first_column: 0,
                column_count: 2,
            }),
        );
        assert_eq!(frame_rows(&fetched), Some((3, 500)));
        // An update still answers with the viewport's ten rows.
        let updated = ask(
            &mut s,
            4,
            C::UpdateView(UpdateView {
                view_id: 1,
                layout_json: r#"{"columns":["position_id","fund"],"formats":{"position_id":{"thousands":false}}}"#.into(),
                config_version: 1,
                viewport: None,
            }),
        );
        assert_eq!(frame_rows(&updated), Some((4, 10)));
    }

    #[test]
    fn fetches_are_capped_after_clamping_to_the_view() {
        // 30,000 rows by 40 columns is 1.2 million cells.
        let mut s = session_of(30_000);
        open(&mut s, "{}");
        let fetch = |first_row: u64, row_count: u64| {
            C::FetchWindow(FetchWindow {
                view_id: 1,
                first_row,
                row_count,
                first_column: 0,
                column_count: u32::MAX,
            })
        };
        let rows = MAX_FETCH_CELLS / 40;
        assert!(matches!(
            ask(&mut s, 2, fetch(0, rows))[0].1,
            Body::Frame(_)
        ));
        let Body::Error(e) = &ask(&mut s, 3, fetch(0, rows + 1))[0].1 else {
            panic!("refused");
        };
        assert!(e.message.contains("cells"), "{}", e.message);
        // Past the end, the window is clamped first, so a huge count is fine.
        assert!(matches!(
            ask(&mut s, 4, fetch(29_000, u64::MAX))[0].1,
            Body::Frame(_)
        ));
    }

    #[test]
    fn a_format_change_keeps_expanded_groups() {
        let mut s = session();
        let layout = r#"{"group_by":["fund","strategy"],"measures":[{"column":"market_value_usd","aggregate":"sum"}]}"#;
        open(&mut s, layout);
        ask(
            &mut s,
            2,
            C::SetViewport(SetViewport {
                view_id: 1,
                first_row: 0,
                row_count: 100,
                first_column: 0,
                column_count: 5,
            }),
        );
        let collapsed = ask(
            &mut s,
            3,
            C::SetExpanded(SetExpanded {
                view_id: 1,
                path_json: "[\"Atlas Global Macro\"]".into(),
                expanded: false,
            }),
        );
        let (_, rows_collapsed) = frame_rows(&collapsed).unwrap();
        // The same layout with the collapse recorded and a new format: no rebuild,
        // so the group stays collapsed and the row count is unchanged.
        let reformatted = ask(
            &mut s,
            4,
            C::UpdateView(UpdateView {
                view_id: 1,
                layout_json: r#"{"group_by":["fund","strategy"],"measures":[{"column":"market_value_usd","aggregate":"sum","format":{"abbreviate":"millions"}}],"expanded":[{"path":["Atlas Global Macro"],"expanded":false}]}"#.into(),
                config_version: 1,
                viewport: None,
            }),
        );
        let (_, rows_after) = frame_rows(&reformatted).unwrap();
        assert_eq!(rows_after, rows_collapsed);
        let Body::Frame(f) = &reformatted[0].1 else {
            panic!("a frame");
        };
        let batch = &decode_batches(&f.batch).unwrap()[0];
        let text = batch.column_by_name("sum(market_value_usd)#text").unwrap();
        let text = arrow_array::cast::AsArray::as_string::<i32>(text.as_ref());
        assert!(text.value(0).ends_with('M'), "{}", text.value(0));
    }

    fn first_row(messages: &[(u64, Body)]) -> Option<u64> {
        messages.iter().find_map(|(_, b)| match b {
            Body::Frame(f) => Some(f.first_row),
            _ => None,
        })
    }

    fn update(layout: &str, version: u64, viewport: Option<GridWindow>) -> C {
        C::UpdateView(UpdateView {
            view_id: 1,
            layout_json: layout.into(),
            config_version: version,
            viewport,
        })
    }

    fn window(first_row: u64, row_count: u64) -> GridWindow {
        GridWindow {
            first_row,
            row_count,
            first_column: 0,
            column_count: 2,
        }
    }

    #[test]
    fn an_update_answers_with_the_window_it_carries() {
        let mut s = session();
        let layout = r#"{"columns":["position_id","fund"]}"#;
        open(&mut s, layout);
        // A view that has never had a viewport is answered all the same.
        let updated = ask(&mut s, 2, update(layout, 1, Some(window(100, 30))));
        assert_eq!(frame_rows(&updated), Some((2, 30)));
        assert_eq!(first_row(&updated), Some(100));
        // The window becomes the viewport: an update without one answers with it.
        let again = ask(&mut s, 3, update(layout, 2, None));
        assert_eq!(frame_rows(&again), Some((3, 30)));
        assert_eq!(first_row(&again), Some(100));
    }

    #[test]
    fn rows_that_end_before_the_viewport_answer_from_the_top() {
        let mut s = session();
        open(&mut s, r#"{"columns":["position_id","fund"]}"#);
        ask(
            &mut s,
            2,
            C::SetViewport(SetViewport {
                view_id: 1,
                first_row: 2_900,
                row_count: 50,
                first_column: 0,
                column_count: 2,
            }),
        );
        // 40 rows remain, all before the viewport.
        let narrowed = r#"{"columns":["position_id","fund"],"filters":[{"column":"position_id","op":"le","value":40}]}"#;
        let answer = ask(&mut s, 3, update(narrowed, 1, None));
        assert_eq!(first_row(&answer), Some(0));
        let Some((3, rows)) = frame_rows(&answer) else {
            panic!("a frame, got {answer:?}");
        };
        assert!(rows > 0 && rows <= 50, "{rows}");
        // So does a window sent with the update, and the viewport stays at the top.
        let sent = ask(&mut s, 4, update(narrowed, 2, Some(window(1_000, 50))));
        assert_eq!(first_row(&sent), Some(0));
        let viewport = C::SetViewport(SetViewport {
            view_id: 1,
            first_row: 0,
            row_count: 50,
            first_column: 0,
            column_count: 2,
        });
        assert_eq!(frame_rows(&ask(&mut s, 5, viewport)), Some((5, rows)));
        // A window that starts inside the rows is answered where it is.
        let inside = ask(&mut s, 6, update(narrowed, 3, Some(window(10, 50))));
        assert_eq!(first_row(&inside), Some(10));
    }

    #[test]
    fn a_chart_refuses_a_window_sent_with_its_update() {
        let mut s = session();
        open(&mut s, r#"{"columns":["position_id","fund"]}"#);
        let chart = r#"{"chart":{"kind":"histogram","x":"beta"}}"#;
        // An update with a window is always answered, here with the reason.
        let answer = ask(&mut s, 2, update(chart, 1, Some(window(0, 50))));
        let [(2, Body::Error(e))] = answer.as_slice() else {
            panic!("one error, got {answer:?}");
        };
        assert!(e.message.contains("chart window"), "{}", e.message);
        // Without a window, a chart that was never asked for one has nothing to say.
        assert!(ask(&mut s, 3, update(chart, 2, None)).is_empty());
        // The chart has no viewport, so a grid layout after it has none either.
        let grid = ask(
            &mut s,
            4,
            update(r#"{"columns":["position_id","fund"]}"#, 3, None),
        );
        assert!(grid.is_empty(), "{grid:?}");
    }

    fn viewport_frame(s: &mut Session, request_id: u64) -> parallax_protocol::v1::Frame {
        let answer = ask(
            s,
            request_id,
            C::SetViewport(SetViewport {
                view_id: 1,
                first_row: 0,
                row_count: 10_000,
                first_column: 0,
                column_count: 40,
            }),
        );
        match answer.into_iter().next() {
            Some((_, Body::Frame(f))) => f,
            other => panic!("a frame, got {other:?}"),
        }
    }

    fn strings(batch: &arrow_array::RecordBatch, name: &str) -> Vec<String> {
        arrow_array::cast::AsArray::as_string::<i32>(batch.column_by_name(name).unwrap().as_ref())
            .iter()
            .map(|v| v.unwrap_or_default().to_owned())
            .collect()
    }

    #[test]
    fn value_lists_follow_the_column_s_order() {
        let mut s = session();
        open(
            &mut s,
            r#"{"columns":["position_id","credit_rating"],"orders":{"credit_rating":"rating"}}"#,
        );
        let listed = ask(
            &mut s,
            2,
            C::DistinctValues(parallax_protocol::v1::DistinctValues {
                view_id: 1,
                column: "credit_rating".into(),
                search: String::new(),
                limit: 1_000,
            }),
        );
        let Body::DistinctValues(list) = &listed[0].1 else {
            panic!("values, got {listed:?}");
        };
        let texts = strings(&decode_batches(&list.values).unwrap()[0], "text");
        let notches: Vec<u64> = texts
            .iter()
            .filter_map(|t| parallax_engine::order::rating_notch(t))
            .collect();
        assert!(notches.len() > 3, "{texts:?}");
        assert!(notches.windows(2).all(|w| w[0] < w[1]), "{texts:?}");
    }

    #[test]
    fn a_search_narrows_the_rows_and_the_value_lists() {
        let mut s = session();
        open(&mut s, r#"{"columns":["position_id","fund","sector"]}"#);
        let all = viewport_frame(&mut s, 2).total_rows;
        // A fund's name, searched for in lower case.
        let fund = strings(
            &decode_batches(&viewport_frame(&mut s, 3).batch).unwrap()[0],
            "fund#text",
        )[0]
        .to_lowercase();
        let searched =
            format!(r#"{{"columns":["position_id","fund","sector"],"search":{fund:?}}}"#);
        ask(&mut s, 4, update(&searched, 1, None));
        let found = viewport_frame(&mut s, 5);
        assert!(
            found.total_rows > 0 && found.total_rows < all,
            "{} of {all}",
            found.total_rows
        );
        let funds = strings(&decode_batches(&found.batch).unwrap()[0], "fund#text");
        let sectors = strings(&decode_batches(&found.batch).unwrap()[0], "sector#text");
        assert!(
            funds
                .iter()
                .zip(&sectors)
                .all(|(f, s)| f.to_lowercase().contains(&fund) || s.to_lowercase().contains(&fund))
        );
        // The value lists count only the rows the search keeps.
        let listed = ask(
            &mut s,
            6,
            C::DistinctValues(parallax_protocol::v1::DistinctValues {
                view_id: 1,
                column: "sector".into(),
                search: String::new(),
                limit: 1_000,
            }),
        );
        let Body::DistinctValues(list) = &listed[0].1 else {
            panic!("values, got {listed:?}");
        };
        let counts = decode_batches(&list.values).unwrap();
        let total: i64 = counts
            .iter()
            .map(|b| {
                arrow_array::cast::AsArray::as_primitive::<arrow_array::types::Int64Type>(
                    b.column_by_name("count").unwrap().as_ref(),
                )
                .values()
                .iter()
                .sum::<i64>()
            })
            .sum();
        assert_eq!(total as u64, found.total_rows);
        // A view of every column searches every text column.
        ask(
            &mut s,
            8,
            update(&format!(r#"{{"search":{fund:?}}}"#), 3, None),
        );
        assert_eq!(viewport_frame(&mut s, 9).total_rows, found.total_rows);
        // A view that shows no text column has nothing to search.
        let answer = ask(
            &mut s,
            7,
            update(r#"{"columns":["position_id"],"search":"x"}"#, 2, None),
        );
        assert!(
            matches!(&answer[0].1, Body::Error(e) if e.message.contains("no text column")),
            "{answer:?}"
        );
    }

    #[test]
    fn frames_carry_the_totals_row_and_pinned_columns_come_first() {
        let mut s = session();
        open(
            &mut s,
            r#"{"columns":["position_id","fund","market_value_usd"],"pinned":["market_value_usd"],
                "titles":{"fund":"Fund"},
                "totals":[{"column":"market_value_usd","aggregate":"sum"},{"column":"fund","aggregate":"distinct_count"}]}"#,
        );
        let frame = viewport_frame(&mut s, 2);
        let batch = &decode_batches(&frame.batch).unwrap()[0];
        let schema = batch.schema();
        let values: Vec<&str> = schema
            .fields()
            .iter()
            .filter(|f| f.metadata().get("parallax.role").map(String::as_str) == Some("value"))
            .map(|f| f.name().as_str())
            .collect();
        assert_eq!(values, ["market_value_usd", "position_id", "fund"]);
        let fund = schema.field_with_name("fund").unwrap();
        assert_eq!(fund.metadata()["parallax.title"], "Fund");
        let totals = &decode_batches(&frame.totals).unwrap()[0];
        assert_eq!(totals.num_rows(), 1);
        assert_ne!(strings(totals, "market_value_usd#text"), [""]);
        assert_eq!(strings(totals, "position_id#text"), [""]);
        assert!(strings(totals, "fund#text")[0].parse::<u32>().unwrap() > 1);
        // A view without totals sends none.
        ask(&mut s, 3, update(r#"{"columns":["fund"]}"#, 1, None));
        assert!(viewport_frame(&mut s, 4).totals.is_empty());
    }

    #[test]
    fn titles_name_a_pivot_s_measures_by_their_headers() {
        let mut s = session();
        open(
            &mut s,
            r#"{"group_by":["fund"],"split_by":["long_short"],
                "measures":[{"column":"market_value_usd","aggregate":"sum"},
                            {"column":"beta","aggregate":"weighted_mean","weight":"market_value_usd"}],
                "titles":{"sum(market_value_usd)":"Market value","wmean(beta by market_value_usd)":"Beta"}}"#,
        );
        let frame = viewport_frame(&mut s, 2);
        let batch = &decode_batches(&frame.batch).unwrap()[0];
        let schema = batch.schema();
        let titles: Vec<&str> = schema
            .fields()
            .iter()
            .filter(|f| f.metadata().get("parallax.role").map(String::as_str) == Some("value"))
            .map(|f| f.metadata()["parallax.title"].as_str())
            .collect();
        assert_eq!(
            titles,
            [
                "Long | Market value",
                "Long | Beta",
                "Short | Market value",
                "Short | Beta",
                "Total | Market value",
                "Total | Beta",
            ]
        );
        // The names stay the measures' own, which sorts and widths key on.
        assert!(
            schema
                .field_with_name("Total | sum(market_value_usd)")
                .is_ok()
        );
    }

    #[test]
    fn a_title_that_names_nothing_says_what_it_could_name() {
        let mut s = session();
        let answer = open(
            &mut s,
            r#"{"group_by":["fund"],"measures":[{"column":"beta","aggregate":"sum"}],
                "titles":{"sum(par)":"Par"}}"#,
        );
        let Body::Error(e) = &answer[0].1 else {
            panic!("{answer:?}")
        };
        assert!(
            e.message
                .contains("titles: sum(par) is neither a column nor a measure"),
            "{e:?}"
        );
        assert!(e.message.contains("position_id, as_of_date, fund"), "{e:?}");
        assert!(
            e.message.ends_with("and the measures are sum(beta)"),
            "{e:?}"
        );
    }

    #[test]
    fn a_detail_layout_lists_rows_under_their_groups() {
        let mut s = session();
        open(
            &mut s,
            r#"{"group_by":["fund"],"detail":true,"expand_depth":1,"columns":["position_id","ticker"],
                "totals":[{"column":"position_id","aggregate":"count"}]}"#,
        );
        let frame = viewport_frame(&mut s, 2);
        let batch = &decode_batches(&frame.batch).unwrap()[0];
        let kinds = strings(batch, "__kind");
        assert_eq!(kinds[0], "group");
        assert_eq!(kinds[1], "row");
        assert_eq!(frame.total_rows as usize, kinds.len());
        assert_eq!(kinds.iter().filter(|k| *k == "row").count(), 3_000);
        // The footer counts every row.
        assert_eq!(
            strings(
                &decode_batches(&frame.totals).unwrap()[0],
                "position_id#text"
            ),
            ["3,000"]
        );
    }

    #[test]
    fn a_layout_for_another_dataset_is_refused() {
        let mut s = session();
        let answer = open(&mut s, r#"{"dataset":"trades"}"#);
        let Body::Error(e) = &answer[0].1 else {
            panic!("an error, got {answer:?}");
        };
        assert!(e.message.contains("trades"), "{}", e.message);
        assert!(matches!(
            open(&mut s, r#"{"dataset":"positions"}"#)[0].1,
            Body::ViewOpened(_)
        ));
    }
}
