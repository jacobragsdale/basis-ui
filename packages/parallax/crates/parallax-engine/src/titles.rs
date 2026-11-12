//! Readable headers. A column a layout gives no title is headed by its name made
//! readable: words split at underscores, the first capitalised, abbreviations a
//! desk writes in capitals, and a trailing currency or unit in brackets, so
//! `market_value_usd` is `Market value (USD)`, `position_id` is `Position ID` and
//! `daily_pnl_usd` is `Daily P&L (USD)`. A name already written for reading,
//! with a capital or a space, is kept. A time zone is named by its place:
//! `America/New_York` is `New York`.

/// Words written in capitals, or as a desk writes them.
const ABBREVIATIONS: &[(&str, &str)] = &[
    ("id", "ID"),
    ("pnl", "P&L"),
    ("ytm", "YTM"),
    ("ytw", "YTW"),
    ("dv01", "DV01"),
    ("cs01", "CS01"),
    ("ir01", "IR01"),
    ("cusip", "CUSIP"),
    ("isin", "ISIN"),
    ("figi", "FIGI"),
    ("oas", "OAS"),
    ("nav", "NAV"),
    ("fx", "FX"),
    ("otc", "OTC"),
    ("cds", "CDS"),
    ("sofr", "SOFR"),
    ("ccy", "CCY"),
];

/// Trailing words that name a unit, written in brackets.
const UNITS: &[(&str, &str)] = &[
    ("usd", "USD"),
    ("eur", "EUR"),
    ("gbp", "GBP"),
    ("jpy", "JPY"),
    ("chf", "CHF"),
    ("cad", "CAD"),
    ("aud", "AUD"),
    ("local", "local"),
    ("utc", "UTC"),
    ("bps", "bp"),
    ("bp", "bp"),
    ("pct", "%"),
];

/// A word as a header writes it: an abbreviation in its form, else as it is.
fn word(text: &str) -> String {
    ABBREVIATIONS
        .iter()
        .find(|(from, _)| *from == text)
        .map_or_else(|| text.to_owned(), |(_, to)| (*to).to_owned())
}

/// `text` with its first letter in capitals.
fn capitalised(text: &str) -> String {
    let mut chars = text.chars();
    chars.next().map_or_else(String::new, |first| {
        first.to_uppercase().chain(chars).collect()
    })
}

/// A column's name made readable for its header.
#[must_use]
pub fn readable(name: &str) -> String {
    if name.chars().any(|c| c.is_uppercase() || c == ' ') {
        return name.to_owned();
    }
    let mut words: Vec<&str> = name.split('_').filter(|w| !w.is_empty()).collect();
    let unit = match words.as_slice() {
        [.., last] if words.len() > 1 => UNITS
            .iter()
            .find(|(from, _)| from == last)
            .map(|(_, to)| *to),
        _ => None,
    };
    if unit.is_some() {
        words.pop();
    }
    let mut text = words.iter().map(|w| word(w)).collect::<Vec<_>>().join(" ");
    text = capitalised(&text);
    match unit {
        Some(unit) => format!("{text} ({unit})"),
        None => text,
    }
}

/// A time zone named by its place, as a header says it: `America/New_York` is
/// `New York`, and `UTC` stays `UTC`.
#[must_use]
pub fn place(zone: &str) -> String {
    zone.rsplit('/').next().unwrap_or(zone).replace('_', " ")
}

#[cfg(test)]
mod tests {
    use super::{place, readable};

    #[test]
    fn names_read_as_headers() {
        assert_eq!(readable("market_value_usd"), "Market value (USD)");
        assert_eq!(readable("position_id"), "Position ID");
        assert_eq!(readable("daily_pnl_usd"), "Daily P&L (USD)");
        assert_eq!(readable("trade_time_utc"), "Trade time (UTC)");
        assert_eq!(readable("spread_bps"), "Spread (bp)");
        assert_eq!(readable("desk"), "Desk");
        assert_eq!(readable("dv01_usd"), "DV01 (USD)");
        assert_eq!(readable("Traded"), "Traded");
        assert_eq!(readable("usd"), "Usd");
    }

    #[test]
    fn zones_read_as_places() {
        assert_eq!(place("America/New_York"), "New York");
        assert_eq!(place("UTC"), "UTC");
    }
}
