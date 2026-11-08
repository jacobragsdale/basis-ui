//! A column's display format as the API declares it: basis writes each number
//! column's format into its Arrow field's metadata under [`DISPLAY_FORMAT_METADATA`],
//! as compact JSON, such as `{"kind":"price","decimals":4}`. The kinds and
//! fields are the ones agreed with basis (basis-ui's docs/design.md, Numbers).
//! A layout's own format for a column wins; one it does not set comes from
//! here. Fields it does not know are ignored and an unknown kind is no format,
//! so basis can add to the object.

use arrow_schema::Field;
use serde::Deserialize;

use crate::layout::{LayoutFormat, ThirtySecondsName};

/// The field metadata key that holds a column's display format.
pub const DISPLAY_FORMAT_METADATA: &str = "basis.format";

/// The decimals at most a display format asks for, as basis checks them.
const MAX_DECIMALS: u8 = 15;

/// The object basis writes. Every field but `kind` is optional.
#[derive(Deserialize)]
struct DisplayFormat {
    kind: String,
    decimals: Option<u8>,
    currency: Option<String>,
    step: Option<String>,
}

/// The minor units of an ISO 4217 currency: the decimals an amount in it shows
/// unless the format sets them. Two for every currency not listed.
fn minor_units(currency: &str) -> u8 {
    match currency {
        "BIF" | "CLP" | "DJF" | "GNF" | "ISK" | "JPY" | "KMF" | "KRW" | "PYG" | "RWF" | "UGX"
        | "UYI" | "VND" | "VUV" | "XAF" | "XOF" | "XPF" => 0,
        "BHD" | "IQD" | "JOD" | "KWD" | "LYD" | "OMR" | "TND" => 3,
        "CLF" | "UYW" => 4,
        _ => 2,
    }
}

/// A price32 step as the layout names it; `32nd` unless set.
fn step_of(step: Option<&str>) -> Option<ThirtySecondsName> {
    match step.unwrap_or("32nd") {
        "32nd" => Some(ThirtySecondsName::ThirtySeconds),
        "half" => Some(ThirtySecondsName::Halves),
        "quarter" => Some(ThirtySecondsName::Quarters),
        "eighth" => Some(ThirtySecondsName::Eighths),
        _ => None,
    }
}

/// The layout format the display format `text` declares, or `None` for text
/// that is not one, or a kind this version does not know.
#[must_use]
pub fn layout_format_of(text: &str) -> Option<LayoutFormat> {
    let declared: DisplayFormat = serde_json::from_str(text).ok()?;
    let decimals = declared.decimals.filter(|d| *d <= MAX_DECIMALS);
    let mut format = LayoutFormat {
        decimals,
        ..LayoutFormat::default()
    };
    match declared.kind.as_str() {
        "number" | "price" => {}
        "money" => {
            let currency = declared.currency.as_deref().unwrap_or("USD");
            format.decimals = decimals.or(Some(minor_units(currency)));
        }
        "pct" => format.percent = true,
        "bps" => format.bps = true,
        "price32" => {
            format.decimals = None;
            format.thirty_seconds = Some(step_of(declared.step.as_deref())?);
        }
        _ => return None,
    }
    Some(format)
}

/// The display format a field's metadata declares, if any.
#[must_use]
pub fn field_format(field: &Field) -> Option<LayoutFormat> {
    field
        .metadata()
        .get(DISPLAY_FORMAT_METADATA)
        .and_then(|text| layout_format_of(text))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_kind_reads_as_its_layout_format() {
        let price = layout_format_of(r#"{"kind":"price","decimals":4}"#).unwrap();
        assert_eq!(price.decimals, Some(4));
        let pct = layout_format_of(r#"{"kind":"pct","decimals":2}"#).unwrap();
        assert!(pct.percent && pct.decimals == Some(2));
        let bps = layout_format_of(r#"{"kind":"bps","decimals":1}"#).unwrap();
        assert!(bps.bps && bps.decimals == Some(1));
        let number = layout_format_of(r#"{"kind":"number"}"#).unwrap();
        assert_eq!(number, LayoutFormat::default());
        let half = layout_format_of(r#"{"kind":"price32","step":"half"}"#).unwrap();
        assert_eq!(half.thirty_seconds, Some(ThirtySecondsName::Halves));
        let whole = layout_format_of(r#"{"kind":"price32"}"#).unwrap();
        assert_eq!(whole.thirty_seconds, Some(ThirtySecondsName::ThirtySeconds));
    }

    #[test]
    fn money_shows_its_currency_minor_units_unless_set() {
        let usd = layout_format_of(r#"{"kind":"money","currency":"USD"}"#).unwrap();
        assert_eq!(usd.decimals, Some(2));
        let jpy = layout_format_of(r#"{"kind":"money","currency":"JPY"}"#).unwrap();
        assert_eq!(jpy.decimals, Some(0));
        let set = layout_format_of(r#"{"kind":"money","currency":"USD","decimals":0}"#).unwrap();
        assert_eq!(set.decimals, Some(0));
    }

    #[test]
    fn unknown_fields_are_ignored_and_unknown_kinds_are_no_format() {
        let later = layout_format_of(r#"{"kind":"pct","decimals":1,"tooltip":"x"}"#).unwrap();
        assert!(later.percent);
        assert!(layout_format_of(r#"{"kind":"duration"}"#).is_none());
        assert!(layout_format_of(r#"{"kind":"price32","step":"tick"}"#).is_none());
        assert!(layout_format_of("not json").is_none());
        let wide = layout_format_of(r#"{"kind":"number","decimals":40}"#).unwrap();
        assert_eq!(wide.decimals, None);
    }

    fn table_with_formats() -> parallax_engine::Table {
        use std::collections::HashMap;

        use arrow_schema::{DataType, Schema};
        let declared = |text: &str| -> HashMap<String, String> {
            HashMap::from([(DISPLAY_FORMAT_METADATA.to_owned(), text.to_owned())])
        };
        let interest = Field::new("interest", DataType::Float64, true)
            .with_metadata(declared(r#"{"kind":"price","decimals":4}"#));
        let rate = Field::new("rate", DataType::Float64, true)
            .with_metadata(declared(r#"{"kind":"bps"}"#));
        let plain = Field::new("count", DataType::Float64, true);
        let schema = Schema::new(vec![interest, rate, plain]);
        parallax_engine::Table::new(&schema, parallax_engine::TableOptions::default()).unwrap()
    }

    #[test]
    fn a_column_takes_the_api_format_unless_the_layout_sets_one() {
        let table = table_with_formats();
        let layout =
            crate::layout::Layout::from_json(r#"{"formats": {"rate": {"decimals": 3}}}"#).unwrap();
        let resolved = layout.resolve(&table).unwrap();
        let formats = &resolved.config.formats;
        assert_eq!(formats["interest"].decimals, Some(4));
        assert!(
            !formats["rate"].bps,
            "the layout's own format wins over the API's"
        );
        assert_eq!(formats["rate"].decimals, Some(3));
        assert!(!formats.contains_key("count"));
    }
}
