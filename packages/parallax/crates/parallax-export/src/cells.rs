//! A layout's rich cells and rules in Excel, as conditional formats over each
//! column's exported rows: a bar as a data bar, a heat fill as a colour scale, a
//! badge's and a rule's tone as a cell format. What Excel cannot show, a badge's
//! shape, a sparkline or a rule it has no condition for, is a line on the Notes
//! sheet. Excel takes fixed colours, so a tone is written in the default theme's
//! light colours.

use crate::Notes;
use parallax_protocol::layout::{
    BarFrom, FilterOpName, HeatScale, Layout, LayoutCell, LayoutRule, RuleFormat, Tone,
};
use rust_xlsxwriter::{
    Color, ConditionalFormat2ColorScale, ConditionalFormat3ColorScale, ConditionalFormatBlank,
    ConditionalFormatCell, ConditionalFormatCellRule, ConditionalFormatDataBar,
    ConditionalFormatText, ConditionalFormatTextRule, ConditionalFormatType, Format, Worksheet,
    XlsxError,
};

/// A tone's ink and tint, as RGB.
const fn colors(tone: Tone) -> (u32, u32) {
    match tone {
        Tone::Positive => (0x1A_7F37, 0xDA_FBE1),
        Tone::Negative => (0xB4_2318, 0xFF_EBE9),
        Tone::Warning => (0x9A_6700, 0xFF_F8C5),
        Tone::Info => (0x09_69DA, 0xDD_F4FF),
        Tone::Neutral => (0x66_7085, 0xF2_F4F7),
    }
}

/// The cell format a rule's style asks for.
fn format_of(style: &RuleFormat) -> Format {
    let mut format = Format::new();
    if let Some(tone) = style.tone {
        format = format.set_font_color(Color::RGB(colors(tone).0));
    }
    if style.fill {
        format =
            format.set_background_color(Color::RGB(colors(style.tone.unwrap_or(Tone::Neutral)).1));
    }
    if style.bold {
        format = format.set_bold();
    }
    format
}

/// Where a column's exported rows are: its column, and its first and last row.
#[derive(Clone, Copy)]
struct Range {
    column: u16,
    first: u32,
    last: u32,
}

/// Writes a cell kind's conditional format over `range`.
fn write_cell_kind(
    sheet: &mut Worksheet,
    range: Range,
    (name, kind): (&str, &LayoutCell),
    notes: &mut Notes,
) -> Result<(), XlsxError> {
    let Range {
        column,
        first,
        last,
    } = range;
    match kind {
        LayoutCell::Bar { from } => {
            let mut bar = ConditionalFormatDataBar::new()
                .set_fill_color(Color::RGB(colors(Tone::Info).0))
                .set_negative_fill_color(Color::RGB(colors(Tone::Negative).0))
                .set_solid_fill(true);
            if *from == BarFrom::Min {
                bar = bar.set_minimum(ConditionalFormatType::Lowest, 0);
            }
            sheet.add_conditional_format(first, column, last, column, &bar)?;
        }
        LayoutCell::Heat {
            scale: HeatScale::Sequential,
        } => {
            let heat = ConditionalFormat2ColorScale::new()
                .set_minimum_color(Color::RGB(0xEF_F6FF))
                .set_maximum_color(Color::RGB(0x1E_40AF));
            sheet.add_conditional_format(first, column, last, column, &heat)?;
        }
        LayoutCell::Heat {
            scale: HeatScale::Diverging,
        } => {
            let heat = ConditionalFormat3ColorScale::new()
                .set_minimum_color(Color::RGB(colors(Tone::Negative).0))
                .set_midpoint(ConditionalFormatType::Number, 0)
                .set_midpoint_color(Color::RGB(colors(Tone::Neutral).1))
                .set_maximum_color(Color::RGB(0x1E_40AF));
            sheet.add_conditional_format(first, column, last, column, &heat)?;
        }
        LayoutCell::Badge { values } => {
            for (value, tone) in values {
                let style = RuleFormat {
                    bold: false,
                    fill: true,
                    tone: Some(*tone),
                };
                let badge = ConditionalFormatCell::new()
                    .set_rule(ConditionalFormatCellRule::EqualTo(value.as_str()))
                    .set_format(format_of(&style));
                sheet.add_conditional_format(first, column, last, column, &badge)?;
            }
            notes.add(format!(
                "{name}'s badges keep their colours, not their shapes, which Excel cannot draw."
            ));
        }
        LayoutCell::Sparkline => notes.add(format!(
            "{name} is drawn as a sparkline of the numbers in its text; Excel shows the text."
        )),
        LayoutCell::Link => {}
    }
    Ok(())
}

/// Writes a rule as a conditional format over `range`; returns false for one
/// Excel has no condition for.
fn write_rule(sheet: &mut Worksheet, range: Range, rule: &LayoutRule) -> Result<bool, XlsxError> {
    let Range {
        column,
        first,
        last,
    } = range;
    let format = format_of(&rule.format);
    let number = rule.when.value.as_ref().and_then(|v| v.as_f64());
    let text = rule
        .when
        .value
        .as_ref()
        .and_then(|v| v.as_str())
        .map(str::to_owned);
    let cell = |op: fn(f64) -> ConditionalFormatCellRule<f64>| number.map(op);
    let compared = match rule.when.op {
        FilterOpName::Gt => cell(ConditionalFormatCellRule::GreaterThan),
        FilterOpName::Ge => cell(ConditionalFormatCellRule::GreaterThanOrEqualTo),
        FilterOpName::Lt => cell(ConditionalFormatCellRule::LessThan),
        FilterOpName::Le => cell(ConditionalFormatCellRule::LessThanOrEqualTo),
        FilterOpName::Eq => cell(ConditionalFormatCellRule::EqualTo),
        FilterOpName::Ne => cell(ConditionalFormatCellRule::NotEqualTo),
        _ => None,
    };
    if let Some(compared) = compared {
        let cf = ConditionalFormatCell::new()
            .set_rule(compared)
            .set_format(format)
            .set_stop_if_true(true);
        sheet.add_conditional_format(first, column, last, column, &cf)?;
        return Ok(true);
    }
    let texts = match (rule.when.op, text) {
        (FilterOpName::Contains, Some(t)) => Some(ConditionalFormatTextRule::Contains(t)),
        (FilterOpName::NotContains, Some(t)) => Some(ConditionalFormatTextRule::DoesNotContain(t)),
        (FilterOpName::StartsWith, Some(t)) => Some(ConditionalFormatTextRule::BeginsWith(t)),
        (FilterOpName::EndsWith, Some(t)) => Some(ConditionalFormatTextRule::EndsWith(t)),
        (FilterOpName::Eq, Some(t)) => {
            let cf = ConditionalFormatCell::new()
                .set_rule(ConditionalFormatCellRule::EqualTo(t.as_str()))
                .set_format(format)
                .set_stop_if_true(true);
            sheet.add_conditional_format(first, column, last, column, &cf)?;
            return Ok(true);
        }
        _ => None,
    };
    if let Some(texts) = texts {
        let cf = ConditionalFormatText::new()
            .set_rule(texts)
            .set_format(format);
        sheet.add_conditional_format(first, column, last, column, &cf)?;
        return Ok(true);
    }
    if matches!(rule.when.op, FilterOpName::IsNull | FilterOpName::IsNotNull) {
        let mut blank = ConditionalFormatBlank::new();
        if rule.when.op == FilterOpName::IsNotNull {
            blank = blank.invert();
        }
        let blank = blank.set_format(format);
        sheet.add_conditional_format(first, column, last, column, &blank)?;
        return Ok(true);
    }
    Ok(false)
}

/// Writes the layout's cells and rules for the exported data columns, each
/// `(column, name)`, over rows `1..=rows`.
pub(crate) fn write(
    sheet: &mut Worksheet,
    layout: &Layout,
    (columns, rows): (&[(u16, String)], u32),
    notes: &mut Notes,
) -> Result<(), XlsxError> {
    if rows == 0 {
        return Ok(());
    }
    for (column, name) in columns {
        let range = Range {
            column: *column,
            first: 1,
            last: rows,
        };
        if let Some(kind) = layout.cells.get(name) {
            write_cell_kind(sheet, range, (name, kind), notes)?;
        }
        for rule in layout.rules.get(name).into_iter().flatten() {
            if !write_rule(sheet, range, rule)? {
                notes.add(format!(
                    "A rule on {name} has a condition Excel's conditional formats cannot test, so the export leaves it out."
                ));
            }
        }
    }
    Ok(())
}
