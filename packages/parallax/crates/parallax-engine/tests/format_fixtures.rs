//! Writes `tests/fixtures/format.json`: inputs and the text this formatter shows
//! for them. `@basis/ui` ports the formatter to TypeScript and tests its port
//! against the file, so a number reads the same in a card as in the grid. The test
//! fails when the committed file is out of date; rerun it with
//! `PARALLAX_UPDATE_FIXTURES=1` after changing the formatter, and commit both.

#![allow(missing_docs)]

use parallax_engine::format::{Abbreviation, Format, Formatter, Negative, TimePrecision};
use serde_json::{Value, json};

fn format_json(format: &Format) -> Value {
    json!({
        "decimals": format.decimals,
        "thousands": format.thousands,
        "percent": format.percent,
        "abbreviate": format.abbreviate.map(|a| match a {
            Abbreviation::Thousands => "K",
            Abbreviation::Millions => "M",
            Abbreviation::Billions => "B",
        }),
        "negative": match format.negative {
            Negative::Minus => "minus",
            Negative::Parentheses => "parentheses",
        },
        "zone": format.zone,
        "precision": match format.precision {
            TimePrecision::Seconds => "seconds",
            TimePrecision::Milliseconds => "milliseconds",
            TimePrecision::Microseconds => "microseconds",
        },
    })
}

/// JSON cannot hold NaN or the infinities, so those travel as strings.
fn float_json(value: f64) -> Value {
    if value.is_nan() {
        json!("NaN")
    } else if value.is_infinite() {
        json!(if value > 0.0 { "inf" } else { "-inf" })
    } else {
        json!(value)
    }
}

fn number_formats() -> Vec<Format> {
    let with = |change: fn(&mut Format)| {
        let mut format = Format::default();
        change(&mut format);
        format
    };
    vec![
        Format::default(),
        with(|f| f.decimals = Some(0)),
        with(|f| f.decimals = Some(4)),
        with(|f| f.decimals = Some(30)),
        with(|f| f.thousands = Some(false)),
        with(|f| f.percent = true),
        with(|f| {
            f.percent = true;
            f.decimals = Some(0);
        }),
        with(|f| f.abbreviate = Some(Abbreviation::Thousands)),
        with(|f| f.abbreviate = Some(Abbreviation::Millions)),
        with(|f| {
            f.abbreviate = Some(Abbreviation::Billions);
            f.decimals = Some(3);
        }),
        with(|f| f.negative = Negative::Parentheses),
        with(|f| {
            f.negative = Negative::Parentheses;
            f.percent = true;
        }),
    ]
}

/// A fixed sequence of doubles across many magnitudes, from a xorshift generator so
/// the file never changes unless the formatter does.
fn spread_floats() -> Vec<f64> {
    let mut state: u64 = 0x9e37_79b9_7f4a_7c15;
    let mut next = move || {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        state
    };
    (0..120)
        .map(|i| {
            let mantissa = (next() >> 11) as f64 / (1u64 << 53) as f64;
            let exponent = i32::try_from(next() % 40).unwrap() - 20;
            let sign = if i % 3 == 0 { -1.0 } else { 1.0 };
            sign * mantissa * 10f64.powi(exponent)
        })
        .collect()
}

fn floats() -> Vec<f64> {
    let mut values = vec![
        0.0,
        -0.0,
        2.675,
        -2.675,
        1.005,
        0.1 + 0.2,
        0.125,
        1.0 / 3.0,
        2.0 / 3.0,
        0.5,
        1.5,
        2.5,
        -0.5,
        -0.0004,
        0.045,
        100.0,
        999.995,
        999_999.5,
        12_345.678_9,
        1_234_567.891,
        -1_234_567.891,
        1e15,
        123_456_789_012_345_680.0,
        1e21,
        1e-7,
        5e-324,
        f64::MAX,
        f64::NAN,
        f64::INFINITY,
        f64::NEG_INFINITY,
    ];
    values.extend(spread_floats());
    values
}

fn decimals() -> Vec<(i128, i8)> {
    vec![
        (0, 2),
        (-1, 2),
        (5, 0),
        (15, 1),
        (-15, 1),
        (995, 3),
        (123_456, 2),
        (-123_456, 2),
        (1, 10),
        (-1, 30),
        (12, -2),
        (-123_456_789_012_345_678_901_234_567_890_123_456, 4),
        (i128::MAX, 38),
    ]
}

fn integers() -> Vec<i64> {
    vec![
        0,
        1,
        -1,
        999,
        1000,
        1_234_567,
        -1_234_567,
        i64::MAX,
        i64::MIN,
    ]
}

fn dates() -> Vec<i32> {
    // 1970-01-01 and the day before, a recent date, the ends of year 0001 to 9999,
    // and the days just past them.
    vec![
        0, -1, 19_000, 20_398, -719_162, -719_163, 2_932_896, 2_932_897,
    ]
}

fn instant_formats() -> Vec<Format> {
    let zoned = |zone: Option<&str>, precision| Format {
        zone: zone.map(str::to_owned),
        precision,
        ..Format::default()
    };
    vec![
        zoned(None, TimePrecision::Seconds),
        zoned(None, TimePrecision::Milliseconds),
        zoned(None, TimePrecision::Microseconds),
        zoned(Some("UTC"), TimePrecision::Seconds),
        zoned(Some("Europe/London"), TimePrecision::Milliseconds),
        zoned(Some("Asia/Tokyo"), TimePrecision::Seconds),
    ]
}

fn instants() -> Vec<i64> {
    vec![
        0,
        -1,
        1_700_000_000_123_456,
        // New York's 2026 spring-forward and fall-back instants, and either side.
        1_772_953_199_999_999,
        1_772_953_200_000_000,
        1_793_511_000_000_000,
        1_793_514_600_000_000,
        // 1900-01-01T00:00:00Z, and the end of 9999-12-30 UTC.
        -2_208_988_800_000_000,
        253_402_127_999_999_999,
        i64::MAX,
    ]
}

/// One format and the cases it formats.
struct Group {
    format: Value,
    cases: Vec<Value>,
}

fn groups() -> Vec<Group> {
    let mut groups = Vec::new();
    for format in number_formats() {
        let formatter = Formatter::new(&format).unwrap();
        let mut cases = Vec::new();
        for value in floats() {
            cases.push(json!({"kind": "float", "value": float_json(value), "text": formatter.float(value)}));
        }
        for (unscaled, scale) in decimals() {
            cases.push(json!({
                "kind": "decimal", "unscaled": unscaled.to_string(), "scale": scale,
                "text": formatter.decimal(unscaled, scale),
            }));
        }
        for value in integers() {
            cases.push(json!({"kind": "integer", "value": value.to_string(), "text": formatter.integer(value)}));
        }
        groups.push(Group {
            format: format_json(&format),
            cases,
        });
    }
    let formatter = Formatter::default();
    groups.push(Group {
        format: format_json(&Format::default()),
        cases: dates()
            .into_iter()
            .map(|days| json!({"kind": "date", "days": days, "text": formatter.date(days)}))
            .collect(),
    });
    for format in instant_formats() {
        let formatter = Formatter::new(&format).unwrap();
        let mut cases = Vec::new();
        for micros in instants() {
            for zoned in [true, false] {
                cases.push(json!({
                    "kind": "timestamp", "micros": micros.to_string(), "zoned": zoned,
                    "text": formatter.timestamp(micros, zoned),
                }));
            }
        }
        groups.push(Group {
            format: format_json(&format),
            cases,
        });
    }
    groups
}

/// The file's text: one group per format, one case per line, so a change to the
/// formatter shows as a readable diff.
fn render(groups: &[Group]) -> String {
    let groups: Vec<String> = groups
        .iter()
        .map(|group| {
            let cases: Vec<String> = group
                .cases
                .iter()
                .map(|case| format!("      {case}"))
                .collect();
            format!(
                "    {{\n      \"format\": {},\n      \"cases\": [\n{}\n      ]\n    }}",
                group.format,
                cases
                    .join(",\n")
                    .replace("\n      {", "\n        {")
                    .replacen("      {", "        {", 1)
            )
        })
        .collect();
    format!("{{\n  \"groups\": [\n{}\n  ]\n}}\n", groups.join(",\n"))
}

#[test]
fn committed_fixtures_are_current() {
    let contents = render(&groups());
    let parsed: Value = serde_json::from_str(&contents).expect("the rendered file is JSON");
    assert!(parsed["groups"].is_array());
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/format.json");
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
