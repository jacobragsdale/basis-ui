//! Trading time on SIFMA's calendar: its closes take no space, its early closes
//! shorten their days, and a session that opens the evening before trades for
//! the next day.

#![allow(missing_docs)]

use std::sync::Arc;

use arrow_array::{ArrayRef, Float64Array, RecordBatch, TimestampMicrosecondArray};
use arrow_schema::{DataType, Field, Schema, TimeUnit};
use jiff::civil::time;
use parallax_engine::calendar::{Market, Session, TradingCalendar, epoch_days};
use parallax_engine::chart::{
    ChartConfig, ChartData, ChartKind, ChartRequest, ChartView, Interval, OhlcColumns,
    PointColumns, XAxis,
};
use parallax_engine::{Table, TableOptions};

const HOUR: f64 = 3_600_000_000.0;

/// An instant written in New York time.
fn at(text: &str) -> i64 {
    format!("{text}[America/New_York]")
        .parse::<jiff::Zoned>()
        .unwrap()
        .timestamp()
        .as_microsecond()
}

fn day(text: &str) -> i32 {
    epoch_days(text.parse().unwrap())
}

fn electronic() -> TradingCalendar {
    TradingCalendar::new(
        Market::Sifma,
        Some(Session {
            opens: time(18, 0, 0, 0),
            closes: time(17, 0, 0, 0),
        }),
    )
}

#[test]
fn the_bond_market_s_holidays_take_no_space_where_the_nyse_s_do() {
    let (sifma, nyse) = (
        TradingCalendar::new(Market::Sifma, None),
        TradingCalendar::nyse(),
    );
    // Columbus Day 2026 is Monday 12 October: closed for bonds, open for stocks.
    let gap = |c: &TradingCalendar| {
        c.date_position(day("2026-10-13")) - c.date_position(day("2026-10-09"))
    };
    assert_eq!(gap(&sifma), 1.0);
    assert_eq!(gap(&nyse), 2.0);
    assert!(!sifma.is_open(day("2026-11-11")), "Veterans Day");
    assert!(nyse.is_open(day("2026-11-11")));
    assert_eq!(
        sifma.day_at(sifma.day_index(day("2026-10-12"))),
        day("2026-10-13")
    );
}

#[test]
fn an_early_close_shortens_its_day_so_closed_hours_take_no_space() {
    let sifma = TradingCalendar::new(Market::Sifma, None);
    assert_eq!(sifma.session_micros() as f64, 9.0 * HOUR, "08:00 to 17:00");
    let position = |text: &str| sifma.instant_position(at(text));
    // Thanksgiving is Thursday 26 November 2026; Friday closes at 2 p.m.
    let wednesday = position("2026-11-25T08:00");
    assert_eq!(position("2026-11-25T17:00") - wednesday, 9.0 * HOUR);
    assert_eq!(
        position("2026-11-26T12:00"),
        position("2026-11-27T08:00"),
        "Thanksgiving takes no space"
    );
    assert_eq!(
        position("2026-11-27T14:00") - position("2026-11-27T08:00"),
        6.0 * HOUR
    );
    assert_eq!(position("2026-11-27T15:30"), position("2026-11-27T14:00"));
    assert_eq!(
        position("2026-11-27T14:00"),
        position("2026-11-30T08:00"),
        "Monday opens where Friday closed"
    );
    // And back: an instant inside a session is found again.
    for text in ["2026-11-25T09:15", "2026-11-27T13:59", "2026-11-30T16:00"] {
        assert_eq!(sifma.instant_at(position(text)), at(text), "{text}");
    }
}

#[test]
fn a_session_that_opens_the_evening_before_trades_for_the_next_day() {
    let calendar = electronic();
    assert_eq!(calendar.session_micros() as f64, 23.0 * HOUR);
    let position = |text: &str| calendar.instant_position(at(text));
    // Monday's session opens on Sunday at 18:00.
    let monday = position("2026-11-01T18:00");
    assert_eq!(position("2026-11-01T19:00") - monday, HOUR);
    assert_eq!(position("2026-11-02T17:00") - monday, 23.0 * HOUR);
    // The hour between sessions takes no space, nor does the weekend.
    assert_eq!(position("2026-11-02T17:30"), position("2026-11-02T18:00"));
    assert_eq!(
        position("2026-10-30T17:00"),
        monday,
        "Friday's close is Monday's open"
    );
    assert_eq!(position("2026-10-31T12:00"), monday);
    // Thanksgiving's session never opens: Wednesday evening is Friday's, which
    // ends at 2 p.m., three hours short.
    assert_eq!(position("2026-11-25T17:00"), position("2026-11-25T18:00"));
    assert_eq!(
        position("2026-11-25T19:00") - position("2026-11-25T18:00"),
        0.0
    );
    let friday = position("2026-11-26T18:00");
    assert_eq!(position("2026-11-27T14:00") - friday, 20.0 * HOUR);
    for text in ["2026-11-01T18:30", "2026-11-04T03:00", "2026-11-27T09:00"] {
        assert_eq!(calendar.instant_at(position(text)), at(text), "{text}");
    }
}

#[test]
fn a_session_opens_and_closes_at_its_instants_and_a_closed_day_has_none() {
    let calendar = electronic();
    assert_eq!(
        calendar.session_of(day("2026-11-27")),
        Some((at("2026-11-26T18:00"), at("2026-11-27T14:00"))),
        "Friday's session opens on Thanksgiving evening and closes early"
    );
    assert_eq!(calendar.session_of(day("2026-11-26")), None);
    assert_eq!(calendar.session_of(day("2026-11-28")), None);
    assert_eq!(
        calendar.session_of(day("2026-11-30")),
        Some((at("2026-11-29T18:00"), at("2026-11-30T17:00")))
    );
    assert_eq!(
        calendar.trading_date(at("2026-11-29T18:00")),
        day("2026-11-30")
    );
    assert_eq!(
        calendar.trading_date(at("2026-11-30T17:30")),
        day("2026-11-30")
    );
}

/// A line chart of quotes every half hour through the electronic sessions from
/// `first` to `last`, on SIFMA's trading time.
fn quotes(first: &str, last: &str) -> (Table, ChartView) {
    quotes_as(first, last, ChartKind::Line)
}

/// The quotes of [`quotes`] drawn as `kind`, each quote its own open, high, low
/// and close.
fn quotes_as(first: &str, last: &str, kind: ChartKind) -> (Table, ChartView) {
    let calendar = electronic();
    let step = 1_800_000_000;
    let times: Vec<i64> = (day(first)..=day(last))
        .filter_map(|d| calendar.session_of(d))
        .flat_map(|(opens, closes)| (opens..closes).step_by(step))
        .collect();
    let schema = Schema::new(vec![
        Field::new(
            "time",
            DataType::Timestamp(TimeUnit::Microsecond, Some("UTC".into())),
            false,
        ),
        Field::new("yield", DataType::Float64, false),
    ]);
    let values: Vec<f64> = (0..times.len()).map(|i| i as f64).collect();
    let batch = RecordBatch::try_new(
        Arc::new(schema),
        vec![
            Arc::new(TimestampMicrosecondArray::from(times).with_timezone("UTC")) as ArrayRef,
            Arc::new(Float64Array::from(values)) as ArrayRef,
        ],
    )
    .unwrap();
    let mut table = Table::new(&batch.schema(), TableOptions::default()).unwrap();
    table.load(&[batch]).unwrap();
    let ohlc = (kind == ChartKind::Candlestick).then(|| OhlcColumns {
        open: "yield".into(),
        high: "yield".into(),
        low: "yield".into(),
        close: "yield".into(),
    });
    let config = ChartConfig {
        kind,
        x: "time".into(),
        y: if ohlc.is_some() {
            Vec::new()
        } else {
            vec!["yield".into()]
        },
        series: None,
        ohlc,
        filters: Vec::new(),
        axis: XAxis::Trading,
        indicators: Vec::new(),
        volume: None,
        compare: false,
        events: None,
        points: PointColumns::default(),
        orders: std::collections::BTreeMap::new(),
        market: Market::Sifma,
        session: Some(Session {
            opens: time(18, 0, 0, 0),
            closes: time(17, 0, 0, 0),
        }),
    };
    let view = ChartView::new(&table, config).unwrap();
    (table, view)
}

#[test]
fn an_overnight_session_s_day_ticks_sit_at_its_opens_and_name_the_day_it_trades_for() {
    let (table, view) = quotes("2026-11-23", "2026-12-01");
    let request = ChartRequest {
        x: None,
        y: None,
        width: 1_000,
        height: 100,
    };
    let ticks = view.reduce(&table, &request).ticks;
    let days = [
        ("Nov 23", "2026-11-23"),
        ("Nov 24", "2026-11-24"),
        ("Nov 25", "2026-11-25"),
        ("Nov 27", "2026-11-27"),
        ("Nov 30", "2026-11-30"),
        ("Dec 1", "2026-12-01"),
    ];
    let labels: Vec<&str> = ticks.iter().map(|t| t.label.as_str()).collect();
    assert_eq!(labels, days.map(|d| d.0), "no tick names Thanksgiving");
    let calendar = electronic();
    for (tick, (_, trades)) in ticks.iter().zip(days) {
        assert_eq!(tick.x, calendar.session_position(day(trades)), "{tick:?}");
        let (opens, _) = calendar.session_of(day(trades)).unwrap();
        assert_eq!(calendar.instant_at(tick.x), opens, "{tick:?}");
    }
}

#[test]
fn a_daylight_saving_change_moves_no_session() {
    // Clocks went forward on Sunday 8 March 2026 and back on Sunday 1 November,
    // each at 2 a.m., between sessions on either calendar.
    let sifma = TradingCalendar::new(Market::Sifma, None);
    let position = |c: &TradingCalendar, text: &str| c.instant_position(at(text));
    assert_eq!(
        position(&sifma, "2026-03-09T08:00"),
        position(&sifma, "2026-03-06T17:00")
    );
    assert_eq!(
        position(&sifma, "2026-03-09T17:00") - position(&sifma, "2026-03-09T08:00"),
        9.0 * HOUR
    );
    let calendar = electronic();
    for (sunday, monday) in [
        ("2026-03-08T18:00", "2026-03-09T17:00"),
        ("2026-11-01T18:00", "2026-11-02T17:00"),
    ] {
        assert_eq!(
            position(&calendar, monday) - position(&calendar, sunday),
            23.0 * HOUR
        );
    }
    for text in [
        "2026-03-08T19:00",
        "2026-03-09T03:00",
        "2026-11-01T19:00",
        "2026-11-02T03:00",
    ] {
        assert_eq!(
            calendar.instant_at(position(&calendar, text)),
            at(text),
            "{text}"
        );
    }
}

#[test]
fn the_nyse_axis_is_as_it_was() {
    let nyse = TradingCalendar::nyse();
    let position = |text: &str| nyse.instant_position(at(text));
    assert_eq!(nyse.session_micros() as f64, 6.5 * HOUR);
    assert_eq!(
        position("2026-11-02T10:30") - position("2026-11-02T09:30"),
        HOUR
    );
    assert_eq!(position("2026-10-30T16:00"), position("2026-11-02T09:30"));
    // The day after Thanksgiving is a full day on this axis: NYSE's early closes
    // are not modelled.
    assert_eq!(
        position("2026-11-27T16:00") - position("2026-11-27T09:30"),
        6.5 * HOUR
    );
}

#[test]
fn an_overnight_session_s_daily_candles_are_its_sessions() {
    let (table, view) = quotes_as("2026-11-23", "2026-12-01", ChartKind::Candlestick);
    let request = ChartRequest {
        x: None,
        y: None,
        width: 120,
        height: 100,
    };
    let ChartData::Candles {
        interval, candles, ..
    } = view.reduce(&table, &request).data
    else {
        panic!("not candles")
    };
    assert_eq!(interval, Interval::Day);
    let calendar = electronic();
    let days = [
        "2026-11-23",
        "2026-11-24",
        "2026-11-25",
        "2026-11-27",
        "2026-11-30",
        "2026-12-01",
    ];
    assert_eq!(
        candles.len(),
        days.len(),
        "one candle per session, none for Thanksgiving"
    );
    for ((bucket, candle), trades) in candles.iter().zip(days) {
        let (opens, closes) = calendar.session_of(day(trades)).unwrap();
        // Each candle starts at its session's open, the evening before, and
        // holds the session's first and last quotes.
        assert_eq!(bucket.start, opens, "{trades}");
        assert_eq!(
            bucket.from,
            calendar.session_position(day(trades)),
            "{trades}"
        );
        let first = candle.open.unwrap();
        let last = candle.close.unwrap();
        let time = table.column(0);
        let at = |slot: usize| match time.scalar(slot) {
            parallax_engine::Scalar::Timestamp(t) => t,
            other => panic!("{other:?}"),
        };
        assert_eq!(at(first), opens, "{trades}");
        assert_eq!(at(last), closes - 1_800_000_000, "{trades}");
    }
}
