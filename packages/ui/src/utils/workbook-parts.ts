/* The parts of an Excel workbook besides its sheets' cells, as read-workbook.ts finds them: the relationships that
 * name each part, which are the same in transitional and strict Open XML but for their types' namespaces; the
 * workbook part's list of sheets and date system; the shared strings that cells refer to; and the styles that say
 * which numbers are dates. */

import type { NumberKind } from "./workbook-cells.ts";
import { numberKind } from "./workbook-cells.ts";
import { attribute, scanXml } from "./xml-scan.ts";
import type { XmlScanner, XmlTag } from "./xml-scan.ts";

/** A relationship's target, resolved to a part's name, and the last segment of its type, such as `worksheet`. */
interface Relationship {
  readonly kind: string;
  readonly part: string;
}

/** A sheet as the workbook part lists it, with the relationship its part goes by. */
interface ListedSheet {
  readonly name: string;
  readonly hidden: boolean;
  readonly id: string;
}

// Office Open XML escapes a character XML cannot hold as _xHHHH_, and an underscore that would read as one as _x005F_.
const escapedCharacter = /_x(?<hex>[\da-f]{4})_/giu;
const hexadecimal = 16;

/** Text with Office Open XML's _xHHHH_ escapes read. */
function unescapeOoxml(text: string): string {
  return text.includes("_x")
    ? text.replaceAll(escapedCharacter, (_whole, hex: string) =>
        String.fromCodePoint(Number.parseInt(hex, hexadecimal)),
      )
    : text;
}

/** Every tag of a part, in order. */
function* tagsOf(scanner: XmlScanner): Generator<XmlTag> {
  for (let tag = scanner.next(); tag !== undefined; tag = scanner.next()) {
    yield tag;
  }
}

/** A target's text, percent-decoded, or as written when it holds a `%` that encodes nothing, as `100%.xml` does. */
function decodedTarget(target: string): string {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

/** A part's name from a relationship's target, which is relative to the part that holds the relationship. */
function resolvePart(base: string, target: string): string {
  const segments = target.startsWith("/") ? [] : base.split("/").slice(0, -1);
  for (const segment of decodedTarget(target).split("/")) {
    if (segment === "..") {
      segments.pop();
    } else if (segment !== "." && segment !== "") {
      segments.push(segment);
    }
  }
  return segments.join("/");
}

/** Where a part's relationships are: `xl/_rels/workbook.xml.rels` for `xl/workbook.xml`. */
function relationshipsPart(part: string): string {
  const slash = part.lastIndexOf("/");
  return `${part.slice(0, slash + 1)}_rels/${part.slice(slash + 1)}.rels`;
}

/** A part's relationships, by id; an external one, such as a link to another file, is left out. */
function relationshipsOf(xml: string | undefined, part: string): ReadonlyMap<string, Relationship> {
  const relationships = new Map<string, Relationship>();
  for (const tag of tagsOf(scanXml(xml ?? ""))) {
    const id = tag.name === "Relationship" ? attribute(tag, "Id") : undefined;
    const target = attribute(tag, "Target");
    if (id !== undefined && target !== undefined && attribute(tag, "TargetMode") !== "External") {
      const type = attribute(tag, "Type") ?? "";
      relationships.set(id, {
        kind: type.slice(type.lastIndexOf("/") + 1),
        part: resolvePart(part, target),
      });
    }
  }
  return relationships;
}

/** The first part of a kind among relationships. */
function partOfKind(
  relationships: ReadonlyMap<string, Relationship>,
  kind: string,
): string | undefined {
  return [...relationships.values()].find((relationship) => relationship.kind === kind)?.part;
}

/** The text of every `<t>` up to the tag that closes `element`, leaving out phonetic runs, which give a reading of
 * East Asian text rather than text of the cell's own. */
function richText(scanner: XmlScanner, element: string): string {
  let text = "";
  let phonetic = false;
  for (const tag of tagsOf(scanner)) {
    if (tag.name === element && tag.closing) {
      break;
    }
    if (tag.name === "rPh" && !tag.empty) {
      phonetic = !tag.closing;
    } else if (tag.name === "t" && !tag.closing && !tag.empty && !phonetic) {
      text += scanner.text();
    }
  }
  return unescapeOoxml(text);
}

/** The shared strings part's strings, in order, which cells refer to by index. */
function sharedStrings(xml: string | undefined): string[] {
  const strings: string[] = [];
  const scanner = scanXml(xml ?? "");
  for (const tag of tagsOf(scanner)) {
    if (tag.name === "si" && !tag.closing) {
      strings.push(tag.empty ? "" : richText(scanner, "si"));
    }
  }
  return strings;
}

/** What each cell style's number format shows, by the style's index among the styles part's `cellXfs`. */
function styleKinds(xml: string | undefined): NumberKind[] {
  const codes = new Map<number, string>();
  const kinds: NumberKind[] = [];
  let inCellStyles = false;
  for (const tag of tagsOf(scanXml(xml ?? ""))) {
    if (tag.name === "numFmt" && !tag.closing) {
      codes.set(Number(attribute(tag, "numFmtId")), attribute(tag, "formatCode") ?? "");
    } else if (tag.name === "cellXfs") {
      inCellStyles = !tag.closing && !tag.empty;
    } else if (tag.name === "xf" && inCellStyles && !tag.closing) {
      const id = Number(attribute(tag, "numFmtId") ?? "0");
      kinds.push(numberKind(id, codes.get(id)));
    }
  }
  return kinds;
}

/** A `<sheet>` tag's sheet. */
function listedSheet(tag: XmlTag): ListedSheet {
  const state = attribute(tag, "state");
  return {
    hidden: state === "hidden" || state === "veryHidden",
    id: attribute(tag, "id") ?? "",
    name: unescapeOoxml(attribute(tag, "name") ?? ""),
  };
}

/** The workbook part's sheets, in the order of their tabs, and its date system. */
function workbookOf(xml: string): {
  readonly sheets: readonly ListedSheet[];
  readonly date1904: boolean;
} {
  const sheets: ListedSheet[] = [];
  let date1904 = false;
  for (const tag of tagsOf(scanXml(xml))) {
    if (tag.name === "workbookPr") {
      const value = attribute(tag, "date1904");
      date1904 = value === "1" || value === "true";
    } else if (tag.name === "sheet" && !tag.closing) {
      sheets.push(listedSheet(tag));
    }
  }
  return { date1904, sheets };
}

export {
  partOfKind,
  relationshipsOf,
  relationshipsPart,
  richText,
  sharedStrings,
  styleKinds,
  unescapeOoxml,
  workbookOf,
};
export type { ListedSheet, Relationship };
