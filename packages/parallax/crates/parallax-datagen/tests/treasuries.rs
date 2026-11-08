//! Treasury curves and intraday yields: reproducibility, and the bond market's
//! calendar and sessions.

mod common;

use common::{f64s, hash, i32s, i64s, strings};
use jiff::civil::{Date, date};
use parallax_datagen::calendar::{epoch_days, from_epoch_days};
use parallax_datagen::treasuries::{
    Curves, CurvesOptions, ELECTRONIC, QUOTED, TENORS, Yields, YieldsOptions, curves_schema,
    yields_schema,
};
use parallax_datagen::{Dataset, OptionsError};
use parallax_engine::calendar::{Market, TradingCalendar};

fn curves() -> Curves {
    Curves::new(&CurvesOptions::default()).unwrap()
}

fn yields() -> Yields {
    Yields::new(&YieldsOptions::default()).unwrap()
}

/// An instant written in New York time.
fn at(text: &str) -> i64 {
    format!("{text}[America/New_York]")
        .parse::<jiff::Zoned>()
        .unwrap()
        .timestamp()
        .as_microsecond()
}

#[test]
fn same_options_give_same_rows_and_any_range_matches_a_full_run() {
    for (dataset, other) in [
        (
            Box::new(curves()) as Box<dyn Dataset>,
            Box::new(
                Curves::new(&CurvesOptions {
                    seed: 43,
                    ..CurvesOptions::default()
                })
                .unwrap(),
            ) as Box<dyn Dataset>,
        ),
        (
            Box::new(yields()),
            Box::new(
                Yields::new(&YieldsOptions {
                    seed: 43,
                    ..YieldsOptions::default()
                })
                .unwrap(),
            ),
        ),
    ] {
        let rows = dataset.num_rows();
        let full = dataset.batch(0..rows);
        assert_eq!(hash(&full.slice(101, 700)), hash(&dataset.batch(101..801)));
        assert_ne!(hash(&full), hash(&other.batch(0..rows)));
    }
    assert_eq!(curves().schema().as_ref(), &curves_schema());
    assert_eq!(yields().schema().as_ref(), &yields_schema());
}

#[test]
fn golden_rows_are_stable() {
    // These hashes lock the generators' output; a change means every stored
    // expectation built from them, such as the charts' screenshots, is invalid.
    let curves = curves();
    let yields = yields();
    assert_eq!(hash(&curves.batch(0..curves.num_rows())), GOLDEN_CURVES);
    assert_eq!(hash(&yields.batch(0..yields.num_rows())), GOLDEN_YIELDS);
}

const GOLDEN_CURVES: u64 = 2_851_985_612_112_908_841;
const GOLDEN_YIELDS: u64 = 15_600_632_331_999_159_432;

#[test]
fn a_curve_is_drawn_each_day_the_bond_market_trades_and_no_other() {
    let dataset = curves();
    let batch = dataset.batch(0..dataset.num_rows());
    let dates: Vec<Date> = i32s(&batch, "curve_date")
        .into_iter()
        .map(|d| from_epoch_days(d.unwrap()))
        .collect();
    let sifma = TradingCalendar::new(Market::Sifma, None);
    let mut days: Vec<Date> = dates.clone();
    days.dedup();
    assert!(days.iter().all(|&d| sifma.is_open(epoch_days(d))));
    let expected = (epoch_days(date(2026, 1, 2))..=epoch_days(date(2026, 11, 30)))
        .filter(|&d| sifma.is_open(d))
        .count();
    assert_eq!(days.len(), expected);
    // Columbus Day, Veterans Day and Thanksgiving close the bond market; the
    // day after Thanksgiving closes early but trades.
    for closed in [date(2026, 10, 12), date(2026, 11, 11), date(2026, 11, 26)] {
        assert!(!days.contains(&closed), "{closed}");
    }
    assert!(days.contains(&date(2026, 11, 27)));
    // Each day lists every tenor, short to long.
    let tenors = strings(&batch, "tenor");
    for (i, tenor) in tenors.iter().enumerate() {
        assert_eq!(*tenor, Some(TENORS[i % TENORS.len()].0));
    }
    for y in f64s(&batch, "yield") {
        assert!((0.02..0.08).contains(&y.unwrap()), "{y:?}");
    }
}

#[test]
fn each_point_s_change_is_its_yield_less_the_day_before_s() {
    let dataset = curves();
    let batch = dataset.batch(0..dataset.num_rows());
    let yields: Vec<f64> = f64s(&batch, "yield")
        .into_iter()
        .map(Option::unwrap)
        .collect();
    let changes = f64s(&batch, "change");
    let n = TENORS.len();
    // The first day has no day before it.
    assert!(changes[..n].iter().all(Option::is_none));
    for i in n..yields.len() {
        let change = changes[i].unwrap();
        assert!(
            (change - (yields[i] - yields[i - n])).abs() < 1e-12,
            "row {i}"
        );
        // To a tenth of a basis point.
        assert_eq!(change, (change * 1e5).round() / 1e5, "row {i}");
    }
}

#[test]
fn quotes_fall_inside_their_sessions_and_none_on_thanksgiving() {
    let dataset = yields();
    let batch = dataset.batch(0..dataset.num_rows());
    let times: Vec<i64> = i64s(&batch, "time")
        .into_iter()
        .map(Option::unwrap)
        .collect();
    let trade_dates: Vec<i32> = i32s(&batch, "trade_date")
        .into_iter()
        .map(Option::unwrap)
        .collect();
    let tenors = strings(&batch, "tenor");
    let quotes = times.len() / QUOTED.len();
    let calendar = TradingCalendar::new(Market::Sifma, Some(ELECTRONIC));
    for (i, (&time, &day)) in times.iter().zip(&trade_dates).enumerate() {
        let (opens, closes) = calendar.session_of(day).expect("an open day");
        assert!((opens..closes).contains(&time), "row {i}");
        assert_eq!(calendar.trading_date(time), day, "row {i}");
        assert_eq!(tenors[i], Some(TENORS[QUOTED[i / quotes]].0));
    }
    let first: Vec<i64> = times[..quotes].to_vec();
    // Five minutes apart through a session, and on to the next session's open.
    for (w, d) in first.windows(2).zip(trade_dates.windows(2)) {
        if d[0] == d[1] {
            assert_eq!(w[1] - w[0], 300_000_000);
        } else {
            assert_eq!(Some(w[1]), calendar.session_of(d[1]).map(|s| s.0));
        }
    }
    assert_eq!(
        first[0],
        at("2026-11-22T18:00"),
        "Monday's session opens on Sunday"
    );
    assert!(!trade_dates.contains(&epoch_days(date(2026, 11, 26))));
    // Friday's session opens on Thanksgiving evening and closes at 2 p.m.
    let friday: Vec<i64> = first
        .iter()
        .zip(&trade_dates)
        .filter(|(_, d)| **d == epoch_days(date(2026, 11, 27)))
        .map(|(t, _)| *t)
        .collect();
    assert_eq!(friday.first(), Some(&at("2026-11-26T18:00")));
    assert_eq!(friday.last(), Some(&at("2026-11-27T13:55")));
    assert_eq!(friday.len(), 20 * 12);
    // Six sessions: five of 23 hours and Friday's of 20.
    assert_eq!(quotes, (5 * 23 + 20) * 12);
}

#[test]
fn yields_move_a_little_each_quote_and_keep_the_curve_s_order() {
    let dataset = yields();
    let batch = dataset.batch(0..dataset.num_rows());
    let values: Vec<f64> = f64s(&batch, "yield")
        .into_iter()
        .map(Option::unwrap)
        .collect();
    let quotes = values.len() / QUOTED.len();
    for path in values.chunks(quotes) {
        // No five-minute move reaches 2 basis points.
        assert!(path.windows(2).all(|w| (w[1] - w[0]).abs() < 0.000_2));
        assert!(path.iter().all(|y| (0.02..0.08).contains(y)));
    }
}

#[test]
fn options_without_a_trading_day_or_with_a_wrong_step_are_refused() {
    let thanksgiving = date(2026, 11, 26);
    assert_eq!(
        Curves::new(&CurvesOptions {
            start: thanksgiving,
            end: thanksgiving,
            ..CurvesOptions::default()
        })
        .unwrap_err(),
        OptionsError::NoBondMarketDays {
            start: thanksgiving,
            end: thanksgiving
        }
    );
    for minutes in [0, 61] {
        assert_eq!(
            Yields::new(&YieldsOptions {
                minutes,
                ..YieldsOptions::default()
            })
            .unwrap_err(),
            OptionsError::QuoteMinutes(minutes)
        );
    }
    assert_eq!(
        Yields::new(&YieldsOptions {
            minutes: 60,
            ..YieldsOptions::default()
        })
        .unwrap()
        .num_rows(),
        (5 * 23 + 20) * QUOTED.len() as u64
    );
}
