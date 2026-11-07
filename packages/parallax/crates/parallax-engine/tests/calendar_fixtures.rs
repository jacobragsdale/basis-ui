//! Writes `tests/fixtures/calendar.json`: for each year from 2000, the NYSE
//! holidays this calendar's rules give, the weekdays it closes on (the holidays and
//! the special closures), how many days it trades, and the next trading day after
//! each day before a closure. `@basis/ui/dates` ports the calendar to TypeScript
//! and tests its port against the file, so a UI's business days are the chart
//! axis's trading days. The test fails when the committed file is out of date;
//! rerun it with `PARALLAX_UPDATE_FIXTURES=1` after changing the calendar, and
//! commit both.

#![allow(missing_docs)]

use jiff::civil::{Date, Weekday, date};
use parallax_engine::calendar::{
    SPECIAL_CLOSURES, holidays, is_trading_day, next_trading_day, trading_days,
};
use serde_json::{Value, json};

/// The holiday rules hold from 2000, and the file runs a generation past today.
const YEARS: std::ops::RangeInclusive<i16> = 2000..=2050;

fn text(day: Date) -> String {
    day.to_string()
}

fn year_json(year: i16) -> Value {
    let (first, last) = (date(year, 1, 1), date(year, 12, 31));
    let closed: Vec<Date> = first
        .series(jiff::Span::new().days(1))
        .take_while(|day| *day <= last)
        .filter(|day| !matches!(day.weekday(), Weekday::Saturday | Weekday::Sunday))
        .filter(|day| !is_trading_day(*day))
        .collect();
    let next: Vec<Value> = closed
        .iter()
        .map(|day| {
            let before = day.yesterday().expect("in range");
            json!([text(before), text(next_trading_day(before))])
        })
        .collect();
    json!({
        "year": year,
        "tradingDays": trading_days(first, last).len(),
        "holidays": holidays(year).into_iter().map(text).collect::<Vec<_>>(),
        "closed": closed.into_iter().map(text).collect::<Vec<_>>(),
        "next": next,
    })
}

/// The file's text: one year per line, so a change to the calendar shows as a
/// readable diff.
fn render() -> String {
    let special: Vec<String> = SPECIAL_CLOSURES.into_iter().map(text).collect();
    let years: Vec<String> = YEARS
        .map(|year| format!("    {}", year_json(year)))
        .collect();
    format!(
        "{{\n  \"specialClosures\": {},\n  \"years\": [\n{}\n  ]\n}}\n",
        json!(special),
        years.join(",\n")
    )
}

#[test]
fn committed_fixtures_are_current() {
    let contents = render();
    let parsed: Value = serde_json::from_str(&contents).expect("the rendered file is JSON");
    assert!(parsed["years"].is_array());
    let path =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/calendar.json");
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
