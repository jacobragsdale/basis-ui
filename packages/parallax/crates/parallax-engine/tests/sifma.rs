//! The SIFMA calendar against the schedules SIFMA published: the fixture
//! `@basis/ui/dates` is tested against, with the disputes between SIFMA's own
//! sources it lists. The Rust also writes `tests/fixtures/sifma.json`, each year's
//! closes and early closes from 1996 to 2050, which `@basis/ui`'s tests check its
//! SIFMA calendar against, so the two can't disagree past the published years.
//! The test fails when the committed file is out of date; rerun it with
//! `PARALLAX_UPDATE_FIXTURES=1` after changing the calendar, and commit both.

#![allow(missing_docs)]

use std::collections::BTreeSet;

use jiff::civil::{Date, Weekday, date};
use parallax_engine::sifma::{self, EXCEPTIONS, FIRST_YEAR, Irregular};
use serde_json::{Value, json};

/// The schedules SIFMA published, as `@basis/ui/dates`' tests read them.
fn published() -> Value {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../ui/tests/fixtures/calendars/sifma.json");
    serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap()
}

fn text(day: Date) -> String {
    day.to_string()
}

/// A day as the fixtures write it: "closed", "open", or the early close's time.
fn shown(day: Date) -> String {
    match sifma::day(day) {
        None => "open".into(),
        Some(Irregular::Closed) => "closed".into(),
        Some(Irregular::ClosesAt(at)) => at.strftime("%H:%M").to_string(),
    }
}

/// A source's days, as date and "closed" or closing time.
fn listed(source: &Value) -> Vec<(Date, String)> {
    source["days"]
        .as_array()
        .unwrap()
        .iter()
        .map(|day| {
            let date: Date = day["date"].as_str().unwrap().parse().unwrap();
            let close = day["close"].as_str().unwrap_or("closed").to_owned();
            (date, close)
        })
        .collect()
}

/// Whether the fixture names `source`'s entry for `day` as disputed.
fn disputed(fixture: &Value, source: &Value, day: Date) -> bool {
    fixture["disputes"]
        .as_array()
        .unwrap()
        .iter()
        .any(|d| d["source"] == source["url"] && d["date"].as_str() == Some(text(day).as_str()))
}

#[test]
fn every_day_a_source_lists_matches_the_calendar() {
    let fixture = published();
    let mut checked = 0;
    for source in fixture["sources"].as_array().unwrap() {
        for (day, close) in listed(source) {
            if !disputed(&fixture, source, day) {
                assert_eq!(shown(day), close, "{day} in {}", source["title"]);
                checked += 1;
            }
        }
    }
    assert!(checked > 400, "{checked} days checked");
}

#[test]
fn each_source_lists_every_irregular_day_of_the_years_it_covers() {
    let fixture = published();
    let unscheduled: BTreeSet<String> = fixture["unscheduled"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| d.as_str().unwrap().to_owned())
        .collect();
    for source in fixture["sources"].as_array().unwrap() {
        let days: BTreeSet<Date> = listed(source).into_iter().map(|d| d.0).collect();
        for year in source["years"].as_array().unwrap() {
            let year = i16::try_from(year.as_i64().unwrap()).unwrap();
            for (day, _) in sifma::year(year) {
                assert!(
                    days.contains(&day)
                        || unscheduled.contains(&text(day))
                        || disputed(&fixture, source, day),
                    "{day} is irregular but {} leaves it out",
                    source["title"]
                );
            }
        }
    }
}

#[test]
fn where_sources_disagree_the_calendar_follows_the_one_named() {
    let fixture = published();
    let sources = fixture["sources"].as_array().unwrap();
    let by_url = |url: &Value| sources.iter().find(|s| s["url"] == *url).unwrap();
    for dispute in fixture["disputes"].as_array().unwrap() {
        let day: Date = dispute["date"].as_str().unwrap().parse().unwrap();
        let reading = |source: &Value| {
            listed(source)
                .into_iter()
                .find(|d| d.0 == day)
                .map_or_else(|| "open".to_owned(), |d| d.1)
        };
        let (followed, rejected) = (by_url(&dispute["follows"]), by_url(&dispute["source"]));
        assert_eq!(shown(day), reading(followed), "{day}");
        assert_ne!(shown(day), reading(rejected), "{day}");
    }
}

#[test]
fn the_rules_hold_from_1996_and_weekends_always_close() {
    assert_eq!(FIRST_YEAR, 1996);
    assert_eq!(shown(date(2026, 11, 7)), "closed", "a Saturday");
    // Columbus Day and Veterans Day close the bond market, not the NYSE.
    assert_eq!(shown(date(2026, 10, 12)), "closed");
    assert_eq!(shown(date(2026, 11, 11)), "closed");
    assert_eq!(
        shown(date(2026, 11, 27)),
        "14:00",
        "the day after Thanksgiving"
    );
    assert_eq!(
        shown(date(2026, 4, 3)),
        "12:00",
        "Good Friday, with the employment report"
    );
}

/// The file `@basis/ui`'s tests read: the exceptions, then each year's irregular
/// weekdays, one year per line, so a change to the calendar reads as a diff.
fn render() -> String {
    let exceptions: Vec<Value> = EXCEPTIONS
        .iter()
        .map(|(day, irregular)| {
            let kind = match irregular {
                None => "open".to_owned(),
                Some(Irregular::Closed) => "closed".to_owned(),
                Some(Irregular::ClosesAt(at)) => at.strftime("%H:%M").to_string(),
            };
            json!([text(*day), kind])
        })
        .collect();
    let years: Vec<String> = (FIRST_YEAR..=2050)
        .map(|year| {
            let days: Vec<Value> = sifma::year(year)
                .keys()
                .map(|day| json!([text(*day), shown(*day)]))
                .collect();
            format!("    {}", json!({"year": year, "days": days}))
        })
        .collect();
    format!(
        "{{\n  \"exceptions\": {},\n  \"years\": [\n{}\n  ]\n}}\n",
        json!(exceptions),
        years.join(",\n")
    )
}

#[test]
fn committed_fixtures_are_current() {
    let contents = render();
    let parsed: Value = serde_json::from_str(&contents).expect("the rendered file is JSON");
    assert!(parsed["years"].is_array());
    // No weekend is listed: every irregular day is a weekday.
    for year in parsed["years"].as_array().unwrap() {
        for day in year["days"].as_array().unwrap() {
            let day: Date = day[0].as_str().unwrap().parse().unwrap();
            assert!(!matches!(
                day.weekday(),
                Weekday::Saturday | Weekday::Sunday
            ));
        }
    }
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/sifma.json");
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
