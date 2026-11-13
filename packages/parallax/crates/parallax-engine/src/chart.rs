//! Charts, reduced to the screen before they leave the engine.
//!
//! A [`ChartView`] reads a table through a layout's filters, like any view, and
//! answers a request for an x range at a pixel size with no more than the screen
//! can show:
//!
//! - [`ChartKind::Line`] and [`ChartKind::Area`] series keep, in each pixel
//!   column, the first, lowest, highest and last point (M4). The line through
//!   them covers exactly the same pixels as the line through every point, so
//!   spikes never vanish, and a chart 2,000 pixels wide needs at most 8,000
//!   points per series however long the series is.
//! - [`ChartKind::Scatter`] sends each row in the range shown as a dot while
//!   there are at most [`MAX_POINTS`] of them, and becomes a density past that:
//!   counts in cells of a few pixels. A fit column, a curve the API fitted, is
//!   reduced like a line in either form.
//! - [`ChartKind::Histogram`] counts values in bins with stated edges.
//! - [`ChartKind::Candlestick`] and [`ChartKind::Ohlc`] bucket rows by a calendar
//!   interval cut in New York time, chosen so that candles stay a few pixels
//!   wide, and keep each bucket's first open, highest high, lowest low and last
//!   close.
//!
//! Bar charts and categorical heatmaps are grouped views, which already arrive
//! aggregated.
//!
//! The x axis is either the x values themselves or trading time, where closed
//! days and the hours outside the session take no space. Each reduced value
//! carries the slot of the row it came from, so callers can show its exact
//! value, and the x axis's ticks come with their labels.

use std::collections::BTreeMap;
use std::ops::Range;

use jiff::civil::{Date, DateTime};
use jiff::tz::TimeZone;

use crate::calendar::{Market, Session, TradingCalendar, epoch_days, from_epoch_days};
use crate::column::Column;
use crate::error::ConfigError;
use crate::exact::ExactSum;
use crate::filter::{CompiledFilter, Filter};
use crate::indicator::{Indicator, Inputs};
use crate::order::{Order, Orders, tenor_years};
use crate::table::Table;
use crate::types::{ColumnType, Key, Scalar};

/// What a chart draws.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChartKind {
    /// Lines through each series.
    Line,
    /// Lines through each series, filled down to zero.
    Area,
    /// Points: each row as a dot up to [`MAX_POINTS`] in the range shown, and a
    /// density past that.
    Scatter,
    /// Counts of the x values in bins.
    Histogram,
    /// Candles of each bucket's open, high, low and close.
    Candlestick,
    /// Bars of each bucket's open, high, low and close.
    Ohlc,
}

/// How x values are placed along the axis.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum XAxis {
    /// By value: an instant, a date or a number.
    #[default]
    Value,
    /// By trading time on the chart's market's calendar, NYSE's unless it names
    /// another: closed days and the hours outside the session take no space.
    Trading,
    /// By tenor: text such as `3M` and `10Y`, or a number of years.
    Tenor(TenorSpacing),
}

/// How a tenor axis spaces tenors.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum TenorSpacing {
    /// The standard tenors of [`TENOR_KNOTS`] one step apart, and a tenor
    /// between two of them placed between them by length.
    #[default]
    Even,
    /// By length in years.
    Length,
}

/// The tenors a tenor axis is labelled with, in years and as written: an even
/// axis puts each one step from the next.
pub const TENOR_KNOTS: [(f64, &str); 14] = [
    (0.0, "0"),
    (1.0 / 12.0, "1M"),
    (0.25, "3M"),
    (0.5, "6M"),
    (1.0, "1Y"),
    (2.0, "2Y"),
    (3.0, "3Y"),
    (5.0, "5Y"),
    (7.0, "7Y"),
    (10.0, "10Y"),
    (20.0, "20Y"),
    (30.0, "30Y"),
    (50.0, "50Y"),
    (100.0, "100Y"),
];

/// The fewest pixels between a tenor axis's labels.
pub const TENOR_TICK_GAP: f64 = 36.0;

/// A tenor's place on an axis spaced `spacing`, from its length in years.
#[must_use]
pub fn tenor_position(years: f64, spacing: TenorSpacing) -> f64 {
    match spacing {
        TenorSpacing::Length => years,
        TenorSpacing::Even => {
            // The segment between the knots either side; past the last, the last
            // segment carries on.
            let after = TENOR_KNOTS
                .iter()
                .position(|k| k.0 >= years)
                .unwrap_or(TENOR_KNOTS.len() - 1)
                .max(1);
            let (low, high) = (TENOR_KNOTS[after - 1].0, TENOR_KNOTS[after].0);
            (after - 1) as f64 + (years - low) / (high - low)
        }
    }
}

/// The price columns of a candlestick or OHLC chart.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OhlcColumns {
    /// The opening price.
    pub open: String,
    /// The highest price.
    pub high: String,
    /// The lowest price.
    pub low: String,
    /// The closing price.
    pub close: String,
}

/// The columns a scatter plot draws its dots with, beside its x and y.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PointColumns {
    /// A numeric column whose magnitude sets each dot's area, such as DV01.
    pub size: Option<String>,
    /// The column naming each dot, such as a bond's CUSIP.
    pub id: Option<String>,
    /// More columns a dot's tooltip lists.
    pub tooltip: Vec<String>,
    /// A numeric column holding a fitted curve's value at each row's x, drawn
    /// as a line through each series.
    pub fit: Option<String>,
}

impl PointColumns {
    /// Whether any is set.
    #[must_use]
    pub fn any(&self) -> bool {
        self.size.is_some() || self.id.is_some() || !self.tooltip.is_empty() || self.fit.is_some()
    }
}

/// What a chart shows.
#[derive(Clone, Debug, PartialEq)]
pub struct ChartConfig {
    /// What it draws.
    pub kind: ChartKind,
    /// The x column: an instant, a date or a number. A histogram bins it.
    pub x: String,
    /// The plotted columns of line, area and scatter charts; a scatter plot uses
    /// the first.
    pub y: Vec<String>,
    /// A column whose values split every plotted column into series, such as the
    /// ticker.
    pub series: Option<String>,
    /// The price columns of candlestick and OHLC charts.
    pub ohlc: Option<OhlcColumns>,
    /// Row filters.
    pub filters: Vec<Filter>,
    /// How x values are placed.
    pub axis: XAxis,
    /// Indicators computed over every row of each series before reduction.
    pub indicators: Vec<Indicator>,
    /// The volume column, which a VWAP and volume read.
    pub volume: Option<String>,
    /// Each series as its percentage change from its first value in the range
    /// shown, so that series of different prices can be compared.
    pub compare: bool,
    /// A column whose non-null values mark rows as events, such as earnings.
    pub events: Option<String>,
    /// A scatter's size, id, tooltip and fit columns.
    pub points: PointColumns,
    /// Orders of text columns, which the series follow.
    pub orders: BTreeMap<String, Order>,
    /// The market a trading-time axis follows.
    pub market: Market,
    /// A trading-time axis's session, the market's regular session if `None`.
    pub session: Option<Session>,
}

impl ChartConfig {
    /// The column price indicators read: a candle's close, or a line's first
    /// plotted column.
    #[must_use]
    pub fn indicator_price(&self) -> Option<&str> {
        self.ohlc
            .as_ref()
            .map(|o| o.close.as_str())
            .or_else(|| self.y.first().map(String::as_str))
    }
}

/// The part of a chart to reduce, and the pixels it fills.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ChartRequest {
    /// The x range in axis positions, or the whole data when absent.
    pub x: Option<(f64, f64)>,
    /// The y range of a density, or the whole data when absent.
    pub y: Option<(f64, f64)>,
    /// The plot's width in pixels.
    pub width: u32,
    /// The plot's height in pixels.
    pub height: u32,
}

/// Pixels per density cell side.
pub const DENSITY_CELL: u32 = 4;
/// The most rows a scatter plot sends as dots, in the range shown; past this it
/// becomes a density.
pub const MAX_POINTS: usize = 5_000;
/// The narrowest candle, in pixels: the bucket interval grows until candles are
/// at least this wide.
pub const MIN_CANDLE: u32 = 4;
/// Pixels per histogram bin.
pub const BIN_WIDTH: u32 = 8;
/// Pixels between x-axis ticks, roughly.
pub const TICK_SPACING: u32 = 100;

/// A series of a chart: one plotted column, for one value of the series column.
#[derive(Clone, Debug, PartialEq)]
pub struct Series {
    /// The plotted column, by index in [`ChartConfig::y`].
    pub y: usize,
    /// The series column's value, or `None` without a series column.
    pub key: Option<Scalar>,
}

/// A point that survived reduction, or a break in the line where values are
/// missing.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Point {
    /// The x position on the axis.
    pub x: f64,
    /// The y value, or NaN at a break.
    pub y: f64,
    /// The row it came from, or `None` at a break.
    pub slot: Option<usize>,
}

/// A row of a scatter plot, drawn as a dot.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Dot {
    /// The x position on the axis.
    pub x: f64,
    /// The y value.
    pub y: f64,
    /// The row.
    pub slot: usize,
    /// The size column's magnitude as a share of its largest in the whole
    /// chart, in `0..=1`, or `None` without a size column or a value. A dot's
    /// area follows it, so zooming keeps a dot's size.
    pub size: Option<f64>,
}

/// One calendar bucket of a candlestick or OHLC chart, by the rows that give its
/// prices. A price no row of the bucket has is `None`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Candle {
    /// The first row with an open, by time and then insertion order.
    pub open: Option<usize>,
    /// The row with the highest high; the first such on ties.
    pub high: Option<usize>,
    /// The row with the lowest low; the first such on ties.
    pub low: Option<usize>,
    /// The last row with a close.
    pub close: Option<usize>,
}

/// A calendar bucket and where it spans on the axis.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Bucket {
    /// The bucket's start as an x value: days since the epoch for dates,
    /// microseconds for instants.
    pub start: i64,
    /// The next bucket's start, which this bucket stops short of, as an x value.
    pub end: i64,
    /// The axis position of the bucket's start.
    pub from: f64,
    /// The axis position of the next bucket's start.
    pub to: f64,
}

/// A bucket interval for candles.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Interval {
    /// Minutes, for instants.
    Minutes(u32),
    /// Days.
    Day,
    /// Weeks starting on Monday.
    Week,
    /// Calendar months.
    Month,
    /// Calendar quarters.
    Quarter,
    /// Calendar years.
    Year,
    /// A number of calendar years, starting in years divisible by it, for ticks
    /// over long ranges.
    Years(u16),
}

/// A tick on the x axis.
#[derive(Clone, Debug, PartialEq)]
pub struct Tick {
    /// Its axis position.
    pub x: f64,
    /// Its label.
    pub label: String,
}

/// A reduced chart.
#[derive(Clone, Debug, PartialEq)]
pub enum ChartData {
    /// Line and area series.
    Series(Vec<(Series, Vec<Point>)>),
    /// A scatter's rows in the range shown, as dots, per series in the series'
    /// order and each in x order.
    Points {
        /// The y range the dots span.
        y: (f64, f64),
        /// Each series' key, or `None` without a series column, and its dots.
        series: Vec<(Option<Scalar>, Vec<Dot>)>,
    },
    /// A density of points: `counts[row * columns + column]`, with row 0 at the
    /// bottom.
    Density {
        /// The x range the cells span.
        x: (f64, f64),
        /// The y range the cells span.
        y: (f64, f64),
        /// Cells across.
        columns: u32,
        /// Cells up.
        rows: u32,
        /// Points per cell.
        counts: Vec<u32>,
    },
    /// Bin edges and the counts in each bin, per series. The last bin includes
    /// its upper edge.
    Histogram {
        /// `bins + 1` edges, ascending.
        edges: Vec<f64>,
        /// Counts per series, one per bin.
        counts: Vec<(Option<Scalar>, Vec<u64>)>,
    },
    /// Candles in x order.
    Candles {
        /// The bucket interval chosen.
        interval: Interval,
        /// Each bucket's span and the rows giving its prices.
        candles: Vec<(Bucket, Candle)>,
        /// Each bucket's total volume when the chart shows volume, one per
        /// candle; empty otherwise.
        volumes: Vec<BucketVolume>,
    },
}

/// A candle bucket's total volume, summed exactly.
#[derive(Clone, Debug, PartialEq)]
pub enum BucketVolume {
    /// No row of the bucket has a volume.
    None,
    /// The total, in the volume column's type.
    Total(Scalar),
    /// The exact total does not fit the column's type: beyond 64 bits for
    /// integers, 38 digits for decimals, or the largest double.
    Overflow,
}

/// The change from `base` to `value` as a percentage of the base's size, so that
/// a loss growing from -100 to -200 reads as a fall of 100 %, not a rise.
#[must_use]
pub fn percent_change(base: f64, value: f64) -> f64 {
    (value - base) / base.abs() * 100.0
}

/// The most events a reduced chart carries; more are thinned evenly.
pub const MAX_EVENTS: usize = 500;

/// A row an events column marks.
#[derive(Clone, Debug, PartialEq)]
pub struct EventPoint {
    /// Its axis position.
    pub x: f64,
    /// The row.
    pub slot: usize,
    /// The series column's value, or `None` without a series column.
    pub key: Option<Scalar>,
}

/// Two rows of a series, measured: the rows nearest two places on the axis that
/// have a price, earlier first, and the rows from one to the other.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Measured {
    /// The earlier row.
    pub from: usize,
    /// The later row.
    pub to: usize,
    /// Their axis positions.
    pub from_x: f64,
    /// The later row's axis position.
    pub to_x: f64,
    /// The price column.
    pub price: usize,
    /// Rows with a price after the earlier, up to and including the later.
    pub rows: usize,
}

/// An indicator's lines for one series, reduced like the series themselves.
#[derive(Clone, Debug, PartialEq)]
pub struct IndicatorLines {
    /// The indicator, by index in [`ChartConfig::indicators`].
    pub indicator: usize,
    /// The series column's value, or `None` without a series column.
    pub key: Option<Scalar>,
    /// Each line, named as in [`Indicator::lines`]. A point's slot is the row
    /// the value was computed at.
    pub lines: Vec<(&'static str, Vec<Point>)>,
}

/// A reduced chart and its x axis.
#[derive(Clone, Debug, PartialEq)]
pub struct Reduced {
    /// The data.
    pub data: ChartData,
    /// The x range shown, in axis positions.
    pub x: (f64, f64),
    /// The data's whole x range, in axis positions, which zooming and panning
    /// stay within: the range shown when the request names none.
    pub extent: (f64, f64),
    /// The x axis's ticks.
    pub ticks: Vec<Tick>,
    /// The indicators' lines, per series, in the order of
    /// [`ChartConfig::indicators`]. Volume is in [`ChartData::Candles`] instead.
    pub indicators: Vec<IndicatorLines>,
    /// The rows the events column marks in the range shown, in x order, at most
    /// [`MAX_EVENTS`] of them.
    pub events: Vec<EventPoint>,
    /// How many rows it marks in the range shown, all told.
    pub events_total: usize,
    /// A scatter's fit line per series, reduced with M4, in the series' order;
    /// empty without a fit column.
    pub fits: Vec<(Option<Scalar>, Vec<Point>)>,
}

/// How the x column's values become axis positions.
#[derive(Clone, Debug)]
enum Placement {
    /// Numbers as they are; a decimal's unscaled value over `10^scale`.
    Number { scale: Option<i8> },
    /// Days since the epoch.
    Date,
    /// Microseconds since the epoch.
    Instant,
    /// Trading days on the calendar.
    TradingDate(TradingCalendar),
    /// Microseconds of open market on the calendar.
    TradingInstant(TradingCalendar),
    /// Tenors, from a number of years or text such as `3M`: each dictionary
    /// code's place, NaN for text that is not a tenor, refreshed as loads add
    /// strings.
    Tenor {
        spacing: TenorSpacing,
        scale: Option<i8>,
        text: bool,
        places: Vec<f64>,
    },
}

impl Placement {
    fn new(ty: &ColumnType, config: &ChartConfig) -> Result<Self, ConfigError> {
        let (axis, column) = (config.axis, config.x.as_str());
        let calendar = || TradingCalendar::new(config.market, config.session);
        let wrong = || ConfigError::ChartColumn {
            role: match axis {
                XAxis::Value => "x axis".into(),
                XAxis::Trading => "trading-time x axis".into(),
                XAxis::Tenor(_) => "tenor x axis, which takes text such as 3M or years".into(),
            },
            column: column.to_owned(),
            data_type: ty.to_arrow().to_string(),
        };
        Ok(match (ty, axis) {
            (ColumnType::Int64 | ColumnType::Float64, XAxis::Value) => Self::Number { scale: None },
            (ColumnType::Decimal { scale, .. }, XAxis::Value) => Self::Number {
                scale: Some(*scale),
            },
            (ColumnType::Date32, XAxis::Value) => Self::Date,
            (ColumnType::Timestamp { .. }, XAxis::Value) => Self::Instant,
            (ColumnType::Date32, XAxis::Trading) => Self::TradingDate(calendar()),
            (ColumnType::Timestamp { .. }, XAxis::Trading) => Self::TradingInstant(calendar()),
            (ColumnType::Utf8, XAxis::Tenor(spacing)) => Self::Tenor {
                spacing,
                scale: None,
                text: true,
                places: Vec::new(),
            },
            (ColumnType::Int64 | ColumnType::Float64, XAxis::Tenor(spacing)) => Self::Tenor {
                spacing,
                scale: None,
                text: false,
                places: Vec::new(),
            },
            (ColumnType::Decimal { scale, .. }, XAxis::Tenor(spacing)) => Self::Tenor {
                spacing,
                scale: Some(*scale),
                text: false,
                places: Vec::new(),
            },
            _ => return Err(wrong()),
        })
    }

    /// A text tenor axis's places for every string of the column, after a load.
    fn refresh(&mut self, column: &Column) {
        if let Self::Tenor {
            spacing,
            text: true,
            places,
            ..
        } = self
            && let Some(dictionary) = column.dictionary()
        {
            *places = (0..dictionary.len() as u32)
                .map(|code| {
                    tenor_years(dictionary.get(code))
                        .map_or(f64::NAN, |years| tenor_position(years, *spacing))
                })
                .collect();
        }
    }

    /// The axis position of a key of the x column, or `None` for a null or NaN,
    /// or a date or instant outside [`CHART_DAYS`], which the grid shows as out
    /// of range and a chart leaves out as it does a null.
    fn position(&self, key: Key) -> Option<f64> {
        let position = match (self, key) {
            (_, Key::Null) => return None,
            (_, Key::Date(d)) if !CHART_DAYS.contains(&d) => return None,
            (_, Key::Ts(t)) if !CHART_DAYS.contains(&utc_day(t)) => return None,
            (Self::Number { scale }, Key::Int(_) | Key::Float(_) | Key::Decimal(_)) => {
                crate::aggregate::key_to_f64(key, scale.unwrap_or(0))
            }
            (Self::Date, Key::Date(d)) => f64::from(d),
            (Self::Instant, Key::Ts(t)) => t as f64,
            (Self::TradingDate(c), Key::Date(d)) => c.date_position(d),
            (Self::TradingInstant(c), Key::Ts(t)) => c.instant_position(t),
            (Self::Tenor { places, .. }, Key::Str(code)) => {
                places.get(code as usize).copied().unwrap_or(f64::NAN)
            }
            (Self::Tenor { spacing, scale, .. }, Key::Int(_) | Key::Float(_) | Key::Decimal(_)) => {
                tenor_position(
                    crate::aggregate::key_to_f64(key, scale.unwrap_or(0)),
                    *spacing,
                )
            }
            _ => return None,
        };
        position.is_finite().then_some(position)
    }
}

/// The days a chart places a date or instant on, those of a trading calendar,
/// years 1232 to 4707: inside jiff's range with room to spare, so that a
/// bucket, a tick or a session around any of them is a date jiff can hold.
const CHART_DAYS: std::ops::RangeInclusive<i32> = crate::calendar::TRADING_DAYS;

/// The UTC day an instant falls on, in days since the epoch.
fn utc_day(micros: i64) -> i32 {
    i32::try_from(micros.div_euclid(86_400_000_000)).unwrap_or(i32::MAX)
}

/// A numeric column's value at `slot` as a double, a decimal correctly rounded,
/// or `None` for a null, a NaN or a column that is not numeric.
#[must_use]
pub fn number(column: &Column, slot: usize) -> Option<f64> {
    y_value(column, slot)
}

/// The y value of a slot as a double, or `None` for a null or NaN.
fn y_value(column: &Column, slot: usize) -> Option<f64> {
    let scale = match column.column_type() {
        ColumnType::Decimal { scale, .. } => *scale,
        _ => 0,
    };
    let value = crate::aggregate::key_to_f64(column.key(slot), scale);
    value.is_finite().then_some(value)
}

/// An x key's own value, which orders rows that share an axis position: instants
/// outside the session all take its edge on a trading-time axis.
fn x_order(key: Key) -> i128 {
    match key {
        Key::Int(v) | Key::Ts(v) => i128::from(v),
        Key::Date(d) => i128::from(d),
        Key::Decimal(v) => v,
        Key::Float(bits) => i128::from(bits),
        _ => 0,
    }
}

/// Checks that a chart can compute its indicators: their parameters, that it is
/// a kind that draws them, and that it has the columns they read.
fn check_indicators(config: &ChartConfig, has_volume: bool) -> Result<(), ConfigError> {
    let candles = matches!(config.kind, ChartKind::Candlestick | ChartKind::Ohlc);
    let lines = matches!(config.kind, ChartKind::Line | ChartKind::Area);
    for indicator in &config.indicators {
        indicator.check()?;
        let fits = match indicator.inputs() {
            Inputs::Price => candles || lines,
            Inputs::Range | Inputs::RangeAndVolume | Inputs::Volume => candles,
        };
        if !fits {
            let needs = if indicator.inputs() == Inputs::Price {
                "a line, area, candlestick or OHLC chart"
            } else {
                "a candlestick or OHLC chart, which has the high, low and close"
            };
            return Err(ConfigError::Chart(format!(
                "{} needs {needs}",
                indicator.name()
            )));
        }
        if matches!(indicator.inputs(), Inputs::RangeAndVolume | Inputs::Volume) && !has_volume {
            return Err(ConfigError::MissingChartColumns(format!(
                "volume, which {} reads",
                indicator.name()
            )));
        }
    }
    Ok(())
}

/// Checks that compare mode is on a line or area chart without averages or
/// bands, which are in prices, and that events are on a kind drawn along an x
/// axis.
fn check_compare_and_events(config: &ChartConfig) -> Result<(), ConfigError> {
    let lines = matches!(config.kind, ChartKind::Line | ChartKind::Area);
    if config.compare && !lines {
        return Err(ConfigError::Chart(
            "compare mode puts series on a line or area chart as percentage changes".into(),
        ));
    }
    let priced = config.indicators.iter().find(|i| {
        matches!(
            i,
            Indicator::Sma { .. }
                | Indicator::Ema { .. }
                | Indicator::Wma { .. }
                | Indicator::Bollinger { .. }
        )
    });
    if let Some(indicator) = priced.filter(|_| config.compare) {
        return Err(ConfigError::Chart(format!(
            "compare mode shows percentage changes, so {} in prices would not match its axis",
            indicator.name()
        )));
    }
    let along_x = lines || matches!(config.kind, ChartKind::Candlestick | ChartKind::Ohlc);
    if config.events.is_some() && !along_x {
        return Err(ConfigError::Chart(
            "events mark line, area, candlestick and OHLC charts".into(),
        ));
    }
    Ok(())
}

fn numeric(ty: &ColumnType) -> bool {
    matches!(
        ty,
        ColumnType::Int64 | ColumnType::Float64 | ColumnType::Decimal { .. }
    )
}

/// Rows of one series in x order: their x positions and slots.
#[derive(Clone, Debug, Default)]
struct Ordered {
    x: Vec<f64>,
    slots: Vec<usize>,
}

impl Ordered {
    /// The rows whose x position lies in `from..=to`, plus the nearest row on
    /// each side, so that lines run to the plot's edges.
    fn around(&self, from: f64, to: f64) -> Range<usize> {
        let start = self.x.partition_point(|&x| x < from);
        let end = self.x.partition_point(|&x| x <= to);
        start.saturating_sub(1)..(end + 1).min(self.x.len())
    }

    fn within(&self, from: f64, to: f64) -> Range<usize> {
        self.x.partition_point(|&x| x < from)..self.x.partition_point(|&x| x <= to)
    }
}

/// One series' inputs of one kind: the rows that have all of them, by place in
/// the series, their values, and for a VWAP where its sessions start.
#[derive(Clone, Debug)]
struct Gathered {
    inputs: Inputs,
    rows: Vec<usize>,
    columns: Vec<Vec<f64>>,
    sessions: Vec<usize>,
}

impl Gathered {
    fn series(&self) -> crate::indicator::Series<'_> {
        match self.inputs {
            Inputs::Price => crate::indicator::Series {
                price: &self.columns[0],
                ..Default::default()
            },
            _ => crate::indicator::Series {
                high: &self.columns[0],
                low: &self.columns[1],
                close: &self.columns[2],
                volume: self.columns.get(3).map_or(&[][..], Vec::as_slice),
                sessions: &self.sessions,
                ..Default::default()
            },
        }
    }
}

/// An indicator's lines for one series, one value per row of the inputs it
/// read, NaN where it has none.
#[derive(Clone, Debug, Default)]
struct Computed {
    /// The inputs, by index among the series' [`Gathered`].
    gathered: usize,
    lines: Vec<Vec<f64>>,
}

/// A bucket's total volume, summed exactly in the column's own type.
#[derive(Clone, Debug, Default)]
struct VolumeSum {
    integers: Option<i128>,
    floats: ExactSum,
    any: bool,
}

impl VolumeSum {
    fn add(&mut self, column: &Column, slot: usize) {
        match column.key(slot) {
            Key::Int(v) => self.add_integer(i128::from(v)),
            Key::Decimal(v) => self.add_integer(v),
            _ => match y_value(column, slot) {
                Some(v) => self.floats.add(v),
                None => return,
            },
        }
        self.any = true;
    }

    fn add_integer(&mut self, v: i128) {
        // None once the total has overflowed, and from then on.
        let total = if self.any { self.integers } else { Some(0) };
        self.integers = total.and_then(|t| t.checked_add(v));
    }

    fn total(&self, column: &Column) -> BucketVolume {
        if !self.any {
            return BucketVolume::None;
        }
        let total = match column.column_type() {
            ColumnType::Int64 => self
                .integers
                .and_then(|t| i64::try_from(t).ok())
                .map(Scalar::Int64),
            ColumnType::Decimal { .. } => self
                .integers
                .filter(|t| t.abs() <= crate::aggregate::MAX_DECIMAL_38)
                .map(Scalar::Decimal),
            _ => Some(self.floats.value())
                .filter(|v| v.is_finite())
                .map(Scalar::Float64),
        };
        total.map_or(BucketVolume::Overflow, BucketVolume::Total)
    }
}

/// A chart of a table.
#[derive(Clone, Debug)]
pub struct ChartView {
    config: ChartConfig,
    filters: Vec<CompiledFilter>,
    x: usize,
    placement: Placement,
    y: Vec<usize>,
    series: Option<usize>,
    ohlc: Option<[usize; 4]>,
    volume: Option<usize>,
    events: Option<usize>,
    /// A scatter's size and fit columns.
    size: Option<usize>,
    fit: Option<usize>,
    /// The size column's largest magnitude among the chart's rows, which a
    /// dot's size is a share of.
    size_max: f64,
    /// The orders of text columns, which the series follow.
    orders: Orders,
    /// Rows by series key, each in x order.
    rows: Vec<(Option<Key>, Ordered)>,
    /// Each series' inputs to its indicators, gathered once per kind.
    gathered: Vec<Vec<Gathered>>,
    /// Each series' indicators, in the order of the configuration's.
    computed: Vec<Vec<Computed>>,
    load_version: u64,
}

impl ChartView {
    /// Opens a chart of `table`.
    ///
    /// # Errors
    ///
    /// Returns an error if the configuration names unknown columns, or columns of
    /// the wrong type for the chart.
    pub fn new(table: &Table, config: ChartConfig) -> Result<Self, ConfigError> {
        check_compare_and_events(&config)?;
        let index = |name: &str| {
            table
                .column_index(name)
                .ok_or_else(|| ConfigError::UnknownColumn(name.to_owned()))
        };
        let numeric_column = |name: &str, role: &str| -> Result<usize, ConfigError> {
            let i = index(name)?;
            let ty = table.column(i).column_type();
            if numeric(ty) {
                Ok(i)
            } else {
                Err(ConfigError::ChartColumn {
                    role: role.to_owned(),
                    column: name.to_owned(),
                    data_type: ty.to_arrow().to_string(),
                })
            }
        };
        let filters = config
            .filters
            .iter()
            .map(|f| CompiledFilter::compile(table, f))
            .collect::<Result<Vec<_>, _>>()?;
        let x = index(&config.x)?;
        let placement = Placement::new(table.column(x).column_type(), &config)?;
        let y = config
            .y
            .iter()
            .map(|c| numeric_column(c, "y axis"))
            .collect::<Result<Vec<_>, _>>()?;
        let ohlc = match &config.ohlc {
            Some(o) => Some([
                numeric_column(&o.open, "open price")?,
                numeric_column(&o.high, "high price")?,
                numeric_column(&o.low, "low price")?,
                numeric_column(&o.close, "close price")?,
            ]),
            None => None,
        };
        let needs_y = matches!(
            config.kind,
            ChartKind::Line | ChartKind::Area | ChartKind::Scatter
        );
        if needs_y && y.is_empty() {
            return Err(ConfigError::MissingChartColumns("y".into()));
        }
        if matches!(config.kind, ChartKind::Candlestick | ChartKind::Ohlc) && ohlc.is_none() {
            return Err(ConfigError::MissingChartColumns(
                "open, high, low and close".into(),
            ));
        }
        let candles = matches!(config.kind, ChartKind::Candlestick | ChartKind::Ohlc);
        if candles
            && matches!(
                placement,
                Placement::Number { .. } | Placement::Tenor { .. }
            )
        {
            return Err(ConfigError::ChartColumn {
                role: "x axis of a candlestick or OHLC chart, which buckets by calendar".into(),
                column: config.x.clone(),
                data_type: table.column(x).column_type().to_arrow().to_string(),
            });
        }
        if candles && !config.y.is_empty() {
            return Err(ConfigError::Chart(
                "a candlestick or OHLC chart draws its prices only; plot other columns in a chart of their own".into(),
            ));
        }
        if candles && config.series.is_some() {
            return Err(ConfigError::Chart(
                "a candlestick or OHLC chart shows one instrument; filter to it instead of splitting by a series column".into(),
            ));
        }
        if config.kind == ChartKind::Histogram && !matches!(placement, Placement::Number { .. }) {
            return Err(ConfigError::ChartColumn {
                role: "binned column of a histogram".into(),
                column: config.x.clone(),
                data_type: table.column(x).column_type().to_arrow().to_string(),
            });
        }
        let series = config.series.as_deref().map(index).transpose()?;
        let volume = config
            .volume
            .as_deref()
            .map(|c| numeric_column(c, "volume"))
            .transpose()?;
        check_indicators(&config, volume.is_some())?;
        let events = config.events.as_deref().map(index).transpose()?;
        let points = &config.points;
        if points.any() && config.kind != ChartKind::Scatter {
            return Err(ConfigError::Chart(
                "size, id, tooltip and fit draw a scatter plot's dots, which other kinds have none of".into(),
            ));
        }
        let size = points
            .size
            .as_deref()
            .map(|c| numeric_column(c, "size of a scatter's dots"))
            .transpose()?;
        let fit = points
            .fit
            .as_deref()
            .map(|c| numeric_column(c, "fitted curve of a scatter"))
            .transpose()?;
        for column in points.id.iter().chain(&points.tooltip) {
            index(column)?;
        }
        let orders = Orders::compile(table, &config.orders)?;
        let mut view = Self {
            config,
            filters,
            x,
            placement,
            y,
            series,
            ohlc,
            volume,
            events,
            size,
            fit,
            size_max: 0.0,
            orders,
            rows: Vec::new(),
            gathered: Vec::new(),
            computed: Vec::new(),
            load_version: table.load_version(),
        };
        view.rebuild(table);
        Ok(view)
    }

    /// The configuration.
    #[must_use]
    pub fn config(&self) -> &ChartConfig {
        &self.config
    }

    /// The table load this chart reflects.
    #[must_use]
    pub fn load_version(&self) -> u64 {
        self.load_version
    }

    /// Recomputes the chart's rows from the table.
    pub fn rebuild(&mut self, table: &Table) {
        self.load_version = table.load_version();
        self.orders.refresh(table);
        self.placement.refresh(table.column(self.x));
        for filter in &mut self.filters {
            filter.prepare(table, true);
        }
        let x = table.column(self.x);
        // Each row's position, its own x value, insertion number and slot.
        type Placed = (f64, i128, u64, usize);
        let mut by_key: rustc_hash::FxHashMap<Option<Key>, Vec<Placed>> =
            rustc_hash::FxHashMap::default();
        for slot in table.live_slots() {
            if !self.filters.iter().all(|f| f.passes_table(table, slot)) {
                continue;
            }
            let x_key = x.key(slot);
            let Some(position) = self.placement.position(x_key) else {
                continue;
            };
            let key = self.series.map(|s| table.column(s).key(slot));
            by_key
                .entry(key)
                .or_default()
                .push((position, x_order(x_key), table.seq(slot), slot));
        }
        let mut rows: Vec<(Option<Key>, Ordered)> = by_key
            .into_iter()
            .map(|(key, mut points)| {
                // By position, then by the value itself, then by insertion.
                points.sort_unstable_by(|a, b| {
                    a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)).then(a.2.cmp(&b.2))
                });
                let ordered = Ordered {
                    x: points.iter().map(|p| p.0).collect(),
                    slots: points.iter().map(|p| p.3).collect(),
                };
                (key, ordered)
            })
            .collect();
        // Series in the order of their keys, the column's own if it has one,
        // nulls last.
        if let Some(s) = self.series {
            let orders = &self.orders;
            rows.sort_by(|a, b| match (a.0, b.0) {
                (Some(x), Some(y)) => orders.cmp(table, s, x, y),
                _ => std::cmp::Ordering::Equal,
            });
        }
        self.rows = rows;
        self.size_max = self.size.map_or(0.0, |s| {
            let column = table.column(s);
            self.rows
                .iter()
                .flat_map(|(_, o)| &o.slots)
                .filter_map(|&slot| y_value(column, slot))
                .fold(0.0, |most: f64, v| most.max(v.abs()))
        });
        let (gathered, computed) = self
            .rows
            .iter()
            .map(|(_, ordered)| self.compute_series(table, ordered))
            .unzip();
        self.gathered = gathered;
        self.computed = computed;
    }

    /// One series' indicators, each kind of input gathered once and shared.
    fn compute_series(&self, table: &Table, ordered: &Ordered) -> (Vec<Gathered>, Vec<Computed>) {
        let mut gathered: Vec<Gathered> = Vec::new();
        let mut computed = Vec::new();
        for indicator in &self.config.indicators {
            let inputs = indicator.inputs();
            // Volume is summed per candle instead.
            if inputs == Inputs::Volume {
                computed.push(Computed::default());
                continue;
            }
            let index = match gathered.iter().position(|g| g.inputs == inputs) {
                Some(index) => index,
                None => {
                    gathered.push(self.gather(table, ordered, inputs));
                    gathered.len() - 1
                }
            };
            computed.push(Computed {
                gathered: index,
                lines: indicator.compute(&gathered[index].series()),
            });
        }
        (gathered, computed)
    }

    /// One series' rows that have every input of a kind, and their values.
    fn gather(&self, table: &Table, ordered: &Ordered, inputs: Inputs) -> Gathered {
        let price = self
            .config
            .indicator_price()
            .and_then(|c| table.column_index(c));
        let columns: Vec<usize> = match (inputs, self.ohlc) {
            (Inputs::Price, _) => price.into_iter().collect(),
            (Inputs::Range, Some([_, high, low, close])) => vec![high, low, close],
            (Inputs::RangeAndVolume, Some([_, high, low, close])) => {
                [high, low, close].into_iter().chain(self.volume).collect()
            }
            // The configuration was checked: this does not happen.
            _ => Vec::new(),
        };
        let mut rows = Vec::new();
        let mut values: Vec<Vec<f64>> = vec![Vec::new(); columns.len()];
        let mut row = Vec::with_capacity(columns.len());
        for (r, &slot) in ordered.slots.iter().enumerate() {
            row.clear();
            row.extend(
                columns
                    .iter()
                    .map_while(|&c| y_value(table.column(c), slot)),
            );
            if row.len() == columns.len() && !columns.is_empty() {
                rows.push(r);
                for (column, &value) in values.iter_mut().zip(&row) {
                    column.push(value);
                }
            }
        }
        let sessions = if inputs == Inputs::RangeAndVolume {
            self.sessions(table, ordered, &rows)
        } else {
            Vec::new()
        };
        Gathered {
            inputs,
            rows,
            columns: values,
            sessions,
        }
    }

    /// Where VWAP sessions start among `rows`: each New York trading day for
    /// instants, and only the first row for dates.
    fn sessions(&self, table: &Table, ordered: &Ordered, rows: &[usize]) -> Vec<usize> {
        if !matches!(
            self.placement,
            Placement::Instant | Placement::TradingInstant(_)
        ) {
            return vec![0];
        }
        let x = table.column(self.x);
        let cut = Cut::of(&self.placement);
        let mut starts = Vec::new();
        let mut previous = None;
        for (i, &r) in rows.iter().enumerate() {
            let day = bucket_start(x.key(ordered.slots[r]), Interval::Day, &cut);
            if i == 0 || day != previous {
                starts.push(i);
                previous = day;
            }
        }
        starts
    }

    /// The values of the series column, one per series, in the series' order;
    /// empty without a series column.
    #[must_use]
    pub fn series_keys(&self, table: &Table) -> Vec<Scalar> {
        self.rows
            .iter()
            .filter_map(|(key, _)| self.scalar(table, *key))
            .collect()
    }

    /// The axis position of a value of the x column, such as a drawing's anchor,
    /// or `None` for a value of another type, a null or a NaN.
    #[must_use]
    pub fn position(&self, value: &Scalar) -> Option<f64> {
        let key = match *value {
            Scalar::Int64(v) => Key::Int(v),
            Scalar::Float64(v) => Key::float(v),
            Scalar::Decimal(v) => Key::Decimal(v),
            Scalar::Date32(d) => Key::Date(d),
            Scalar::Timestamp(t) => Key::Ts(t),
            Scalar::Utf8(ref text) => {
                // A tenor written as text, on a tenor axis of text.
                return match self.placement {
                    Placement::Tenor {
                        spacing,
                        text: true,
                        ..
                    } => tenor_years(text).map(|years| tenor_position(years, spacing)),
                    _ => None,
                };
            }
            _ => return None,
        };
        self.placement.position(key)
    }

    /// The x range of the data, in axis positions, or `None` without rows.
    #[must_use]
    pub fn x_extent(&self) -> Option<(f64, f64)> {
        let first = self.rows.iter().filter_map(|(_, o)| o.x.first()).copied();
        let last = self.rows.iter().filter_map(|(_, o)| o.x.last()).copied();
        Some((first.reduce(f64::min)?, last.reduce(f64::max)?))
    }

    fn scalar(&self, table: &Table, key: Option<Key>) -> Option<Scalar> {
        let (s, key) = (self.series?, key?);
        Some(table.column(s).key_to_scalar(key))
    }

    /// Reduces the chart for `request`.
    #[must_use]
    pub fn reduce(&self, table: &Table, request: &ChartRequest) -> Reduced {
        let width = request.width.max(1);
        // A single x value is shown half a unit either side.
        let widen = |(from, to): (f64, f64)| {
            if to > from {
                (from, to)
            } else {
                (from - 0.5, from + 0.5)
            }
        };
        let extent = widen(self.x_extent().unwrap_or((0.0, 1.0)));
        let (from, to) = widen(request.x.unwrap_or(extent));
        let data = match self.config.kind {
            ChartKind::Line | ChartKind::Area => {
                ChartData::Series(self.series_m4(table, from, to, width))
            }
            ChartKind::Scatter => self.scatter(table, from, to, request),
            ChartKind::Histogram => self.histogram(table, from, to, request),
            ChartKind::Candlestick | ChartKind::Ohlc => self.candles(table, from, to, width),
        };
        let ticks = self.ticks(from, to, width);
        let indicators = self.reduce_indicators(table, from, to, width);
        let (events, events_total) = self.reduce_events(table, from, to);
        let fits = self.fit.map_or_else(Vec::new, |f| {
            let column = table.column(f);
            self.rows
                .iter()
                .map(|(key, ordered)| {
                    let points = ordered.around(from, to).map(|r| {
                        let slot = ordered.slots[r];
                        (ordered.x[r], y_value(column, slot), slot)
                    });
                    (self.scalar(table, *key), m4(points, from, to, width))
                })
                .collect()
        });
        Reduced {
            data,
            x: (from, to),
            extent,
            ticks,
            indicators,
            events,
            events_total,
            fits,
        }
    }

    /// The rows the events column marks in `from..=to`: all of them up to
    /// [`MAX_EVENTS`], else that many evenly chosen; and how many there are.
    fn reduce_events(&self, table: &Table, from: f64, to: f64) -> (Vec<EventPoint>, usize) {
        let Some(column) = self.events.map(|e| table.column(e)) else {
            return (Vec::new(), 0);
        };
        let candles = matches!(self.config.kind, ChartKind::Candlestick | ChartKind::Ohlc);
        let series = if candles {
            &self.rows[..self.rows.len().min(1)]
        } else {
            &self.rows[..]
        };
        let mut all: Vec<EventPoint> = series
            .iter()
            .flat_map(|(key, o)| {
                o.within(from, to)
                    .filter(|&r| column.scalar(o.slots[r]) != Scalar::Null)
                    .map(move |r| (key, o.x[r], o.slots[r]))
            })
            .map(|(key, x, slot)| EventPoint {
                x,
                slot,
                key: self.scalar(table, *key),
            })
            .collect();
        all.sort_by(|a, b| a.x.total_cmp(&b.x));
        let total = all.len();
        if total <= MAX_EVENTS {
            return (all, total);
        }
        let kept = (0..MAX_EVENTS)
            .map(|i| all[i * (total - 1) / (MAX_EVENTS - 1)].clone())
            .collect();
        (kept, total)
    }

    /// Measures a series between two axis positions: the rows nearest each with
    /// a price, and the rows from one to the other. The series is the one whose
    /// key is `series`, or the first; `None` if it has no row with a price.
    #[must_use]
    pub fn measure(
        &self,
        table: &Table,
        from: f64,
        to: f64,
        series: Option<&Scalar>,
    ) -> Option<Measured> {
        let price = self
            .config
            .indicator_price()
            .and_then(|c| table.column_index(c))?;
        let column = table.column(price);
        let ordered = series
            .and_then(|wanted| {
                self.rows
                    .iter()
                    .find(|(key, _)| self.scalar(table, *key).as_ref() == Some(wanted))
            })
            .or_else(|| self.rows.first())
            .map(|(_, o)| o)?;
        // The rows with a price, by place in the series.
        let priced: Vec<usize> = (0..ordered.slots.len())
            .filter(|&r| y_value(column, ordered.slots[r]).is_some())
            .collect();
        let nearest = |at: f64| {
            let i = priced.partition_point(|&r| ordered.x[r] < at);
            [i.checked_sub(1), (i < priced.len()).then_some(i)]
                .into_iter()
                .flatten()
                .min_by(|&a, &b| {
                    (ordered.x[priced[a]] - at)
                        .abs()
                        .total_cmp(&(ordered.x[priced[b]] - at).abs())
                })
        };
        let (a, b) = (nearest(from.min(to))?, nearest(from.max(to))?);
        Some(Measured {
            from: ordered.slots[priced[a]],
            to: ordered.slots[priced[b]],
            from_x: ordered.x[priced[a]],
            to_x: ordered.x[priced[b]],
            price,
            rows: b - a,
        })
    }

    /// Each series' indicator lines in `from..=to`, reduced with M4 like the
    /// series, from the values computed over every row.
    fn reduce_indicators(
        &self,
        table: &Table,
        from: f64,
        to: f64,
        width: u32,
    ) -> Vec<IndicatorLines> {
        let mut out = Vec::new();
        let series = self.rows.iter().zip(&self.gathered).zip(&self.computed);
        for (((key, ordered), gathered), computed) in series {
            for (index, (indicator, c)) in self.config.indicators.iter().zip(computed).enumerate() {
                if c.lines.is_empty() {
                    continue;
                }
                // The computed rows inside the range, plus one on each side.
                let rows = &gathered[c.gathered].rows;
                let start = rows.partition_point(|&r| ordered.x[r] < from);
                let end = rows.partition_point(|&r| ordered.x[r] <= to);
                let range = start.saturating_sub(1)..(end + 1).min(rows.len());
                let lines = indicator
                    .lines()
                    .iter()
                    .zip(&c.lines)
                    .map(|(&name, values)| {
                        let points = range.clone().map(|i| {
                            let r = rows[i];
                            let value = values[i];
                            (
                                ordered.x[r],
                                (!value.is_nan()).then_some(value),
                                ordered.slots[r],
                            )
                        });
                        (name, m4(points, from, to, width))
                    })
                    .collect();
                out.push(IndicatorLines {
                    indicator: index,
                    key: self.scalar(table, *key),
                    lines,
                });
            }
        }
        out
    }

    fn series_m4(
        &self,
        table: &Table,
        from: f64,
        to: f64,
        width: u32,
    ) -> Vec<(Series, Vec<Point>)> {
        let mut out = Vec::new();
        for (key, ordered) in &self.rows {
            let range = ordered.around(from, to);
            for (i, &y) in self.y.iter().enumerate() {
                let column = table.column(y);
                // In compare mode, each value as a percentage of the series' first
                // value in the range shown; a first value of zero leaves nothing to
                // compare with.
                // The base: the series' first value in the range shown, or, with no
                // row inside it, the value where its line enters the range.
                let base = if self.config.compare {
                    ordered
                        .within(from, to)
                        .chain(range.clone())
                        .find_map(|r| y_value(column, ordered.slots[r]))
                } else {
                    None
                };
                let value = |slot: usize| {
                    let v = y_value(column, slot)?;
                    if !self.config.compare {
                        return Some(v);
                    }
                    let b = base.filter(|b| *b != 0.0)?;
                    Some(percent_change(b, v))
                };
                let points = range.clone().map(|r| {
                    let slot = ordered.slots[r];
                    (ordered.x[r], value(slot), slot)
                });
                out.push((
                    Series {
                        y: i,
                        key: self.scalar(table, *key),
                    },
                    m4(points, from, to, width),
                ));
            }
        }
        out
    }

    /// A scatter's rows in `from..=to` as dots, if there are at most
    /// [`MAX_POINTS`] of them inside the y range, or else their density.
    fn scatter(&self, table: &Table, from: f64, to: f64, request: &ChartRequest) -> ChartData {
        let y_column = table.column(self.y[0]);
        // Each series' rows in the range, by place in the series, with a y value.
        let shown: Vec<Vec<(usize, f64)>> = self
            .rows
            .iter()
            .map(|(_, o)| {
                o.within(from, to)
                    .filter_map(|r| Some((r, y_value(y_column, o.slots[r])?)))
                    .collect()
            })
            .collect();
        // The y range holds the fit line where it crosses the range, too.
        let fit_values = self.fit.map(|f| table.column(f)).into_iter().flat_map(|c| {
            self.rows.iter().flat_map(move |(_, o)| {
                o.within(from, to)
                    .filter_map(move |r| y_value(c, o.slots[r]))
            })
        });
        let (bottom, top) = request
            .y
            .or_else(|| {
                let values = shown.iter().flatten().map(|p| p.1).chain(fit_values);
                values.fold(None, |range: Option<(f64, f64)>, v| {
                    Some(range.map_or((v, v), |(low, high)| (low.min(v), high.max(v))))
                })
            })
            .unwrap_or((0.0, 1.0));
        let (bottom, top) = if top > bottom {
            (bottom, top)
        } else {
            (bottom - 0.5, bottom + 0.5)
        };
        let inside = |y: f64| y >= bottom && y <= top;
        let count: usize = shown
            .iter()
            .map(|rows| rows.iter().filter(|p| inside(p.1)).count())
            .sum();
        if count > MAX_POINTS {
            let points = self
                .rows
                .iter()
                .zip(&shown)
                .flat_map(|((_, o), rows)| rows.iter().map(|&(r, y)| (o.x[r], y)));
            return density(points, (from, to), (bottom, top), request);
        }
        let size = self.size.map(|s| table.column(s));
        let share = |slot: usize| {
            let v = y_value(size?, slot)?.abs();
            Some(if self.size_max > 0.0 {
                (v / self.size_max).min(1.0)
            } else {
                0.0
            })
        };
        let series = self
            .rows
            .iter()
            .zip(&shown)
            .map(|((key, o), rows)| {
                let dots = rows
                    .iter()
                    .filter(|p| inside(p.1))
                    .map(|&(r, y)| Dot {
                        x: o.x[r],
                        y,
                        slot: o.slots[r],
                        size: share(o.slots[r]),
                    })
                    .collect();
                (self.scalar(table, *key), dots)
            })
            .collect();
        ChartData::Points {
            y: (bottom, top),
            series,
        }
    }

    fn histogram(&self, table: &Table, from: f64, to: f64, request: &ChartRequest) -> ChartData {
        let bins = (request.width / BIN_WIDTH).max(1);
        // Edges are computed once and every value is placed by comparing with
        // them, so a value on an edge lands in the bin the edge's label opens.
        let mut edges: Vec<f64> = (0..=bins)
            .map(|i| from + (to - from) * f64::from(i) / f64::from(bins))
            .collect();
        if let Some(last) = edges.last_mut() {
            *last = to;
        }
        let counts = self
            .rows
            .iter()
            .map(|(key, o)| {
                let mut counts = vec![0u64; bins as usize];
                for r in o.within(from, to) {
                    let bin = edges.partition_point(|&e| e <= o.x[r]).saturating_sub(1);
                    counts[bin.min(bins as usize - 1)] += 1;
                }
                (self.scalar(table, *key), counts)
            })
            .collect();
        ChartData::Histogram { edges, counts }
    }

    fn candles(&self, table: &Table, from: f64, to: f64, width: u32) -> ChartData {
        let instants = matches!(
            self.placement,
            Placement::Instant | Placement::TradingInstant(_)
        );
        let interval = self.interval(from, to, width, instants);
        let (Some([open, high, low, close]), Some((_, rows))) = (self.ohlc, self.rows.first())
        else {
            return ChartData::Candles {
                interval,
                candles: Vec::new(),
                volumes: Vec::new(),
            };
        };
        let x = table.column(self.x);
        let cut = Cut::of(&self.placement);
        let bucket_of = |r: usize| bucket_start(x.key(rows.slots[r]), interval, &cut);
        // Buckets crossing either edge of the range keep all their rows, so an
        // edge candle shows its whole bucket however the chart is panned.
        let within = rows.within(from, to);
        let mut start = within.start;
        if let Some(first) = (start < within.end).then(|| bucket_of(start)).flatten() {
            while start > 0 && bucket_of(start - 1) == Some(first) {
                start -= 1;
            }
        }
        let mut end = within.end;
        if let Some(last) = (end > start).then(|| bucket_of(end - 1)).flatten() {
            while end < rows.slots.len() && bucket_of(end) == Some(last) {
                end += 1;
            }
        }
        let (o, h, l, c) = (
            table.column(open),
            table.column(high),
            table.column(low),
            table.column(close),
        );
        // Volume, when the chart shows it, summed exactly per bucket.
        let volume = self
            .volume
            .filter(|_| self.config.indicators.contains(&Indicator::Volume))
            .map(|v| table.column(v));
        let mut volumes: Vec<BucketVolume> = Vec::new();
        let mut sum = VolumeSum::default();
        let mut candles: Vec<(Bucket, Candle)> = Vec::new();
        let mut current: Option<(i64, Bucket, Candle, f64, f64)> = None;
        for r in start..end {
            let slot = rows.slots[r];
            let Some(bucket) = bucket_of(r) else { continue };
            if current.as_ref().is_none_or(|(key, ..)| *key != bucket) {
                if let Some((_, span, candle, _, _)) = current.take() {
                    candles.push((span, candle));
                    if let Some(v) = volume {
                        volumes.push(std::mem::take(&mut sum).total(v));
                    }
                }
                let span = Bucket {
                    start: bucket,
                    end: advance(bucket, interval, instants, &cut),
                    from: self.bucket_position(bucket, interval, instants, &cut, false),
                    to: self.bucket_position(bucket, interval, instants, &cut, true),
                };
                let empty = Candle {
                    open: None,
                    high: None,
                    low: None,
                    close: None,
                };
                current = Some((bucket, span, empty, f64::NEG_INFINITY, f64::INFINITY));
            }
            let Some((_, _, candle, highest, lowest)) = current.as_mut() else {
                continue;
            };
            // Each price comes from a row that has it.
            if candle.open.is_none() && y_value(o, slot).is_some() {
                candle.open = Some(slot);
            }
            if let Some(v) = y_value(h, slot)
                && v > *highest
            {
                *highest = v;
                candle.high = Some(slot);
            }
            if let Some(v) = y_value(l, slot)
                && v < *lowest
            {
                *lowest = v;
                candle.low = Some(slot);
            }
            if y_value(c, slot).is_some() {
                candle.close = Some(slot);
            }
            if let Some(v) = volume {
                sum.add(v, slot);
            }
        }
        if let Some((_, span, candle, _, _)) = current {
            candles.push((span, candle));
            if let Some(v) = volume {
                volumes.push(sum.total(v));
            }
        }
        ChartData::Candles {
            interval,
            candles,
            volumes,
        }
    }

    /// The smallest interval whose buckets in `from..to` are at least
    /// [`MIN_CANDLE`] pixels wide.
    fn interval(&self, from: f64, to: f64, width: u32, instants: bool) -> Interval {
        let fits = |buckets: f64| buckets * f64::from(MIN_CANDLE) <= f64::from(width);
        let span = to - from;
        let candidates: &[Interval] = if instants {
            &[
                Interval::Minutes(1),
                Interval::Minutes(5),
                Interval::Minutes(15),
                Interval::Minutes(30),
                Interval::Minutes(60),
                Interval::Day,
                Interval::Week,
                Interval::Month,
                Interval::Quarter,
                Interval::Year,
            ]
        } else {
            &[
                Interval::Day,
                Interval::Week,
                Interval::Month,
                Interval::Quarter,
                Interval::Year,
            ]
        };
        // An interval's length in axis units: trading time gives a day 6.5 hours
        // and a week five days.
        let length = |interval: Interval| -> f64 {
            let day = match &self.placement {
                Placement::TradingInstant(c) => c.session_micros() as f64,
                Placement::Instant => 86_400_000_000.0,
                _ => 1.0,
            };
            let trading = matches!(
                self.placement,
                Placement::TradingDate(_) | Placement::TradingInstant(_)
            );
            let week = if trading { 5.0 } else { 7.0 };
            let year = if trading { 252.0 } else { 365.25 };
            match interval {
                Interval::Minutes(m) => f64::from(m) * 60_000_000.0,
                Interval::Day => day,
                Interval::Week => day * week,
                Interval::Month => day * year / 12.0,
                Interval::Quarter => day * year / 4.0,
                Interval::Year => day * year,
                Interval::Years(n) => day * year * f64::from(n),
            }
        };
        candidates
            .iter()
            .copied()
            .find(|&i| fits(span / length(i)))
            .unwrap_or(Interval::Year)
    }

    /// The axis position of a bucket's start, or with `next`, of the next
    /// bucket's start.
    fn bucket_position(
        &self,
        start: i64,
        interval: Interval,
        instants: bool,
        cut: &Cut,
        next: bool,
    ) -> f64 {
        let start = if next {
            advance(start, interval, instants, cut)
        } else {
            start
        };
        let key = if instants {
            Key::Ts(start)
        } else {
            Key::Date(i32::try_from(start).unwrap_or(i32::MAX))
        };
        self.placement.position(key).unwrap_or(f64::NAN)
    }

    /// Ticks for the x axis between `from` and `to`, about [`TICK_SPACING`]
    /// pixels apart, labelled in New York time for dates and instants.
    fn ticks(&self, from: f64, to: f64, width: u32) -> Vec<Tick> {
        let wanted = (f64::from(width) / f64::from(TICK_SPACING)).max(1.0);
        match &self.placement {
            Placement::Number { .. } => {
                let (values, step) = nice_ticks(from, to, wanted);
                let labels = number_labels(&values, step);
                values
                    .into_iter()
                    .zip(labels)
                    .map(|(x, label)| Tick { x, label })
                    .collect()
            }
            Placement::Tenor { spacing, .. } => tenor_ticks(*spacing, (from, to), width),
            placement => time_ticks(placement, from, to, wanted),
        }
    }
}

/// The density of `points` in cells of [`DENSITY_CELL`] pixels over the plot,
/// leaving out those outside the y range.
fn density(
    points: impl Iterator<Item = (f64, f64)>,
    (from, to): (f64, f64),
    (bottom, top): (f64, f64),
    request: &ChartRequest,
) -> ChartData {
    let columns = (request.width / DENSITY_CELL).max(1);
    let rows = (request.height / DENSITY_CELL).max(1);
    let mut counts = vec![0u32; (columns * rows) as usize];
    for (x, y) in points {
        if y < bottom || y > top {
            continue;
        }
        let c = cell(x, from, to, columns);
        let r = cell(y, bottom, top, rows);
        counts[(r * columns + c) as usize] += 1;
    }
    ChartData::Density {
        x: (from, to),
        y: (bottom, top),
        columns,
        rows,
        counts,
    }
}

/// The standard tenors in `from..=to` on a tenor axis, labelled as written, as
/// many as fit [`TENOR_TICK_GAP`] apart, the longest kept first.
fn tenor_ticks(spacing: TenorSpacing, (from, to): (f64, f64), width: u32) -> Vec<Tick> {
    let per_pixel = (to - from) / f64::from(width.max(1));
    let mut kept: Vec<Tick> = Vec::new();
    for &(years, label) in TENOR_KNOTS.iter().rev() {
        let x = tenor_position(years, spacing);
        let clear = kept
            .iter()
            .all(|t| (t.x - x).abs() / per_pixel >= TENOR_TICK_GAP);
        if years > 0.0 && x >= from && x <= to && clear {
            kept.push(Tick {
                x,
                label: label.to_owned(),
            });
        }
    }
    kept.reverse();
    kept
}

/// The cell of `value` among `cells` equal cells spanning `from..=to`.
fn cell(value: f64, from: f64, to: f64, cells: u32) -> u32 {
    let at = ((value - from) / (to - from) * f64::from(cells)).floor();
    (at.max(0.0) as u32).min(cells - 1)
}

/// The pixel column of `x`: `-1` before the plot and `width` after it.
fn column(x: f64, from: f64, to: f64, width: u32) -> i64 {
    if x < from {
        return -1;
    }
    if x > to {
        return i64::from(width);
    }
    let at = ((x - from) / (to - from) * f64::from(width)).floor() as i64;
    at.min(i64::from(width) - 1)
}

/// M4: per pixel column, the first, lowest, highest and last point of each run
/// of values, in the order given, with a break wherever values are missing.
/// `points` must be in series order: by x, then insertion.
fn m4(
    points: impl Iterator<Item = (f64, Option<f64>, usize)>,
    from: f64,
    to: f64,
    width: u32,
) -> Vec<Point> {
    /// A point and its place in the series.
    type Placed = (usize, Point);
    struct Run {
        column: i64,
        first: Placed,
        low: Placed,
        high: Placed,
        last: Placed,
    }
    fn flush(run: Option<Run>, out: &mut Vec<Point>) {
        let Some(run) = run else { return };
        let mut kept = [run.first, run.low, run.high, run.last];
        // In series order; the same point once.
        kept.sort_by_key(|p| p.0);
        let mut previous = None;
        for (place, point) in kept {
            if previous != Some(place) {
                out.push(point);
                previous = Some(place);
            }
        }
    }
    let mut out = Vec::new();
    let mut run: Option<Run> = None;
    let mut broken = false;
    for (place, (x, y, slot)) in points.enumerate() {
        let Some(y) = y else {
            flush(run.take(), &mut out);
            if !broken {
                out.push(Point {
                    x,
                    y: f64::NAN,
                    slot: None,
                });
                broken = true;
            }
            continue;
        };
        broken = false;
        let point = (
            place,
            Point {
                x,
                y,
                slot: Some(slot),
            },
        );
        let c = column(x, from, to, width);
        match &mut run {
            Some(r) if r.column == c => {
                if y < r.low.1.y {
                    r.low = point;
                }
                if y > r.high.1.y {
                    r.high = point;
                }
                r.last = point;
            }
            _ => {
                flush(run.take(), &mut out);
                run = Some(Run {
                    column: c,
                    first: point,
                    low: point,
                    high: point,
                    last: point,
                });
            }
        }
    }
    flush(run, &mut out);
    out
}

/// Where buckets of a day or longer are cut: at midnight in a zone, or, on a
/// trading-time axis whose session opens the evening before, at that session's
/// open, so a day's bucket is the session that trades for it.
#[derive(Clone, Debug)]
struct Cut {
    zone: TimeZone,
    /// How far before midnight a day's bucket starts, in microseconds of the
    /// clock.
    evening: i64,
}

impl Cut {
    /// Cuts at midnight in New York, or at an evening session's open on a
    /// trading-time axis of instants.
    fn of(placement: &Placement) -> Self {
        let zone = TimeZone::get(crate::format::DEFAULT_ZONE).unwrap_or(TimeZone::UTC);
        let evening = match placement {
            Placement::TradingInstant(c) => c.evening_micros(),
            _ => 0,
        };
        Self { zone, evening }
    }

    /// Cuts at midnight in `zone`.
    fn midnight(zone: TimeZone) -> Self {
        Self { zone, evening: 0 }
    }

    /// The date a local time's bucket of a day or longer belongs to.
    fn date_of(&self, local: DateTime) -> Option<Date> {
        Some(
            local
                .checked_add(jiff::Span::new().microseconds(self.evening))
                .ok()?
                .date(),
        )
    }

    /// The instant a bucket of a day or longer that starts on `day` starts.
    fn start_of(&self, day: Date) -> Option<i64> {
        DateTime::from(day)
            .checked_sub(jiff::Span::new().microseconds(self.evening))
            .ok()?
            .to_zoned(self.zone.clone())
            .ok()
            .map(|z| z.timestamp().as_microsecond())
    }
}

/// The start of the bucket holding an x key: microseconds for instants, days for
/// dates, cut as `cut` says.
fn bucket_start(key: Key, interval: Interval, cut: &Cut) -> Option<i64> {
    let zone = &cut.zone;
    match key {
        Key::Date(d) => Some(i64::from(epoch_days(truncate_date(
            from_epoch_days(d),
            interval,
        )))),
        Key::Ts(t) => {
            let zoned = jiff::Timestamp::from_microsecond(t)
                .ok()?
                .to_zoned(zone.clone());
            match interval {
                Interval::Minutes(m) => {
                    // Cut on local time by the instant's own offset, so the
                    // repeated autumn hour keeps its own buckets.
                    let offset = i64::from(zoned.offset().seconds()) * 1_000_000;
                    let step = i64::from(m) * 60_000_000;
                    let local = t + offset;
                    Some(local - local.rem_euclid(step) - offset)
                }
                other => cut.start_of(truncate_date(cut.date_of(zoned.datetime())?, other)),
            }
        }
        _ => None,
    }
}

fn truncate_date(day: Date, interval: Interval) -> Date {
    match interval {
        Interval::Minutes(_) | Interval::Day => day,
        Interval::Week => day
            .checked_sub(jiff::Span::new().days(i64::from(day.weekday().to_monday_zero_offset())))
            .unwrap_or(day),
        Interval::Month => day.first_of_month(),
        Interval::Quarter => {
            let month = (day.month() - 1) / 3 * 3 + 1;
            jiff::civil::date(day.year(), month, 1)
        }
        Interval::Year => day.first_of_year(),
        Interval::Years(n) => {
            let n = i16::try_from(n.max(1)).unwrap_or(i16::MAX);
            Date::new(day.year() - day.year().rem_euclid(n), 1, 1)
                .unwrap_or_else(|_| day.first_of_year())
        }
    }
}

/// The start of the bucket after the one starting at `start`.
fn advance(start: i64, interval: Interval, instants: bool, cut: &Cut) -> i64 {
    let span = match interval {
        Interval::Minutes(m) => jiff::Span::new().minutes(i64::from(m)),
        Interval::Day => jiff::Span::new().days(1),
        Interval::Week => jiff::Span::new().weeks(1),
        Interval::Month => jiff::Span::new().months(1),
        Interval::Quarter => jiff::Span::new().months(3),
        Interval::Year => jiff::Span::new().years(1),
        Interval::Years(n) => jiff::Span::new().years(i64::from(n)),
    };
    if instants && matches!(interval, Interval::Minutes(_)) {
        jiff::Timestamp::from_microsecond(start)
            .ok()
            .and_then(|t| t.to_zoned(cut.zone.clone()).checked_add(span).ok())
            .map_or(start, |z| z.timestamp().as_microsecond())
    } else if instants {
        // A day or longer moves by the date the bucket belongs to, so months
        // keep their ends and an evening session's buckets keep its open.
        jiff::Timestamp::from_microsecond(start)
            .ok()
            .map(|t| t.to_zoned(cut.zone.clone()).datetime())
            .and_then(|local| cut.date_of(local))
            .and_then(|day| day.checked_add(span).ok())
            .and_then(|day| cut.start_of(day))
            .unwrap_or(start)
    } else {
        let day = from_epoch_days(i32::try_from(start).unwrap_or(0));
        day.checked_add(span)
            .map_or(start, |d| i64::from(epoch_days(d)))
    }
}

/// Round numbers between `from` and `to`, about `wanted` of them: steps of 1, 2
/// or 5 times a power of ten.
fn nice_ticks(from: f64, to: f64, wanted: f64) -> (Vec<f64>, f64) {
    let raw = (to - from) / wanted;
    if !(raw.is_finite() && raw > 0.0) {
        return (Vec::new(), 1.0);
    }
    let power = 10f64.powf(raw.log10().floor());
    let step = [1.0, 2.0, 5.0, 10.0]
        .into_iter()
        .map(|m| m * power)
        .find(|&s| s >= raw)
        .unwrap_or(10.0 * power);
    let first = (from / step).ceil() as i64;
    let last = (to / step).floor() as i64;
    ((first..=last).map(|i| i as f64 * step).collect(), step)
}

/// Labels for round tick values, one style per axis: in full with thousands
/// separators while the axis stays under 10,000, compact (K, M, B, T) once it
/// reaches it, with as many decimals as the step needs.
fn number_labels(values: &[f64], step: f64) -> Vec<String> {
    let largest = values.iter().fold(0.0f64, |m, v| m.max(v.abs()));
    let (divisor, suffix) = if largest >= 1e4 {
        [(1e12, "T"), (1e9, "B"), (1e6, "M"), (1e3, "K")]
            .into_iter()
            .find(|(d, _)| largest >= *d)
            .unwrap_or((1.0, ""))
    } else {
        (1.0, "")
    };
    let scaled = step / divisor;
    // Ticks are multiples of the step, so the step's own decimals show each exactly.
    let mut decimals = 0usize;
    while decimals < 12 {
        let shifted = scaled * 10f64.powi(decimals as i32);
        if (shifted.round() - shifted).abs() <= 1e-9 * shifted.abs().max(1.0) {
            break;
        }
        decimals += 1;
    }
    values
        .iter()
        .map(|&v| {
            if v == 0.0 {
                return "0".to_owned();
            }
            let text = format!("{:.decimals$}", v / divisor);
            let (whole, fraction) = text
                .split_once('.')
                .map_or((text.as_str(), ""), |(w, f)| (w, f));
            let (sign, digits) = whole.strip_prefix('-').map_or(("", whole), |d| ("-", d));
            let mut grouped = String::new();
            for (i, ch) in digits.chars().enumerate() {
                if i > 0 && (digits.len() - i) % 3 == 0 {
                    grouped.push(',');
                }
                grouped.push(ch);
            }
            let fraction = if fraction.is_empty() {
                String::new()
            } else {
                format!(".{fraction}")
            };
            format!("{sign}{grouped}{fraction}{suffix}")
        })
        .collect()
}

/// A day's label at a step of a day or more.
fn day_label(day: Date, step: Interval) -> String {
    match step {
        Interval::Minutes(_) | Interval::Day | Interval::Week => day.strftime("%b %-d").to_string(),
        Interval::Month | Interval::Quarter => day.strftime("%b %Y").to_string(),
        Interval::Year | Interval::Years(_) => day.strftime("%Y").to_string(),
    }
}

/// Ticks on a trading-time axis of instants at a step of a day or more: at the
/// opens of the trading days that start each step, each labelled with the day it
/// trades for, so the open of a session that opens the evening before is labelled
/// with the next day.
fn session_ticks(calendar: &TradingCalendar, from: f64, to: f64, step: Interval) -> Vec<Tick> {
    let first = calendar.trading_date(calendar.instant_at(from));
    let last = i64::from(calendar.trading_date(calendar.instant_at(to)));
    let mut ticks: Vec<Tick> = Vec::new();
    let mut at = i64::from(epoch_days(truncate_date(from_epoch_days(first), step)));
    let mut guard = 0;
    while at <= last && guard < 1_000 {
        guard += 1;
        let day = i32::try_from(at).unwrap_or(0);
        let x = calendar.session_position(day);
        if x >= from && x <= to && ticks.last().is_none_or(|t| t.x < x) {
            let trades = calendar.day_at(calendar.day_index(day));
            ticks.push(Tick {
                x,
                label: day_label(from_epoch_days(trades), step),
            });
        }
        let next = advance(at, step, false, &Cut::midnight(TimeZone::UTC));
        if next <= at {
            break;
        }
        at = next;
    }
    ticks
}

/// Ticks on a date or instant axis at a calendar step, labelled in New York.
fn time_ticks(placement: &Placement, from: f64, to: f64, wanted: f64) -> Vec<Tick> {
    let zone = TimeZone::get(crate::format::DEFAULT_ZONE).unwrap_or(TimeZone::UTC);
    let (instants, calendar) = match placement {
        Placement::Instant => (true, None),
        Placement::TradingInstant(c) => (true, Some(c)),
        Placement::Date => (false, None),
        Placement::TradingDate(c) => (false, Some(c)),
        Placement::Number { .. } | Placement::Tenor { .. } => return Vec::new(),
    };
    // The x value at a position; on a trading axis, the open moment there.
    let value_at = |position: f64| -> i64 {
        match (calendar, instants) {
            (Some(c), true) => c.instant_at(position),
            (Some(c), false) => i64::from(c.day_at(position.floor() as i64)),
            (None, _) => position as i64,
        }
    };
    // A step's length in axis units: trading time gives a day the session and a
    // year 252 trading days.
    let day = match calendar {
        Some(c) if instants => c.session_micros() as f64,
        None if instants => 86_400_000_000.0,
        _ => 1.0,
    };
    let (week, month, year) = if calendar.is_some() {
        (5.0, 21.0, 252.0)
    } else {
        (7.0, 30.44, 365.25)
    };
    let length = |i: Interval| match i {
        Interval::Minutes(m) => f64::from(m) * 60_000_000.0,
        Interval::Day => day,
        Interval::Week => day * week,
        Interval::Month => day * month,
        Interval::Quarter => day * month * 3.0,
        Interval::Year => day * year,
        Interval::Years(n) => day * year * f64::from(n),
    };
    let steps = [
        Interval::Minutes(1),
        Interval::Minutes(5),
        Interval::Minutes(15),
        Interval::Minutes(30),
        Interval::Minutes(60),
        Interval::Day,
        Interval::Week,
        Interval::Month,
        Interval::Quarter,
        Interval::Year,
        Interval::Years(2),
        Interval::Years(5),
        Interval::Years(10),
        Interval::Years(20),
        Interval::Years(50),
        Interval::Years(100),
    ];
    let step = steps
        .into_iter()
        .filter(|i| instants || !matches!(i, Interval::Minutes(_)))
        .find(|&i| (to - from) / length(i) <= wanted)
        .unwrap_or(Interval::Years(100));
    if let (Some(c), true) = (calendar, instants)
        && !matches!(step, Interval::Minutes(_))
    {
        return session_ticks(c, from, to, step);
    }
    let label = |value: i64| -> String {
        if instants {
            let Ok(t) = jiff::Timestamp::from_microsecond(value) else {
                return String::new();
            };
            let local = t.to_zoned(zone.clone());
            match step {
                Interval::Minutes(_) => local.strftime("%H:%M").to_string(),
                _ => day_label(local.date(), step),
            }
        } else {
            day_label(from_epoch_days(i32::try_from(value).unwrap_or(0)), step)
        }
    };
    let key = |value: i64| {
        if instants {
            Key::Ts(value)
        } else {
            Key::Date(i32::try_from(value).unwrap_or(0))
        }
    };
    let (start, end) = (value_at(from), value_at(to));
    let mut ticks = Vec::new();
    let cut = Cut::midnight(zone.clone());
    let Some(mut at) = bucket_start(key(start), step, &cut) else {
        return ticks;
    };
    let mut guard = 0;
    while at <= end && guard < 1_000 {
        guard += 1;
        if let Some(x) = placement.position(key(at))
            && x >= from
            && x <= to
            && ticks.last().is_none_or(|t: &Tick| t.x < x)
        {
            // On a trading axis a closed moment sits where the market next opens,
            // so the tick there is labelled with that moment.
            let shown = if calendar.is_some() { value_at(x) } else { at };
            ticks.push(Tick {
                x,
                label: label(shown),
            });
        }
        let next = advance(at, step, instants, &cut);
        if next <= at {
            break;
        }
        at = next;
    }
    ticks
}
