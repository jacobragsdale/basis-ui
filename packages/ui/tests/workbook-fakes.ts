/* Workbooks of hand-written parts, for the reader's tests. */

import { zipBytes } from "#testing/zip-file.ts";
import type { ZipPart } from "#testing/zip-file.ts";

const main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const officeRelationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packageRelationships = "http://schemas.openxmlformats.org/package/2006/relationships";

/** A workbook of one sheet whose part is `sheet`, with the other parts given, as an archive. */
async function rawWorkbook(
  sheet: string,
  parts: Readonly<Record<string, ZipPart>> = {},
): Promise<Uint8Array> {
  return zipBytes({
    "_rels/.rels": {
      text: `<Relationships xmlns="${packageRelationships}"><Relationship Id="r1" Type="${officeRelationships}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    "xl/_rels/workbook.xml.rels": {
      text: `<Relationships xmlns="${packageRelationships}"><Relationship Id="s1" Type="${officeRelationships}/worksheet" Target="/xl/worksheets/one.xml"/><Relationship Id="t" Type="${officeRelationships}/sharedStrings" Target="strings.xml"/><Relationship Id="y" Type="${officeRelationships}/styles" Target="styles.xml"/></Relationships>`,
    },
    "xl/workbook.xml": {
      text: `<workbook xmlns="${main}" xmlns:r="${officeRelationships}"><sheets><sheet name="One" sheetId="1" r:id="s1"/></sheets></workbook>`,
    },
    "xl/worksheets/one.xml": { deflate: true, text: sheet },
    ...parts,
  });
}

export { main, officeRelationships, packageRelationships, rawWorkbook };
