//! Bonds: reproducibility, CUSIPs, and the identities between their columns.

mod common;

use std::collections::HashSet;

use common::{decimals, f64s, hash, strings};
use parallax_datagen::bonds::{
    Bonds, BondsOptions, MAX_BONDS, RATINGS, SECTORS, TENOR_BUCKETS, cusip_check_digit,
    fitted_spread, schema, treasury_yield,
};
use parallax_datagen::{Dataset, OptionsError};

fn bonds(rows: u64) -> Bonds {
    Bonds::new(BondsOptions {
        rows,
        ..BondsOptions::default()
    })
    .unwrap()
}

#[test]
fn same_options_give_same_rows_and_any_range_matches_a_full_run() {
    let dataset = bonds(2_000);
    let full = dataset.batch(0..2_000);
    assert_eq!(full.schema().as_ref(), &schema());
    assert_eq!(hash(&full), hash(&bonds(2_000).batch(0..2_000)));
    assert_eq!(
        hash(&full.slice(345, 678)),
        hash(&dataset.batch(345..1_023))
    );
    let other = Bonds::new(BondsOptions {
        seed: 43,
        rows: 2_000,
        ..BondsOptions::default()
    })
    .unwrap();
    assert_ne!(hash(&full), hash(&other.batch(0..2_000)));
}

#[test]
fn golden_rows_are_stable() {
    // This hash locks the generator's output; a change means every stored
    // expectation built from it, such as the charts' screenshots, is invalid.
    assert_eq!(hash(&bonds(600).batch(0..600)), GOLDEN);
}

const GOLDEN: u64 = 5_655_194_409_302_964_230;

#[test]
fn check_digits_follow_the_cusip_rules() {
    // Published CUSIPs.
    for cusip in [
        "037833100",
        "17275R102",
        "38259P508",
        "594918104",
        "912828C57",
    ] {
        assert_eq!(
            cusip_check_digit(&cusip[..8]),
            cusip.chars().last().unwrap(),
            "{cusip}"
        );
    }
    let batch = bonds(5_000).batch(0..5_000);
    let cusips = strings(&batch, "cusip");
    let distinct: HashSet<_> = cusips.iter().collect();
    assert_eq!(
        distinct.len(),
        cusips.len(),
        "every bond's CUSIP is its own"
    );
    for cusip in cusips.into_iter().flatten() {
        assert_eq!(cusip.len(), 9);
        assert_eq!(
            cusip_check_digit(&cusip[..8]),
            cusip.chars().last().unwrap()
        );
    }
}

#[test]
fn spreads_yields_and_risk_agree() {
    let batch = bonds(3_000).batch(0..3_000);
    let years = f64s(&batch, "years_to_maturity");
    let ytm = f64s(&batch, "yield_to_maturity");
    let spread = f64s(&batch, "spread_bp");
    let fitted = f64s(&batch, "fitted_spread_bp");
    let rich_cheap = f64s(&batch, "rich_cheap_bp");
    let duration = f64s(&batch, "duration");
    let dv01 = f64s(&batch, "dv01_usd");
    let price = f64s(&batch, "price");
    let par = decimals(&batch, "par");
    let sector = strings(&batch, "sector");
    let rating = strings(&batch, "rating");
    let bucket = strings(&batch, "tenor_bucket");
    for i in 0..batch.num_rows() {
        let (years, ytm, spread) = (years[i].unwrap(), ytm[i].unwrap(), spread[i].unwrap());
        // The yield is the Treasury curve's plus the spread.
        let implied = (ytm - treasury_yield(years)) * 10_000.0;
        assert!(
            (implied - spread).abs() < 0.1,
            "row {i}: {implied} against {spread}"
        );
        // The fitted spread is the sector's curve at the bond's duration.
        let s = SECTORS.iter().position(|s| Some(s.0) == sector[i]).unwrap();
        assert!((fitted_spread(s, duration[i].unwrap()) - fitted[i].unwrap()).abs() < 0.051);
        assert!((spread - fitted[i].unwrap() - rich_cheap[i].unwrap()).abs() < 0.11);
        assert!(duration[i].unwrap() > 0.0 && duration[i].unwrap() < years + 0.5);
        let par = par[i] as f64 / 100.0;
        assert!((250_000.0..=25_000_000.0).contains(&par) && par % 250_000.0 == 0.0);
        let expected = price[i].unwrap() / 100.0 * duration[i].unwrap() * par / 10_000.0;
        assert!((expected - dv01[i].unwrap()).abs() < 0.01 + expected * 1e-6);
        assert!(RATINGS.iter().any(|r| Some(r.0) == rating[i]));
        let named = TENOR_BUCKETS.iter().find(|b| years < b.1).unwrap().0;
        assert_eq!(bucket[i], Some(named), "row {i} at {years} years");
    }
}

#[test]
fn a_book_has_a_limit() {
    assert_eq!(
        Bonds::new(BondsOptions {
            rows: MAX_BONDS + 1,
            ..BondsOptions::default()
        })
        .unwrap_err(),
        OptionsError::TooManyBonds {
            rows: MAX_BONDS + 1,
            limit: MAX_BONDS
        }
    );
}
