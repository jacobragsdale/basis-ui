//! An app's Arrow bytes, loaded and exported as WebAssembly, through the methods
//! the browser's worker calls.

use std::cell::RefCell;
use std::rc::Rc;
use std::sync::Arc;

use arrow_array::{Float64Array, Int64Array, RecordBatch, StringArray};
use arrow_schema::{DataType, Field, Schema};
use parallax_wasm::{CSV_CHUNK_BYTES, Worker};
use wasm_bindgen::JsCast;
use wasm_bindgen::closure::Closure;
use wasm_bindgen_test::wasm_bindgen_test;

/// An Arrow IPC stream of `rows` rows, as an app's API would send it, in the
/// page's memory.
fn stream(rows: i64) -> js_sys::Uint8Array {
    js_sys::Uint8Array::from(stream_bytes(rows).as_slice())
}

/// The bytes of [`stream`], in batches of 65,536 rows.
fn stream_bytes(rows: i64) -> Vec<u8> {
    let batches: Vec<std::ops::Range<i64>> = (0..rows)
        .step_by(65_536)
        .map(|start| start..(start + 65_536).min(rows))
        .collect();
    stream_of(&batches)
}

/// A stream with one batch for each range of ids.
fn stream_of(batches: &[std::ops::Range<i64>]) -> Vec<u8> {
    let schema = Arc::new(Schema::new(vec![
        Field::new("id", DataType::Int64, false),
        Field::new("fund", DataType::Utf8, false),
        Field::new("value", DataType::Float64, true),
    ]));
    let mut out = Vec::new();
    let mut writer = arrow_ipc::writer::StreamWriter::try_new(&mut out, &schema).unwrap();
    for range in batches {
        let ids: Vec<i64> = range.clone().collect();
        let batch = RecordBatch::try_new(
            Arc::clone(&schema),
            vec![
                Arc::new(Int64Array::from(ids.clone())),
                Arc::new(StringArray::from_iter_values(
                    ids.iter().map(|i| format!("Fund {}", i % 8)),
                )),
                Arc::new(Float64Array::from_iter_values(
                    ids.iter().map(|&i| i as f64 * 1.25),
                )),
            ],
        )
        .unwrap();
        writer.write(&batch).unwrap();
    }
    writer.finish().unwrap();
    drop(writer);
    out
}

#[wasm_bindgen_test]
fn a_load_past_the_row_limit_is_refused_and_one_at_it_loads() {
    let mut worker = Worker::new();
    assert_eq!(
        worker
            .load_table("positions", &stream(1_000), None, 1_000.0, None, 1_000)
            .unwrap(),
        1_000
    );
    let error = worker
        .load_table("big", &stream(1_001), None, 1_000.0, None, 1_000)
        .unwrap_err();
    assert_eq!(
        message(error),
        "big has 1001 rows, more than the 1000 a table in the browser holds; have its API filter or aggregate the data to fit"
    );
}

/// What an error thrown to JavaScript says.
fn message(error: wasm_bindgen::JsError) -> String {
    let value = wasm_bindgen::JsValue::from(error);
    String::from(value.dyn_into::<js_sys::Error>().unwrap().message())
}

#[wasm_bindgen_test]
fn csv_reaches_the_page_in_chunks_that_make_the_whole_file() {
    let mut worker = Worker::new();
    worker
        .load_table("positions", &stream(150_000), None, 1_000.0, None, 150_000)
        .unwrap();
    let layout = r#"{"version":1,"dataset":"positions"}"#;
    let mut whole = Vec::new();
    worker.write_csv_to(layout, None, &mut whole).unwrap();
    let chunks: Rc<RefCell<Vec<Vec<u8>>>> = Rc::default();
    let received = Rc::clone(&chunks);
    let sink = Closure::<dyn FnMut(js_sys::Uint8Array)>::new(move |chunk: js_sys::Uint8Array| {
        received.borrow_mut().push(chunk.to_vec());
    });
    let written = worker
        .export_csv(layout, None, sink.as_ref().unchecked_ref())
        .unwrap();
    let chunks = chunks.borrow();
    assert_eq!(written, whole.len() as f64);
    assert!(chunks.len() >= 3, "{} chunks", chunks.len());
    assert!(
        chunks[..chunks.len() - 1]
            .iter()
            .all(|c| c.len() >= CSV_CHUNK_BYTES)
    );
    assert_eq!(chunks.concat(), whole);
}

#[wasm_bindgen_test]
fn excel_is_written_in_memory_up_to_its_cell_cap() {
    let mut worker = Worker::new();
    worker
        .load_table("positions", &stream(999), None, 1_000.0, None, 1_000)
        .unwrap();
    let layout = r#"{"version":1,"dataset":"positions"}"#;
    // 1,000 rows with the header by 3 columns.
    let workbook = worker.export_xlsx(layout, None, 3_000).unwrap();
    assert!(workbook.starts_with(b"PK"), "an xlsx is a zip");
    let refused = message(worker.export_xlsx(layout, None, 2_999).unwrap_err());
    assert!(refused.ends_with("export it as CSV instead"), "{refused}");
    let pivot = r#"{"version":1,"dataset":"positions","group_by":["fund"],"measures":[{"column":"value","aggregate":"sum"}]}"#;
    assert!(
        worker
            .export_xlsx(pivot, None, 3_000)
            .unwrap()
            .starts_with(b"PK")
    );
}

#[wasm_bindgen_test]
fn a_stream_the_page_holds_loads_as_the_same_bytes_do_in_webassembly() {
    let layout = r#"{"version":1,"dataset":"positions"}"#;
    let csv = |worker: &Worker| {
        let mut out = Vec::new();
        worker.write_csv_to(layout, None, &mut out).unwrap();
        out
    };
    let mut from_page = Worker::new();
    from_page
        .load_table(
            "positions",
            &stream(70_000),
            Some("id".into()),
            1_000.0,
            None,
            70_000,
        )
        .unwrap();
    let mut from_memory = Worker::new();
    from_memory
        .load(
            "positions",
            stream_bytes(70_000),
            &parallax_wasm::Load {
                primary_key: Some("id".into()),
                now_micros: 1_000,
                source_as_of_micros: None,
                max_rows: 70_000,
            },
        )
        .unwrap();
    assert_eq!(csv(&from_page), csv(&from_memory));
    // A reload whose second batch repeats a key of its first is refused whole,
    // and the table keeps its first load.
    let repeated = stream_of(&[0..65_536, 65_535..65_600]);
    let refused = from_page
        .load_table(
            "positions",
            &js_sys::Uint8Array::from(repeated.as_slice()),
            None,
            2_000.0,
            None,
            70_000,
        )
        .unwrap_err();
    assert_eq!(
        message(refused),
        r#"positions: column id has 1 duplicate primary keys, for example ["Int64(65535)"]"#
    );
    assert_eq!(csv(&from_page), csv(&from_memory));
}

#[wasm_bindgen_test]
fn a_weighted_average_of_a_long_period_is_right_where_usize_has_32_bits() {
    // Weights 1 to 70,000 sum to 2,450,035,000, past a 32-bit word.
    let period = 70_000;
    let averages = parallax_engine::indicator::wma(&vec![2.5; period + 10], period);
    assert_eq!(averages[period - 1], 2.5);
    assert_eq!(averages[period + 9], 2.5);
}

#[wasm_bindgen_test]
fn a_stream_the_page_posts_in_pieces_loads_through_the_calls_its_worker_makes() {
    let bytes = stream_bytes(150_000);
    let mut worker = Worker::new();
    worker
        .begin_load(
            "positions",
            Some("id".into()),
            1_000.0,
            None,
            200_000,
            Some(bytes.len() as f64),
        )
        .unwrap();
    let mut shown = false;
    for piece in bytes.chunks(100_000) {
        worker
            .add_load_bytes("positions", &js_sys::Uint8Array::from(piece))
            .unwrap();
        loop {
            let progress = worker.step_load("positions").unwrap();
            let field = |name: &str| js_sys::Reflect::get(&progress, &name.into()).unwrap();
            shown |= field("shown").as_bool().unwrap();
            if field("waiting").as_bool().unwrap() || field("ended").as_bool().unwrap() {
                break;
            }
        }
    }
    assert!(shown, "a first load shows as it arrives");
    worker.end_load_bytes("positions").unwrap();
    while !js_sys::Reflect::get(&worker.step_load("positions").unwrap(), &"ended".into())
        .unwrap()
        .as_bool()
        .unwrap()
    {}
    assert_eq!(worker.finish_load("positions").unwrap(), 150_000);
    // Bytes after the end, and a step of no load, are errors the page reads.
    assert!(worker.add_load_bytes("positions", &stream(1)).is_err());
    assert_eq!(
        message(worker.step_load("positions").unwrap_err()),
        "positions has no load under way"
    );
    // The table it built exports as the one a whole load builds.
    let mut whole = Worker::new();
    whole
        .load_table(
            "positions",
            &stream(150_000),
            Some("id".into()),
            1_000.0,
            None,
            200_000,
        )
        .unwrap();
    let layout = r#"{"version":1,"dataset":"positions"}"#;
    let csv = |worker: &Worker| {
        let mut out = Vec::new();
        worker.write_csv_to(layout, None, &mut out).unwrap();
        out
    };
    assert_eq!(csv(&worker), csv(&whole));
}
