//! What a table holds for its views across reloads.

use std::sync::{Arc, RwLock};

use arrow_array::RecordBatch;
use arrow_array::cast::AsArray;
use arrow_array::types::Int64Type;
use parallax_datagen::Dataset;
use parallax_datagen::positions::{Positions, PositionsOptions};
use parallax_engine::view::Sort;
use parallax_engine::{Table, TableOptions, View, ViewConfig};
use parallax_protocol::ipc::decode_batches;
use parallax_protocol::v1::{
    ClientMessage, CloseView, Frame, OpenView, SetViewport, client_message, server_message::Body,
};
use parallax_session::{MemoryCatalog, Session, TableState};

const ROWS: u64 = 1_000;
const LAYOUT: &str = r#"{"version":1,"sort":[{"column":"market_value_usd","descending":true}]}"#;

fn positions(seed: u64) -> RecordBatch {
    first_positions(seed, ROWS)
}

fn first_positions(seed: u64, rows: u64) -> RecordBatch {
    Positions::new(PositionsOptions {
        rows: ROWS,
        seed,
        securities: 300,
        ..PositionsOptions::default()
    })
    .unwrap()
    .batch(0..rows)
}

fn table(primary_key: Option<&str>) -> (Arc<MemoryCatalog>, Arc<RwLock<TableState>>) {
    let batch = positions(1);
    let mut table = Table::new(
        &batch.schema(),
        TableOptions {
            primary_key: primary_key.map(str::to_owned),
            ..TableOptions::default()
        },
    )
    .unwrap();
    table.load(&[batch]).unwrap();
    let shared = Arc::new(RwLock::new(TableState::new(table, 1, 1)));
    let catalog = Arc::new(MemoryCatalog::new());
    catalog.insert("positions", Arc::clone(&shared));
    (catalog, shared)
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

/// Opens view `view_id` with [`LAYOUT`] and sets its viewport.
fn open(session: &mut Session, view_id: u32) {
    let opened = ask(
        session,
        client_message::Body::OpenView(OpenView {
            view_id,
            dataset: "positions".into(),
            parameters: Default::default(),
            layout_json: LAYOUT.into(),
        }),
    );
    assert!(matches!(opened[0], Body::ViewOpened(_)), "{opened:?}");
    viewport(session, view_id);
}

fn viewport(session: &mut Session, view_id: u32) -> Frame {
    let replies = ask(
        session,
        client_message::Body::SetViewport(SetViewport {
            view_id,
            first_row: 0,
            row_count: 200,
            first_column: 0,
            column_count: 50,
        }),
    );
    match replies.into_iter().next() {
        Some(Body::Frame(frame)) => frame,
        other => panic!("a frame, got {other:?}"),
    }
}

fn reload(shared: &RwLock<TableState>, seed: u64) {
    reload_with(shared, &positions(seed), seed);
}

fn reload_with(shared: &RwLock<TableState>, batch: &RecordBatch, at: u64) {
    let at = i64::try_from(at).unwrap();
    shared
        .write()
        .unwrap()
        .reload(std::slice::from_ref(batch), at, at)
        .unwrap();
}

fn ids(batch: &RecordBatch) -> Vec<i64> {
    batch
        .column_by_name("position_id")
        .unwrap()
        .as_primitive::<Int64Type>()
        .values()
        .to_vec()
}

/// The rows a view built fresh on the table shows in the frame's window.
fn fresh_ids(shared: &RwLock<TableState>) -> Vec<i64> {
    let state = shared.read().unwrap();
    let mut view = View::new(
        &state.table,
        ViewConfig {
            sort: vec![Sort {
                column: "market_value_usd".into(),
                descending: true,
            }],
            ..ViewConfig::default()
        },
    )
    .unwrap();
    ids(&view.window(&state.table, 0..200, 0..50).batch)
}

fn frame_ids(frame: &Frame) -> Vec<i64> {
    ids(&decode_batches(&frame.batch).unwrap()[0])
}

#[test]
fn reloads_of_an_unkeyed_table_hold_no_old_rows_once_its_views_catch_up() {
    let (catalog, shared) = table(None);
    let mut session = Session::new(catalog);
    open(&mut session, 1);
    for seed in 2..30 {
        reload(&shared, seed);
        // The open view has yet to apply this load: it needs its old rows.
        assert_eq!(shared.read().unwrap().held_rows(), ROWS as usize);
        let pushed = session.refresh();
        let frame = pushed
            .iter()
            .find_map(|m| match m.body.as_ref().unwrap() {
                Body::Frame(f) => Some(f.clone()),
                _ => None,
            })
            .expect("a pushed frame");
        assert_eq!(frame.load_version, seed);
        assert_eq!(frame_ids(&frame), fresh_ids(&shared));
        assert_eq!(shared.read().unwrap().held_rows(), 0, "after reload {seed}");
    }
}

#[test]
fn a_table_no_view_reads_holds_no_old_rows() {
    let (catalog, shared) = table(None);
    for seed in 2..30 {
        reload(&shared, seed);
    }
    assert_eq!(shared.read().unwrap().held_rows(), 0);

    // A closed view, or a dropped session, needs nothing either.
    let mut session = Session::new(Arc::clone(&catalog) as _);
    open(&mut session, 1);
    ask(
        &mut session,
        client_message::Body::CloseView(CloseView { view_id: 1 }),
    );
    let mut dropped = Session::new(catalog);
    open(&mut dropped, 1);
    drop(dropped);
    reload(&shared, 30);
    assert_eq!(shared.read().unwrap().held_rows(), 0);
}

#[test]
fn a_view_that_misses_reloads_holds_at_most_one_table_of_old_rows() {
    let (catalog, shared) = table(None);
    let mut idle = Session::new(Arc::clone(&catalog) as _);
    open(&mut idle, 1);
    let mut busy = Session::new(catalog);
    open(&mut busy, 1);
    for seed in 2..30 {
        reload(&shared, seed);
        busy.refresh();
        let state = shared.read().unwrap();
        assert!(
            state.held_rows() <= state.table.num_slots(),
            "reload {seed} holds {} old rows for {} slots",
            state.held_rows(),
            state.table.num_slots()
        );
    }
    // The view that missed them rebuilds, and shows what a fresh view shows.
    let frame = viewport(&mut idle, 1);
    assert_eq!(frame.load_version, 29);
    assert_eq!(frame_ids(&frame), fresh_ids(&shared));
    assert_eq!(shared.read().unwrap().held_rows(), 0);
}

#[test]
fn a_keyed_view_keeps_the_diff_of_one_missed_reload_and_rebuilds_after_more() {
    let (catalog, shared) = table(Some("position_id"));
    let mut session = Session::new(catalog);
    open(&mut session, 1);
    // Fifty rows go: the view keeps their old images to apply the diff.
    reload_with(&shared, &first_positions(1, ROWS - 50), 2);
    assert_eq!(shared.read().unwrap().held_rows(), 50);
    let frame = viewport(&mut session, 1);
    assert_eq!(frame.load_version, 2);
    assert_eq!(frame_ids(&frame), fresh_ids(&shared));
    assert_eq!(shared.read().unwrap().held_rows(), 0);
    // They come back and go again: a view two loads behind keeps nothing, and
    // rebuilds.
    for (version, rows) in [(3, ROWS), (4, ROWS - 50)] {
        reload_with(&shared, &first_positions(1, rows), version);
    }
    assert_eq!(shared.read().unwrap().held_rows(), 0);
    let frame = viewport(&mut session, 1);
    assert_eq!(frame.load_version, 4);
    assert_eq!(frame_ids(&frame), fresh_ids(&shared));
}

/// A keyed table of three rows, the first two on one desk, holding `values`.
fn desks(values: [f64; 3]) -> RecordBatch {
    use arrow_array::{Float64Array, Int64Array, StringArray};
    RecordBatch::try_from_iter([
        (
            "id",
            Arc::new(Int64Array::from(vec![1, 2, 3])) as arrow_array::ArrayRef,
        ),
        (
            "desk",
            Arc::new(StringArray::from(vec!["A", "A", "B"])) as _,
        ),
        ("value", Arc::new(Float64Array::from(values.to_vec())) as _),
    ])
    .unwrap()
}

/// The frame a pivot of the sums by desk in view `view_id` answers its viewport
/// with, opened first if `open`.
fn pivot_frame(session: &mut Session, view_id: u32, open: bool) -> RecordBatch {
    if open {
        let opened = ask(
            session,
            client_message::Body::OpenView(OpenView {
                view_id,
                dataset: "desks".into(),
                parameters: Default::default(),
                layout_json: r#"{"version":1,"group_by":["desk"],"measures":[{"column":"value","aggregate":"sum"}]}"#.into(),
            }),
        );
        assert!(matches!(opened[0], Body::ViewOpened(_)), "{opened:?}");
    }
    let replies = ask(
        session,
        client_message::Body::SetViewport(SetViewport {
            view_id,
            first_row: 0,
            row_count: 10,
            first_column: 0,
            column_count: 10,
        }),
    );
    match replies.into_iter().next() {
        Some(Body::Frame(frame)) => decode_batches(&frame.batch).unwrap().remove(0),
        other => panic!("a frame, got {other:?}"),
    }
}

#[test]
fn a_pivot_that_missed_two_keyed_reloads_shows_the_sums_of_the_last() {
    let mut table = Table::new(
        &desks([1.0, 2.0, 3.0]).schema(),
        TableOptions {
            primary_key: Some("id".into()),
            ..TableOptions::default()
        },
    )
    .unwrap();
    table.load(&[desks([1.0, 2.0, 3.0])]).unwrap();
    let shared = Arc::new(RwLock::new(TableState::new(table, 1, 1)));
    let catalog = Arc::new(MemoryCatalog::new());
    catalog.insert("desks", Arc::clone(&shared));
    let mut session = Session::new(Arc::clone(&catalog) as _);
    pivot_frame(&mut session, 1, true);
    // Row 1 goes from 1 to 10 to 100 across two loads the view misses.
    reload_with(&shared, &desks([10.0, 2.0, 3.0]), 2);
    reload_with(&shared, &desks([100.0, 2.0, 3.0]), 3);
    let caught_up = pivot_frame(&mut session, 1, false);
    let fresh = pivot_frame(&mut Session::new(catalog), 1, true);
    assert_eq!(caught_up, fresh);
}
