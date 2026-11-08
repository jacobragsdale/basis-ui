/* A ZIP archive written for a test: each file stored as it is, uncompressed, which every reader takes, or deflated by
 * the browser's CompressionStream. It writes no CRC-32, which the import never checks; Excel opens a workbook written
 * so only after repairing it, so the archive is for tests, not for people. */

/** A file in the archive: its text, and whether to deflate it. */
interface ZipPart {
  readonly text: string;
  readonly deflate?: boolean | undefined;
}

/** A local file header's fields, and the central directory entry's that repeat them. */
const local = { length: 30, signature: 0x04_03_4b_50 } as const;
const entry = { length: 46, signature: 0x02_01_4b_50 } as const;
const end = { length: 22, signature: 0x06_05_4b_50 } as const;
const version = 20;
const method = { deflated: 8, stored: 0 } as const;
/** Bit 11 of the flags: the names are UTF-8. */
const utf8Names = 0x8_00;
const field = {
  compressedSize: 18,
  directoryCompressed: 20,
  directoryFlags: 8,
  directoryMethod: 10,
  directoryName: 28,
  directoryNeeded: 6,
  directoryOffset: 42,
  directoryUncompressed: 24,
  endCount: 10,
  endDiskCount: 8,
  endOffset: 16,
  endSize: 12,
  flags: 6,
  method: 8,
  name: 26,
  needed: 4,
  uncompressedSize: 22,
} as const;

/** The widths of the fields, in bytes. */
const u16 = 2;
const u32 = 4;

const encoder = new TextEncoder();

/** The bytes a part is stored as. */
async function partBytes(part: ZipPart): Promise<Uint8Array<ArrayBuffer>> {
  const raw = encoder.encode(part.text);
  if (part.deflate !== true) {
    return raw;
  }
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** One file as the archive holds it: its name, its stored bytes, its size, and where its header starts. */
interface Written {
  readonly name: Uint8Array<ArrayBuffer>;
  readonly data: Uint8Array<ArrayBuffer>;
  readonly size: number;
  readonly deflated: boolean;
  readonly offset: number;
}

/** Writes little-endian fields into a record: each an offset, a width of 2 or 4 bytes, and a value. */
function writeFields(
  record: Uint8Array<ArrayBuffer>,
  fields: readonly (readonly [offset: number, width: typeof u16 | typeof u32, value: number])[],
): void {
  const view = new DataView(record.buffer);
  for (const [offset, width, value] of fields) {
    if (width === u16) {
      view.setUint16(offset, value, true);
    } else {
      view.setUint32(offset, value, true);
    }
  }
}

/** A file's local header, then its bytes. */
function localRecord(file: Written): Uint8Array<ArrayBuffer> {
  const record = new Uint8Array(local.length + file.name.byteLength + file.data.byteLength);
  writeFields(record, [
    [0, u32, local.signature],
    [field.needed, u16, version],
    [field.flags, u16, utf8Names],
    [field.method, u16, file.deflated ? method.deflated : method.stored],
    [field.compressedSize, u32, file.data.byteLength],
    [field.uncompressedSize, u32, file.size],
    [field.name, u16, file.name.byteLength],
  ]);
  record.set(file.name, local.length);
  record.set(file.data, local.length + file.name.byteLength);
  return record;
}

/** A file's central directory entry. */
function directoryRecord(file: Written): Uint8Array<ArrayBuffer> {
  const record = new Uint8Array(entry.length + file.name.byteLength);
  writeFields(record, [
    [0, u32, entry.signature],
    [field.directoryNeeded, u16, version],
    [field.directoryFlags, u16, utf8Names],
    [field.directoryMethod, u16, file.deflated ? method.deflated : method.stored],
    [field.directoryCompressed, u32, file.data.byteLength],
    [field.directoryUncompressed, u32, file.size],
    [field.directoryName, u16, file.name.byteLength],
    [field.directoryOffset, u32, file.offset],
  ]);
  record.set(file.name, entry.length);
  return record;
}

/** The end-of-central-directory record. */
function endRecord(count: number, size: number, offset: number): Uint8Array<ArrayBuffer> {
  const record = new Uint8Array(end.length);
  writeFields(record, [
    [0, u32, end.signature],
    [field.endDiskCount, u16, count],
    [field.endCount, u16, count],
    [field.endSize, u32, size],
    [field.endOffset, u32, offset],
  ]);
  return record;
}

/** Each part as the archive holds it, with where its local header starts. */
async function writtenParts(parts: Readonly<Record<string, ZipPart>>): Promise<Written[]> {
  const named = Object.entries(parts);
  const stored = await Promise.all(named.map(async ([, part]) => partBytes(part)));
  let offset = 0;
  return named.map(([name, part], index) => {
    const data = stored[index] ?? new Uint8Array();
    const file = {
      data,
      deflated: part.deflate === true,
      name: encoder.encode(name),
      offset,
      size: encoder.encode(part.text).byteLength,
    };
    offset += local.length + file.name.byteLength + data.byteLength;
    return file;
  });
}

/** A ZIP archive's bytes, holding each part by its name, in the order given:
 *
 *   const bytes = await zipBytes({ "notes.txt": { text: "Hello" } });
 */
async function zipBytes(
  parts: Readonly<Record<string, ZipPart>>,
): Promise<Uint8Array<ArrayBuffer>> {
  const written = await writtenParts(parts);
  const locals = written.map((file) => localRecord(file));
  const directory = written.map((file) => directoryRecord(file));
  const start = locals.reduce((total, record) => total + record.byteLength, 0);
  const size = directory.reduce((total, record) => total + record.byteLength, 0);
  const blob = new Blob([...locals, ...directory, endRecord(written.length, size, start)]);
  return new Uint8Array(await blob.arrayBuffer());
}

export { zipBytes };
export type { ZipPart };
