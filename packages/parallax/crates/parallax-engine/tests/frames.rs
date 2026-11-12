//! What frames carry for display: roles, titles and text in the view's formats.

use std::collections::BTreeMap;
use std::sync::Arc;

use arrow_array::cast::AsArray;
use arrow_array::{ArrayRef, Float64Array, RecordBatch, StringArray, TimestampMicrosecondArray};
use arrow_schema::{DataType, Field, Schema, TimeUnit};
use parallax_engine::format::{Abbreviation, Format, Negative};
use parallax_engine::view::{meta, role};
use parallax_engine::{Aggregate, ConfigError, Measure, Table, TableOptions, View, ViewConfig};

fn table() -> Table {
    let schema = Schema::new(vec![
        Field::new("desk", DataType::Utf8, true),
        Field::new("level", DataType::Float64, true),
        Field::new("pnl", DataType::Float64, true),
        Field::new(
            "at",
            DataType::Timestamp(TimeUnit::Microsecond, Some("UTC".into())),
            true,
        ),
    ]);
    let columns: Vec<ArrayRef> = vec![
        Arc::new(StringArray::from(vec![
            Some("Rates"),
            Some("Rates"),
            None,
            Some("(blank)"),
        ])),
        // 1.001 and 1.004 look the same at two decimals.
        Arc::new(Float64Array::from(vec![1.001, 1.004, 1.001, 1.004])),
        Arc::new(Float64Array::from(vec![
            -1_250_000.0,
            2_000_000.0,
            10.0,
            0.0,
        ])),
        Arc::new(
            TimestampMicrosecondArray::from(vec![1_772_953_199_000_000; 4]).with_timezone("UTC"),
        ),
    ];
    let batch = RecordBatch::try_new(Arc::new(schema.clone()), columns).unwrap();
    let mut t = Table::new(&schema, TableOptions::default()).unwrap();
    t.load(&[batch]).unwrap();
    t
}

fn fields_with(batch: &RecordBatch, wanted: &str) -> Vec<usize> {
    let schema = batch.schema();
    (0..schema.fields().len())
        .filter(|&i| {
            schema
                .field(i)
                .metadata()
                .get(meta::ROLE)
                .map(String::as_str)
                == Some(wanted)
        })
        .collect()
}

fn text_of(batch: &RecordBatch, index: usize) -> Vec<String> {
    let schema = batch.schema();
    let i = fields_with(batch, role::TEXT)
        .into_iter()
        .find(|&i| schema.field(i).metadata()[meta::INDEX] == index.to_string())
        .unwrap();
    batch
        .column(i)
        .as_string::<i32>()
        .iter()
        .map(|t| t.unwrap().to_owned())
        .collect()
}

fn title_of(batch: &RecordBatch, index: usize) -> String {
    let schema = batch.schema();
    let i = fields_with(batch, role::VALUE)
        .into_iter()
        .find(|&i| schema.field(i).metadata()[meta::INDEX] == index.to_string())
        .unwrap();
    schema.field(i).metadata()[meta::TITLE].clone()
}

#[test]
fn pivot_columns_that_display_alike_stay_distinct() {
    let t = table();
    let mut view = View::new(
        &t,
        ViewConfig {
            split_by: vec!["level".into()],
            measures: vec![Measure::new(Aggregate::Sum, "pnl")],
            ..ViewConfig::default()
        },
    )
    .unwrap();
    let frame = view.window(&t, 0..10, 0..10);
    let values = fields_with(&frame.batch, role::VALUE);
    // Two pivot columns and the row total.
    assert_eq!(values.len(), 3);
    let schema = frame.batch.schema();
    let names: Vec<&str> = values
        .iter()
        .map(|&i| schema.field(i).name().as_str())
        .collect();
    assert_ne!(names[0], names[1], "names are identities and never merge");
    // Titles are display text, so these two read the same.
    assert_eq!(title_of(&frame.batch, 0), "1.00 | sum(pnl)");
    assert_eq!(title_of(&frame.batch, 1), "1.00 | sum(pnl)");
    assert_eq!(title_of(&frame.batch, 2), "Total | sum(pnl)");
    // Each pivot column carries its pivot values as exact JSON; the total has none.
    let splits: Vec<Option<String>> = values
        .iter()
        .map(|&i| schema.field(i).metadata().get(meta::SPLIT).cloned())
        .collect();
    assert_eq!(
        splits,
        [Some("[1.001]".to_owned()), Some("[1.004]".to_owned()), None]
    );
}

#[test]
fn labels_and_measures_use_the_formats() {
    let t = table();
    let mut formats = BTreeMap::new();
    formats.insert(
        "pnl".to_owned(),
        Format {
            abbreviate: Some(Abbreviation::Millions),
            negative: Negative::Parentheses,
            ..Format::default()
        },
    );
    let mut view = View::new(
        &t,
        ViewConfig {
            group_by: vec!["desk".into()],
            measures: vec![
                Measure::new(Aggregate::Sum, "pnl"),
                Measure::count_all(),
                Measure::new(Aggregate::Max, "at"),
            ],
            formats,
            ..ViewConfig::default()
        },
    )
    .unwrap();
    let frame = view.window(&t, 0..10, 0..10);
    let batch = &frame.batch;
    let labels: Vec<&str> = batch
        .column(fields_with(batch, role::LABEL)[0])
        .as_string::<i32>()
        .iter()
        .map(Option::unwrap)
        .collect();
    // A null group reads "(blank)" and sorts last; text that happens to read
    // "(blank)" is an ordinary value.
    assert_eq!(labels, ["Total", "(blank)", "Rates", "(blank)"]);
    assert_eq!(text_of(batch, 0), ["0.8M", "0.0M", "0.8M", "0.0M"]);
    assert_eq!(text_of(batch, 1), ["4", "1", "2", "1"]);
    // The instant shows in New York, and the header says so.
    assert_eq!(text_of(batch, 2)[0], "2026-03-08 01:59:59");
    assert_eq!(title_of(batch, 2), "max(at) (New York)");
    // Timestamps also carry every digit for copying.
    assert_eq!(fields_with(batch, role::COPY).len(), 1);
}

#[test]
fn negative_sums_show_in_parentheses() {
    let t = table();
    let mut formats = BTreeMap::new();
    formats.insert(
        "pnl".to_owned(),
        Format {
            negative: Negative::Parentheses,
            ..Format::default()
        },
    );
    let mut view = View::new(
        &t,
        ViewConfig {
            columns: vec!["pnl".into()],
            formats,
            ..ViewConfig::default()
        },
    )
    .unwrap();
    let frame = view.window(&t, 0..10, 0..10);
    assert_eq!(
        text_of(&frame.batch, 0),
        ["(1,250,000.00)", "2,000,000.00", "10.00", "0.00"]
    );
}

#[test]
fn bad_formats_are_configuration_errors() {
    let t = table();
    let with = |column: &str, format: Format| {
        View::new(
            &t,
            ViewConfig {
                formats: BTreeMap::from([(column.to_owned(), format)]),
                ..ViewConfig::default()
            },
        )
        .map(|_| ())
    };
    assert!(matches!(
        with("nope", Format::default()),
        Err(ConfigError::UnknownColumn(_))
    ));
    assert!(matches!(
        with(
            "at",
            Format {
                zone: Some("Not/AZone".into()),
                ..Format::default()
            }
        ),
        Err(ConfigError::Format { .. })
    ));
}

#[test]
fn flat_columns_keep_the_table_fields_properties() {
    let t = table();
    let mut view = View::new(&t, ViewConfig::default()).unwrap();
    let frame = view.window(&t, 0..1, 0..4);
    let schema = frame.batch.schema();
    for (k, i) in fields_with(&frame.batch, role::VALUE)
        .into_iter()
        .enumerate()
    {
        let field = schema.field(i);
        let source = t.schema().field(k);
        assert_eq!(field.name(), source.name());
        assert_eq!(field.data_type(), source.data_type());
        assert_eq!(field.is_nullable(), source.is_nullable());
        assert_eq!(field.metadata()[meta::INDEX], k.to_string());
    }
}

#[test]
fn reformat_applies_only_format_changes() {
    let t = table();
    let base = ViewConfig {
        group_by: vec!["desk".into()],
        measures: vec![Measure::new(Aggregate::Sum, "pnl")],
        ..ViewConfig::default()
    };
    let mut view = View::new(&t, base.clone()).unwrap();
    let mut millions = base.clone();
    millions.measures[0].format = Some(Format {
        abbreviate: Some(Abbreviation::Millions),
        ..Format::default()
    });
    assert!(view.reformat(&t, &millions).unwrap());
    assert_eq!(text_of(&view.window(&t, 0..1, 0..1).batch, 0), ["0.8M"]);
    let mut regrouped = base.clone();
    regrouped.group_by = vec!["level".into()];
    assert!(
        !view.reformat(&t, &regrouped).unwrap(),
        "a new grouping is not a format change"
    );
    assert_eq!(
        view.config(),
        &millions,
        "a refused reformat changes nothing"
    );
    let mut bad = base;
    bad.formats.insert(
        "at".into(),
        Format {
            zone: Some("Nowhere/Land".into()),
            ..Format::default()
        },
    );
    assert!(view.reformat(&t, &bad).is_err());
    assert_eq!(
        view.config(),
        &millions,
        "an invalid format changes nothing"
    );
}

#[test]
fn totals_read_as_the_pivot_grand_total_and_titles_rename_headers() {
    let t = table();
    let mut formats = BTreeMap::new();
    formats.insert(
        "pnl".to_owned(),
        Format {
            abbreviate: Some(Abbreviation::Millions),
            negative: Negative::Parentheses,
            ..Format::default()
        },
    );
    let titles = BTreeMap::from([
        ("pnl".to_owned(), "P&L".to_owned()),
        ("at".to_owned(), "Traded".to_owned()),
    ]);
    let mut flat = View::new(
        &t,
        ViewConfig {
            formats: formats.clone(),
            titles,
            totals: vec![
                Measure::new(Aggregate::Sum, "pnl"),
                Measure::new(Aggregate::Count, "desk"),
                Measure::new(Aggregate::Max, "at"),
            ],
            ..ViewConfig::default()
        },
    )
    .unwrap();
    let window = flat.window(&t, 0..10, 0..10);
    assert_eq!(title_of(&window.batch, 0), "Desk");
    assert_eq!(title_of(&window.batch, 2), "P&L");
    // A renamed instant keeps its zone in the header.
    assert_eq!(title_of(&window.batch, 3), "Traded (New York)");
    let totals = flat.totals_window(&t, 0..10).unwrap();
    assert_eq!(totals.num_rows(), 1);
    assert_eq!(title_of(&totals, 2), "P&L");
    let mut pivot = View::new(
        &t,
        ViewConfig {
            measures: vec![
                Measure::new(Aggregate::Sum, "pnl"),
                Measure::new(Aggregate::Count, "desk"),
                Measure::new(Aggregate::Max, "at"),
            ],
            formats,
            ..ViewConfig::default()
        },
    )
    .unwrap();
    let grand = pivot.window(&t, 0..1, 0..3);
    assert_eq!(text_of(&totals, 0), text_of(&grand.batch, 1));
    assert_eq!(text_of(&totals, 2), text_of(&grand.batch, 0));
    assert_eq!(text_of(&totals, 2), ["0.8M"]);
    assert_eq!(text_of(&totals, 3), text_of(&grand.batch, 2));
    // A column without a total is blank.
    assert_eq!(text_of(&totals, 1), [""]);
    // A window of columns gets the totals of those columns.
    let right = flat.totals_window(&t, 2..3).unwrap();
    assert_eq!(text_of(&right, 0), ["0.8M"]);
}

#[test]
fn column_changes_keep_the_rows_and_new_totals_count_them() {
    use parallax_engine::view::Sort;
    use parallax_engine::{Filter, FilterOp};
    let t = table();
    let config = ViewConfig {
        filters: vec![Filter::new("desk", FilterOp::IsNotNull)],
        sort: vec![Sort {
            column: "pnl".into(),
            descending: true,
        }],
        ..ViewConfig::default()
    };
    let mut view = View::new(&t, config.clone()).unwrap();
    let order = |view: &mut View| text_of(&view.window(&t, 0..10, 0..10).batch, 0);
    let before = order(&mut view);
    // Hidden and reordered columns, a title and a total: the rows stay as they were.
    let shown = ViewConfig {
        columns: vec!["pnl".into(), "desk".into()],
        titles: BTreeMap::from([("desk".to_owned(), "Desk".to_owned())]),
        totals: vec![Measure::new(Aggregate::Count, "desk")],
        ..config.clone()
    };
    assert!(view.reformat(&t, &shown).unwrap());
    let window = view.window(&t, 0..10, 0..10);
    assert_eq!(window.total_columns, 2);
    assert_eq!(title_of(&window.batch, 1), "Desk");
    assert_eq!(text_of(&window.batch, 1), before);
    assert_eq!(
        view.totals(&t),
        [parallax_engine::CellValue::Count(3)],
        "the total counts the rows that pass"
    );
    // Two totals of one column are refused, and the view stays as it was.
    let twice = ViewConfig {
        totals: vec![
            Measure::new(Aggregate::Count, "desk"),
            Measure::new(Aggregate::DistinctCount, "desk"),
        ],
        ..shown.clone()
    };
    assert!(matches!(
        view.reformat(&t, &twice),
        Err(ConfigError::Total { .. })
    ));
    assert_eq!(view.config(), &shown);
    // Another sort computes the rows again.
    let resorted = ViewConfig {
        sort: Vec::new(),
        ..shown
    };
    assert!(!view.reformat(&t, &resorted).unwrap());
}

#[test]
fn a_detail_view_lists_each_groups_rows_under_it() {
    use arrow_array::types::{Float64Type, Int32Type, Int64Type};
    use parallax_engine::Scalar;
    use parallax_engine::view::Sort;
    let t = table();
    let mut view = View::new(
        &t,
        ViewConfig {
            group_by: vec!["desk".into()],
            columns: vec!["pnl".into()],
            sort: vec![Sort {
                column: "pnl".into(),
                descending: true,
            }],
            detail: true,
            expand_depth: 1,
            ..ViewConfig::default()
        },
    )
    .unwrap();
    let frame = view.window(&t, 0..20, 0..1);
    let batch = &frame.batch;
    let strings = |name: &str| -> Vec<Option<String>> {
        batch
            .column_by_name(name)
            .unwrap()
            .as_string::<i32>()
            .iter()
            .map(|v| v.map(str::to_owned))
            .collect()
    };
    let some =
        |v: &[&str]| -> Vec<Option<String>> { v.iter().map(|s| Some((*s).to_owned())).collect() };
    // Text reading "(blank)" sorts as text; the null group comes last. No grand
    // total: it is the footer.
    assert_eq!(
        strings("__kind"),
        some(&["group", "row", "group", "row", "row", "group", "row"])
    );
    assert_eq!(
        strings("__label"),
        some(&["(blank)", "", "Rates", "", "", "(blank)", ""])
    );
    let depths: Vec<i32> = batch
        .column_by_name("__depth")
        .unwrap()
        .as_primitive::<Int32Type>()
        .values()
        .to_vec();
    assert_eq!(depths, [1, 2, 1, 2, 2, 1, 2]);
    let counts: Vec<Option<i64>> = batch
        .column_by_name("__rows")
        .unwrap()
        .as_primitive::<Int64Type>()
        .iter()
        .collect();
    assert_eq!(counts, [Some(1), None, Some(2), None, None, Some(1), None]);
    // Every row carries its group's key, and the rows of a group follow the sort.
    assert_eq!(
        strings("desk"),
        [
            Some("(blank)".into()),
            Some("(blank)".into()),
            Some("Rates".into()),
            Some("Rates".into()),
            Some("Rates".into()),
            None,
            None
        ]
    );
    let pnl: Vec<Option<f64>> = batch
        .column_by_name("pnl")
        .unwrap()
        .as_primitive::<Float64Type>()
        .iter()
        .collect();
    assert_eq!(
        pnl,
        [
            None,
            Some(0.0),
            None,
            Some(2_000_000.0),
            Some(-1_250_000.0),
            None,
            Some(10.0)
        ]
    );
    assert_eq!(
        text_of(batch, 0)[0],
        "",
        "a group row holds no value of its own"
    );
    // Collapsing a group hides its rows.
    view.set_expanded(vec![Scalar::Utf8("Rates".into())], false);
    assert_eq!(view.num_rows(&t), 5);
    // By default only the groups show.
    let mut closed = View::new(
        &t,
        ViewConfig {
            expand_depth: 0,
            ..view.config().clone()
        },
    )
    .unwrap();
    assert_eq!(closed.num_rows(&t), 3);
}

#[test]
fn a_detail_view_refuses_what_it_cannot_show() {
    use parallax_engine::view::{GroupOrder, GroupSort};
    let t = table();
    let detail = ViewConfig {
        group_by: vec!["desk".into()],
        detail: true,
        ..ViewConfig::default()
    };
    for config in [
        ViewConfig {
            group_by: Vec::new(),
            ..detail.clone()
        },
        ViewConfig {
            split_by: vec!["level".into()],
            ..detail.clone()
        },
        ViewConfig {
            measures: vec![Measure::count_all()],
            ..detail.clone()
        },
        ViewConfig {
            group_sort: GroupSort {
                by: GroupOrder::Measure(0),
                descending: true,
            },
            ..detail.clone()
        },
    ] {
        assert!(
            matches!(View::new(&t, config.clone()), Err(ConfigError::Detail(_))),
            "{config:?}"
        );
    }
    assert!(View::new(&t, detail).is_ok());
}

#[test]
fn a_detail_views_group_rows_carry_their_totals_as_a_pivot_shows_them() {
    use arrow_array::types::Int64Type;
    let t = table();
    let mut formats = BTreeMap::new();
    formats.insert(
        "pnl".to_owned(),
        Format {
            abbreviate: Some(Abbreviation::Millions),
            ..Format::default()
        },
    );
    let totals = vec![
        Measure::new(Aggregate::Sum, "pnl"),
        Measure::new(Aggregate::Count, "level"),
    ];
    let mut detail = View::new(
        &t,
        ViewConfig {
            group_by: vec!["desk".into()],
            columns: vec!["pnl".into(), "level".into(), "at".into()],
            formats: formats.clone(),
            totals: totals.clone(),
            detail: true,
            expand_depth: 1,
            ..ViewConfig::default()
        },
    )
    .unwrap();
    let frame = detail.window(&t, 0..20, 0..3);
    let batch = &frame.batch;
    let mut pivot = View::new(
        &t,
        ViewConfig {
            group_by: vec!["desk".into()],
            measures: totals,
            formats,
            ..ViewConfig::default()
        },
    )
    .unwrap();
    let grand = pivot.window(&t, 0..10, 0..2);
    // The pivot's rows are the total, then the groups; the detail view's groups
    // are rows 0, 2 and 5, between their rows.
    let pivot_pnl = text_of(&grand.batch, 0);
    let pnl = text_of(batch, 0);
    assert_eq!(
        [&pnl[0], &pnl[2], &pnl[5]],
        [&pivot_pnl[1], &pivot_pnl[2], &pivot_pnl[3]]
    );
    // A row reads its own value, in the column's format; without a sort, rows come
    // in the table's order.
    assert_eq!([&pnl[3], &pnl[4]], ["-1.3M", "2.0M"]);
    let pivot_count = text_of(&grand.batch, 1);
    let count = text_of(batch, 1);
    assert_eq!([&count[0], &count[2]], [&pivot_count[1], &pivot_count[2]]);
    // The totals travel typed, in a field of their own, null on the rows.
    let counts: Vec<Option<i64>> = batch
        .column(fields_with(batch, role::TOTAL)[1])
        .as_primitive::<Int64Type>()
        .iter()
        .collect();
    assert_eq!(counts, [Some(1), None, Some(2), None, None, Some(1), None]);
    // A column without a total has no totals field, and its group rows are blank.
    assert_eq!(fields_with(batch, role::TOTAL).len(), 2);
    assert_eq!(text_of(batch, 2)[0], "");
    // The footer is the grand total.
    let footer = detail.totals_window(&t, 0..3).unwrap();
    assert_eq!(text_of(&footer, 0), [pivot_pnl[0].clone()]);
}

#[test]
fn a_flat_view_carries_the_domains_of_the_columns_drawn_by_value() {
    use parallax_engine::{Filter, FilterOp};
    let t = table();
    let config = ViewConfig {
        domains: vec!["pnl".into()],
        ..ViewConfig::default()
    };
    let mut flat = View::new(&t, config.clone()).unwrap();
    let domains = flat.domains_window(&t, 0..4).unwrap();
    assert_eq!(domains.num_rows(), 2);
    // pnl's least and greatest; the other columns have none.
    assert_eq!(text_of(&domains, 2), ["-1,250,000.00", "2,000,000.00"]);
    assert_eq!(text_of(&domains, 1), ["", ""]);
    // Over the rows that pass the filters.
    let filtered = ViewConfig {
        filters: vec![Filter::new("desk", FilterOp::IsNull)],
        ..config
    };
    let mut only = View::new(&t, filtered).unwrap();
    assert_eq!(
        text_of(&only.domains_window(&t, 2..3).unwrap(), 0),
        ["10.00", "10.00"]
    );
    // A view that asks for none carries none.
    let mut plain = View::new(&t, ViewConfig::default()).unwrap();
    assert!(plain.domains_window(&t, 0..4).is_none());
}
