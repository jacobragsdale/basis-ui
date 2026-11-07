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

/// An Arrow IPC stream of `rows` rows, as an app's API would send it.
fn stream(rows: i64) -> Vec<u8> {
    let schema = Arc::new(Schema::new(vec![
        Field::new("id", DataType::Int64, false),
        Field::new("fund", DataType::Utf8, false),
        Field::new("value", DataType::Float64, true),
    ]));
    let mut out = Vec::new();
    let mut writer = arrow_ipc::writer::StreamWriter::try_new(&mut out, &schema).unwrap();
    for start in (0..rows).step_by(65_536) {
        let ids: Vec<i64> = (start..(start + 65_536).min(rows)).collect();
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
            .load_table("positions", stream(1_000), None, 1_000.0, None, 1_000)
            .unwrap(),
        1_000
    );
    let error = worker
        .load_table("big", stream(1_001), None, 1_000.0, None, 1_000)
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
        .load_table("positions", stream(150_000), None, 1_000.0, None, 150_000)
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
        .export_csv(layout, Some(1.0), sink.as_ref().unchecked_ref())
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
        .load_table("positions", stream(999), None, 1_000.0, None, 1_000)
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
