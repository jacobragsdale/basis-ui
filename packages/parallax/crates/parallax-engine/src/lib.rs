//! The parallax engine: tables, views, pivots and exact aggregates.
//!
//! A [`Table`](table::Table) stores typed columns addressed by stable slots and loads
//! data as diffs. A [`View`](view::View) filters, groups, pivots, aggregates and sorts
//! a table, and returns any window of its result as Arrow. Views apply a table's
//! [`ChangeSet`](table::ChangeSet) to stay current, and the result equals a view
//! built from scratch on the new table.
//!
//! The same code compiles to WebAssembly for the browser and natively for the
//! tests, which compare it with DuckDB.

pub mod aggregate;
mod bignum;
pub mod bitmap;
pub mod calendar;
pub mod chart;
pub mod column;
pub mod dictionary;
pub mod error;
pub mod exact;
pub mod filter;
pub mod format;
pub mod indicator;
mod leaf_key;
pub mod order;
pub mod profile;
pub mod sifma;
mod sort;
pub mod table;
pub mod titles;
pub mod types;
pub mod view;

pub use aggregate::{Aggregate, Measure, ShowAs};
pub use error::{ConfigError, LoadError};
pub use filter::{Filter, FilterOp};
pub use format::{Format, Formatter};
pub use order::Order;
pub use table::{ChangeSet, DuplicatePolicy, LoadReport, Staging, Table, TableOptions};
pub use types::{ColumnType, Scalar};
pub use view::{CellValue, Frame, GroupCell, View, ViewConfig};
