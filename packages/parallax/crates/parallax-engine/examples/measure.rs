//! Times a load and the views over it, and splits each into its phases: the
//! load into counting the stream's rows, decoding it a batch at a time, staging
//! each batch in the engine's columns and appending them to the table; the demo's reference pivot
//! of the positions into aggregating the rows into leaf cells, sorting the
//! leaves, building the tree, merging it upwards, and showing its first window.
//! The scale harness's figures say how long the browser takes; this says
//! where that time goes.
//!
//! Each argument is an Arrow IPC stream, such as one the scale harness writes
//! (`vp run @basis/parallax#bench -- --sizes 1000000 --modes plain`), loaded as
//! the browser's worker loads it, or a number of positions to generate here:
//!
//! ```sh
//! cargo run --release -p parallax-engine --features profile --example measure -- \
//!   tests/perf/data/trades-1000000.arrows tests/perf/data/positions-1000000.arrows
//! ```
//!
//! Without `--features profile` it prints the totals alone. It runs on one
//! thread, as the engine in WebAssembly does; `--threads N` gives it more. The
//! native build is faster than WebAssembly, so read the shares, not the
//! seconds, against the browser's. Memory is this process's resident set from
//! Linux's `/proc`: its peak, and what the table holds once the stream is
//! dropped. The stream is held whole, as the page holds it outside WebAssembly,
//! so the peak counts it once beside the table.

use std::time::Instant;

use arrow_schema::SchemaRef;
use parallax_datagen::Dataset;
use parallax_datagen::positions::{Positions, PositionsOptions};
use parallax_engine::view::{GroupOrder, GroupSort, Sort};
use parallax_engine::{Aggregate, Measure, Table, TableOptions, View, ViewConfig};

/// A stream to load: its name, for the report, and its bytes.
struct Input {
    name: String,
    bytes: Vec<u8>,
}

/// Prints each phase timed since the last call, with its share of `total`
/// seconds, and what is left over as `other`.
fn report(what: &str, total: f64) {
    println!("{what}: {total:.3} s");
    let phases = parallax_engine::profile::take();
    let timed: f64 = phases.iter().map(|(_, seconds)| seconds).sum();
    let share = |seconds: f64| 100.0 * seconds / total.max(f64::EPSILON);
    for (phase, seconds) in &phases {
        println!("  {phase:<20} {seconds:>8.3} s {:>5.1}%", share(*seconds));
    }
    if !phases.is_empty() {
        let other = (total - timed).max(0.0);
        println!("  {:<20} {other:>8.3} s {:>5.1}%", "other", share(other));
    }
}

/// Times `work`, returning its result and its seconds.
fn timed<T>(work: impl FnOnce() -> T) -> (T, f64) {
    let started = Instant::now();
    let result = work();
    (result, started.elapsed().as_secs_f64())
}

/// This process's resident memory from `/proc/self/status`, in MB: its peak
/// and now.
fn memory() -> Option<(f64, f64)> {
    let status = std::fs::read_to_string("/proc/self/status").ok()?;
    let field = |name: &str| -> Option<f64> {
        let line = status.lines().find(|line| line.starts_with(name))?;
        let kb: f64 = line[name.len()..]
            .trim()
            .trim_end_matches(" kB")
            .parse()
            .ok()?;
        Some(kb * 1024.0 / 1e6)
    };
    Some((field("VmHWM:")?, field("VmRSS:")?))
}

/// Generated positions as an Arrow IPC stream.
fn generated(rows: u64) -> Input {
    let dataset = Positions::new(PositionsOptions {
        rows,
        ..PositionsOptions::default()
    })
    .expect("positions");
    let schema = dataset.schema();
    let mut bytes = Vec::new();
    {
        let mut writer =
            arrow_ipc::writer::StreamWriter::try_new(&mut bytes, &schema).expect("a stream");
        for range in parallax_datagen::batch_ranges(rows, 65_536) {
            writer.write(&dataset.batch(range)).expect("a batch");
        }
        writer.finish().expect("the stream's end");
    }
    Input {
        name: format!("{rows} generated positions"),
        bytes,
    }
}

fn input(arg: &str) -> Input {
    match arg.parse::<u64>() {
        Ok(rows) => generated(rows),
        Err(_) => Input {
            name: arg.to_owned(),
            bytes: std::fs::read(arg).unwrap_or_else(|e| panic!("{arg}: {e}")),
        },
    }
}

/// Loads a stream as the browser's worker does: counts its rows, then decodes
/// it a message at a time, staging each batch before the next, into a table
/// keyed as the demo keys it.
fn load(input: Input) -> Table {
    let arrow_mb = input.bytes.len() as f64 / 1e6;
    let bytes = input.bytes.as_slice();
    let (table, total) = timed(|| {
        let rows = {
            let _phase = parallax_engine::profile::span("load: count");
            parallax_protocol::ipc::stream_rows(bytes).expect("a stream")
        };
        let mut batches = {
            let _phase = parallax_engine::profile::span("load: decode");
            parallax_protocol::ipc::StreamBatches::new(bytes).expect("a stream")
        };
        let mut table = keyed_table(&batches.schema());
        let mut staging = table.staging(usize::try_from(rows).expect("rows"));
        loop {
            let batch = {
                let _phase = parallax_engine::profile::span("load: decode");
                batches.next()
            };
            let Some(batch) = batch else { break };
            staging.push(&batch.expect("a batch")).expect("a batch");
        }
        table.load_staged(staging).expect("a load");
        table
    });
    report(
        &format!(
            "load {} ({arrow_mb:.0} MB of Arrow, {} rows)",
            input.name,
            table.num_rows()
        ),
        total,
    );
    drop(input);
    if let Some((peak, now)) = memory() {
        println!("  memory: peak {peak:.0} MB, holding the table {now:.0} MB");
    }
    table
}

fn keyed_table(schema: &SchemaRef) -> Table {
    let key = ["trade_id", "position_id"]
        .into_iter()
        .find(|name| schema.index_of(name).is_ok());
    Table::new(
        schema,
        TableOptions {
            primary_key: key.map(str::to_owned),
            ..TableOptions::default()
        },
    )
    .expect("a table")
}

/// Builds a view and shows its first window, reporting both.
fn view(table: &Table, what: &str, config: ViewConfig) {
    let (mut view, built) = timed(|| View::new(table, config).expect("a view"));
    report(&format!("{what}: build"), built);
    let ((rows, columns), shown) = timed(|| {
        let rows = view.num_rows(table);
        let frame = view.window(table, 0..60, 0..15);
        (rows, frame.total_columns)
    });
    report(
        &format!("{what}: first window ({rows} visible rows, {columns} columns)"),
        shown,
    );
}

fn sorted(column: &str) -> ViewConfig {
    ViewConfig {
        sort: vec![Sort {
            column: column.into(),
            descending: false,
        }],
        ..ViewConfig::default()
    }
}

/// The demo's reference pivot: fund, strategy, sector and ticker by asset
/// class, three levels open.
fn reference_pivot() -> ViewConfig {
    ViewConfig {
        group_by: ["fund", "strategy", "sector", "ticker"]
            .map(String::from)
            .to_vec(),
        split_by: vec!["asset_class".into()],
        measures: vec![
            Measure::new(Aggregate::Sum, "market_value_usd"),
            Measure::new(Aggregate::Sum, "daily_pnl_usd"),
            Measure::count_all(),
        ],
        expand_depth: 3,
        ..ViewConfig::default()
    }
}

fn measure_views(table: &Table) {
    let has = |name: &str| table.column_index(name).is_some();
    if has("market_value_usd") {
        view(table, "reference pivot", reference_pivot());
        let mut by_value = reference_pivot();
        by_value.group_sort = GroupSort {
            by: GroupOrder::Measure(0),
            descending: true,
        };
        view(table, "reference pivot, largest first", by_value);
        view(
            table,
            "flat sorted by market value",
            sorted("market_value_usd"),
        );
    }
    if has("trade_id") {
        view(table, "flat sorted by ticker", sorted("ticker"));
        view(table, "flat sorted by quantity", sorted("quantity"));
        view(table, "flat sorted by trade date", sorted("trade_date"));
    }
}

fn main() {
    let mut args: Vec<String> = std::env::args().skip(1).collect();
    let mut threads = 1;
    if let Some(at) = args.iter().position(|arg| arg == "--threads") {
        threads = args
            .get(at + 1)
            .and_then(|n| n.parse().ok())
            .expect("--threads takes a number");
        args.drain(at..at + 2);
    }
    if args.is_empty() {
        args.push("1000000".into());
    }
    rayon::ThreadPoolBuilder::new()
        .num_threads(threads)
        .build_global()
        .expect("a thread pool");
    if parallax_engine::profile::take().is_empty() && !cfg!(feature = "profile") {
        println!("Totals only: add --features profile for the phases.");
    }
    for arg in &args {
        let table = load(input(arg));
        measure_views(&table);
        println!();
    }
}
