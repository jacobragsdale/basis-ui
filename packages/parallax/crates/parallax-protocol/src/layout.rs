//! Layout documents: the JSON description of a view.
//!
//! A layout is the contract between the UI, saved views, shared URLs, exports and
//! tests. It is versioned: [`Layout::from_json`] migrates older versions forward,
//! and [`schema`] returns the JSON Schema generated from these types.
//!
//! Values in filters and paths are plain JSON. They are interpreted against the
//! table's column types when the view opens, and never rounded: a decimal filter
//! value with more digits than the column's scale is an error.

use std::collections::BTreeMap;

use parallax_engine::aggregate::{Aggregate, Measure, ShowAs};
use parallax_engine::calendar::{Market, Session};
use parallax_engine::chart::{
    ChartConfig, ChartKind, OhlcColumns, PointColumns, TenorSpacing, XAxis,
};
use parallax_engine::filter::{Filter, FilterOp};
use parallax_engine::format::{
    Abbreviation, Format, Negative, Suffixes, ThirtySeconds, TimePrecision, exact_decimal,
};
use parallax_engine::indicator::Indicator;
use parallax_engine::order::Order;
use parallax_engine::view::{Comparison, GroupOrder, GroupSort, Having, Sort, TopN, ViewConfig};
use parallax_engine::{ColumnType, Scalar, Table};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// The current layout version. Version 2 added `search`, filters across several
/// columns, two text conditions, `pinned`, `titles`, `totals`, `detail` and pie
/// charts; a version 1 document reads unchanged.
pub const LAYOUT_VERSION: u32 = 2;

/// A view, as saved and sent.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(default, deny_unknown_fields)]
pub struct Layout {
    /// The layout version; [`LAYOUT_VERSION`] for documents this crate writes.
    pub version: u32,
    /// The dataset the view reads. Empty in layouts sent with an open-view
    /// request, which names the dataset itself; when both are given they must
    /// agree.
    pub dataset: String,
    /// The dataset's parameters, such as an as-of date.
    pub parameters: BTreeMap<String, String>,
    /// Columns of a flat view, in order. Empty means every column.
    pub columns: Vec<String>,
    /// Row pivots, outermost first.
    pub group_by: Vec<String>,
    /// Column pivots.
    pub split_by: Vec<String>,
    /// Measures of a grouped view.
    pub measures: Vec<LayoutMeasure>,
    /// Row filters.
    pub filters: Vec<LayoutFilter>,
    /// Sorts of a flat view.
    pub sort: Vec<LayoutSort>,
    /// Ordering of groups among their siblings.
    pub group_sort: LayoutGroupSort,
    /// Aggregate filters.
    pub having: Vec<LayoutHaving>,
    /// Top-N per set of siblings.
    pub top_n: Option<LayoutTopN>,
    /// Levels expanded by default.
    pub expand_depth: usize,
    /// Groups expanded or collapsed by the user, by value.
    pub expanded: Vec<LayoutExpanded>,
    /// Display formats by source column. Measures take their column's format
    /// unless they set their own.
    pub formats: BTreeMap<String, LayoutFormat>,
    /// Column widths in CSS pixels, chosen by the user. Keys are source column
    /// names for flat views, `"__measure:0"`, `"__measure:1"` and so on for the
    /// data columns of grouped views, and `"__tree"` for the group column. The
    /// engine ignores them.
    pub column_widths: BTreeMap<String, u32>,
    /// Draws the view as a chart instead of a grid.
    pub chart: Option<LayoutChart>,
    /// Text to search for, ignoring case, in every searched column: the text
    /// columns a flat view shows, those and the group columns of a detail view,
    /// or the group and column-pivot columns of a pivot. Rows must match it as
    /// well as the filters. Empty searches nothing.
    pub search: String,
    /// Columns of a flat or detail view kept at the left while the rest scroll,
    /// in order. They come first, whatever `columns` says.
    pub pinned: Vec<String>,
    /// Header text by source column, or by a measure's header, such as
    /// `sum(par)` or `wmean(ytm by market_value)`; a column or measure without
    /// one shows its name. The export's headers and a chart's legend are the
    /// same.
    pub titles: BTreeMap<String, String>,
    /// The totals row of a flat or detail view: at most one total per column,
    /// each a measure of its column. A detail view's group rows show them too.
    pub totals: Vec<LayoutMeasure>,
    /// Groups `group_by` with the rows under them, in `sort` order and with the
    /// `columns`, as a grid does, rather than as a pivot of measures.
    pub detail: bool,
    /// Orders of text columns other than alphabetical, by column: tenors by
    /// length, ratings best first, a listed order, or another column's values.
    /// Groups at every level, column pivots, sorts, a chart's series and the
    /// categories of bars, heatmaps and pies follow them; filters still compare
    /// text.
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub orders: BTreeMap<String, LayoutOrder>,
}

/// How a text column's values are ordered, in a layout.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub enum LayoutOrder {
    /// Alphabetically, ignoring case, as text sorts without an order.
    Text,
    /// Tenors by length, `3M` before `1Y` and `10Y`: a whole number from 1 to
    /// 9999 and `D`, `W`, `M` or `Y`. Text that is not a tenor comes after.
    Tenor,
    /// Credit ratings, best first, on S&P's and Fitch's scale and Moody's, a
    /// notch of one equal to the same notch of the other. Text that is not a
    /// rating, such as `NR`, comes after.
    Rating,
    /// As listed; values not listed come after.
    Values(Vec<String>),
    /// By another column's smallest value among the rows with each value, such
    /// as a tenor bucket by its rows' shortest maturity.
    By(String),
}

impl LayoutOrder {
    /// The engine's order.
    #[must_use]
    pub fn to_engine(&self) -> Order {
        match self {
            Self::Text => Order::Text,
            Self::Tenor => Order::Tenor,
            Self::Rating => Order::Rating,
            Self::Values(values) => Order::Values(values.clone()),
            Self::By(column) => Order::By(column.clone()),
        }
    }
}

impl Default for Layout {
    /// An empty layout at the current version: a flat view of every column.
    fn default() -> Self {
        Self {
            version: LAYOUT_VERSION,
            dataset: String::new(),
            parameters: BTreeMap::new(),
            columns: Vec::new(),
            group_by: Vec::new(),
            split_by: Vec::new(),
            measures: Vec::new(),
            filters: Vec::new(),
            sort: Vec::new(),
            group_sort: LayoutGroupSort::default(),
            having: Vec::new(),
            top_n: None,
            expand_depth: 0,
            expanded: Vec::new(),
            formats: BTreeMap::new(),
            column_widths: BTreeMap::new(),
            chart: None,
            search: String::new(),
            pinned: Vec::new(),
            titles: BTreeMap::new(),
            totals: Vec::new(),
            detail: false,
            orders: BTreeMap::new(),
        }
    }
}

/// What a chart draws, in a layout.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ChartKindName {
    /// Lines through each series.
    Line,
    /// Lines filled down to zero.
    Area,
    /// Bars of the layout's grouped view: one per group, one per measure or
    /// column pivot within it.
    Bar,
    /// Points: each row as a dot while the range shown holds at most 5,000,
    /// and a density past that.
    Scatter,
    /// Cells of the layout's grouped view, coloured by its first measure: groups
    /// across, column pivots up.
    Heatmap,
    /// Counts of the x values in bins.
    Histogram,
    /// Candles of each bucket's open, high, low and close.
    Candlestick,
    /// Bars of each bucket's open, high, low and close.
    Ohlc,
    /// Slices of the layout's grouped view, one per group, sized by its first
    /// measure, as a ring when `donut` is set.
    Pie,
    /// Steps of the layout's grouped view, one per group: each floats from the
    /// running total of its first measure before it to the one after, and a
    /// total bar ends them, as attribution and P&L explain are drawn.
    Waterfall,
}

impl ChartKindName {
    /// Whether this kind takes drawings: kinds drawn along an x axis over a price.
    #[must_use]
    pub fn takes_drawings(self) -> bool {
        matches!(
            self,
            Self::Line | Self::Area | Self::Candlestick | Self::Ohlc
        )
    }

    /// The engine's reduction for this kind, or `None` for kinds drawn from the
    /// layout's grouped view.
    #[must_use]
    pub fn reduced(self) -> Option<ChartKind> {
        Some(match self {
            Self::Line => ChartKind::Line,
            Self::Area => ChartKind::Area,
            Self::Scatter => ChartKind::Scatter,
            Self::Histogram => ChartKind::Histogram,
            Self::Candlestick => ChartKind::Candlestick,
            Self::Ohlc => ChartKind::Ohlc,
            Self::Bar | Self::Heatmap | Self::Pie | Self::Waterfall => return None,
        })
    }
}

/// How a chart places x values, in a layout.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum XAxisName {
    /// By value.
    #[default]
    Value,
    /// By trading time on the chart's `calendar`, NYSE's unless it says
    /// otherwise, in its `session`.
    Trading,
    /// By tenor, labelled `3M` to `30Y`: the x column holds tenors as text,
    /// such as `3M` and `10Y`, or as years.
    Tenor,
}

/// How a tenor axis spaces tenors, in a layout.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum TenorSpacingName {
    /// The standard tenors 1M, 3M, 6M, 1Y, 2Y, 3Y, 5Y, 7Y, 10Y, 20Y, 30Y, 50Y
    /// and 100Y one step apart, and a tenor between two placed between them by
    /// length, as desks' curve screens space them.
    #[default]
    Even,
    /// By length in years.
    Length,
}

impl TenorSpacingName {
    fn is_even(&self) -> bool {
        *self == Self::Even
    }
}

/// The market calendar a trading-time axis follows, in a layout.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum CalendarName {
    /// The New York Stock Exchange's, 09:30 to 16:00 by default.
    Nyse,
    /// SIFMA's recommendations for the US bond market, which close on Columbus
    /// Day and Veterans Day as well and close early at 2 p.m. before some
    /// holidays, 08:00 to 17:00 by default.
    Sifma,
}

/// A trading day's session in New York time, in a layout: `HH:MM` times. A
/// session that opens later in the day than it closes opens the evening before
/// its trading day.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LayoutSession {
    /// When it opens, such as `08:00`, or `18:00` the evening before.
    pub opens: String,
    /// When it closes, such as `17:00`.
    pub closes: String,
}

/// Which colour a rise takes on a chart, in a layout.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum RisingName {
    /// The gain colour, as a rising price is a gain to a long position.
    #[default]
    Gain,
    /// The loss colour, as a rising yield is a loss to a long position.
    Loss,
}

impl RisingName {
    fn is_gain(&self) -> bool {
        *self == Self::Gain
    }
}

/// How a pane under a chart draws its columns, in a layout.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum PaneKindName {
    /// A line through each series.
    #[default]
    Line,
    /// A bar from zero at each point: in the up and down colours for one
    /// series, side by side in the series' colours for several.
    Bar,
}

impl PaneKindName {
    fn is_line(&self) -> bool {
        *self == Self::Line
    }
}

/// A pane under a line or area chart's plot, in a layout: columns of its own on
/// a value axis of its own, on the chart's x axis, sharing its crosshair and
/// zoom, as an indicator's pane does, such as the change in basis points under
/// curves.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LayoutPane {
    /// The numeric columns it draws, split into series as the plot's are; a
    /// series with no values in the range shown is left out.
    pub columns: Vec<String>,
    /// Lines or bars.
    #[serde(default, skip_serializing_if = "PaneKindName::is_line")]
    pub kind: PaneKindName,
    /// Its title; its columns' names if empty.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub title: String,
    /// Turns its value axis upside down.
    #[serde(default, skip_serializing_if = "is_false")]
    pub reverse: bool,
}

/// The price columns of a candlestick or OHLC chart, in a layout.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LayoutOhlc {
    /// The opening price.
    pub open: String,
    /// The highest price.
    pub high: String,
    /// The lowest price.
    pub low: String,
    /// The closing price.
    pub close: String,
}

/// An x range a chart was zoomed to, in axis positions.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LayoutRange {
    /// The left edge.
    pub from: f64,
    /// The right edge.
    pub to: f64,
}

const fn period_20() -> u32 {
    20
}
const fn period_14() -> u32 {
    14
}
const fn deviations_2() -> f64 {
    2.0
}
const fn fast_12() -> u32 {
    12
}
const fn slow_26() -> u32 {
    26
}
const fn signal_9() -> u32 {
    9
}
const fn smooth_3() -> u32 {
    3
}

/// A technical-analysis indicator, in a layout, with TA-Lib's usual defaults.
/// Averages, bands and VWAP are drawn over the price; the others in panes of
/// their own.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum LayoutIndicator {
    /// The simple moving average of the price.
    Sma {
        /// Rows averaged.
        #[serde(default = "period_20")]
        #[schemars(range(min = 1, max = 100_000))]
        period: u32,
    },
    /// The exponential moving average of the price.
    Ema {
        /// Rows in the smoothing.
        #[serde(default = "period_20")]
        #[schemars(range(min = 1, max = 100_000))]
        period: u32,
    },
    /// The weighted moving average of the price.
    Wma {
        /// Rows averaged.
        #[serde(default = "period_20")]
        #[schemars(range(min = 1, max = 100_000))]
        period: u32,
    },
    /// Bollinger Bands around the price's simple average.
    Bollinger {
        /// Rows averaged.
        #[serde(default = "period_20")]
        #[schemars(range(min = 1, max = 100_000))]
        period: u32,
        /// Standard deviations above and below.
        #[serde(default = "deviations_2")]
        #[schemars(extend("exclusiveMinimum" = 0))]
        deviations: f64,
    },
    /// The relative strength index of the price.
    Rsi {
        /// Rows in Wilder's smoothing.
        #[serde(default = "period_14")]
        #[schemars(range(min = 1, max = 100_000))]
        period: u32,
    },
    /// MACD of the price.
    Macd {
        /// Rows of the fast average.
        #[serde(default = "fast_12")]
        #[schemars(range(min = 1, max = 100_000))]
        fast: u32,
        /// Rows of the slow average.
        #[serde(default = "slow_26")]
        #[schemars(range(min = 1, max = 100_000))]
        slow: u32,
        /// Rows of the signal line's average.
        #[serde(default = "signal_9")]
        #[schemars(range(min = 1, max = 100_000))]
        signal: u32,
    },
    /// The average true range.
    Atr {
        /// Rows in Wilder's smoothing.
        #[serde(default = "period_14")]
        #[schemars(range(min = 1, max = 100_000))]
        period: u32,
    },
    /// The slow stochastic oscillator.
    Stochastic {
        /// Rows whose range the close is placed in.
        #[serde(default = "period_14")]
        #[schemars(range(min = 1, max = 100_000))]
        k: u32,
        /// Rows %K is averaged over.
        #[serde(default = "smooth_3")]
        #[schemars(range(min = 1, max = 100_000))]
        k_smooth: u32,
        /// Rows %D averages %K over.
        #[serde(default = "smooth_3")]
        #[schemars(range(min = 1, max = 100_000))]
        d: u32,
    },
    // Empty struct variants rather than unit ones: serde applies
    // `deny_unknown_fields` only to struct variants of an internally tagged enum.
    /// The volume-weighted average price.
    Vwap {},
    /// Volume, summed per candle.
    Volume {},
}

impl LayoutIndicator {
    /// The engine's indicator.
    #[must_use]
    pub fn to_engine(self) -> Indicator {
        match self {
            Self::Sma { period } => Indicator::Sma { period },
            Self::Ema { period } => Indicator::Ema { period },
            Self::Wma { period } => Indicator::Wma { period },
            Self::Bollinger { period, deviations } => Indicator::Bollinger { period, deviations },
            Self::Rsi { period } => Indicator::Rsi { period },
            Self::Macd { fast, slow, signal } => Indicator::Macd { fast, slow, signal },
            Self::Atr { period } => Indicator::Atr { period },
            Self::Stochastic { k, k_smooth, d } => Indicator::Stochastic { k, k_smooth, d },
            Self::Vwap {} => Indicator::Vwap,
            Self::Volume {} => Indicator::Volume,
        }
    }
}

/// A point a drawing is anchored to: a value of the chart's x column, as in a
/// filter, and a value on the price's axis. Drawings stay with the data however
/// the chart is zoomed or its axis placed.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LayoutAnchor {
    /// The x value: a date, an instant or a number.
    pub x: Value,
    /// The value on the price's axis.
    pub y: f64,
}

/// The longest note a drawing holds, in characters.
pub const MAX_NOTE: usize = 500;

/// A drawing on a chart, in a layout.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum LayoutDrawing {
    /// A line between two points.
    Trend {
        /// One end.
        from: LayoutAnchor,
        /// The other end.
        to: LayoutAnchor,
    },
    /// A line across the chart at a value.
    Horizontal {
        /// The value on the price's axis.
        y: f64,
    },
    /// Fibonacci retracement levels between two points: 0 %, 23.6 %, 38.2 %,
    /// 50 %, 61.8 %, 78.6 % and 100 % of the way from one to the other.
    Fibonacci {
        /// Where the move starts.
        from: LayoutAnchor,
        /// Where it ends.
        to: LayoutAnchor,
    },
    /// A rectangle between two corners.
    Rectangle {
        /// One corner.
        from: LayoutAnchor,
        /// The opposite corner.
        to: LayoutAnchor,
    },
    /// A text note at a point.
    Note {
        /// Where it is.
        at: LayoutAnchor,
        /// What it says.
        #[schemars(length(max = MAX_NOTE))]
        text: String,
    },
}

impl LayoutDrawing {
    /// Its anchors, in order.
    #[must_use]
    pub fn anchors(&self) -> Vec<&LayoutAnchor> {
        match self {
            Self::Trend { from, to }
            | Self::Fibonacci { from, to }
            | Self::Rectangle { from, to } => {
                vec![from, to]
            }
            Self::Horizontal { .. } => Vec::new(),
            Self::Note { at, .. } => vec![at],
        }
    }
}

/// A chart, in a layout. Bar charts, heatmaps, pies and waterfalls draw the
/// layout's grouped view; the other kinds are reduced by the engine to the
/// plot's pixels.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LayoutChart {
    /// What it draws.
    pub kind: ChartKindName,
    /// The x column of reduced kinds; a histogram bins it.
    #[serde(default)]
    pub x: String,
    /// Columns drawn against the left y axis.
    #[serde(default)]
    pub y: Vec<String>,
    /// Columns drawn against a second y axis on the right.
    #[serde(default)]
    pub y_right: Vec<String>,
    /// A column whose values split each plotted column into series.
    #[serde(default)]
    pub series: Option<String>,
    /// The price columns of candlestick and OHLC charts.
    #[serde(default)]
    pub ohlc: Option<LayoutOhlc>,
    /// How x values are placed.
    #[serde(default)]
    pub axis: XAxisName,
    /// A logarithmic y axis.
    #[serde(default)]
    pub log_y: bool,
    /// Bars of one group stacked instead of side by side.
    #[serde(default)]
    pub stacked: bool,
    /// Bars running across instead of up.
    #[serde(default)]
    pub horizontal: bool,
    /// The x range zoomed to; absent shows everything.
    #[serde(default)]
    pub range: Option<LayoutRange>,
    /// Series hidden from the plot, by their legend labels.
    #[serde(default)]
    pub hidden: Vec<String>,
    /// Technical-analysis indicators, computed over every row before the chart
    /// is reduced.
    #[serde(default)]
    pub indicators: Vec<LayoutIndicator>,
    /// The volume column, which a VWAP and volume read.
    #[serde(default)]
    pub volume: Option<String>,
    /// Lines, levels, rectangles and notes drawn over the price.
    #[serde(default)]
    pub drawings: Vec<LayoutDrawing>,
    /// Each series as its percentage change from its first value in the range
    /// shown, on a line or area chart.
    #[serde(default)]
    pub compare: bool,
    /// A column whose non-null values mark rows as events, such as earnings.
    #[serde(default)]
    pub events: Option<String>,
    /// Draws a pie chart as a ring, with the total in its centre.
    #[serde(default = "yes")]
    pub donut: bool,
    /// Writes each bar's value at its end, and each slice's share on it,
    /// where they fit.
    #[serde(default = "yes")]
    pub labels: bool,
    /// The market calendar a trading-time axis follows; NYSE's if absent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calendar: Option<CalendarName>,
    /// A trading-time axis's session; the calendar's regular session if absent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session: Option<LayoutSession>,
    /// Panes under a line or area chart's plot, each with columns of its own.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub panes: Vec<LayoutPane>,
    /// Turns the left value axis upside down, for yields, where a rise is a
    /// loss to a long position.
    #[serde(default, skip_serializing_if = "is_false")]
    pub reverse_y: bool,
    /// Turns the right value axis upside down.
    #[serde(default, skip_serializing_if = "is_false")]
    pub reverse_y_right: bool,
    /// Which colour a rise takes: candles, OHLC bars, volume, MACD's
    /// histogram, a pane's bars and a waterfall's steps.
    #[serde(default, skip_serializing_if = "RisingName::is_gain")]
    pub rising: RisingName,
    /// A scatter's numeric column whose magnitude sets each dot's area, such as
    /// DV01 or par.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,
    /// The column naming each dot of a scatter, such as a bond's CUSIP: the
    /// title of its tooltip, and the value a click on it selects.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    /// More columns a scatter's dot lists in its tooltip, in order.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tooltip: Vec<String>,
    /// A scatter's numeric column holding a fitted curve's value at each row's
    /// x, such as the API's fitted spread at each bond's duration: drawn as a
    /// line through each series.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fit: Option<String>,
    /// How a tenor axis spaces tenors.
    #[serde(default, skip_serializing_if = "TenorSpacingName::is_even")]
    pub tenor_spacing: TenorSpacingName,
    /// Shows the drawing tools above a chart that takes drawings. Off, a
    /// small overview chart carries no toolbar, and the drawings the layout
    /// holds are shown but not edited.
    #[serde(default = "yes", skip_serializing_if = "is_true")]
    pub drawing_tools: bool,
}

impl LayoutChart {
    /// The engine's chart for this layout chart, with the view's filters and
    /// orders, or `None` for kinds drawn from the grouped view.
    #[must_use]
    pub fn to_engine(
        &self,
        filters: &[Filter],
        orders: &BTreeMap<String, Order>,
    ) -> Option<ChartConfig> {
        Some(ChartConfig {
            kind: self.kind.reduced()?,
            x: self.x.clone(),
            // Panes' columns are reduced as the plot's are, after them.
            y: self
                .y
                .iter()
                .chain(&self.y_right)
                .chain(self.panes.iter().flat_map(|p| &p.columns))
                .cloned()
                .collect(),
            series: self.series.clone(),
            ohlc: self.ohlc.as_ref().map(|o| OhlcColumns {
                open: o.open.clone(),
                high: o.high.clone(),
                low: o.low.clone(),
                close: o.close.clone(),
            }),
            filters: filters.to_vec(),
            axis: match self.axis {
                XAxisName::Value => XAxis::Value,
                XAxisName::Trading => XAxis::Trading,
                XAxisName::Tenor => XAxis::Tenor(match self.tenor_spacing {
                    TenorSpacingName::Even => TenorSpacing::Even,
                    TenorSpacingName::Length => TenorSpacing::Length,
                }),
            },
            indicators: self.indicators.iter().map(|i| i.to_engine()).collect(),
            volume: self.volume.clone(),
            compare: self.compare,
            events: self.events.clone(),
            points: PointColumns {
                size: self.size.clone(),
                id: self.id.clone(),
                tooltip: self.tooltip.clone(),
                fit: self.fit.clone(),
            },
            orders: orders.clone(),
            market: match self.calendar {
                Some(CalendarName::Sifma) => Market::Sifma,
                Some(CalendarName::Nyse) | None => Market::Nyse,
            },
            session: None,
        })
    }

    /// Refuses panes the chart cannot draw: under a kind other than a line or
    /// area chart, in compare mode, with no columns, or drawing a column the
    /// plot or another pane draws.
    ///
    /// # Errors
    ///
    /// Returns an error naming the column, or the x column for the chart as a
    /// whole, and what to change.
    pub fn check_panes(&self) -> Result<(), LayoutError> {
        if self.panes.is_empty() {
            return Ok(());
        }
        if !matches!(self.kind, ChartKindName::Line | ChartKindName::Area) {
            return Err(value_error(
                &self.x,
                "panes go under a line or area chart's plot",
            ));
        }
        if self.compare {
            return Err(value_error(
                &self.x,
                "compare mode puts the plot's series on percentage changes, and panes keep their own values: use one or the other",
            ));
        }
        let mut drawn: Vec<&String> = self.y.iter().chain(&self.y_right).collect();
        for pane in &self.panes {
            if pane.columns.is_empty() {
                return Err(value_error(
                    &self.x,
                    "a pane needs at least one column to draw",
                ));
            }
            for column in &pane.columns {
                if drawn.contains(&column) {
                    return Err(value_error(
                        column,
                        "a column is drawn once, in the plot or in one pane",
                    ));
                }
                drawn.push(column);
            }
        }
        Ok(())
    }

    /// Refuses a reversed axis the chart does not have: the left axis of a
    /// kind other than a line, area, scatter, candlestick or OHLC chart, or a
    /// right axis with no columns on it.
    ///
    /// # Errors
    ///
    /// Returns an error naming the x column and what to change.
    pub fn check_reversed(&self) -> Result<(), LayoutError> {
        let along_x = matches!(
            self.kind,
            ChartKindName::Line
                | ChartKindName::Area
                | ChartKindName::Scatter
                | ChartKindName::Candlestick
                | ChartKindName::Ohlc
        );
        if self.reverse_y && !along_x {
            return Err(value_error(
                &self.x,
                "reverse_y turns the value axis of a line, area, scatter, candlestick or OHLC chart",
            ));
        }
        if self.reverse_y_right && self.y_right.is_empty() {
            return Err(value_error(
                &self.x,
                "reverse_y_right turns the right axis, which needs columns in y_right",
            ));
        }
        Ok(())
    }

    /// The session a trading-time axis keeps, read from its `HH:MM` times.
    ///
    /// # Errors
    ///
    /// Returns an error for a time that does not read as `HH:MM`, a session of
    /// no length, or a calendar or session on a chart that is not on a
    /// trading-time axis.
    pub fn trading_session(&self) -> Result<Option<Session>, LayoutError> {
        if self.axis != XAxisName::Trading && (self.calendar.is_some() || self.session.is_some()) {
            return Err(value_error(
                &self.x,
                "a calendar and a session place a trading-time axis: set axis to trading",
            ));
        }
        let Some(session) = &self.session else {
            return Ok(None);
        };
        let read = |text: &str| -> Result<jiff::civil::Time, LayoutError> {
            let (hour, minute) = text
                .split_once(':')
                .filter(|(h, m)| {
                    h.len() == 2
                        && m.len() == 2
                        && h.bytes().chain(m.bytes()).all(|b| b.is_ascii_digit())
                })
                .and_then(|(h, m)| Some((h.parse::<i8>().ok()?, m.parse::<i8>().ok()?)))
                .ok_or_else(|| {
                    value_error(
                        &self.x,
                        format!("the session's {text:?} is not an HH:MM time"),
                    )
                })?;
            jiff::civil::Time::new(hour, minute, 0, 0).map_err(|_| {
                value_error(
                    &self.x,
                    format!("the session's {text:?} is not a time of day"),
                )
            })
        };
        let (opens, closes) = (read(&session.opens)?, read(&session.closes)?);
        Ok(Some(Session { opens, closes }))
    }
}

/// How a column's values are displayed. Unset fields take the type's default:
/// a decimal's scale, no decimals for integers, one when abbreviating, and two
/// otherwise; thousands grouped; instants in `America/New_York` to the second.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(default, deny_unknown_fields)]
pub struct LayoutFormat {
    /// Digits after the decimal point, at most 30.
    #[schemars(range(max = 30))]
    pub decimals: Option<u8>,
    /// Group thousands with commas.
    pub thousands: Option<bool>,
    /// Multiply by 100 and append `%`.
    pub percent: bool,
    /// Divide by a thousand, million or billion and append `K`, `M` or `B`, or
    /// as `suffixes` says.
    pub abbreviate: Option<AbbreviationName>,
    /// How an abbreviation is written: `amount`'s `K`, `M` and `B`, or `par`'s
    /// `M`, `MM` and `BN`, as bond markets write par amounts.
    #[serde(skip_serializing_if = "SuffixesName::is_amount")]
    pub suffixes: SuffixesName,
    /// Write a rate, a fraction, in basis points with ` bp`: 0.0025 is `25 bp`.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub bps: bool,
    /// Write a price in 32nds, `99-16+`, to its finest step.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thirty_seconds: Option<ThirtySecondsName>,
    /// How negative numbers are written.
    pub negative: NegativeName,
    /// The IANA zone instants are shown in.
    pub zone: Option<String>,
    /// The sub-second digits instants show.
    pub precision: PrecisionName,
}

/// A K, M or B scaling in a layout.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AbbreviationName {
    /// Thousands, `K`.
    Thousands,
    /// Millions, `M`.
    Millions,
    /// Billions, `B`.
    Billions,
}

/// How an abbreviation is written, in a layout.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum SuffixesName {
    /// `K`, `M` and `B`.
    #[default]
    Amount,
    /// `M` for thousands, `MM` for millions and `BN` for billions, as bond
    /// markets write par amounts and `AmountInput` reads them back.
    Par,
}

impl SuffixesName {
    fn is_amount(&self) -> bool {
        *self == Self::Amount
    }
}

/// The finest step of a price in 32nds, in a layout.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ThirtySecondsName {
    /// Whole 32nds: `99-16`.
    ThirtySeconds,
    /// Halves of a 32nd: `99-16+`.
    Halves,
    /// Quarters of a 32nd: `99-162`.
    Quarters,
    /// Eighths of a 32nd, the finest: `99-163`.
    Eighths,
}

/// How negative numbers are written, in a layout.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum NegativeName {
    /// `-1,234.50`
    #[default]
    Minus,
    /// `(1,234.50)`
    Parentheses,
}

/// Sub-second digits in a layout.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum PrecisionName {
    /// Whole seconds.
    #[default]
    Seconds,
    /// Milliseconds.
    Milliseconds,
    /// Microseconds.
    Microseconds,
}

impl LayoutFormat {
    /// The engine's format.
    #[must_use]
    pub fn to_engine(&self) -> Format {
        Format {
            decimals: self.decimals,
            thousands: self.thousands,
            percent: self.percent,
            abbreviate: self.abbreviate.map(|a| match a {
                AbbreviationName::Thousands => Abbreviation::Thousands,
                AbbreviationName::Millions => Abbreviation::Millions,
                AbbreviationName::Billions => Abbreviation::Billions,
            }),
            suffixes: match self.suffixes {
                SuffixesName::Amount => Suffixes::Amount,
                SuffixesName::Par => Suffixes::Par,
            },
            bps: self.bps,
            thirty_seconds: self.thirty_seconds.map(|step| match step {
                ThirtySecondsName::ThirtySeconds => ThirtySeconds::Whole,
                ThirtySecondsName::Halves => ThirtySeconds::Halves,
                ThirtySecondsName::Quarters => ThirtySeconds::Quarters,
                ThirtySecondsName::Eighths => ThirtySeconds::Eighths,
            }),
            negative: match self.negative {
                NegativeName::Minus => Negative::Minus,
                NegativeName::Parentheses => Negative::Parentheses,
            },
            zone: self.zone.clone(),
            precision: match self.precision {
                PrecisionName::Seconds => TimePrecision::Seconds,
                PrecisionName::Milliseconds => TimePrecision::Milliseconds,
                PrecisionName::Microseconds => TimePrecision::Microseconds,
            },
        }
    }

    /// The layout form of an engine format.
    #[must_use]
    pub fn from_engine(format: &Format) -> Self {
        Self {
            decimals: format.decimals,
            thousands: format.thousands,
            percent: format.percent,
            abbreviate: format.abbreviate.map(|a| match a {
                Abbreviation::Thousands => AbbreviationName::Thousands,
                Abbreviation::Millions => AbbreviationName::Millions,
                Abbreviation::Billions => AbbreviationName::Billions,
            }),
            suffixes: match format.suffixes {
                Suffixes::Amount => SuffixesName::Amount,
                Suffixes::Par => SuffixesName::Par,
            },
            bps: format.bps,
            thirty_seconds: format.thirty_seconds.map(|step| match step {
                ThirtySeconds::Whole => ThirtySecondsName::ThirtySeconds,
                ThirtySeconds::Halves => ThirtySecondsName::Halves,
                ThirtySeconds::Quarters => ThirtySecondsName::Quarters,
                ThirtySeconds::Eighths => ThirtySecondsName::Eighths,
            }),
            negative: match format.negative {
                Negative::Minus => NegativeName::Minus,
                Negative::Parentheses => NegativeName::Parentheses,
            },
            zone: format.zone.clone(),
            precision: match format.precision {
                TimePrecision::Seconds => PrecisionName::Seconds,
                TimePrecision::Milliseconds => PrecisionName::Milliseconds,
                TimePrecision::Microseconds => PrecisionName::Microseconds,
            },
        }
    }
}

/// An aggregate's name in a layout.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AggregateName {
    /// Rows with a value.
    Count,
    /// All rows.
    CountAll,
    /// Exact sum.
    Sum,
    /// Mean.
    Mean,
    /// Weighted mean; needs `weight`.
    WeightedMean,
    /// Minimum.
    Min,
    /// Maximum.
    Max,
    /// Value of the earliest inserted row.
    First,
    /// Value of the latest inserted row.
    Last,
    /// Distinct values.
    DistinctCount,
    /// Sample variance.
    Variance,
    /// Sample standard deviation.
    StdDev,
    /// Median.
    Median,
    /// Percentile; needs `percentile`.
    Percentile,
}

/// How a measure is shown.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ShowAsName {
    /// The value.
    #[default]
    Value,
    /// Fraction of the grand total.
    PercentOfGrandTotal,
    /// Fraction of the column's total.
    PercentOfColumnTotal,
    /// Fraction of the row's total.
    PercentOfRowTotal,
    /// Fraction of the parent row's value.
    PercentOfParent,
    /// Excel's "Running Total In": the exact sum of the group's value and its
    /// siblings' before it, in their order. Sums and counts only.
    RunningTotal,
}

/// A measure in a layout.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LayoutMeasure {
    /// The column, absent for `count_all`.
    #[serde(default)]
    pub column: Option<String>,
    /// The aggregate.
    pub aggregate: AggregateName,
    /// The percentile in `[0, 1]`, for `percentile`.
    #[serde(default)]
    pub percentile: Option<f64>,
    /// The weight column, for `weighted_mean`.
    #[serde(default)]
    pub weight: Option<String>,
    /// A column naming each row's unit.
    #[serde(default)]
    pub unit_column: Option<String>,
    /// How the value is shown.
    #[serde(default)]
    pub show_as: ShowAsName,
    /// The display format, overriding the one derived from the column's.
    #[serde(default)]
    pub format: Option<LayoutFormat>,
}

impl LayoutMeasure {
    /// The engine's measure, or what is missing.
    ///
    /// # Errors
    ///
    /// Returns a message for a percentile without its value or a weighted mean
    /// without its weight.
    pub fn to_engine(&self) -> Result<Measure, String> {
        let aggregate = match self.aggregate {
            AggregateName::Count => Aggregate::Count,
            AggregateName::CountAll => Aggregate::CountAll,
            AggregateName::Sum => Aggregate::Sum,
            AggregateName::Mean => Aggregate::Mean,
            AggregateName::WeightedMean => Aggregate::WeightedMean,
            AggregateName::Min => Aggregate::Min,
            AggregateName::Max => Aggregate::Max,
            AggregateName::First => Aggregate::First,
            AggregateName::Last => Aggregate::Last,
            AggregateName::DistinctCount => Aggregate::DistinctCount,
            AggregateName::Variance => Aggregate::Variance,
            AggregateName::StdDev => Aggregate::StdDev,
            AggregateName::Median => Aggregate::Median,
            AggregateName::Percentile => Aggregate::Percentile(
                self.percentile
                    .ok_or_else(|| "percentile is missing".to_owned())?,
            ),
        };
        if aggregate == Aggregate::WeightedMean && self.weight.is_none() {
            return Err("weighted_mean needs a weight".into());
        }
        Ok(Measure {
            column: self.column.clone(),
            aggregate,
            weight: self.weight.clone(),
            unit_column: self.unit_column.clone(),
            show_as: match self.show_as {
                ShowAsName::Value => ShowAs::Value,
                ShowAsName::PercentOfGrandTotal => ShowAs::PercentOfGrandTotal,
                ShowAsName::PercentOfColumnTotal => ShowAs::PercentOfColumnTotal,
                ShowAsName::PercentOfRowTotal => ShowAs::PercentOfRowTotal,
                ShowAsName::PercentOfParent => ShowAs::PercentOfParent,
                ShowAsName::RunningTotal => ShowAs::RunningTotal,
            },
            format: self.format.as_ref().map(LayoutFormat::to_engine),
        })
    }
}

/// A filter operator in a layout.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum FilterOpName {
    /// Equal to `value`.
    Eq,
    /// Not equal to `value`.
    Ne,
    /// Less than `value`.
    Lt,
    /// At most `value`.
    Le,
    /// Greater than `value`.
    Gt,
    /// At least `value`.
    Ge,
    /// One of `values`.
    In,
    /// None of `values`.
    NotIn,
    /// Null.
    IsNull,
    /// Not null.
    IsNotNull,
    /// Text containing `value`, ignoring case.
    Contains,
    /// Text not containing `value`, ignoring case. Blanks match, as in a
    /// spreadsheet.
    NotContains,
    /// Text starting with `value`, ignoring case.
    StartsWith,
    /// Text ending with `value`, ignoring case.
    EndsWith,
}

/// A filter in a layout.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LayoutFilter {
    /// The column.
    pub column: String,
    /// The operator.
    pub op: FilterOpName,
    /// The operand of single-value operators.
    #[serde(default)]
    pub value: Option<Value>,
    /// The operands of `in` and `not_in`.
    #[serde(default)]
    pub values: Vec<Value>,
    /// More columns the condition is tested in: the filter passes when it holds
    /// in `column` or in any of these, as a search across columns does.
    #[serde(default)]
    pub columns: Vec<String>,
}

/// A sort in a layout.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LayoutSort {
    /// The column.
    pub column: String,
    /// Largest first.
    #[serde(default)]
    pub descending: bool,
}

/// What orders groups.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum GroupOrderName {
    /// The group's own value.
    #[default]
    Key,
    /// A measure's value, by index.
    Measure(usize),
}

/// How groups are ordered.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(default, deny_unknown_fields)]
pub struct LayoutGroupSort {
    /// What to order by.
    pub by: GroupOrderName,
    /// Largest first.
    pub descending: bool,
}

/// A comparison for aggregate filters.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum CompareName {
    /// Greater than.
    Gt,
    /// At least.
    Ge,
    /// Less than.
    Lt,
    /// At most.
    Le,
    /// Equal.
    Eq,
    /// Not equal.
    Ne,
}

/// An aggregate filter in a layout.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LayoutHaving {
    /// The measure, by index.
    pub measure: usize,
    /// The comparison.
    pub op: CompareName,
    /// The value compared with.
    pub value: f64,
}

/// Top-N in a layout.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LayoutTopN {
    /// Groups to keep.
    pub n: usize,
    /// The measure ranked, by index.
    pub measure: usize,
    /// Keep the largest.
    #[serde(default = "yes")]
    pub largest: bool,
    /// Show the rest as one Other row.
    #[serde(default = "yes")]
    pub other: bool,
}

#[allow(clippy::trivially_copy_pass_by_ref)]
fn is_false(value: &bool) -> bool {
    !*value
}

#[allow(clippy::trivially_copy_pass_by_ref)]
fn is_true(value: &bool) -> bool {
    *value
}

fn yes() -> bool {
    true
}

/// A group the user expanded or collapsed.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LayoutExpanded {
    /// The group's values from the outermost level.
    pub path: Vec<Value>,
    /// Expanded or collapsed.
    pub expanded: bool,
}

/// A layout that cannot be read or does not fit the table.
#[derive(Debug, thiserror::Error)]
pub enum LayoutError {
    /// The JSON is malformed or does not match the schema.
    #[error("layout JSON: {0}")]
    Json(#[from] serde_json::Error),
    /// The version is newer than this build understands.
    #[error("layout version {0} is newer than {LAYOUT_VERSION}")]
    Version(u32),
    /// A column is not in the table.
    #[error("column {0} is not in the table")]
    UnknownColumn(String),
    /// A value does not fit its column.
    #[error("column {column}: {reason}")]
    Value {
        /// The column.
        column: String,
        /// What is wrong.
        reason: String,
    },
    /// A measure is incomplete.
    #[error("measure {0}: {1}")]
    Measure(usize, String),
    /// A total is incomplete.
    #[error("total {0}: {1}")]
    Total(usize, String),
    /// A title names neither a column of the table nor a measure.
    #[error(
        "titles: {name} is neither a column nor a measure; the columns are {columns}{measures}"
    )]
    UnknownTitle {
        /// The title's key.
        name: String,
        /// The table's columns, comma-separated.
        columns: String,
        /// The layout's measures by their headers, after "and the measures
        /// are", or empty when it has none.
        measures: String,
    },
    /// A search has no column to search.
    #[error("the search for {0:?} has no text column to search")]
    Search(String),
}

/// Returns the JSON Schema of layout documents.
#[must_use]
pub fn schema() -> Value {
    serde_json::to_value(schemars::schema_for!(Layout)).expect("schemas serialize")
}

/// The error for a title naming neither a column nor a measure, listing both.
fn unknown_title(table: &Table, measures: &[Measure], name: &str) -> LayoutError {
    let columns: Vec<&str> = table
        .schema()
        .fields()
        .iter()
        .map(|f| f.name().as_str())
        .collect();
    let labels: Vec<String> = measures.iter().map(Measure::label).collect();
    LayoutError::UnknownTitle {
        name: name.to_owned(),
        columns: columns.join(", "),
        measures: if labels.is_empty() {
            String::new()
        } else {
            format!(", and the measures are {}", labels.join(", "))
        },
    }
}

fn value_error(column: &str, reason: impl Into<String>) -> LayoutError {
    LayoutError::Value {
        column: column.to_owned(),
        reason: reason.into(),
    }
}

/// Parses decimal text, such as `-1234.5` or `1.2e3`, exactly into an unscaled
/// value at `scale`. More fractional digits than the scale holds are an error
/// unless they are zeros, so a value is never rounded.
///
/// # Errors
///
/// Returns a message for text that is not a decimal, does not fit 128 bits, or
/// has more decimal places than `scale`.
pub fn parse_exact_decimal(text: &str, scale: i8) -> Result<i128, String> {
    parse_decimal("value", text, scale).map_err(|e| match e {
        LayoutError::Value { reason, .. } => reason,
        other => other.to_string(),
    })
}

/// Parses decimal text exactly into an unscaled value at `scale`. More fractional
/// digits than the scale holds are an error unless they are zeros.
fn parse_decimal(column: &str, text: &str, scale: i8) -> Result<i128, LayoutError> {
    let bad = || value_error(column, format!("{text:?} is not a decimal"));
    let (mantissa, exponent) = match text.find(['e', 'E']) {
        Some(i) => (&text[..i], text[i + 1..].parse::<i64>().map_err(|_| bad())?),
        None => (text, 0),
    };
    let (negative, digits) = match mantissa.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, mantissa.strip_prefix('+').unwrap_or(mantissa)),
    };
    let (whole, fraction) = digits.split_once('.').unwrap_or((digits, ""));
    if whole.is_empty() && fraction.is_empty()
        || !whole
            .bytes()
            .chain(fraction.bytes())
            .all(|b| b.is_ascii_digit())
    {
        return Err(bad());
    }
    // The value is all_digits * 10^(exponent - fraction.len()); rescale to `scale`.
    let all_digits = format!("{whole}{fraction}");
    // Computed in i64 and bounded, so hostile exponents cannot overflow.
    let shift = i64::from(scale)
        .checked_add(exponent)
        .and_then(|s| s.checked_sub(i64::try_from(fraction.len()).ok()?))
        .filter(|s| s.abs() <= 76)
        .ok_or_else(|| value_error(column, format!("{text} is out of range")))?;
    let trimmed = all_digits.trim_start_matches('0');
    let mut unscaled: i128 = if trimmed.is_empty() {
        0
    } else {
        trimmed
            .parse()
            .map_err(|_| value_error(column, format!("{text} is too large")))?
    };
    if shift >= 0 {
        unscaled = 10i128
            .checked_pow(shift as u32)
            .and_then(|p| unscaled.checked_mul(p))
            .ok_or_else(|| value_error(column, format!("{text} is too large")))?;
    } else {
        let divisor = 10i128
            .checked_pow((-shift) as u32)
            .ok_or_else(|| value_error(column, format!("{text} has too many digits")))?;
        if unscaled % divisor != 0 {
            return Err(value_error(
                column,
                format!("{text} has more decimal places than the column's {scale}"),
            ));
        }
        unscaled /= divisor;
    }
    Ok(if negative { -unscaled } else { unscaled })
}

/// Converts a JSON value to a scalar of the column's type.
fn scalar(column: &str, ty: &ColumnType, value: &Value) -> Result<Scalar, LayoutError> {
    let mismatch = || value_error(column, format!("{value} does not fit type {ty:?}"));
    Ok(match (ty, value) {
        (_, Value::Null) => Scalar::Null,
        (ColumnType::Boolean, Value::Bool(b)) => Scalar::Boolean(*b),
        (ColumnType::Int64, Value::Number(n)) => {
            Scalar::Int64(n.as_str().parse().map_err(|_| mismatch())?)
        }
        // JavaScript numbers hold integers exactly only up to 2^53, so larger ones
        // travel as strings.
        (ColumnType::Int64, Value::String(s)) => {
            Scalar::Int64(s.trim().parse().map_err(|_| mismatch())?)
        }
        (ColumnType::Float64, Value::Number(n)) => {
            Scalar::Float64(n.as_str().parse().map_err(|_| mismatch())?)
        }
        // JSON has no infinity, so infinities travel as "inf" and "-inf".
        (ColumnType::Float64, Value::String(s)) => match s.as_str() {
            "inf" | "+inf" | "infinity" => Scalar::Float64(f64::INFINITY),
            "-inf" | "-infinity" => Scalar::Float64(f64::NEG_INFINITY),
            _ => return Err(mismatch()),
        },
        (ColumnType::Decimal { scale, .. }, Value::Number(n)) => {
            Scalar::Decimal(parse_decimal(column, n.as_str(), *scale)?)
        }
        (ColumnType::Decimal { scale, .. }, Value::String(s)) => {
            Scalar::Decimal(parse_decimal(column, s.trim(), *scale)?)
        }
        (ColumnType::Utf8, Value::String(s)) => Scalar::Utf8(s.clone()),
        (ColumnType::Date32, Value::String(s)) => {
            let date: jiff::civil::Date = s.parse().map_err(|_| mismatch())?;
            let days = date
                .since(jiff::civil::date(1970, 1, 1))
                .map_err(|_| mismatch())?
                .get_days();
            Scalar::Date32(days)
        }
        (ColumnType::Timestamp { timezone: Some(_) }, Value::String(s)) => {
            let t: jiff::Timestamp = s.parse().map_err(|_| {
                value_error(
                    column,
                    format!("{s:?} needs an offset, such as Z or -05:00"),
                )
            })?;
            Scalar::Timestamp(t.as_microsecond())
        }
        (ColumnType::Timestamp { timezone: None }, Value::String(s)) => {
            let dt: jiff::civil::DateTime = s.parse().map_err(|_| mismatch())?;
            let t = dt
                .to_zoned(jiff::tz::TimeZone::UTC)
                .map_err(|_| mismatch())?;
            Scalar::Timestamp(t.timestamp().as_microsecond())
        }
        _ => return Err(mismatch()),
    })
}

fn column_type(table: &Table, column: &str) -> Result<ColumnType, LayoutError> {
    let index = table
        .column_index(column)
        .ok_or_else(|| LayoutError::UnknownColumn(column.to_owned()))?;
    Ok(table.column(index).column_type().clone())
}

/// A layout read against a table: the engine configuration and the expanded and
/// collapsed groups.
#[derive(Clone, Debug)]
pub struct ResolvedLayout {
    /// The view configuration.
    pub config: ViewConfig,
    /// The chart the engine reduces, for layouts with a reduced chart.
    pub chart: Option<ChartConfig>,
    /// Group paths and whether each is expanded.
    pub expanded: Vec<(Vec<Scalar>, bool)>,
    /// The distinct x values the chart's drawings are anchored to: as the layout
    /// gave them in JSON, and read as values of the x column.
    pub anchors: Vec<(String, Scalar)>,
}

impl Layout {
    /// Reads a layout document, migrating older versions.
    ///
    /// # Errors
    ///
    /// Returns an error for malformed JSON, unknown fields, or a newer version.
    pub fn from_json(json: &str) -> Result<Self, LayoutError> {
        let mut value: Value = serde_json::from_str(json)?;
        let version = value
            .get("version")
            .and_then(Value::as_u64)
            .unwrap_or(u64::from(LAYOUT_VERSION)) as u32;
        if version > LAYOUT_VERSION {
            return Err(LayoutError::Version(version));
        }
        // Migrations from older versions go here, one step at a time. Version 2
        // only added fields, whose defaults mean what version 1 did.
        if let Some(object) = value.as_object_mut() {
            object.insert("version".into(), Value::from(LAYOUT_VERSION));
        }
        Ok(serde_json::from_value(value)?)
    }

    /// Writes the layout as JSON.
    ///
    /// # Panics
    ///
    /// Never: layouts always serialize.
    #[must_use]
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).expect("layouts serialize")
    }

    /// Whether the layout is grouped: a pivot or a detail view rather than a flat
    /// list of rows.
    #[must_use]
    pub fn is_grouped(&self) -> bool {
        !self.group_by.is_empty() || !self.split_by.is_empty() || !self.measures.is_empty()
    }

    /// The filter the search becomes: its text in any searched column, ignoring
    /// case. A flat view searches the text columns it shows; a detail view, those
    /// and its group columns; a pivot, its group and column-pivot columns. `None`
    /// without a search.
    ///
    /// # Errors
    ///
    /// Returns an error for unknown columns, or a search with no text column to
    /// search.
    pub fn search_filter(&self, table: &Table) -> Result<Option<LayoutFilter>, LayoutError> {
        if self.search.is_empty() {
            return Ok(None);
        }
        // An empty list of columns shows every column.
        let shown = || -> Result<Vec<String>, LayoutError> {
            let shown = self.shown_columns(table)?;
            Ok(if shown.is_empty() {
                table
                    .schema()
                    .fields()
                    .iter()
                    .map(|f| f.name().clone())
                    .collect()
            } else {
                shown
            })
        };
        let mut candidates: Vec<String> = Vec::new();
        if self.is_grouped() {
            candidates.extend(self.group_by.iter().cloned());
            if self.detail {
                candidates.extend(shown()?);
            } else {
                candidates.extend(self.split_by.iter().cloned());
            }
        } else {
            candidates.extend(shown()?);
        }
        let mut columns: Vec<String> = Vec::new();
        for c in candidates {
            if column_type(table, &c)? == ColumnType::Utf8 && !columns.contains(&c) {
                columns.push(c);
            }
        }
        let Some((first, rest)) = columns.split_first() else {
            return Err(LayoutError::Search(self.search.clone()));
        };
        Ok(Some(LayoutFilter {
            column: first.clone(),
            columns: rest.to_vec(),
            op: FilterOpName::Contains,
            value: Some(Value::String(self.search.clone())),
            values: Vec::new(),
        }))
    }

    /// The columns a flat or detail view shows, in order: the pinned ones first,
    /// then the rest of `columns`, or of the table's when `columns` is empty.
    ///
    /// # Errors
    ///
    /// Returns an error for a pinned column that is not in the table.
    pub fn shown_columns(&self, table: &Table) -> Result<Vec<String>, LayoutError> {
        if self.pinned.is_empty() {
            return Ok(self.columns.clone());
        }
        for c in &self.pinned {
            column_type(table, c)?;
        }
        let rest: Vec<String> = if self.columns.is_empty() {
            table
                .schema()
                .fields()
                .iter()
                .map(|f| f.name().clone())
                .collect()
        } else {
            self.columns.clone()
        };
        Ok(self
            .pinned
            .iter()
            .chain(rest.iter().filter(|c| !self.pinned.contains(c)))
            .cloned()
            .collect())
    }

    /// Interprets the layout against `table`.
    ///
    /// # Errors
    ///
    /// Returns an error for unknown columns, values that do not fit their columns,
    /// and incomplete measures.
    pub fn resolve(&self, table: &Table) -> Result<ResolvedLayout, LayoutError> {
        let measures = self
            .measures
            .iter()
            .enumerate()
            .map(|(i, m)| {
                m.to_engine()
                    .map_err(|reason| LayoutError::Measure(i, reason))
            })
            .collect::<Result<Vec<_>, LayoutError>>()?;
        let totals = self
            .totals
            .iter()
            .enumerate()
            .map(|(i, m)| {
                m.to_engine()
                    .map_err(|reason| LayoutError::Total(i, reason))
            })
            .collect::<Result<Vec<_>, LayoutError>>()?;
        let search = self.search_filter(table)?;
        let filters = self
            .filters
            .iter()
            .chain(&search)
            .map(|f| {
                let ty = column_type(table, &f.column)?;
                let single = || -> Result<Scalar, LayoutError> {
                    let v = f
                        .value
                        .as_ref()
                        .ok_or_else(|| value_error(&f.column, "the filter needs a value"))?;
                    match scalar(&f.column, &ty, v)? {
                        Scalar::Null => Err(value_error(&f.column, "use is_null to match nulls")),
                        s => Ok(s),
                    }
                };
                let many = || -> Result<Vec<Scalar>, LayoutError> {
                    f.values.iter().map(|v| scalar(&f.column, &ty, v)).collect()
                };
                let text = || -> Result<String, LayoutError> {
                    match &f.value {
                        Some(Value::String(s)) => Ok(s.clone()),
                        _ => Err(value_error(&f.column, "the filter needs text")),
                    }
                };
                let op = match f.op {
                    FilterOpName::Eq => FilterOp::Eq(single()?),
                    FilterOpName::Ne => FilterOp::Ne(single()?),
                    FilterOpName::Lt => FilterOp::Lt(single()?),
                    FilterOpName::Le => FilterOp::Le(single()?),
                    FilterOpName::Gt => FilterOp::Gt(single()?),
                    FilterOpName::Ge => FilterOp::Ge(single()?),
                    FilterOpName::In => FilterOp::In(many()?),
                    FilterOpName::NotIn => FilterOp::NotIn(many()?),
                    FilterOpName::IsNull => FilterOp::IsNull,
                    FilterOpName::IsNotNull => FilterOp::IsNotNull,
                    FilterOpName::Contains => FilterOp::Contains(text()?),
                    FilterOpName::NotContains => FilterOp::NotContains(text()?),
                    FilterOpName::StartsWith => FilterOp::StartsWith(text()?),
                    FilterOpName::EndsWith => FilterOp::EndsWith(text()?),
                };
                for column in &f.columns {
                    column_type(table, column)?;
                }
                let columns: Vec<&str> = f.columns.iter().map(String::as_str).collect();
                Ok(Filter::new(&f.column, op).or_in(&columns))
            })
            .collect::<Result<Vec<_>, LayoutError>>()?;
        let expanded = self
            .expanded
            .iter()
            .map(|e| {
                let path = e
                    .path
                    .iter()
                    .zip(&self.group_by)
                    .map(|(v, column)| scalar(column, &column_type(table, column)?, v))
                    .collect::<Result<Vec<_>, LayoutError>>()?;
                Ok((path, e.expanded))
            })
            .collect::<Result<Vec<_>, LayoutError>>()?;
        // A title names a column, or a measure by its header, such as
        // `sum(par)`, which a grouped view's header and a bar chart's legend
        // then say instead.
        let titles = self
            .titles
            .iter()
            .map(|(name, title)| {
                let measure = measures.iter().any(|m| m.label() == *name);
                if !measure && table.column_index(name).is_none() {
                    return Err(unknown_title(table, &measures, name));
                }
                Ok((name.clone(), title.clone()))
            })
            .collect::<Result<_, LayoutError>>()?;
        let config = ViewConfig {
            columns: self.shown_columns(table)?,
            group_by: self.group_by.clone(),
            split_by: self.split_by.clone(),
            measures,
            filters,
            sort: self
                .sort
                .iter()
                .map(|s| Sort {
                    column: s.column.clone(),
                    descending: s.descending,
                })
                .collect(),
            group_sort: GroupSort {
                by: match self.group_sort.by {
                    GroupOrderName::Key => GroupOrder::Key,
                    GroupOrderName::Measure(i) => GroupOrder::Measure(i),
                },
                descending: self.group_sort.descending,
            },
            having: self
                .having
                .iter()
                .map(|h| Having {
                    measure: h.measure,
                    op: match h.op {
                        CompareName::Gt => Comparison::Gt,
                        CompareName::Ge => Comparison::Ge,
                        CompareName::Lt => Comparison::Lt,
                        CompareName::Le => Comparison::Le,
                        CompareName::Eq => Comparison::Eq,
                        CompareName::Ne => Comparison::Ne,
                    },
                    value: h.value,
                })
                .collect(),
            top_n: self.top_n.map(|t| TopN {
                n: t.n,
                measure: t.measure,
                largest: t.largest,
                other: t.other,
            }),
            expand_depth: self.expand_depth,
            // The API's format for each column it declares one for, then the
            // layout's own, which wins.
            formats: table
                .schema()
                .fields()
                .iter()
                .filter_map(|field| {
                    crate::display::field_format(field)
                        .map(|f| (field.name().clone(), f.to_engine()))
                })
                .map(Ok)
                .chain(self.formats.iter().map(|(column, f)| {
                    column_type(table, column)?;
                    Ok((column.clone(), f.to_engine()))
                }))
                .collect::<Result<_, LayoutError>>()?,
            titles,
            totals,
            detail: self.detail,
            orders: self
                .orders
                .iter()
                .map(|(column, order)| (column.clone(), order.to_engine()))
                .collect(),
        };
        let session = match &self.chart {
            Some(c) => {
                c.check_panes()?;
                c.check_reversed()?;
                c.trading_session()?
            }
            None => None,
        };
        let chart = self
            .chart
            .as_ref()
            .and_then(|c| c.to_engine(&config.filters, &config.orders))
            .map(|c| ChartConfig { session, ..c });
        let anchors = match &self.chart {
            Some(c) if !c.drawings.is_empty() => drawing_anchors(table, c)?,
            _ => Vec::new(),
        };
        Ok(ResolvedLayout {
            config,
            chart,
            expanded,
            anchors,
        })
    }
}

/// A chart's drawings' distinct anchors, read as values of its x column and keyed
/// by their exact JSON, as the frame's points carry theirs. Anchors that do not fit
/// the column, as after the chart's x column changes, are left out: their drawings
/// are not drawn, and the chart is not refused for them. Kinds that take no
/// drawings keep theirs in the layout without placing them.
fn drawing_anchors(
    table: &Table,
    chart: &LayoutChart,
) -> Result<Vec<(String, Scalar)>, LayoutError> {
    for drawing in &chart.drawings {
        if let LayoutDrawing::Note { text, .. } = drawing {
            let length = text.chars().count();
            if length > MAX_NOTE {
                return Err(value_error(
                    &chart.x,
                    format!("a drawing's note holds at most {MAX_NOTE} characters, not {length}"),
                ));
            }
        }
    }
    if !chart.kind.takes_drawings() {
        return Ok(Vec::new());
    }
    let ty = column_type(table, &chart.x)?;
    let mut anchors = BTreeMap::new();
    for anchor in chart.drawings.iter().flat_map(LayoutDrawing::anchors) {
        if let Ok(value) = scalar(&chart.x, &ty, &anchor.x)
            && value != Scalar::Null
        {
            anchors.insert(parallax_engine::format::scalar_json(&ty, &value), value);
        }
    }
    Ok(anchors.into_iter().collect())
}

/// Converts one engine value of `column` to JSON. Decimals become strings so that no
/// digit is lost, dates become `YYYY-MM-DD`, and instants become RFC 3339 text.
#[must_use]
pub fn scalar_to_json(table: &Table, column: &str, value: &Scalar) -> Value {
    match value {
        Scalar::Null => Value::Null,
        Scalar::Boolean(b) => Value::Bool(*b),
        Scalar::Int64(i) => Value::from(*i),
        Scalar::Float64(f) if f.is_infinite() => {
            Value::String(if *f > 0.0 { "inf" } else { "-inf" }.to_owned())
        }
        Scalar::Float64(f) => serde_json::Number::from_f64(*f).map_or(Value::Null, Value::Number),
        Scalar::Decimal(d) => {
            let scale = match column_type(table, column) {
                Ok(ColumnType::Decimal { scale, .. }) => i32::from(scale),
                _ => 0,
            };
            Value::String(exact_decimal(*d, scale))
        }
        Scalar::Utf8(t) => Value::String(t.clone()),
        Scalar::Date32(d) => Value::String(
            jiff::civil::date(1970, 1, 1)
                .checked_add(jiff::Span::new().days(i64::from(*d)))
                .map_or_else(|_| d.to_string(), |date| date.to_string()),
        ),
        Scalar::Timestamp(t) => match (
            jiff::Timestamp::from_microsecond(*t),
            column_type(table, column),
        ) {
            (Ok(ts), Ok(ColumnType::Timestamp { timezone: None })) => {
                Value::String(ts.to_zoned(jiff::tz::TimeZone::UTC).datetime().to_string())
            }
            (Ok(ts), _) => Value::String(ts.to_string()),
            (Err(_), _) => Value::from(*t),
        },
    }
}

/// Converts a group path from the engine to JSON values.
#[must_use]
pub fn path_to_json(table: &Table, group_by: &[String], path: &[Scalar]) -> Vec<Value> {
    path.iter()
        .zip(group_by)
        .map(|(s, column)| scalar_to_json(table, column, s))
        .collect()
}

impl Layout {
    /// Describes an engine configuration as a layout, for views the engine creates
    /// itself, such as drill-throughs. Measures and aggregate filters are not
    /// carried; flat views have none.
    #[must_use]
    pub fn from_flat_config(config: &ViewConfig, table: &Table) -> Self {
        let filters = config
            .filters
            .iter()
            .map(|f| {
                let one = |v: &Scalar| Some(scalar_to_json(table, &f.column, v));
                let (op, value, values) = match &f.op {
                    FilterOp::Eq(v) => (FilterOpName::Eq, one(v), Vec::new()),
                    FilterOp::Ne(v) => (FilterOpName::Ne, one(v), Vec::new()),
                    FilterOp::Lt(v) => (FilterOpName::Lt, one(v), Vec::new()),
                    FilterOp::Le(v) => (FilterOpName::Le, one(v), Vec::new()),
                    FilterOp::Gt(v) => (FilterOpName::Gt, one(v), Vec::new()),
                    FilterOp::Ge(v) => (FilterOpName::Ge, one(v), Vec::new()),
                    FilterOp::In(vs) => (
                        FilterOpName::In,
                        None,
                        vs.iter()
                            .map(|v| scalar_to_json(table, &f.column, v))
                            .collect(),
                    ),
                    FilterOp::NotIn(vs) => (
                        FilterOpName::NotIn,
                        None,
                        vs.iter()
                            .map(|v| scalar_to_json(table, &f.column, v))
                            .collect(),
                    ),
                    FilterOp::IsNull => (FilterOpName::IsNull, None, Vec::new()),
                    FilterOp::IsNotNull => (FilterOpName::IsNotNull, None, Vec::new()),
                    FilterOp::Contains(t) => (
                        FilterOpName::Contains,
                        Some(Value::String(t.clone())),
                        Vec::new(),
                    ),
                    FilterOp::NotContains(t) => (
                        FilterOpName::NotContains,
                        Some(Value::String(t.clone())),
                        Vec::new(),
                    ),
                    FilterOp::StartsWith(t) => (
                        FilterOpName::StartsWith,
                        Some(Value::String(t.clone())),
                        Vec::new(),
                    ),
                    FilterOp::EndsWith(t) => (
                        FilterOpName::EndsWith,
                        Some(Value::String(t.clone())),
                        Vec::new(),
                    ),
                };
                LayoutFilter {
                    column: f.column.clone(),
                    columns: f.or_columns.clone(),
                    op,
                    value,
                    values,
                }
            })
            .collect();
        Self {
            version: LAYOUT_VERSION,
            columns: config.columns.clone(),
            filters,
            sort: config
                .sort
                .iter()
                .map(|s| LayoutSort {
                    column: s.column.clone(),
                    descending: s.descending,
                })
                .collect(),
            formats: config
                .formats
                .iter()
                .map(|(c, f)| (c.clone(), LayoutFormat::from_engine(f)))
                .collect(),
            ..Self::default()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decimals_parse_exactly_or_not_at_all() {
        assert_eq!(parse_decimal("x", "123.45", 2).unwrap(), 12_345);
        assert_eq!(parse_decimal("x", "-0.5", 2).unwrap(), -50);
        assert_eq!(parse_decimal("x", "1e3", 2).unwrap(), 100_000);
        assert_eq!(parse_decimal("x", "1.250", 2).unwrap(), 125);
        assert_eq!(parse_decimal("x", "7", 0).unwrap(), 7);
        assert!(parse_decimal("x", "1.234", 2).is_err(), "would round");
        assert!(parse_decimal("x", "abc", 2).is_err());
        assert!(parse_decimal("x", "", 2).is_err());
        assert!(parse_decimal("x", "1e40", 2).is_err());
        assert!(
            parse_decimal("x", "1e2147483647", 2).is_err(),
            "hostile exponent"
        );
        assert!(parse_decimal("x", "1e-9223372036854775808", 2).is_err());
    }

    #[test]
    fn large_integers_arrive_as_strings() {
        let ty = ColumnType::Int64;
        assert_eq!(
            scalar("id", &ty, &Value::String("1152921504606846976".into())).unwrap(),
            Scalar::Int64(1 << 60)
        );
        assert!(scalar("id", &ty, &Value::String("1.5".into())).is_err());
    }

    #[test]
    fn microsecond_timestamps_round_trip_through_text() {
        let zoned = ColumnType::Timestamp {
            timezone: Some("UTC".into()),
        };
        let naive = ColumnType::Timestamp { timezone: None };
        assert_eq!(
            scalar(
                "t",
                &zoned,
                &Value::String("2026-11-01T05:30:00.123456Z".into())
            )
            .unwrap(),
            Scalar::Timestamp(1_793_511_000_123_456)
        );
        assert_eq!(
            scalar(
                "t",
                &naive,
                &Value::String("2026-11-01T01:30:00.123456".into())
            )
            .unwrap(),
            Scalar::Timestamp(1_793_496_600_123_456)
        );
    }

    #[test]
    fn decimals_format_exactly() {
        assert_eq!(exact_decimal(12_345, 2), "123.45");
        assert_eq!(exact_decimal(5, -2), "500");
        assert_eq!(exact_decimal(-5, 3), "-0.005");
        assert_eq!(exact_decimal(42, 0), "42");
    }

    #[test]
    fn a_version_1_layout_reads_as_version_2_with_nothing_new_set() {
        let v1 = r#"{"version":1,"dataset":"positions","group_by":["fund"],
            "measures":[{"column":"market_value_usd","aggregate":"sum"}],
            "filters":[{"column":"fund","op":"contains","value":"a"}],
            "chart":{"kind":"bar"}}"#;
        let layout = Layout::from_json(v1).unwrap();
        assert_eq!(layout.version, LAYOUT_VERSION);
        assert_eq!(layout.search, "");
        assert!(layout.pinned.is_empty() && layout.titles.is_empty() && layout.totals.is_empty());
        assert!(!layout.detail);
        assert!(layout.filters[0].columns.is_empty());
        // A pie is a ring, and bars and slices are labelled, unless they say
        // otherwise; version 1 had neither.
        let chart = layout.chart.unwrap();
        assert!(chart.donut && chart.labels);
    }

    #[test]
    fn layouts_round_trip_and_reject_the_future() {
        let json = r#"{"version":1,"group_by":["fund"],"measures":[{"column":"x","aggregate":"sum"}],
            "group_sort":{"by":{"measure":0},"descending":true},"top_n":{"n":5,"measure":0}}"#;
        let layout = Layout::from_json(json).unwrap();
        assert_eq!(layout.group_sort.by, GroupOrderName::Measure(0));
        assert!(layout.top_n.unwrap().other);
        assert_eq!(Layout::from_json(&layout.to_json()).unwrap(), layout);
        assert!(matches!(
            Layout::from_json(r#"{"version":99}"#),
            Err(LayoutError::Version(99))
        ));
        assert!(
            Layout::from_json(r#"{"version":1,"grup_by":[]}"#).is_err(),
            "unknown fields"
        );
    }

    #[test]
    fn indicators_take_defaults_and_refuse_unknown_fields() {
        let chart = |indicators: &str| {
            Layout::from_json(&format!(
                r#"{{"chart": {{"kind": "candlestick", "x": "date", "indicators": {indicators}}}}}"#
            ))
        };
        let layout =
            chart(r#"[{"kind": "macd"}, {"kind": "vwap"}, {"kind": "stochastic", "k": 9}]"#)
                .unwrap();
        assert_eq!(
            layout.chart.unwrap().indicators,
            vec![
                LayoutIndicator::Macd {
                    fast: 12,
                    slow: 26,
                    signal: 9
                },
                LayoutIndicator::Vwap {},
                LayoutIndicator::Stochastic {
                    k: 9,
                    k_smooth: 3,
                    d: 3
                },
            ]
        );
        // Unknown fields are errors in every variant, the fieldless ones too.
        for wrong in [
            r#"[{"kind": "vwap", "period": 5}]"#,
            r#"[{"kind": "volume", "column": "vol"}]"#,
            r#"[{"kind": "sma", "length": 5}]"#,
            r#"[{"kind": "vortex"}]"#,
        ] {
            assert!(chart(wrong).is_err(), "{wrong}");
        }
    }

    #[test]
    fn formats_round_trip_through_the_engine() {
        let mut formats = Vec::new();
        for decimals in [None, Some(0), Some(30)] {
            for thousands in [None, Some(false), Some(true)] {
                for (percent, abbreviate) in [
                    (false, None),
                    (true, None),
                    (false, Some(AbbreviationName::Thousands)),
                    (false, Some(AbbreviationName::Millions)),
                    (false, Some(AbbreviationName::Billions)),
                ] {
                    for negative in [NegativeName::Minus, NegativeName::Parentheses] {
                        for precision in [
                            PrecisionName::Seconds,
                            PrecisionName::Milliseconds,
                            PrecisionName::Microseconds,
                        ] {
                            for zone in [None, Some("Europe/London".to_owned())] {
                                formats.push(LayoutFormat {
                                    decimals,
                                    thousands,
                                    percent,
                                    abbreviate,
                                    suffixes: SuffixesName::Amount,
                                    bps: false,
                                    thirty_seconds: None,
                                    negative,
                                    zone,
                                    precision,
                                });
                            }
                        }
                    }
                }
            }
        }
        // The styles step 2.8 adds, each alone, and par suffixes on each
        // abbreviation.
        formats.push(LayoutFormat {
            bps: true,
            ..LayoutFormat::default()
        });
        for step in [
            ThirtySecondsName::ThirtySeconds,
            ThirtySecondsName::Halves,
            ThirtySecondsName::Quarters,
            ThirtySecondsName::Eighths,
        ] {
            formats.push(LayoutFormat {
                thirty_seconds: Some(step),
                negative: NegativeName::Parentheses,
                ..LayoutFormat::default()
            });
        }
        for abbreviate in [
            AbbreviationName::Thousands,
            AbbreviationName::Millions,
            AbbreviationName::Billions,
        ] {
            formats.push(LayoutFormat {
                abbreviate: Some(abbreviate),
                suffixes: SuffixesName::Par,
                ..LayoutFormat::default()
            });
        }
        for f in formats {
            assert_eq!(LayoutFormat::from_engine(&f.to_engine()), f);
        }
    }

    /// Layouts as this crate writes them: every default, and every field set. The
    /// web library's schema must read each one back unchanged.
    fn fixture_layouts() -> Vec<Value> {
        let full = r#"{
            "version": 2,
            "dataset": "positions",
            "parameters": {"as_of": "2026-11-02"},
            "columns": ["fund", "ticker"],
            "group_by": ["fund", "sector"],
            "split_by": ["asset_class"],
            "measures": [
                {"column": "market_value_usd", "aggregate": "sum", "unit_column": "currency",
                 "show_as": "percent_of_parent",
                 "format": {"decimals": 1, "thousands": false, "percent": true,
                            "negative": "parentheses", "zone": "Europe/London",
                            "precision": "milliseconds"}},
                {"column": "price_local", "aggregate": "percentile", "percentile": 0.9},
                {"column": "beta", "aggregate": "weighted_mean", "weight": "market_value_usd"},
                {"aggregate": "count_all"}
            ],
            "filters": [
                {"column": "fund", "op": "in", "values": ["Atlas", "Cobalt"]},
                {"column": "quantity", "op": "gt", "value": "1.5"},
                {"column": "sector", "op": "is_null"},
                {"column": "ticker", "op": "not_contains", "value": "X", "columns": ["fund", "sector"]},
                {"column": "ticker", "op": "ends_with", "value": "a"}
            ],
            "sort": [{"column": "fund", "descending": true}],
            "group_sort": {"by": {"measure": 0}, "descending": true},
            "having": [{"measure": 0, "op": "ge", "value": 1000.5}],
            "top_n": {"n": 10, "measure": 0, "largest": false, "other": true},
            "expand_depth": 2,
            "expanded": [{"path": ["Atlas", null, 1.5, true], "expanded": false}],
            "formats": {"quantity": {"abbreviate": "thousands"}, "trade_time": {"precision": "microseconds"}},
            "column_widths": {"fund": 180, "__tree": 300, "__measure:0": 120, "region": 0},
            "search": "atl",
            "pinned": ["ticker"],
            "titles": {"fund": "Fund", "market_value_usd": "Market value (USD)"},
            "totals": [{"column": "market_value_usd", "aggregate": "sum"},
                       {"column": "ticker", "aggregate": "distinct_count"}],
            "detail": true
        }"#;
        let chart = r#"{
            "dataset": "prices",
            "chart": {"kind": "line", "x": "date", "y": ["close"], "y_right": ["volume"],
                      "series": "ticker", "axis": "trading", "log_y": true, "stacked": true,
                      "horizontal": true, "range": {"from": 1200.5, "to": 1450.0}, "compare": true, "events": "event",
                      "hidden": ["volume AAPL"]}
        }"#;
        let candles = r#"{
            "dataset": "prices",
            "filters": [{"column": "ticker", "op": "eq", "value": "AAPL"}],
            "chart": {"kind": "candlestick", "x": "date",
                      "ohlc": {"open": "open", "high": "high", "low": "low", "close": "close"},
                      "volume": "volume",
                      "indicators": [{"kind": "sma"}, {"kind": "bollinger", "period": 10, "deviations": 1.5},
                                     {"kind": "rsi"}, {"kind": "macd", "fast": 5, "slow": 35, "signal": 5},
                                     {"kind": "atr"}, {"kind": "stochastic", "k": 9}, {"kind": "vwap"},
                                     {"kind": "volume"}, {"kind": "ema", "period": 50}, {"kind": "wma"}],
                      "drawings": [{"kind": "trend", "from": {"x": "2026-01-05", "y": 101.25}, "to": {"x": "2026-03-02", "y": 118}},
                                   {"kind": "horizontal", "y": 110.5},
                                   {"kind": "fibonacci", "from": {"x": "2026-01-05", "y": 90}, "to": {"x": "2026-02-02", "y": 120}},
                                   {"kind": "rectangle", "from": {"x": "2026-02-02", "y": 100}, "to": {"x": "2026-02-27", "y": 112}},
                                   {"kind": "note", "at": {"x": "2026-02-13", "y": 115}, "text": "Earnings: \"beat\""}]}
        }"#;
        [
            Layout::default(),
            Layout::from_json(full).unwrap(),
            Layout::from_json(chart).unwrap(),
            Layout::from_json(candles).unwrap(),
            Layout::from_json(r#"{"chart": {"kind": "bar"}}"#).unwrap(),
            Layout::from_json(r#"{"chart": {"kind": "pie", "donut": false}}"#).unwrap(),
            Layout::from_json(r#"{"chart": {"kind": "bar", "labels": false}}"#).unwrap(),
        ]
        .iter()
        .map(|l| serde_json::to_value(l).unwrap())
        .collect()
    }

    /// Compares a committed file with what this build generates, or rewrites it
    /// when `PARALLAX_UPDATE_FIXTURES` is set.
    fn check_generated(relative: &str, contents: &str) {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(relative);
        if std::env::var_os("PARALLAX_UPDATE_FIXTURES").is_some() {
            std::fs::write(&path, contents).unwrap();
            return;
        }
        let committed = std::fs::read_to_string(&path).unwrap_or_default();
        assert!(
            committed == contents,
            "{} is out of date; rerun with PARALLAX_UPDATE_FIXTURES=1",
            path.display()
        );
    }

    /// Layouts that set the fields roadmap step 2.8 adds. They are written to a
    /// file of their own, which only the React layer reads: the Angular layer,
    /// which step 2.7 deletes, reads `layouts.json` and knows none of them.
    fn fixture_layouts_2_8() -> Vec<Value> {
        let points = r#"{
            "dataset": "bonds",
            "chart": {"kind": "scatter", "x": "duration", "y": ["spread"], "series": "sector",
                      "size": "dv01_usd", "id": "cusip", "tooltip": ["issuer", "rating"],
                      "fit": "fitted_spread"}
        }"#;
        let orders = r#"{
            "dataset": "bonds",
            "group_by": ["rating", "tenor_bucket"],
            "split_by": ["sector"],
            "measures": [{"column": "dv01_usd", "aggregate": "sum"}],
            "orders": {"rating": "rating", "tenor_bucket": "tenor", "sector": {"values": ["Utilities", "Energy"]},
                       "issuer": {"by": "years_to_maturity"}, "ticker": "text"}
        }"#;
        let tenor = r#"{
            "dataset": "curves",
            "chart": {"kind": "line", "x": "tenor", "y": ["yield"], "series": "curve_date", "axis": "tenor",
                      "tenor_spacing": "length"}
        }"#;
        let formats = r#"{
            "dataset": "bonds",
            "formats": {"spread": {"bps": true, "decimals": 1},
                        "price": {"thirty_seconds": "halves", "negative": "parentheses"},
                        "par": {"abbreviate": "millions", "suffixes": "par"}}
        }"#;
        let waterfall = r#"{
            "dataset": "attribution",
            "group_by": ["factor"],
            "measures": [{"column": "pnl_usd", "aggregate": "sum"},
                         {"column": "pnl_usd", "aggregate": "sum", "show_as": "running_total"}],
            "orders": {"factor": {"values": ["Carry", "Roll-down", "Curve 2Y"]}},
            "chart": {"kind": "waterfall"}
        }"#;
        let sifma = r#"{
            "dataset": "yields",
            "chart": {"kind": "line", "x": "time", "y": ["yield"], "axis": "trading",
                      "calendar": "sifma", "session": {"opens": "18:00", "closes": "17:00"}}
        }"#;
        let reversed = r#"{
            "dataset": "yields",
            "chart": {"kind": "line", "x": "time", "y": ["yield"], "y_right": ["spread"], "reverse_y": true,
                      "reverse_y_right": true, "rising": "loss",
                      "panes": [{"columns": ["change"], "kind": "bar", "reverse": true}]}
        }"#;
        let overview = r#"{
            "dataset": "pnl",
            "titles": {"cumulative_pnl": "Cumulative P&L"},
            "chart": {"kind": "line", "x": "date", "y": ["cumulative_pnl"], "series": "portfolio",
                      "drawing_tools": false}
        }"#;
        let panes = r#"{
            "dataset": "curves",
            "filters": [{"column": "curve_date", "op": "in", "values": ["2026-11-30", "2026-11-23"]}],
            "formats": {"yield": {"percent": true, "decimals": 3}, "change": {"bps": true, "decimals": 1}},
            "chart": {"kind": "line", "x": "tenor", "y": ["yield"], "series": "curve_date", "axis": "tenor",
                      "panes": [{"columns": ["change"], "kind": "bar", "title": "Change"}]}
        }"#;
        [
            Layout::from_json(points).unwrap(),
            Layout::from_json(orders).unwrap(),
            Layout::from_json(tenor).unwrap(),
            Layout::from_json(formats).unwrap(),
            Layout::from_json(waterfall).unwrap(),
            Layout::from_json(sifma).unwrap(),
            Layout::from_json(panes).unwrap(),
            Layout::from_json(reversed).unwrap(),
            Layout::from_json(overview).unwrap(),
        ]
        .iter()
        .map(|l| serde_json::to_value(l).unwrap())
        .collect()
    }

    #[test]
    fn committed_schema_and_fixtures_are_current() {
        let schema = serde_json::to_string_pretty(&schema()).unwrap() + "\n";
        check_generated("../../schema/layout.schema.json", &schema);
        let fixtures = serde_json::to_string_pretty(&fixture_layouts()).unwrap() + "\n";
        check_generated("../../tests/fixtures/layouts.json", &fixtures);
        let additions = serde_json::to_string_pretty(&fixture_layouts_2_8()).unwrap() + "\n";
        check_generated("../../tests/fixtures/layouts-2.8.json", &additions);
    }

    #[test]
    fn drawing_tools_are_on_unless_turned_off() {
        let chart = |json: &str| Layout::from_json(json).unwrap().chart.unwrap();
        assert!(chart(r#"{"chart": {"kind": "line", "x": "a", "y": ["b"]}}"#).drawing_tools);
        let off = Layout::from_json(
            r#"{"chart": {"kind": "line", "x": "a", "y": ["b"], "drawing_tools": false}}"#,
        )
        .unwrap();
        assert!(!off.chart.as_ref().unwrap().drawing_tools);
        // Off is written, and read back the same.
        let json = off.to_json();
        assert!(json.contains("\"drawing_tools\":false"), "{json}");
        assert_eq!(Layout::from_json(&json).unwrap(), off);
    }

    #[test]
    fn fields_left_unset_are_left_out() {
        // A layout that sets none of step 2.8's fields is written as before, so
        // a reader that predates them reads it.
        let json = Layout::from_json(r#"{"chart": {"kind": "scatter", "x": "a", "y": ["b"]}}"#)
            .unwrap()
            .to_json();
        for field in [
            "\"size\"",
            "\"id\"",
            "\"tooltip\"",
            "\"fit\"",
            "\"calendar\"",
            "\"session\"",
            "\"panes\"",
            "\"reverse_y\"",
            "\"reverse_y_right\"",
            "\"rising\"",
            "\"reverse\"",
            "\"drawing_tools\"",
        ] {
            assert!(!json.contains(field), "{field} in {json}");
        }
        let json = Layout::from_json(r#"{"chart": {"kind": "line", "x": "a", "y": ["b"]}}"#)
            .unwrap()
            .to_json();
        for field in ["\"orders\"", "\"tenor_spacing\""] {
            assert!(!json.contains(field), "{field} in {json}");
        }
        let json = Layout::from_json(r#"{"formats": {"a": {"decimals": 1}}}"#)
            .unwrap()
            .to_json();
        for field in ["\"suffixes\"", "\"bps\"", "\"thirty_seconds\""] {
            assert!(!json.contains(field), "{field} in {json}");
        }
    }

    #[test]
    fn orders_read_as_names_or_objects_and_refuse_the_rest() {
        let layout = Layout::from_json(
            r#"{"orders": {"a": "tenor", "b": {"values": ["x", "y"]}, "c": {"by": "d"}}}"#,
        )
        .unwrap();
        assert_eq!(layout.orders["a"], LayoutOrder::Tenor);
        assert_eq!(
            layout.orders["b"],
            LayoutOrder::Values(vec!["x".into(), "y".into()])
        );
        assert_eq!(layout.orders["c"], LayoutOrder::By("d".into()));
        for wrong in [
            r#""alphabet""#,
            r#"{"by": 3}"#,
            r#"{"values": "x"}"#,
            r#"{"tenor": true}"#,
        ] {
            assert!(
                Layout::from_json(&format!(r#"{{"orders": {{"a": {wrong}}}}}"#)).is_err(),
                "{wrong}"
            );
        }
    }

    #[test]
    fn a_session_reads_as_hh_mm_on_a_trading_axis_only() {
        let chart = |extra: &str| {
            Layout::from_json(&format!(
                r#"{{"chart": {{"kind": "line", "x": "t", "y": ["y"], {extra}}}}}"#
            ))
            .unwrap()
            .chart
            .unwrap()
        };
        let session = chart(
            r#""axis": "trading", "calendar": "sifma", "session": {"opens": "18:00", "closes": "17:30"}"#,
        )
        .trading_session()
        .unwrap()
        .unwrap();
        assert!(session.overnight());
        assert_eq!(session.micros(), 23 * 3_600_000_000 + 1_800_000_000);
        for wrong in [
            r#""axis": "trading", "session": {"opens": "8:00", "closes": "17:00"}"#,
            r#""axis": "trading", "session": {"opens": "25:00", "closes": "17:00"}"#,
            r#""axis": "trading", "session": {"opens": "08:00", "closes": "5pm"}"#,
            r#""axis": "trading", "session": {"opens": "+8:00", "closes": "17:00"}"#,
            r#""axis": "trading", "session": {"opens": "08:00", "closes": "17:60"}"#,
            r#""calendar": "sifma""#,
        ] {
            assert!(chart(wrong).trading_session().is_err(), "{wrong}");
        }
    }

    #[test]
    fn panes_add_their_columns_and_refuse_what_they_cannot_draw() {
        let chart = |extra: &str| {
            Layout::from_json(&format!(
                r#"{{"chart": {{"kind": "line", "x": "tenor", "y": ["yield"], {extra}}}}}"#
            ))
            .unwrap()
            .chart
            .unwrap()
        };
        let curves = chart(
            r#""panes": [{"columns": ["change"], "kind": "bar"}, {"columns": ["spread", "basis"]}]"#,
        );
        curves.check_panes().unwrap();
        let engine = curves.to_engine(&[], &BTreeMap::new()).unwrap();
        assert_eq!(engine.y, ["yield", "change", "spread", "basis"]);
        assert_eq!(curves.panes[1].kind, PaneKindName::Line);
        let refused = |extra: &str, says: &str| {
            let error = chart(extra).check_panes().unwrap_err().to_string();
            assert!(error.contains(says), "{extra}: {error}");
        };
        refused(
            r#""panes": [{"columns": ["yield"]}]"#,
            "a column is drawn once",
        );
        refused(
            r#""panes": [{"columns": ["a"]}, {"columns": ["a"]}]"#,
            "a column is drawn once",
        );
        refused(r#""panes": [{"columns": []}]"#, "at least one column");
        refused(
            r#""compare": true, "panes": [{"columns": ["a"]}]"#,
            "use one or the other",
        );
        let bars =
            Layout::from_json(r#"{"chart": {"kind": "bar", "panes": [{"columns": ["a"]}]}}"#)
                .unwrap()
                .chart
                .unwrap();
        assert!(
            bars.check_panes()
                .unwrap_err()
                .to_string()
                .contains("line or area")
        );
    }

    #[test]
    fn reversed_axes_are_refused_where_the_chart_has_none() {
        let chart = |json: &str| Layout::from_json(json).unwrap().chart.unwrap();
        let yields = chart(
            r#"{"chart": {"kind": "line", "x": "t", "y": ["yield"], "reverse_y": true, "rising": "loss"}}"#,
        );
        yields.check_reversed().unwrap();
        assert_eq!(yields.rising, RisingName::Loss);
        for (json, says) in [
            (
                r#"{"chart": {"kind": "bar", "reverse_y": true}}"#,
                "line, area, scatter",
            ),
            (
                r#"{"chart": {"kind": "line", "x": "t", "y": ["a"], "reverse_y_right": true}}"#,
                "needs columns in y_right",
            ),
        ] {
            let error = chart(json).check_reversed().unwrap_err().to_string();
            assert!(error.contains(says), "{json}: {error}");
        }
    }
}
