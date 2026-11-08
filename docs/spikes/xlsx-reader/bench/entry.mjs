import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import readXlsxFile from "read-excel-file/browser";
import { readHandrolled } from "./handrolled.mjs";
import init, { read_first_sheet } from "../calamine/pkg/workbook.js";
window.readers = {
  async calamine(bytes) {
    const s = read_first_sheet(new Uint8Array(bytes));
    return s.split("\u001e").map((r) => r.split("\u001f"));
  },
  async sheetjs(bytes) {
    const wb = XLSX.read(bytes, { type: "array" });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
  },
  async exceljs(bytes) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes);
    const rows = [];
    wb.worksheets[0].eachRow((r) => rows.push(r.values));
    return rows;
  },
  async readExcelFile(bytes) {
    return readXlsxFile(new Blob([bytes]));
  },
  async handrolled(bytes) {
    return readHandrolled(bytes);
  },
};
window.initCalamine = () => init();
