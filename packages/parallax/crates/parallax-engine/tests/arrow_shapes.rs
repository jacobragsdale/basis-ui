//! Arrow that is valid but unusual: each loads as the data means, or is refused
//! with a reason that names the column, and none traps the engine.

use std::sync::Arc;

use arrow_array::types::Int32Type;
use arrow_array::{
    ArrayRef, DictionaryArray, Int32Array, Int64Array, NullArray, RecordBatch, StringArray,
};
use arrow_schema::{DataType, Field, Schema};
use parallax_engine::{ColumnType, LoadError, Scalar, Table, TableOptions};

fn batch(columns: Vec<(&str, ArrayRef)>) -> RecordBatch {
    let schema = Schema::new(
        columns
            .iter()
            .map(|(name, a)| Field::new(*name, a.data_type().clone(), true))
            .collect::<Vec<_>>(),
    );
    RecordBatch::try_new(
        Arc::new(schema),
        columns.into_iter().map(|(_, a)| a).collect(),
    )
    .unwrap()
}

fn ids(n: i64) -> ArrayRef {
    Arc::new(Int64Array::from_iter_values(0..n))
}

/// A dictionary-encoded text column with no values, all of its keys null: what
/// `dictionary_encode()` gives for a column of nulls, and what arrow's IPC reader
/// makes of a dictionary a stream never sent.
fn empty_dictionary(rows: usize) -> ArrayRef {
    let keys = Int32Array::from(vec![None; rows]);
    let values = Arc::new(StringArray::from(Vec::<&str>::new()));
    Arc::new(DictionaryArray::<Int32Type>::try_new(keys, values).unwrap())
}

fn texts(table: &Table, column: &str) -> Vec<Scalar> {
    let c = table.column(table.column_index(column).unwrap());
    table.live_slots().map(|slot| c.scalar(slot)).collect()
}

#[test]
fn an_empty_dictionary_loads_as_nulls() {
    let b = batch(vec![("id", ids(3)), ("comment", empty_dictionary(3))]);
    let mut table = Table::new(&b.schema(), TableOptions::default()).unwrap();
    table.load(std::slice::from_ref(&b)).unwrap();
    assert_eq!(texts(&table, "comment"), vec![Scalar::Null; 3]);
    // A first load that grows the table a batch at a time reads it the same way,
    // and a batch of no rows too.
    let none = batch(vec![("id", ids(0)), ("comment", empty_dictionary(0))]);
    let mut grown = Table::new(&b.schema(), TableOptions::default()).unwrap();
    grown.extend(&none).unwrap();
    grown.extend(&b).unwrap();
    grown.publish();
    grown.finish_growth();
    assert_eq!(texts(&grown, "comment"), vec![Scalar::Null; 3]);
}

#[test]
fn a_dictionary_of_dictionaries_is_refused_as_unsupported() {
    let inner = DataType::Dictionary(Box::new(DataType::Int32), Box::new(DataType::Utf8));
    let outer = DataType::Dictionary(Box::new(DataType::Int32), Box::new(inner));
    assert_eq!(ColumnType::from_arrow(&outer), None);
    let schema = Schema::new(vec![Field::new("nested", outer.clone(), true)]);
    assert_eq!(
        Table::new(&schema, TableOptions::default()).unwrap_err(),
        LoadError::UnsupportedType {
            column: "nested".into(),
            data_type: outer,
        }
    );
}

#[test]
fn a_column_of_arrow_nulls_loads_as_blank_text() {
    let b = batch(vec![("id", ids(2)), ("note", Arc::new(NullArray::new(2)))]);
    let mut table = Table::new(&b.schema(), TableOptions::default()).unwrap();
    let note = table.column_index("note").unwrap();
    assert_eq!(table.column(note).column_type(), &ColumnType::Utf8);
    assert_eq!(table.schema().field(note).data_type(), &DataType::Utf8);
    table.load(&[b]).unwrap();
    assert_eq!(texts(&table, "note"), vec![Scalar::Null; 2]);
    // The column fills in on a later load, and empties again on the next.
    let filled = batch(vec![
        ("id", ids(2)),
        (
            "note",
            Arc::new(StringArray::from(vec![Some("late"), None])),
        ),
    ]);
    table.load(&[filled]).unwrap();
    // A table without a key reuses its slots in any order.
    let mut filled = texts(&table, "note");
    filled.sort_by_key(|s| *s == Scalar::Null);
    assert_eq!(filled, vec![Scalar::Utf8("late".into()), Scalar::Null]);
    let emptied = batch(vec![("id", ids(1)), ("note", Arc::new(NullArray::new(1)))]);
    table.load(&[emptied]).unwrap();
    assert_eq!(texts(&table, "note"), vec![Scalar::Null]);
}

#[test]
fn a_repeated_column_name_is_refused_naming_it() {
    let schema = Schema::new(vec![
        Field::new("id", DataType::Int64, false),
        Field::new("price", DataType::Int64, true),
        Field::new("price", DataType::Int64, true),
    ]);
    assert_eq!(
        Table::new(&schema, TableOptions::default()).unwrap_err(),
        LoadError::DuplicateColumn {
            column: "price".into()
        }
    );
    // A load of a table whose own columns are distinct is refused the same way.
    let single = batch(vec![("id", ids(1)), ("price", ids(1))]);
    let mut table = Table::new(&single.schema(), TableOptions::default()).unwrap();
    let doubled = batch(vec![("id", ids(1)), ("price", ids(1)), ("price", ids(1))]);
    assert_eq!(
        table.load(std::slice::from_ref(&doubled)).unwrap_err(),
        LoadError::DuplicateColumn {
            column: "price".into()
        }
    );
    assert_eq!(
        table.extend(&doubled).unwrap_err().to_string(),
        "column price appears more than once; give each column its own name"
    );
}
