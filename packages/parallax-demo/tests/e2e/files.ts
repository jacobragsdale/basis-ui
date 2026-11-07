/* The files the "Data from the app" specs read and change: an xlsx's first sheet, read without a library, and the
 * engine's module with its memory capped, so that a load within the browser's limits still runs it out of memory, as
 * a large one does on a real desktop. */

import { inflateRawSync } from "node:zlib";

/** Where a zip's directory and its entries keep what is read here, in bytes from their starts (APPNOTE.TXT 4.3). */
const zip = {
  /** The end of the central directory: its signature, its count of entries, and the directory's offset. */
  end: { entries: 10, offset: 16, signature: Buffer.from("PK\u0005\u0006", "latin1") },
  /** A central directory entry: its method, its compressed size, its name's, extra's and comment's lengths, its
   * local header's offset, and the length of its fixed part. */
  entry: { comment: 32, extra: 30, fixed: 46, local: 42, method: 10, name: 28, size: 20 },
  /** A local header: its name's and extra's lengths, and the length of its fixed part. */
  local: { extra: 28, fixed: 30, name: 26 },
  /** The method that deflates. */
  deflated: 8,
} as const;

/** One entry of a zip's central directory, starting at `at`: its file's name and contents, and where the next
 * starts. */
function entryAt(archive: Buffer, at: number): readonly [string, string, number] {
  const { entry, local } = zip;
  const nameLength = archive.readUInt16LE(at + entry.name);
  const name = archive.toString("utf8", at + entry.fixed, at + entry.fixed + nameLength);
  const header = archive.readUInt32LE(at + entry.local);
  const data =
    header +
    local.fixed +
    archive.readUInt16LE(header + local.name) +
    archive.readUInt16LE(header + local.extra);
  const stored = archive.subarray(data, data + archive.readUInt32LE(at + entry.size));
  const deflated = archive.readUInt16LE(at + entry.method) === zip.deflated;
  const next =
    at +
    entry.fixed +
    nameLength +
    archive.readUInt16LE(at + entry.extra) +
    archive.readUInt16LE(at + entry.comment);
  return [name, (deflated ? inflateRawSync(stored) : stored).toString("utf8"), next];
}

/** The files of a zip archive, such as an xlsx, by name. */
function unzip(archive: Buffer): Map<string, string> {
  const end = archive.lastIndexOf(zip.end.signature);
  const files = new Map<string, string>();
  let at = archive.readUInt32LE(end + zip.end.offset);
  for (let entry = 0; entry < archive.readUInt16LE(end + zip.end.entries); entry += 1) {
    const [name, contents, next] = entryAt(archive, at);
    files.set(name, contents);
    at = next;
  }
  return files;
}

const firstColumn = "A".codePointAt(0) ?? 0;

/** A cell's text: its value, or its inline text, or the shared string its value names. */
function cellText(
  groups: Readonly<Record<string, string | undefined>>,
  strings: readonly string[],
): string {
  const body = groups["body"] ?? "";
  const value =
    /<v>(?<value>.*?)<\/v>/u.exec(body)?.groups?.["value"] ??
    /<t[^>]*>(?<text>.*?)<\/t>/u.exec(body)?.groups?.["text"] ??
    "";
  return (groups["attributes"] ?? "").includes('t="s"') ? (strings[Number(value)] ?? "") : value;
}

/** An xlsx's first sheet as rows of cell texts, shared strings resolved; single-letter columns only. */
function sheetRows(xlsx: Buffer): string[][] {
  const files = unzip(xlsx);
  const strings = [
    ...(files.get("xl/sharedStrings.xml") ?? "").matchAll(
      /<si>.*?<t[^>]*>(?<text>.*?)<\/t>.*?<\/si>/gsu,
    ),
  ].map((match) => match.groups?.["text"] ?? "");
  const rows: string[][] = [];
  const cells = (files.get("xl/worksheets/sheet1.xml") ?? "").matchAll(
    /<c r="(?<column>[A-Z])(?<row>\d+)"(?<attributes>[^>]*?)(?:\/>|>(?<body>.*?)<\/c>)/gsu,
  );
  for (const { groups = {} } of cells) {
    const row = Number(groups["row"]) - 1;
    const line = rows[row] ?? [];
    line[(groups["column"]?.codePointAt(0) ?? firstColumn) - firstColumn] = cellText(
      groups,
      strings,
    );
    rows[row] = line;
  }
  return rows;
}

/** LEB128: seven bits a byte, the lowest first, each but the last at or above `more`. */
const more = 0x80;
const bitsPerByte = 7;

/** A LEB128 number in `wasm` from `from`, and where it ends. */
function leb(wasm: Buffer, from: number): readonly [number, number] {
  let value = 0;
  let at = from;
  let byte = more;
  for (let shift = 0; byte >= more; shift += bitsPerByte) {
    byte = wasm[at] ?? 0;
    at += 1;
    value += (byte % more) * 2 ** shift;
  }
  return [value, at];
}

/** `value` as LEB128. */
function encode(value: number): number[] {
  const out: number[] = [];
  let rest = value;
  do {
    const byte = rest % more;
    rest = Math.floor(rest / more);
    out.push(rest === 0 ? byte : byte + more);
  } while (rest !== 0);
  return out;
}

/** A module's memory section, its id, and where its sections start, after the magic number and version. */
const memorySection = 5;
const sectionsStart = 8;

/** The engine's module with its memory capped at `pages` of 64 KiB. */
function capMemory(wasm: Buffer, pages: number): Buffer {
  const parts: Buffer[] = [wasm.subarray(0, sectionsStart)];
  for (let at = sectionsStart; at < wasm.length;) {
    const [size, start] = leb(wasm, at + 1);
    if (wasm[at] === memorySection) {
      // One memory, with a maximum: the count, the flags, then its initial pages, and the maximum that replaces any.
      const [initial] = leb(wasm, start + 2);
      const payload = Buffer.from([1, 1, ...encode(initial), ...encode(Math.max(initial, pages))]);
      parts.push(Buffer.from([memorySection, ...encode(payload.length)]), payload);
    } else {
      parts.push(wasm.subarray(at, start + size));
    }
    at = start + size;
  }
  return Buffer.concat(parts);
}

export { capMemory, sheetRows };
