//! What an app says about the data it loads into the browser.
//!
//! The app's API sends its table as an Arrow IPC stream. Only the API knows when
//! it read its source, and whether it turned NaNs blank before sending, so it says
//! so in the schema's metadata under [`LOAD_METADATA`], as a JSON object:
//!
//! ```json
//! {"source_as_of_micros": 1793980800000000, "nans_to_null": [["price", 3]]}
//! ```
//!
//! Both keys are optional, and keys this version does not know are ignored, as
//! the UI ignores response fields it does not know. Without a source time, the
//! status shows when the page loaded the data. NaNs still in the stream are turned
//! blank by the engine's load and counted with the API's.

use std::collections::BTreeMap;

use arrow_schema::Schema;
use serde_json::Value;

use crate::TableState;

/// The schema metadata key that holds a load's status, set by the app's API.
pub const LOAD_METADATA: &str = "parallax.load";

/// A load's status as the app's API reports it.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct LoadStatus {
    /// When the API read its source, in microseconds since the Unix epoch.
    pub source_as_of_micros: Option<i64>,
    /// Per column, the NaNs the API turned blank before sending.
    pub nans_to_null: Vec<(String, usize)>,
}

impl LoadStatus {
    /// Reads the status from a stream's schema, or the empty status if its
    /// metadata has none.
    ///
    /// # Errors
    ///
    /// Returns a message if the status is not a JSON object, a known key has the
    /// wrong type, or it counts NaNs in a column the schema does not have.
    pub fn from_schema(schema: &Schema) -> Result<Self, String> {
        let Some(text) = schema.metadata().get(LOAD_METADATA) else {
            return Ok(Self::default());
        };
        let details: Value = serde_json::from_str(text)
            .map_err(|e| format!("the load status in {LOAD_METADATA} is not JSON: {e}"))?;
        let Value::Object(details) = details else {
            return Err(format!(
                "the load status in {LOAD_METADATA} must be a JSON object"
            ));
        };
        let source_as_of_micros = match details.get("source_as_of_micros") {
            None | Some(Value::Null) => None,
            Some(value) => Some(value.as_i64().ok_or_else(|| {
                "the load status's source_as_of_micros must be an integer of microseconds since the Unix epoch".to_owned()
            })?),
        };
        let mut nans_to_null = Vec::new();
        match details.get("nans_to_null") {
            None | Some(Value::Null) => {}
            Some(Value::Array(entries)) => {
                for entry in entries {
                    let (Some(column), Some(count)) = (entry[0].as_str(), entry[1].as_u64()) else {
                        return Err("the load status's nans_to_null must be a list of [column, count] pairs".to_owned());
                    };
                    if schema.index_of(column).is_err() {
                        return Err(format!(
                            "the load status counts NaNs in {column}, which the data does not have"
                        ));
                    }
                    let count = usize::try_from(count).map_err(|e| e.to_string())?;
                    nans_to_null.push((column.to_owned(), count));
                }
            }
            Some(_) => {
                return Err(
                    "the load status's nans_to_null must be a list of [column, count] pairs"
                        .to_owned(),
                );
            }
        }
        Ok(Self {
            source_as_of_micros,
            nans_to_null,
        })
    }
}

impl TableState {
    /// Adds NaNs that the data's source turned blank before the load, such as an
    /// app's API, to those the load itself turned blank, so that the status counts
    /// both. Columns keep the table's order.
    pub fn count_upstream_nans(&mut self, upstream: &[(String, usize)]) {
        if upstream.is_empty() {
            return;
        }
        let mut counts: BTreeMap<&str, usize> = BTreeMap::new();
        for (column, count) in self.nans_to_null.iter().chain(upstream) {
            *counts.entry(column.as_str()).or_default() += count;
        }
        let schema = self.table.schema();
        let mut merged: Vec<(String, usize)> = schema
            .fields()
            .iter()
            .filter_map(|f| {
                counts
                    .get(f.name().as_str())
                    .filter(|&&n| n > 0)
                    .map(|&n| (f.name().clone(), n))
            })
            .collect();
        // Columns the table does not have cannot reach here through a checked
        // status, but are kept rather than dropped.
        merged.extend(
            counts
                .iter()
                .filter(|(column, n)| **n > 0 && schema.index_of(column).is_err())
                .map(|(column, n)| ((*column).to_owned(), *n)),
        );
        self.nans_to_null = merged;
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use arrow_array::{Float64Array, RecordBatch, StringArray};
    use arrow_schema::{DataType, Field};
    use parallax_engine::TableOptions;

    use super::*;

    fn schema(status: Option<&str>) -> Schema {
        let fields = vec![
            Field::new("ticker", DataType::Utf8, true),
            Field::new("price", DataType::Float64, true),
            Field::new("weight", DataType::Float64, true),
        ];
        match status {
            None => Schema::new(fields),
            Some(text) => {
                Schema::new_with_metadata(fields, [(LOAD_METADATA.to_owned(), text.to_owned())])
            }
        }
    }

    #[test]
    fn the_status_is_read_from_the_schema_metadata() {
        assert_eq!(
            LoadStatus::from_schema(&schema(None)).unwrap(),
            LoadStatus::default()
        );
        assert_eq!(
            LoadStatus::from_schema(&schema(Some(
                r#"{"source_as_of_micros": 1793980800000000, "nans_to_null": [["weight", 4], ["price", 1]], "from": "a later version"}"#
            )))
            .unwrap(),
            LoadStatus {
                source_as_of_micros: Some(1_793_980_800_000_000),
                nans_to_null: vec![("weight".into(), 4), ("price".into(), 1)],
            }
        );
        assert_eq!(
            LoadStatus::from_schema(&schema(Some(
                r#"{"source_as_of_micros": null, "nans_to_null": []}"#
            )))
            .unwrap(),
            LoadStatus::default()
        );
    }

    #[test]
    fn a_malformed_status_is_refused_with_the_reason() {
        for (status, reason) in [
            ("not json", "is not JSON"),
            ("[1]", "must be a JSON object"),
            (
                r#"{"source_as_of_micros": "2026-11-07"}"#,
                "must be an integer",
            ),
            (r#"{"source_as_of_micros": 1.5}"#, "must be an integer"),
            (r#"{"nans_to_null": {"price": 1}}"#, "[column, count] pairs"),
            (
                r#"{"nans_to_null": [["price", -1]]}"#,
                "[column, count] pairs",
            ),
            (
                r#"{"nans_to_null": [["volume", 1]]}"#,
                "counts NaNs in volume, which the data does not have",
            ),
        ] {
            let error = LoadStatus::from_schema(&schema(Some(status))).unwrap_err();
            assert!(error.contains(reason), "{status}: {error}");
        }
    }

    #[test]
    fn upstream_nans_add_to_the_loads_own_in_the_tables_order() {
        let schema = Arc::new(schema(None));
        let batch = RecordBatch::try_new(
            Arc::clone(&schema),
            vec![
                Arc::new(StringArray::from(vec!["A", "B", "C"])),
                Arc::new(Float64Array::from(vec![f64::NAN, 1.0, f64::NAN])),
                Arc::new(Float64Array::from(vec![1.0, 2.0, 3.0])),
            ],
        )
        .unwrap();
        let mut state =
            TableState::from_batches(&schema, &[batch], TableOptions::default(), 10, 5).unwrap();
        assert_eq!(state.nans_to_null, vec![("price".to_owned(), 2)]);
        state.count_upstream_nans(&[("weight".to_owned(), 4), ("price".to_owned(), 1)]);
        assert_eq!(
            state.nans_to_null,
            vec![("price".to_owned(), 3), ("weight".to_owned(), 4)]
        );
        state.count_upstream_nans(&[]);
        assert_eq!(state.nans_to_null.len(), 2);
    }
}
