import { readWorkbook } from "../../../../packages/ui/src/utils/read-workbook.ts";
window.readers.basis = async (bytes) => {
  const r = await readWorkbook(bytes);
  if (!r.ok) throw new Error(r.reason);
  const first = r.workbook.sheets[0];
  const s = await r.workbook.readSheet(first.name);
  if (!s.ok) throw new Error(s.reason);
  return s.records.map((rec) => rec.fields);
};
