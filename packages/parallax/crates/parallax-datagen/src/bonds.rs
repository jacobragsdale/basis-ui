//! Investment-grade corporate bonds held on an as-of date, one row per bond:
//! what a desk's relative-value view draws.
//!
//! Each issuer has a sector and a rating, and each bond a maturity, a coupon
//! and a par holding. A bond's yield is a Treasury curve's yield at its
//! maturity plus its spread, and its spread is its sector's fitted spread curve
//! at its duration, moved by its rating and by noise, so some bonds sit rich to
//! the curve and some cheap. The fitted spread stands for the curve an API fits
//! and sends beside the bonds. Prices, durations and DV01s follow from the
//! coupon and the yield with semi-annual compounding, as of a coupon date.
//!
//! Rates, yields and spreads are fractions, the one unit an API sends them in:
//! a spread of 125 basis points is 0.0125, and a chart or grid shows it in
//! basis points with a format.

use std::ops::Range;
use std::sync::Arc;

use arrow_array::{ArrayRef, Date32Array, Float64Array, RecordBatch, StringArray};
use arrow_schema::{DataType, Field, Schema, SchemaRef};
use jiff::civil::{Date, date};

use crate::calendar::epoch_days;
use crate::decimal::from_f64;
use crate::dist::{Weighted, standard_normal};
use crate::error::OptionsError;
use crate::rng::{Rng, Stream};
use crate::shared::decimal_array;
use crate::write::Dataset;

/// Options for [`Bonds`].
#[derive(Clone, Debug)]
pub struct BondsOptions {
    /// Seed.
    pub seed: u64,
    /// Number of bonds.
    pub rows: u64,
    /// The as-of date maturities are counted from.
    pub as_of: Date,
}

impl Default for BondsOptions {
    fn default() -> Self {
        Self {
            seed: 42,
            rows: 600,
            as_of: date(2026, 10, 30),
        }
    }
}

/// The sectors of the corporate bond market, with their weights and how far
/// their spread curves sit above the market's, in basis points.
pub const SECTORS: [(&str, f64, f64); 7] = [
    ("Financials", 0.30, 10.0),
    ("Industrials", 0.18, 0.0),
    ("Utilities", 0.12, -8.0),
    ("Energy", 0.10, 18.0),
    ("Technology", 0.12, -12.0),
    ("Communications", 0.10, 25.0),
    ("Consumer", 0.08, 5.0),
];

/// S&P's investment-grade scale, the weight of each rating among issuers, and
/// how far its bonds sit from their sector's curve on average, in basis points:
/// the curve is fitted to the sector, so the ratings' offsets balance out.
pub const RATINGS: [(&str, f64, f64); 10] = [
    ("AAA", 1.0, -30.0),
    ("AA+", 1.5, -25.0),
    ("AA", 2.5, -20.0),
    ("AA-", 4.0, -15.0),
    ("A+", 7.0, -10.0),
    ("A", 10.0, -6.0),
    ("A-", 12.0, -2.0),
    ("BBB+", 14.0, 3.0),
    ("BBB", 15.0, 8.0),
    ("BBB-", 11.0, 14.0),
];

/// The tenor buckets maturities fall in, each to the maturity in years it runs
/// up to.
pub const TENOR_BUCKETS: [(&str, f64); 9] = [
    ("6M", 0.75),
    ("1Y", 1.5),
    ("2Y", 2.5),
    ("3Y", 4.0),
    ("5Y", 6.0),
    ("7Y", 8.5),
    ("10Y", 15.0),
    ("20Y", 25.0),
    ("30Y", f64::INFINITY),
];

/// Maturities are drawn near these terms, in years, with these weights.
const TERMS: [(f64, f64); 8] = [
    (1.0, 0.08),
    (2.0, 0.12),
    (3.0, 0.14),
    (5.0, 0.20),
    (7.0, 0.14),
    (10.0, 0.18),
    (20.0, 0.06),
    (30.0, 0.08),
];

/// Words issuer names are made of: placeholders, never real companies.
const NAMES: [&str; 24] = [
    "Atlas",
    "Beacon",
    "Cobalt",
    "Drummond",
    "Ember",
    "Fairhaven",
    "Granite",
    "Harbor",
    "Ironwood",
    "Juniper",
    "Keystone",
    "Larkspur",
    "Meridian",
    "Northfield",
    "Oakmont",
    "Pinecrest",
    "Quarry",
    "Ridgeway",
    "Summit",
    "Tidewater",
    "Upland",
    "Vantage",
    "Westbrook",
    "Yarrow",
];
const SUFFIXES: [&str; 5] = ["Corp", "Holdings", "Group", "Capital", "Industries"];

/// The most bonds a book holds: each issuer has bonds with distinct CUSIPs.
pub const MAX_BONDS: u64 = 500_000;
/// The par each bond is held in steps of, and the largest holding.
const PAR_STEP: f64 = 250_000.0;
const MAX_PAR: f64 = 25_000_000.0;
/// The Treasury curve the bonds' yields are built on: Nelson-Siegel's level,
/// slope and curvature as fractions, and its decay in years.
pub const CURVE: (f64, f64, f64, f64) = (0.0465, -0.0085, 0.0060, 2.2);
/// The market's spread curve: basis points at zero duration, and how much more
/// each step of `ln(1 + duration)` adds.
const SPREAD_BASE: f64 = 55.0;
const SPREAD_SLOPE: f64 = 32.0;
/// A bond's own noise around its curve, in basis points.
const SPREAD_NOISE: f64 = 14.0;

/// The Treasury curve's yield at `years`, as a fraction.
#[must_use]
pub fn treasury_yield(years: f64) -> f64 {
    let (level, slope, curvature, decay) = CURVE;
    let t = years.max(1e-6) / decay;
    let loading = (1.0 - (-t).exp()) / t;
    level + slope * loading + curvature * (loading - (-t).exp())
}

/// A sector's fitted spread curve at `duration`, in basis points.
#[must_use]
pub fn fitted_spread(sector: usize, duration: f64) -> f64 {
    SPREAD_BASE + SECTORS[sector].2 + SPREAD_SLOPE * (1.0 + duration.max(0.0)).ln()
}

/// The CUSIP check digit of an issuer and issue's eight characters, by the CUSIP
/// rules: letters count from 10, every second value doubles, and the digits of
/// the products are summed.
///
/// # Panics
///
/// Panics for characters other than digits, upper-case letters, `*`, `@` and
/// `#`, which a CUSIP cannot hold.
#[must_use]
pub fn cusip_check_digit(base: &str) -> char {
    let sum: u32 = base
        .chars()
        .enumerate()
        .map(|(i, c)| {
            let value = match c {
                '0'..='9' => c as u32 - '0' as u32,
                'A'..='Z' => c as u32 - 'A' as u32 + 10,
                '*' => 36,
                '@' => 37,
                '#' => 38,
                _ => panic!("{c:?} is not a CUSIP character"),
            };
            let value = if i % 2 == 1 { value * 2 } else { value };
            value / 10 + value % 10
        })
        .sum();
    char::from_digit((10 - sum % 10) % 10, 10).expect("a digit")
}

/// The characters an issue number is written in.
const ALPHABET: &[u8; 36] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/// A bond's price per 100 of par, its modified duration and its yield, from its
/// annual coupon and yield as fractions, with semi-annual payments, valued on a
/// coupon date.
fn price_and_duration(coupon: f64, yield_: f64, years: f64) -> (f64, f64) {
    let periods = (years * 2.0).ceil().max(1.0) as i32;
    let rate = yield_ / 2.0;
    let payment = coupon * 100.0 / 2.0;
    let (mut price, mut weighted) = (0.0, 0.0);
    for k in 1..=periods {
        let flow = if k == periods {
            payment + 100.0
        } else {
            payment
        };
        let present = flow / (1.0 + rate).powi(k);
        price += present;
        weighted += f64::from(k) / 2.0 * present;
    }
    let macaulay = weighted / price;
    (price, macaulay / (1.0 + rate))
}

/// An issuer: its name, ticker, sector and rating, by index into [`SECTORS`]
/// and [`RATINGS`], and the first six characters of its bonds' CUSIPs.
#[derive(Clone, Debug)]
struct Issuer {
    name: String,
    ticker: String,
    sector: usize,
    rating: usize,
    cusip: String,
}

/// Bonds on an as-of date.
#[derive(Clone, Debug)]
pub struct Bonds {
    options: BondsOptions,
    issuers: Vec<Issuer>,
}

impl Bonds {
    /// Builds the generator and its issuers.
    ///
    /// # Errors
    ///
    /// Returns an error for more than 1,000,000 bonds.
    pub fn new(options: BondsOptions) -> Result<Self, OptionsError> {
        if options.rows > MAX_BONDS {
            return Err(OptionsError::TooManyBonds {
                rows: options.rows,
                limit: MAX_BONDS,
            });
        }
        let count = usize::try_from(options.rows.div_ceil(6).clamp(1, 20_000)).unwrap_or(1);
        let sectors = Weighted::new(&SECTORS.map(|s| s.1));
        let ratings = Weighted::new(&RATINGS.map(|r| r.1));
        let issuers = (0..count)
            .map(|i| {
                let mut rng = Rng::for_key(options.seed, Stream::BondIssuers, i as u64);
                let word = NAMES[i % NAMES.len()];
                let suffix = SUFFIXES[(i / NAMES.len()) % SUFFIXES.len()];
                let round = i / (NAMES.len() * SUFFIXES.len());
                let name = if round == 0 {
                    format!("{word} {suffix}")
                } else {
                    format!("{word} {suffix} {}", round + 1)
                };
                let ticker = format!(
                    "{}{}",
                    word[..3].to_uppercase(),
                    char::from(ALPHABET[10 + (i / NAMES.len()) % 26])
                );
                // Six characters: three letters of the name, then the issuer's
                // number in base 36, which keeps every issuer's distinct.
                let number = i as u64;
                let mut digits = String::new();
                for power in [36u64 * 36, 36, 1] {
                    digits.push(char::from(ALPHABET[(number / power % 36) as usize]));
                }
                Issuer {
                    cusip: format!("{}{digits}", word[..3].to_uppercase()),
                    name,
                    ticker,
                    sector: sectors.sample(&mut rng),
                    rating: ratings.sample(&mut rng),
                }
            })
            .collect();
        Ok(Self { options, issuers })
    }

    fn row(&self, index: u64) -> Row {
        let issuers = self.issuers.len() as u64;
        let issuer = &self.issuers[(index % issuers) as usize];
        let issue = index / issuers;
        let mut rng = Rng::for_key(self.options.seed, Stream::Bonds, index);
        let terms = Weighted::new(&TERMS.map(|t| t.1));
        let term = TERMS[terms.sample(&mut rng)].0;
        let years = (term * (0.8 + 0.25 * rng.unit())).clamp(0.4, 30.0);
        let days = (years * 365.25).round() as i64;
        let maturity = self
            .options
            .as_of
            .checked_add(jiff::Span::new().days(days))
            .expect("maturity in range");
        let years = days as f64 / 365.25;
        let bucket = TENOR_BUCKETS
            .iter()
            .find(|b| years < b.1)
            .map_or("30Y", |b| b.0);
        // The spread is the curve's at the bond's duration, which depends on the
        // yield the spread gives: a few rounds of a par bond's duration settle it.
        // The coupon is then set near the yield in eighths of a percent, and the
        // price and duration follow.
        let rich_cheap = RATINGS[issuer.rating].2 + SPREAD_NOISE * standard_normal(&mut rng);
        let spread_at =
            |duration: f64| (fitted_spread(issuer.sector, duration) + rich_cheap).max(5.0);
        let mut duration = years / 2.0;
        for _ in 0..4 {
            let yield_ = treasury_yield(years) + spread_at(duration) / 10_000.0;
            duration = price_and_duration(yield_, yield_, years).1;
        }
        let spread = spread_at(duration);
        let yield_ = treasury_yield(years) + spread / 10_000.0;
        let coupon = ((yield_ + (rng.unit() - 0.5) * 0.01) * 800.0)
            .round()
            .max(1.0)
            / 800.0;
        let (price, duration) = price_and_duration(coupon, yield_, years);
        let fitted = fitted_spread(issuer.sector, duration);
        let par = (MAX_PAR / PAR_STEP).powf(rng.unit()).round() * PAR_STEP;
        let issue_code = format!(
            "{}{}",
            char::from(ALPHABET[10 + (issue / 36 % 26) as usize]),
            char::from(ALPHABET[(issue % 36) as usize])
        );
        let base = format!("{}{issue_code}", issuer.cusip);
        let round = |v: f64, places: i32| {
            let scale = 10f64.powi(places);
            (v * scale).round() / scale
        };
        // The risk is the rounded columns', so the columns agree with each other.
        let (price, duration) = (round(price, 6), round(duration, 4));
        Row {
            cusip: format!("{base}{}", cusip_check_digit(&base)),
            issuer: issuer.name.clone(),
            ticker: issuer.ticker.clone(),
            sector: SECTORS[issuer.sector].0,
            rating: RATINGS[issuer.rating].0,
            coupon,
            maturity: epoch_days(maturity),
            years: round(years, 4),
            bucket,
            price,
            yield_: round(yield_, 6),
            // To a tenth of a basis point.
            spread: round(spread / 10_000.0, 5),
            fitted: round(fitted / 10_000.0, 5),
            rich_cheap: round((spread - fitted) / 10_000.0, 5),
            duration,
            dv01: round(price / 100.0 * duration * par / 10_000.0, 2),
            par: from_f64(par, 2),
            market_value: round(price / 100.0 * par, 2),
        }
    }
}

/// One bond's values.
struct Row {
    cusip: String,
    issuer: String,
    ticker: String,
    sector: &'static str,
    rating: &'static str,
    coupon: f64,
    maturity: i32,
    years: f64,
    bucket: &'static str,
    price: f64,
    yield_: f64,
    spread: f64,
    fitted: f64,
    rich_cheap: f64,
    duration: f64,
    dv01: f64,
    par: i128,
    market_value: f64,
}

/// The schema of [`Bonds`]: rates, yields and spreads as fractions, prices per
/// 100 of par.
#[must_use]
pub fn schema() -> Schema {
    let float = |name: &str| Field::new(name, DataType::Float64, false);
    Schema::new(vec![
        Field::new("cusip", DataType::Utf8, false),
        Field::new("issuer", DataType::Utf8, false),
        Field::new("ticker", DataType::Utf8, false),
        Field::new("sector", DataType::Utf8, false),
        Field::new("rating", DataType::Utf8, false),
        float("coupon_rate"),
        Field::new("maturity_date", DataType::Date32, false),
        float("years_to_maturity"),
        Field::new("tenor_bucket", DataType::Utf8, false),
        float("price"),
        float("yield_to_maturity"),
        float("spread"),
        float("fitted_spread"),
        float("rich_cheap"),
        float("duration"),
        float("dv01_usd"),
        Field::new("par", DataType::Decimal128(18, 2), false),
        float("market_value_usd"),
    ])
}

impl Dataset for Bonds {
    fn schema(&self) -> SchemaRef {
        Arc::new(schema())
    }

    fn num_rows(&self) -> u64 {
        self.options.rows
    }

    fn batch(&self, rows: Range<u64>) -> RecordBatch {
        let rows: Vec<Row> = rows.map(|i| self.row(i)).collect();
        let text = |pick: fn(&Row) -> &str| -> ArrayRef {
            Arc::new(StringArray::from_iter_values(rows.iter().map(pick)))
        };
        let float = |pick: fn(&Row) -> f64| -> ArrayRef {
            Arc::new(Float64Array::from_iter_values(rows.iter().map(pick)))
        };
        let columns: Vec<ArrayRef> = vec![
            text(|r| &r.cusip),
            text(|r| &r.issuer),
            text(|r| &r.ticker),
            text(|r| r.sector),
            text(|r| r.rating),
            float(|r| r.coupon),
            Arc::new(Date32Array::from_iter_values(
                rows.iter().map(|r| r.maturity),
            )),
            float(|r| r.years),
            text(|r| r.bucket),
            float(|r| r.price),
            float(|r| r.yield_),
            float(|r| r.spread),
            float(|r| r.fitted),
            float(|r| r.rich_cheap),
            float(|r| r.duration),
            float(|r| r.dv01),
            decimal_array(rows.iter().map(|r| r.par), 18, 2),
            float(|r| r.market_value),
        ];
        RecordBatch::try_new(self.schema(), columns).expect("columns match the schema")
    }
}
