//! A grouped view whose groups change only in order, filtering, ranking or how
//! deep they open keeps its tree: `reformat` takes the change, and the view then
//! shows what one built from scratch would. Expanding and collapsing groups the
//! same.

mod common;

use common::{engine_table, positions};
use parallax_engine::view::{Comparison, GroupOrder, GroupSort, Having, TopN};
use parallax_engine::{Aggregate, Measure, Scalar, ShowAs, Table, View, ViewConfig};

fn base() -> ViewConfig {
    ViewConfig {
        group_by: vec!["fund".into(), "sector".into(), "ticker".into()],
        split_by: vec!["long_short".into()],
        measures: vec![
            Measure::new(Aggregate::Sum, "market_value_usd"),
            Measure::new(Aggregate::Sum, "market_value_usd").show_as(ShowAs::RunningTotal),
            Measure::count_all(),
            Measure::new(Aggregate::Mean, "beta"),
        ],
        expand_depth: 1,
        ..ViewConfig::default()
    }
}

/// Every change of order, filtering, ranking and depth, one after another.
fn variants() -> Vec<ViewConfig> {
    let by = |by: GroupOrder, descending: bool| GroupSort { by, descending };
    let mut out = Vec::new();
    for sort in [
        by(GroupOrder::Key, true),
        by(GroupOrder::Measure(0), true),
        by(GroupOrder::Measure(3), false),
        by(GroupOrder::Key, false),
    ] {
        out.push(ViewConfig {
            group_sort: sort,
            ..base()
        });
    }
    out.push(ViewConfig {
        having: vec![Having {
            measure: 2,
            op: Comparison::Gt,
            value: 3.0,
        }],
        ..base()
    });
    for (n, other) in [(3, true), (2, false)] {
        out.push(ViewConfig {
            group_sort: by(GroupOrder::Measure(0), true),
            top_n: Some(TopN {
                n,
                measure: 0,
                largest: true,
                other,
            }),
            ..base()
        });
    }
    for depth in [0, 3, 2] {
        out.push(ViewConfig {
            expand_depth: depth,
            ..base()
        });
    }
    out
}

/// What a screen would show, every row and column of it.
fn shown(view: &mut View, table: &Table) -> arrow_array::RecordBatch {
    let rows = view.num_rows(table);
    let columns = view.num_columns(table);
    view.window(table, 0..rows, 0..columns).batch
}

#[test]
fn reordered_groups_keep_the_tree_and_equal_a_rebuild() {
    let batch = positions(4_000, 300, false, 21);
    let table = engine_table(&batch);
    let mut view = View::new(&table, base()).unwrap();
    for (i, config) in variants().into_iter().enumerate() {
        assert!(
            view.reformat(&table, &config).unwrap(),
            "variant {i} reorders the same groups"
        );
        assert_eq!(view.config(), &config, "variant {i}: the new configuration");
        let mut fresh = View::new(&table, config).unwrap();
        assert_eq!(
            shown(&mut view, &table),
            shown(&mut fresh, &table),
            "variant {i}: what shows"
        );
    }
}

#[test]
fn a_reorder_that_names_no_measure_is_refused_and_changes_nothing() {
    let table = engine_table(&positions(500, 50, false, 3));
    let mut view = View::new(&table, base()).unwrap();
    let bad = ViewConfig {
        group_sort: GroupSort {
            by: GroupOrder::Measure(9),
            descending: false,
        },
        ..base()
    };
    assert!(view.reformat(&table, &bad).is_err());
    assert_eq!(view.config(), &base());
}

#[test]
fn expanded_groups_show_as_a_rebuild_does() {
    let batch = positions(4_000, 300, true, 22);
    let table = engine_table(&batch);
    let mut view = View::new(&table, base()).unwrap();
    // The first rows' paths, opened and closed in turn, some twice.
    let mut fresh = View::new(&table, base()).unwrap();
    let paths: Vec<Vec<Scalar>> = (1..12)
        .filter_map(|row| fresh.row_path(&table, row))
        .collect();
    assert!(paths.len() > 4, "the view shows groups to open");
    let mut toggles: Vec<(Vec<Scalar>, bool)> = Vec::new();
    for (i, path) in paths.iter().enumerate() {
        toggles.push((path.clone(), i % 3 != 2));
    }
    toggles.push((paths[0].clone(), false));
    toggles.push((vec![Scalar::Utf8("No such fund".into())], true));
    for (i, (path, expanded)) in toggles.iter().enumerate() {
        view.set_expanded(path.clone(), *expanded);
        let mut rebuilt = View::new(&table, base()).unwrap();
        for (path, expanded) in &toggles[..=i] {
            rebuilt.set_expanded(path.clone(), *expanded);
        }
        assert_eq!(
            shown(&mut view, &table),
            shown(&mut rebuilt, &table),
            "after toggle {i}"
        );
        // A reorder keeps the groups the user opened.
        let resorted = ViewConfig {
            group_sort: GroupSort {
                by: GroupOrder::Measure(2),
                descending: i % 2 == 0,
            },
            ..base()
        };
        let mut reordered = view.clone();
        assert!(reordered.reformat(&table, &resorted).unwrap());
        let mut rebuilt = View::new(&table, resorted).unwrap();
        for (path, expanded) in &toggles[..=i] {
            rebuilt.set_expanded(path.clone(), *expanded);
        }
        assert_eq!(
            shown(&mut reordered, &table),
            shown(&mut rebuilt, &table),
            "reordered after toggle {i}"
        );
    }
}
