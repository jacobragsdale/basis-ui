//! US Treasury yields, on the bond market's calendar: the par curve each day
//! SIFMA recommends trading, and intraday quotes through Treasuries' electronic
//! sessions, which open at 6 p.m. New York time for the next day and close at
//! 5 p.m., or at an early close. A closed day has no curve and no session, so a
//! trading-time axis on SIFMA's calendar draws these without gaps.
//!
//! The curve is Nelson-Siegel's, from the curve [`crate::bonds`] builds its
//! yields on. Its level, slope and curvature move each day by noise drawn for
//! that day, pulled back toward where they started, and the intraday quotes
//! move each step by a shock shared across tenors and one of each tenor's own.
//! The paths are worked out when a dataset is built, from the seed alone, so any
//! range of rows equals the same rows of a full run.

use std::ops::Range;
use std::sync::Arc;

use arrow_array::{
    ArrayRef, Date32Array, Float64Array, RecordBatch, StringArray, TimestampMicrosecondArray,
};
use arrow_schema::{DataType, Field, Schema, SchemaRef, TimeUnit};
use jiff::civil::{Date, date, time};
use parallax_engine::calendar::{Market, Session, TradingCalendar};

use crate::bonds::CURVE;
use crate::calendar::epoch_days;
use crate::dist::standard_normal;
use crate::error::OptionsError;
use crate::rng::{Rng, Stream};
use crate::write::Dataset;

/// The tenors of the Treasury curve, with their years.
pub const TENORS: [(&str, f64); 11] = [
    ("1M", 1.0 / 12.0),
    ("3M", 0.25),
    ("6M", 0.5),
    ("1Y", 1.0),
    ("2Y", 2.0),
    ("3Y", 3.0),
    ("5Y", 5.0),
    ("7Y", 7.0),
    ("10Y", 10.0),
    ("20Y", 20.0),
    ("30Y", 30.0),
];

/// The tenors quoted intraday, by index into [`TENORS`]: the 2-, 10- and 30-year.
pub const QUOTED: [usize; 3] = [4, 8, 10];

/// Treasuries' electronic session: 6 p.m. the evening before to 5 p.m.
pub const ELECTRONIC: Session = Session {
    opens: time(18, 0, 0, 0),
    closes: time(17, 0, 0, 0),
};

/// The daily moves of the curve's level, slope and curvature, as fractions, and
/// how much of the way back to its start each moves a day.
const DAILY_MOVES: [f64; 3] = [0.000_45, 0.000_35, 0.000_50];
const PULL: f64 = 0.03;
/// An intraday step's move shared by every tenor, and each tenor's own, as
/// fractions for a five-minute step; other steps scale by the root of time.
const COMMON_MOVE: f64 = 0.000_035;
const OWN_MOVE: f64 = 0.000_015;
const MINUTES_PER_MOVE: f64 = 5.0;

/// The curve's yield at `years` with level, slope and curvature `factors`.
fn nelson_siegel(factors: [f64; 3], years: f64) -> f64 {
    let [level, slope, curvature] = factors;
    let t = years.max(1e-6) / CURVE.3;
    let loading = (1.0 - (-t).exp()) / t;
    level + slope * loading + curvature * (loading - (-t).exp())
}

/// `value` to `places` decimals.
fn round(value: f64, places: i32) -> f64 {
    let scale = 10f64.powi(places);
    (value * scale).round() / scale
}

/// The bond market's trading days from `start` to `end`.
fn bond_market_days(start: Date, end: Date) -> Result<Vec<i32>, OptionsError> {
    let calendar = TradingCalendar::new(Market::Sifma, None);
    let days: Vec<i32> = (epoch_days(start)..=epoch_days(end))
        .filter(|&d| calendar.is_open(d))
        .collect();
    if days.is_empty() {
        return Err(OptionsError::NoBondMarketDays { start, end });
    }
    Ok(days)
}

/// Options for [`Curves`].
#[derive(Clone, Debug)]
pub struct CurvesOptions {
    /// Seed.
    pub seed: u64,
    /// First date.
    pub start: Date,
    /// Last date.
    pub end: Date,
}

impl Default for CurvesOptions {
    fn default() -> Self {
        Self {
            seed: 42,
            start: date(2026, 1, 2),
            end: date(2026, 11, 30),
        }
    }
}

/// The Treasury par curve each bond-market day, one row per day and tenor, in
/// date order.
#[derive(Clone, Debug)]
pub struct Curves {
    days: Vec<i32>,
    /// Each day's level, slope and curvature.
    factors: Vec<[f64; 3]>,
}

impl Curves {
    /// Builds the curve each day.
    ///
    /// # Errors
    ///
    /// Returns an error when the bond market trades on no day of the range.
    pub fn new(options: &CurvesOptions) -> Result<Self, OptionsError> {
        let days = bond_market_days(options.start, options.end)?;
        let first = [CURVE.0, CURVE.1, CURVE.2];
        let mut factors = Vec::with_capacity(days.len());
        let mut today = first;
        for &day in &days {
            factors.push(today);
            // Each day's moves are drawn for that date, so a range that starts
            // later moves the same way from where it starts.
            let key = u64::from(day.cast_unsigned());
            let mut rng = Rng::for_key(options.seed, Stream::Curves, key);
            for ((factor, start), size) in today.iter_mut().zip(first).zip(DAILY_MOVES) {
                *factor += PULL * (start - *factor) + size * standard_normal(&mut rng);
            }
        }
        Ok(Self { days, factors })
    }
}

/// The schema of [`Curves`]: yields as fractions, and each point's change
/// since the bond market's day before, as a fraction too, null on the first
/// day.
#[must_use]
pub fn curves_schema() -> Schema {
    Schema::new(vec![
        Field::new("curve_date", DataType::Date32, false),
        Field::new("tenor", DataType::Utf8, false),
        Field::new("years", DataType::Float64, false),
        Field::new("yield", DataType::Float64, false),
        Field::new("change", DataType::Float64, true),
    ])
}

impl Curves {
    /// Day `day`'s yield at tenor `tenor`, as the dataset writes it: to a
    /// thousandth of a basis point.
    fn yield_at(&self, day: usize, tenor: usize) -> f64 {
        round(nelson_siegel(self.factors[day], TENORS[tenor].1), 5)
    }
}

impl Dataset for Curves {
    fn schema(&self) -> SchemaRef {
        Arc::new(curves_schema())
    }

    fn num_rows(&self) -> u64 {
        (self.days.len() * TENORS.len()) as u64
    }

    fn batch(&self, rows: Range<u64>) -> RecordBatch {
        let at: Vec<(usize, usize)> = rows
            .map(|i| {
                let i = usize::try_from(i).expect("rows fit in memory");
                (i / TENORS.len(), i % TENORS.len())
            })
            .collect();
        let columns: Vec<ArrayRef> = vec![
            Arc::new(Date32Array::from_iter_values(
                at.iter().map(|&(d, _)| self.days[d]),
            )),
            Arc::new(StringArray::from_iter_values(
                at.iter().map(|&(_, t)| TENORS[t].0),
            )),
            Arc::new(Float64Array::from_iter_values(
                at.iter().map(|&(_, t)| round(TENORS[t].1, 6)),
            )),
            Arc::new(Float64Array::from_iter_values(
                at.iter().map(|&(d, t)| self.yield_at(d, t)),
            )),
            // From the yields as written, so the columns agree.
            Arc::new(Float64Array::from_iter(at.iter().map(|&(d, t)| {
                d.checked_sub(1)
                    .map(|before| round(self.yield_at(d, t) - self.yield_at(before, t), 5))
            }))),
        ];
        RecordBatch::try_new(self.schema(), columns).expect("columns match the schema")
    }
}

/// Options for [`Yields`].
#[derive(Clone, Debug)]
pub struct YieldsOptions {
    /// Seed.
    pub seed: u64,
    /// The first trading day whose session is quoted.
    pub start: Date,
    /// The last.
    pub end: Date,
    /// Minutes between quotes, from 1 to 60.
    pub minutes: u32,
}

impl Default for YieldsOptions {
    fn default() -> Self {
        Self {
            seed: 42,
            start: date(2026, 11, 23),
            end: date(2026, 12, 1),
            minutes: 5,
        }
    }
}

/// Intraday quotes of the 2-, 10- and 30-year Treasury through each electronic
/// session, one row per tenor and quote, by tenor, then time.
#[derive(Clone, Debug)]
pub struct Yields {
    /// Each quote's instant, in microseconds since the epoch, and the day its
    /// session trades for.
    times: Vec<(i64, i32)>,
    /// Each quoted tenor's yields, a quote at a time.
    paths: Vec<Vec<f64>>,
}

impl Yields {
    /// Builds the quotes.
    ///
    /// # Errors
    ///
    /// Returns an error for a step outside 1 to 60 minutes, or when the bond
    /// market trades on no day of the range.
    pub fn new(options: &YieldsOptions) -> Result<Self, OptionsError> {
        if !(1..=60).contains(&options.minutes) {
            return Err(OptionsError::QuoteMinutes(options.minutes));
        }
        let calendar = TradingCalendar::new(Market::Sifma, Some(ELECTRONIC));
        let step = i64::from(options.minutes) * 60_000_000;
        let times: Vec<(i64, i32)> = bond_market_days(options.start, options.end)?
            .into_iter()
            .filter_map(|day| calendar.session_of(day).map(|session| (day, session)))
            .flat_map(|(day, (opens, closes))| {
                (0..)
                    .map(move |k| opens + k * step)
                    .take_while(move |&at| at < closes)
                    .map(move |at| (at, day))
            })
            .collect();
        let scale = (f64::from(options.minutes) / MINUTES_PER_MOVE).sqrt();
        let start = [CURVE.0, CURVE.1, CURVE.2];
        let mut paths: Vec<Vec<f64>> = QUOTED
            .iter()
            .map(|&t| {
                let mut path = Vec::with_capacity(times.len());
                path.push(nelson_siegel(start, TENORS[t].1));
                path
            })
            .collect();
        for k in 1..times.len() {
            let mut rng = Rng::for_key(options.seed, Stream::Yields, k as u64);
            let common = COMMON_MOVE * scale * standard_normal(&mut rng);
            for path in &mut paths {
                let own = OWN_MOVE * scale * standard_normal(&mut rng);
                let last = *path.last().expect("a path starts with a yield");
                path.push(last + common + own);
            }
        }
        Ok(Self { times, paths })
    }
}

/// The schema of [`Yields`]: each quote's instant, the day its session trades
/// for, and its yield as a fraction.
#[must_use]
pub fn yields_schema() -> Schema {
    Schema::new(vec![
        Field::new(
            "time",
            DataType::Timestamp(TimeUnit::Microsecond, Some("UTC".into())),
            false,
        ),
        Field::new("trade_date", DataType::Date32, false),
        Field::new("tenor", DataType::Utf8, false),
        Field::new("yield", DataType::Float64, false),
    ])
}

impl Dataset for Yields {
    fn schema(&self) -> SchemaRef {
        Arc::new(yields_schema())
    }

    fn num_rows(&self) -> u64 {
        (self.times.len() * QUOTED.len()) as u64
    }

    fn batch(&self, rows: Range<u64>) -> RecordBatch {
        let at: Vec<(usize, usize)> = rows
            .map(|i| {
                let i = usize::try_from(i).expect("rows fit in memory");
                (i / self.times.len(), i % self.times.len())
            })
            .collect();
        let columns: Vec<ArrayRef> = vec![
            Arc::new(
                TimestampMicrosecondArray::from_iter_values(
                    at.iter().map(|&(_, q)| self.times[q].0),
                )
                .with_timezone("UTC"),
            ),
            Arc::new(Date32Array::from_iter_values(
                at.iter().map(|&(_, q)| self.times[q].1),
            )),
            Arc::new(StringArray::from_iter_values(
                at.iter().map(|&(t, _)| TENORS[QUOTED[t]].0),
            )),
            Arc::new(Float64Array::from_iter_values(
                at.iter().map(|&(t, q)| round(self.paths[t][q], 6)),
            )),
        ];
        RecordBatch::try_new(self.schema(), columns).expect("columns match the schema")
    }
}
