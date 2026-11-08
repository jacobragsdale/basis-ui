//! SIFMA's recommended closes for the US bond market, ported rule for rule from
//! `@basis/ui/dates` (`packages/ui/src/dates/sifma.ts` and its exceptions), so a
//! trading-time axis and a UI's business days agree. SIFMA recommends; each firm
//! decides. The tests check this port against the schedules SIFMA published, the
//! same fixtures `@basis/ui/dates` is tested against, and `@basis/ui`'s tests check
//! its calendar against what this port writes for every year from 1996 to 2050.
//!
//! Full closes: New Year's Day, Martin Luther King Jr. Day, Presidents Day, Good
//! Friday, Memorial Day, Juneteenth (from 2022), Independence Day, Labor Day,
//! Columbus Day, Veterans Day, Thanksgiving Day and Christmas Day. A holiday on a
//! Sunday closes the Monday after. A holiday on a Saturday closes the Friday
//! before, except New Year's Day and Veterans Day, which give no day off.
//!
//! Good Friday is a full close unless the employment report is published that day,
//! as it is when Good Friday falls on 1 to 7 April; SIFMA then recommends a noon
//! close.
//!
//! Early closes, at 2 p.m. New York time: the business day before Good Friday (when
//! it is a full close), Memorial Day, Independence Day (from 2012), Christmas Day and
//! New Year's Day, and the day after Thanksgiving. Until 2009-04-03 SIFMA also closed
//! early before Martin Luther King Jr. Day, Presidents Day, Independence Day, Labor
//! Day, Columbus Day, Veterans Day and Thanksgiving Day.

use std::collections::BTreeMap;

use jiff::civil::{Date, Time, Weekday, date, time};

use crate::calendar::easter_sunday;

/// How a market trades on a day it does not keep its regular session.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Irregular {
    /// Closed all day.
    Closed,
    /// Closing early, at this New York time.
    ClosesAt(Time),
}

/// The first year SIFMA's schedules cover, from which the rules hold.
pub const FIRST_YEAR: i16 = 1996;

/// The time SIFMA's early closes are at, and the noon close of a Good Friday with
/// the employment report.
const EARLY_CLOSE: Time = time(14, 0, 0, 0);
const NOON: Time = time(12, 0, 0, 0);
/// SIFMA's 2009 policy cut its early closes from twelve a year to five.
const FIVE_EARLY_CLOSES_FROM: Date = date(2009, 4, 3);
/// The first year SIFMA's schedules again closed early before Independence Day.
const INDEPENDENCE_EVE_FROM: i16 = 2012;
/// The first year SIFMA closes for Juneteenth.
const JUNETEENTH_FROM: i16 = 2022;

/// Where a holiday falls each year.
#[derive(Clone, Copy)]
enum Rule {
    /// A fixed month and day.
    Fixed(i8, i8),
    /// The nth weekday of a month; -1 is the last.
    Nth(i8, i8, Weekday),
    /// Days from Easter Sunday.
    Easter(i64),
}

/// What a holiday on a Saturday gives: the Friday before, or no day off.
#[derive(Clone, Copy, PartialEq, Eq)]
enum OnSaturday {
    Friday,
    Nothing,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Holiday {
    NewYear,
    King,
    Presidents,
    GoodFriday,
    Memorial,
    Juneteenth,
    Independence,
    Labor,
    Columbus,
    Veterans,
    Thanksgiving,
    Christmas,
}

const HOLIDAYS: [Holiday; 12] = [
    Holiday::NewYear,
    Holiday::King,
    Holiday::Presidents,
    Holiday::GoodFriday,
    Holiday::Memorial,
    Holiday::Juneteenth,
    Holiday::Independence,
    Holiday::Labor,
    Holiday::Columbus,
    Holiday::Veterans,
    Holiday::Thanksgiving,
    Holiday::Christmas,
];

impl Holiday {
    fn rule(self) -> Rule {
        match self {
            Self::NewYear => Rule::Fixed(1, 1),
            Self::King => Rule::Nth(1, 3, Weekday::Monday),
            Self::Presidents => Rule::Nth(2, 3, Weekday::Monday),
            Self::GoodFriday => Rule::Easter(-2),
            Self::Memorial => Rule::Nth(5, -1, Weekday::Monday),
            Self::Juneteenth => Rule::Fixed(6, 19),
            Self::Independence => Rule::Fixed(7, 4),
            Self::Labor => Rule::Nth(9, 1, Weekday::Monday),
            Self::Columbus => Rule::Nth(10, 2, Weekday::Monday),
            Self::Veterans => Rule::Fixed(11, 11),
            Self::Thanksgiving => Rule::Nth(11, 4, Weekday::Thursday),
            Self::Christmas => Rule::Fixed(12, 25),
        }
    }

    /// What a Saturday date gives, for holidays on fixed dates.
    fn on_saturday(self) -> Option<OnSaturday> {
        match self {
            Self::NewYear | Self::Veterans => Some(OnSaturday::Nothing),
            Self::Juneteenth | Self::Independence | Self::Christmas => Some(OnSaturday::Friday),
            _ => None,
        }
    }

    /// Whether its business day before closes early under every policy SIFMA has had.
    fn always_eve(self) -> bool {
        matches!(self, Self::Memorial | Self::Christmas)
    }

    /// Whether its business day before closed early until 2009-04-03.
    fn former_eve(self) -> bool {
        matches!(
            self,
            Self::King
                | Self::Presidents
                | Self::Independence
                | Self::Labor
                | Self::Columbus
                | Self::Veterans
                | Self::Thanksgiving
        )
    }
}

fn date_of(rule: Rule, year: i16) -> Date {
    match rule {
        Rule::Fixed(month, day) => date(year, month, day),
        Rule::Nth(month, nth, weekday) => date(year, month, 1)
            .nth_weekday_of_month(nth, weekday)
            .expect("the weekday falls in the month"),
        Rule::Easter(days) => easter_sunday(year)
            .checked_add(jiff::Span::new().days(days))
            .expect("in range"),
    }
}

fn is_weekend(day: Date) -> bool {
    matches!(day.weekday(), Weekday::Saturday | Weekday::Sunday)
}

/// A holiday's day off in a year, after the weekend rules, or `None` for none.
fn day_off(holiday: Holiday, year: i16) -> Option<Date> {
    if holiday == Holiday::Juneteenth && year < JUNETEENTH_FROM {
        return None;
    }
    let day = date_of(holiday.rule(), year);
    let Some(on_saturday) = holiday.on_saturday() else {
        return Some(day);
    };
    match day.weekday() {
        Weekday::Sunday => day.tomorrow().ok(),
        Weekday::Saturday if on_saturday == OnSaturday::Friday => day.yesterday().ok(),
        Weekday::Saturday => None,
        _ => Some(day),
    }
}

/// Whether the employment report is due on a year's Good Friday, so that SIFMA
/// recommends a noon close rather than a full one.
fn has_employment_report(year: i16) -> bool {
    let good_friday = date_of(Holiday::GoodFriday.rule(), year);
    good_friday.month() == 4 && good_friday.day() <= 7
}

/// Whether the business day `eve` before `holiday` closes early, by the policy of
/// its time.
fn eve_closes_early(holiday: Holiday, eve: Date) -> bool {
    if holiday.always_eve()
        || (holiday == Holiday::GoodFriday && !has_employment_report(eve.year()))
    {
        return true;
    }
    if holiday == Holiday::Independence && eve.year() >= INDEPENDENCE_EVE_FROM {
        return true;
    }
    holiday.former_eve() && eve < FIVE_EARLY_CLOSES_FROM
}

/// One year's irregular days by the rules, written in the order `@basis/ui`'s
/// rules write them: the closes, then the early closes, each eve found among the
/// closes written so far.
fn rules(year: i16) -> BTreeMap<Date, Irregular> {
    let mut days = BTreeMap::new();
    for holiday in HOLIDAYS {
        if let Some(day) = day_off(holiday, year)
            && !(holiday == Holiday::GoodFriday && has_employment_report(year))
        {
            days.insert(day, Irregular::Closed);
        }
    }
    let business_day_before = |days: &BTreeMap<Date, Irregular>, day: Date| {
        let mut before = day.yesterday().expect("in range");
        while is_weekend(before) || days.get(&before) == Some(&Irregular::Closed) {
            before = before.yesterday().expect("in range");
        }
        before
    };
    for holiday in HOLIDAYS {
        if let Some(day) = day_off(holiday, year) {
            let eve = business_day_before(&days, day);
            if eve_closes_early(holiday, eve) {
                days.insert(eve, Irregular::ClosesAt(EARLY_CLOSE));
            }
        }
    }
    if has_employment_report(year) {
        days.insert(
            date_of(Holiday::GoodFriday.rule(), year),
            Irregular::ClosesAt(NOON),
        );
    }
    let next_new_year = date(year + 1, 1, 1);
    let eve = business_day_before(&days, next_new_year);
    days.insert(eve, Irregular::ClosesAt(EARLY_CLOSE));
    let after_thanksgiving = date_of(Holiday::Thanksgiving.rule(), year)
        .tomorrow()
        .expect("in range");
    days.insert(after_thanksgiving, Irregular::ClosesAt(EARLY_CLOSE));
    days
}

/// The days SIFMA's published schedules depart from its rules, as
/// `@basis/ui/dates` lists them with their notices: `None` restores the regular
/// session on a day the rules would close or close early.
pub const EXCEPTIONS: [(Date, Option<Irregular>); 23] = [
    (date(1996, 4, 5), Some(Irregular::Closed)),
    (date(1996, 7, 5), Some(Irregular::ClosesAt(EARLY_CLOSE))),
    (date(1997, 11, 10), None),
    (date(1997, 12, 26), Some(Irregular::ClosesAt(EARLY_CLOSE))),
    (date(1998, 11, 10), None),
    (date(1999, 4, 1), Some(Irregular::ClosesAt(EARLY_CLOSE))),
    (date(1999, 11, 10), None),
    (
        date(1999, 12, 31),
        Some(Irregular::ClosesAt(time(13, 0, 0, 0))),
    ),
    (date(2001, 9, 11), Some(Irregular::Closed)),
    (date(2001, 9, 12), Some(Irregular::Closed)),
    (date(2001, 9, 13), Some(Irregular::ClosesAt(EARLY_CLOSE))),
    (date(2001, 9, 14), Some(Irregular::ClosesAt(EARLY_CLOSE))),
    (date(2001, 9, 17), Some(Irregular::ClosesAt(EARLY_CLOSE))),
    (date(2004, 1, 2), Some(Irregular::ClosesAt(EARLY_CLOSE))),
    (date(2004, 6, 11), Some(Irregular::Closed)),
    (date(2004, 11, 10), None),
    (date(2007, 1, 2), Some(Irregular::ClosesAt(EARLY_CLOSE))),
    (
        date(2007, 4, 6),
        Some(Irregular::ClosesAt(time(11, 0, 0, 0))),
    ),
    (date(2012, 10, 29), Some(Irregular::ClosesAt(NOON))),
    (date(2012, 10, 30), Some(Irregular::Closed)),
    (date(2015, 7, 2), None),
    (date(2018, 12, 5), Some(Irregular::Closed)),
    (date(2025, 1, 9), Some(Irregular::ClosesAt(EARLY_CLOSE))),
];

/// A year's irregular weekdays: the rules' closes and early closes, with the
/// exceptions applied. Weekends are left out; they are always closed.
#[must_use]
pub fn year(year: i16) -> BTreeMap<Date, Irregular> {
    let mut days: BTreeMap<Date, Irregular> = rules(year)
        .into_iter()
        .filter(|(day, _)| day.year() == year && !is_weekend(*day))
        .collect();
    for (day, irregular) in EXCEPTIONS.into_iter().filter(|(day, _)| day.year() == year) {
        match irregular {
            Some(irregular) => days.insert(day, irregular),
            None => days.remove(&day),
        };
    }
    days
}

/// How SIFMA recommends the bond market trade on `day`: `None` for its regular
/// session.
#[must_use]
pub fn day(day: Date) -> Option<Irregular> {
    if is_weekend(day) {
        return Some(Irregular::Closed);
    }
    year(day.year()).get(&day).copied()
}
