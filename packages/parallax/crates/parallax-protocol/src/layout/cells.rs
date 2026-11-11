//! How a flat or detail view's cells draw, by column, in a layout: as text, the
//! default, or by kind, and the conditional formats that style them. The engine
//! draws nothing; it checks the columns and computes the domain of each column a
//! bar or a heat fill is drawn from.

use std::collections::BTreeMap;

use parallax_engine::{ColumnType, Table};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{FilterOpName, LayoutError, column_type, value_error};

/// A status's colour and shape, from the theme: a gain, a loss, a warning, a
/// note, or nothing to note.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Tone {
    /// A gain, or what is good.
    Positive,
    /// A loss, or what is wrong.
    Negative,
    /// What needs a look.
    Warning,
    /// A note.
    Info,
    /// Nothing to note.
    Neutral,
}

/// Where a data bar starts.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum BarFrom {
    /// From zero: a negative value's bar runs left, in the loss colour.
    #[default]
    Zero,
    /// From the column's least value.
    Min,
}

/// The scale a heat fill takes its colour from.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum HeatScale {
    /// From the column's least value to its greatest.
    #[default]
    Sequential,
    /// About zero: losses one way, gains the other.
    Diverging,
}

/// How one column's cells draw.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum LayoutCell {
    /// A bar as long as the value over the column's domain, behind its text.
    Bar {
        /// From zero, the default, or from the column's least value.
        #[serde(default)]
        from: BarFrom,
    },
    /// A fill by value, behind text in the ink that reads on it.
    Heat {
        /// Sequential, the default, or diverging about zero.
        #[serde(default)]
        scale: HeatScale,
    },
    /// A pill with the value's text, in the tone listed for it; a value not
    /// listed is neutral.
    Badge {
        /// The tone of each value, by its text.
        #[serde(default)]
        values: BTreeMap<String, Tone>,
    },
    /// A small line of the numbers in the cell's text, separated by spaces or
    /// commas, such as `101.2 101.5 100.9`.
    Sparkline,
    /// Text that reports a click to the app.
    Link,
}

/// When a rule styles a cell: a filter's condition on the cell's value.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct RuleWhen {
    /// The operator, as a filter's.
    pub op: FilterOpName,
    /// The operand of single-value operators.
    #[serde(default)]
    pub value: Option<Value>,
    /// The operands of `in` and `not_in`.
    #[serde(default)]
    pub values: Vec<Value>,
}

/// How a rule styles a cell.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(default, deny_unknown_fields)]
pub struct RuleFormat {
    /// The ink of its text, a tone's, or the column's for none.
    pub tone: Option<Tone>,
    /// A fill in the tone's tint behind the cell.
    pub fill: bool,
    /// Its text in the group font.
    pub bold: bool,
}

/// A conditional format: the cells whose value meets `when` take `format`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LayoutRule {
    /// The condition.
    pub when: RuleWhen,
    /// The style.
    pub format: RuleFormat,
}

/// Whether a column holds numbers, which a bar or a heat fill is drawn from.
fn numeric(column_type: &ColumnType) -> bool {
    matches!(
        column_type,
        ColumnType::Int64 | ColumnType::Float64 | ColumnType::Decimal { .. }
    )
}

/// Checks the columns of `cells` and `rules`, and returns the columns whose
/// domain the engine computes: those drawn as a bar or a heat fill, in order.
pub(super) fn domains_of(
    table: &Table,
    cells: &BTreeMap<String, LayoutCell>,
    rules: &BTreeMap<String, Vec<LayoutRule>>,
) -> Result<Vec<String>, LayoutError> {
    for column in rules.keys() {
        column_type(table, column)?;
    }
    let mut domains = Vec::new();
    for (column, cell) in cells {
        let kind = column_type(table, column)?;
        match cell {
            LayoutCell::Bar { .. } | LayoutCell::Heat { .. } => {
                if !numeric(&kind) {
                    return Err(value_error(
                        column,
                        "a bar or a heat fill needs a column of numbers",
                    ));
                }
                domains.push(column.clone());
            }
            LayoutCell::Sparkline if kind != ColumnType::Utf8 => {
                return Err(value_error(
                    column,
                    "a sparkline reads numbers written in a text column",
                ));
            }
            _ => {}
        }
    }
    Ok(domains)
}
