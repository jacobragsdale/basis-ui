//! Memory that would grow without bound: each is bounded, or refused with a
//! message that names the limit and what to change.

use std::sync::Arc;

use arrow_array::{ArrayRef, Float64Array, Int64Array, RecordBatch, StringArray};
use arrow_schema::{DataType, Field, Schema};
use parallax_engine::{Aggregate, ConfigError, Measure, Table, TableOptions, View, ViewConfig};

/// `rows` rows of ids, a quote id as text that differs on every load, a desk,
/// and a price.
fn quotes(load: usize, rows: usize) -> RecordBatch {
    let schema = Arc::new(Schema::new(vec![
        Field::new("id", DataType::Int64, false),
        Field::new("quote", DataType::Utf8, false),
        Field::new("desk", DataType::Utf8, false),
        Field::new("price", DataType::Float64, true),
    ]));
    RecordBatch::try_new(
        schema,
        vec![
            Arc::new(Int64Array::from_iter_values(0..rows as i64)) as ArrayRef,
            Arc::new(StringArray::from_iter_values(
                (0..rows).map(|i| format!("Q-{load}-{i}")),
            )),
            Arc::new(StringArray::from_iter_values(
                (0..rows).map(|i| format!("Desk {}", i % 7)),
            )),
            Arc::new(Float64Array::from_iter_values(
                (0..rows).map(|i| (load * rows + i) as f64),
            )),
        ],
    )
    .unwrap()
}

fn pivot(table: &Table) -> View {
    View::new(
        table,
        ViewConfig {
            group_by: vec!["desk".into(), "quote".into()],
            measures: vec![Measure::new(Aggregate::Sum, "price")],
            ..ViewConfig::default()
        },
    )
    .unwrap()
}

/// Each cell of a view, as text, in order.
fn cells(view: &mut View, table: &Table) -> Vec<String> {
    let mut cells: Vec<String> = view
        .cells(table)
        .iter()
        .map(|c| format!("{:?} {:?} {}", c.path, c.values, c.rows))
        .collect();
    cells.sort();
    cells
}

#[test]
fn reloads_whose_text_changes_keep_only_the_strings_rows_use() {
    for key in [None, Some("id"), Some("quote")] {
        let rows = 5_000;
        let mut table = Table::new(
            &quotes(0, rows).schema(),
            TableOptions {
                primary_key: key.map(str::to_owned),
                ..TableOptions::default()
            },
        )
        .unwrap();
        table.load(&[quotes(0, rows)]).unwrap();
        let mut view = pivot(&table);
        let first = table.heap_bytes();
        for load in 1..12 {
            let (_, change) = table.load(&[quotes(load, rows)]).unwrap();
            view.apply(&table, &change);
            // A view that applies each load as it comes equals one built fresh.
            assert!(
                cells(&mut view, &table) == cells(&mut pivot(&table), &table),
                "{key:?}, load {load}"
            );
        }
        // Twelve loads of 5,000 new quote ids each would hold 60,000 strings.
        let last = table.heap_bytes();
        assert!(last < first * 3, "{key:?}: {first} bytes, then {last}");
        // A keyed table still finds its rows by key after its text is recoded.
        let (report, _) = table.load(&[quotes(11, rows)]).unwrap();
        let unchanged = if key.is_some() { rows } else { 0 };
        assert_eq!(report.unchanged, unchanged, "{key:?}");
    }
}

#[test]
fn a_pivot_of_more_groups_than_memory_allows_is_refused_naming_the_limit() {
    // 300,000 trades grouped by their own id, with three float sums each: some
    // 300,000 leaves of three exact accumulators.
    let rows = 300_000;
    let schema = Arc::new(Schema::new(vec![
        Field::new("trade", DataType::Int64, false),
        Field::new("price", DataType::Float64, false),
    ]));
    let batch = RecordBatch::try_new(
        schema,
        vec![
            Arc::new(Int64Array::from_iter_values(0..rows)) as ArrayRef,
            Arc::new(Float64Array::from_iter_values((0..rows).map(|i| i as f64))),
        ],
    )
    .unwrap();
    let mut table = Table::new(&batch.schema(), TableOptions::default()).unwrap();
    table.load(&[batch]).unwrap();
    let config = |measures: usize| ViewConfig {
        group_by: vec!["trade".into()],
        measures: (0..measures)
            .map(|_| Measure::new(Aggregate::Sum, "price"))
            .collect(),
        ..ViewConfig::default()
    };
    let error = View::new(&table, config(3)).expect_err("refused");
    assert!(
        matches!(error, ConfigError::TooManyGroups { .. }),
        "{error}"
    );
    let message = error.to_string();
    assert!(message.contains("MB"), "{message}");
    assert!(
        message.ends_with("group by fewer or coarser columns, or filter the rows first"),
        "{message}"
    );
    // A count costs a word a group, and fits.
    let counts = ViewConfig {
        measures: vec![Measure::new(Aggregate::Count, "price")],
        ..config(0)
    };
    assert!(View::new(&table, counts).is_ok());
}
