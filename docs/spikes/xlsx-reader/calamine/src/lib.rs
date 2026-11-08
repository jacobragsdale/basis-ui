// Spike only: calamine, built to wasm, as the reader measurement in ../../../xlsx-reader.md ran it.
use std::fmt::Write;
use std::io::Cursor;

use calamine::{Data, Reader, open_workbook_auto_from_rs};
use wasm_bindgen::prelude::*;

/// The first sheet's cells as text: cells split by U+001F, rows by U+001E.
#[wasm_bindgen]
pub fn read_first_sheet(bytes: &[u8]) -> Result<String, String> {
    let mut book = open_workbook_auto_from_rs(Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let name = book.sheet_names().first().cloned().ok_or("no sheets")?;
    let range = book.worksheet_range(&name).map_err(|e| e.to_string())?;
    let mut out = String::with_capacity(bytes.len() * 2);
    for row in range.rows() {
        for (i, cell) in row.iter().enumerate() {
            if i > 0 {
                out.push('\u{1f}');
            }
            match cell {
                Data::Empty => {}
                Data::String(s) => out.push_str(s),
                Data::Int(n) => { let _ = write!(out, "{n}"); }
                Data::Float(f) => { let _ = write!(out, "{f}"); }
                Data::Bool(b) => out.push_str(if *b { "TRUE" } else { "FALSE" }),
                Data::DateTime(d) => { let _ = write!(out, "{}", d.as_f64()); }
                Data::DateTimeIso(s) | Data::DurationIso(s) => out.push_str(s),
                Data::Error(e) => { let _ = write!(out, "#{e:?}"); }
            }
        }
        out.push('\u{1e}');
    }
    Ok(out)
}
