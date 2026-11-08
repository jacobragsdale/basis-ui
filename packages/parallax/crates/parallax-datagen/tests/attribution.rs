//! Attribution: reproducibility, the factors of every portfolio's day, and the
//! signs a market's moves give them.

mod common;

use std::collections::HashMap;

use common::{f64s, hash, strings};
use parallax_datagen::attribution::{Attribution, AttributionOptions, FACTORS, schema};
use parallax_datagen::calendar::trading_days;
use parallax_datagen::{Dataset, OptionsError};

fn attribution() -> Attribution {
    Attribution::new(AttributionOptions::default()).unwrap()
}

#[test]
fn same_options_give_same_rows_and_any_range_matches_a_full_run() {
    let dataset = attribution();
    let rows = dataset.num_rows();
    let full = dataset.batch(0..rows);
    assert_eq!(full.schema().as_ref(), &schema());
    assert_eq!(hash(&full), hash(&attribution().batch(0..rows)));
    assert_eq!(hash(&full.slice(123, 300)), hash(&dataset.batch(123..423)));
    let other = Attribution::new(AttributionOptions {
        seed: 43,
        ..AttributionOptions::default()
    })
    .unwrap();
    assert_ne!(hash(&full), hash(&other.batch(0..rows)));
}

#[test]
fn golden_rows_are_stable() {
    // This hash locks the generator's output; a change means every stored
    // expectation built from it, such as the charts' screenshots, is invalid.
    let dataset = attribution();
    assert_eq!(hash(&dataset.batch(0..dataset.num_rows())), GOLDEN);
}

const GOLDEN: u64 = 633_873_832_218_598_711;

#[test]
fn every_portfolio_has_every_factor_on_every_trading_day() {
    let dataset = attribution();
    let options = AttributionOptions::default();
    let days = trading_days(options.start, options.end).len();
    let rows = dataset.num_rows();
    assert_eq!(rows as usize, days * 4 * FACTORS.len());
    let batch = dataset.batch(0..rows);
    let portfolios: Vec<&str> = strings(&batch, "portfolio").into_iter().flatten().collect();
    let factors: Vec<&str> = strings(&batch, "factor").into_iter().flatten().collect();
    let groups: Vec<&str> = strings(&batch, "factor_group")
        .into_iter()
        .flatten()
        .collect();
    assert_eq!(factors.len(), rows as usize);
    let mut seen: HashMap<(&str, &str), usize> = HashMap::new();
    for i in 0..rows as usize {
        *seen.entry((portfolios[i], factors[i])).or_default() += 1;
        let (_, group) = FACTORS.iter().find(|f| f.0 == factors[i]).unwrap();
        assert_eq!(groups[i], *group);
    }
    assert_eq!(seen.len(), 4 * FACTORS.len());
    assert!(seen.values().all(|&n| n == days));
}

#[test]
fn carry_earns_and_the_other_factors_move_both_ways() {
    let dataset = attribution();
    let batch = dataset.batch(0..dataset.num_rows());
    let factors: Vec<&str> = strings(&batch, "factor").into_iter().flatten().collect();
    let pnl: Vec<f64> = f64s(&batch, "pnl_usd").into_iter().flatten().collect();
    assert_eq!(pnl.len(), factors.len());
    let of = |name: &str| -> Vec<f64> {
        factors
            .iter()
            .zip(&pnl)
            .filter(|(f, _)| **f == name)
            .map(|(_, p)| *p)
            .collect()
    };
    assert!(of("Carry").iter().all(|&p| p > 0.0));
    assert!(of("Roll-down").iter().all(|&p| p > 0.0));
    for factor in ["Curve 10Y", "Spread IG", "Trading"] {
        let values = of(factor);
        assert!(values.iter().any(|&p| p > 0.0), "{factor}");
        assert!(values.iter().any(|&p| p < 0.0), "{factor}");
    }
    // In cents.
    assert!(
        pnl.iter()
            .all(|p| (p * 100.0 - (p * 100.0).round()).abs() < 1e-6)
    );
}

#[test]
fn a_range_without_trading_days_is_refused() {
    let options = AttributionOptions {
        start: jiff::civil::date(2026, 11, 7),
        end: jiff::civil::date(2026, 11, 8),
        ..AttributionOptions::default()
    };
    assert!(matches!(
        Attribution::new(options),
        Err(OptionsError::NoTradingDays { .. })
    ));
}
