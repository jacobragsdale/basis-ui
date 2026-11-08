/* Reading the files in a ZIP archive, as an Excel workbook is one, with only what the browser has: the central
 * directory at the archive's end lists each file and where its bytes start, and each is stored as it is or deflated,
 * which the browser's DecompressionStream inflates off the page's thread. ZIP64's larger fields are read too, though
 * a workbook small enough to read in a browser never needs them.
 *
 * It refuses an encrypted file, a compression method other than storing and deflating, and a file that unzips to
 * more than the caller's limit, which keeps a small archive that inflates to gigabytes from taking the page's memory. */

/** One file in the archive, as its central directory lists it. */
interface ZipEntry {
  readonly name: string;
  readonly method: number;
  readonly encrypted: boolean;
  readonly compressedSize: number;
  readonly localOffset: number;
}

/** An archive's files, by name, and a way to read one as text. */
interface ZipArchive {
  readonly names: readonly string[];
  /** A file's text, as UTF-8; `undefined` when the archive has no file of that name, which is matched ignoring case,
   * as Office matches it. It rejects with a ZipError when the file cannot be read or unzips to more than `maxBytes`. */
  readonly text: (name: string, maxBytes: number) => Promise<string | undefined>;
}

type ZipReading =
  | { readonly ok: true; readonly archive: ZipArchive }
  | { readonly ok: false; readonly reason: string };

/** Why a file in the archive could not be read, in words. */
class ZipError extends Error {
  public override readonly name = "ZipError";
}

/** The archive's bytes, and a view of them that reads its little-endian fields. */
interface Bytes {
  readonly bytes: Uint8Array;
  readonly view: DataView;
}

/** The end-of-central-directory record's fields, by their offsets from its signature. */
const end = { count: 10, length: 22, offset: 16, signature: 0x06_05_4b_50 } as const;
/** ZIP64's locator, just before that record, and the ZIP64 record it points to. */
const zip64Locator = { length: 20, record: 8, signature: 0x07_06_4b_50 } as const;
const zip64End = { count: 32, length: 56, offset: 48, signature: 0x06_06_4b_50 } as const;
/** A central directory entry's fields. */
const entry = {
  commentLength: 32,
  compressedSize: 20,
  extraLength: 30,
  flags: 8,
  length: 46,
  localOffset: 42,
  method: 10,
  nameLength: 28,
  signature: 0x02_01_4b_50,
  uncompressedSize: 24,
} as const;
/** A local file header's fields, which the file's bytes follow. */
const local = { extraLength: 28, length: 30, nameLength: 26, signature: 0x04_03_4b_50 } as const;
/** An extra field's header: a 16-bit id and a 16-bit size; ZIP64's id is 1, and its fields are 64-bit. */
const extraField = { header: 4, size: 2, word: 8, zip64: 1 } as const;
const longestComment = 0xff_ff;
/** The value a 16- or 32-bit field holds when ZIP64's extra field holds the real one. */
const short64 = 0xff_ff;
const long64 = 0xff_ff_ff_ff;
const method = { deflated: 8, stored: 0 } as const;

const nameDecoder = new TextDecoder();

function u16(data: Bytes, offset: number): number {
  return data.view.getUint16(offset, true);
}

function u32(data: Bytes, offset: number): number {
  return data.view.getUint32(offset, true);
}

function u64(data: Bytes, offset: number): number {
  return Number(data.view.getBigUint64(offset, true));
}

/** Whether a record of `length` bytes at `offset` fits in the archive and starts with `signature`. */
function recordAt(
  data: Bytes,
  offset: number,
  record: { readonly length: number; readonly signature: number },
): boolean {
  return (
    offset >= 0 &&
    offset + record.length <= data.bytes.byteLength &&
    u32(data, offset) === record.signature
  );
}

/** Where the end-of-central-directory record starts: the last signature, after which at most a comment follows. */
function findEnd(data: Bytes): number | undefined {
  const last = data.bytes.byteLength - end.length;
  for (let offset = last; offset >= Math.max(0, last - longestComment); offset -= 1) {
    if (u32(data, offset) === end.signature) {
      return offset;
    }
  }
  return undefined;
}

/** Where the central directory starts and how many entries it holds, from ZIP64's record when the classic one says
 * so; `undefined` when the archive is cut short. */
function directoryOf(
  data: Bytes,
  at: number,
): { readonly offset: number; readonly count: number } | undefined {
  const count = u16(data, at + end.count);
  const offset = u32(data, at + end.offset);
  if (count !== short64 && offset !== long64) {
    return { count, offset };
  }
  const locator = at - zip64Locator.length;
  const record = recordAt(data, locator, zip64Locator)
    ? u64(data, locator + zip64Locator.record)
    : -1;
  return recordAt(data, record, zip64End)
    ? { count: u64(data, record + zip64End.count), offset: u64(data, record + zip64End.offset) }
    : undefined;
}

/** The ZIP64 extra field's 64-bit values among an entry's extra fields, which start at `start`. */
function zip64Values(data: Bytes, start: number, length: number): number[] {
  for (
    let field = start;
    field + extraField.header <= start + length;
    field += extraField.header + u16(data, field + extraField.size)
  ) {
    if (u16(data, field) === extraField.zip64) {
      const size = u16(data, field + extraField.size);
      const words = Math.floor(size / extraField.word);
      return Array.from({ length: words }, (_unused, index) =>
        u64(data, field + extraField.header + index * extraField.word),
      );
    }
  }
  return [];
}

/** An entry's compressed size and local offset, from ZIP64's extra field where the 32-bit fields say to look there,
 * which holds the uncompressed size, the compressed size and the offset, in that order, for those that need it. */
function sizesOf(
  data: Bytes,
  at: number,
  extraStart: number,
): Pick<ZipEntry, "compressedSize" | "localOffset"> {
  const compressed = u32(data, at + entry.compressedSize);
  const offset = u32(data, at + entry.localOffset);
  const values = zip64Values(data, extraStart, u16(data, at + entry.extraLength));
  if (u32(data, at + entry.uncompressedSize) === long64) {
    values.shift();
  }
  const compressedSize = compressed === long64 ? values.shift() : compressed;
  const localOffset = offset === long64 ? values.shift() : offset;
  return { compressedSize: compressedSize ?? compressed, localOffset: localOffset ?? offset };
}

/** The entry whose central directory record is at `at`, and where the next one starts. */
function entryAt(data: Bytes, at: number): { readonly entry: ZipEntry; readonly next: number } {
  const nameLength = u16(data, at + entry.nameLength);
  const nameStart = at + entry.length;
  const extraStart = nameStart + nameLength;
  const name = nameDecoder.decode(data.bytes.subarray(nameStart, extraStart));
  return {
    entry: {
      ...sizesOf(data, at, extraStart),
      // Bit 0 of the flags marks an encrypted entry.
      encrypted: u16(data, at + entry.flags) % 2 === 1,
      method: u16(data, at + entry.method),
      // A ZIP written on Windows by a careless tool may separate folders with backslashes.
      name: name.replaceAll("\\", "/"),
    },
    next: extraStart + u16(data, at + entry.extraLength) + u16(data, at + entry.commentLength),
  };
}

/** The entries the central directory lists, or `undefined` when it is cut short or damaged. */
function entriesOf(
  data: Bytes,
  directory: { readonly offset: number; readonly count: number },
): ZipEntry[] | undefined {
  const entries: ZipEntry[] = [];
  let at = directory.offset;
  while (entries.length < directory.count) {
    if (!recordAt(data, at, entry)) {
      return undefined;
    }
    const read = entryAt(data, at);
    entries.push(read.entry);
    at = read.next;
  }
  return entries;
}

/** A stream that passes bytes through until more than `maxBytes` have passed, then fails with `reason`. */
function limitBytes(maxBytes: number, reason: string): TransformStream<Uint8Array, Uint8Array> {
  let total = 0;
  return new TransformStream({
    transform: (chunk, controller) => {
      total += chunk.byteLength;
      if (total > maxBytes) {
        controller.error(new ZipError(reason));
        return;
      }
      controller.enqueue(chunk);
    },
  });
}

/** Why an entry cannot be read at all: it is encrypted, or compressed by a method a browser lacks. */
function checkEntry(file: ZipEntry): void {
  if (file.encrypted) {
    throw new ZipError(`${file.name} is encrypted.`);
  }
  if (file.method !== method.stored && file.method !== method.deflated) {
    throw new ZipError(
      `${file.name} is compressed with method ${String(file.method)}, which a browser cannot unzip.`,
    );
  }
}

/** Where an entry's bytes start, after its local header, or why they cannot be read. */
function dataStart(data: Bytes, file: ZipEntry): number {
  checkEntry(file);
  const at = file.localOffset;
  if (!recordAt(data, at, local)) {
    throw new ZipError(`${file.name} is not where the archive's directory says it is.`);
  }
  const start =
    at + local.length + u16(data, at + local.nameLength) + u16(data, at + local.extraLength);
  if (start + file.compressedSize > data.bytes.byteLength) {
    throw new ZipError(`${file.name} is cut short.`);
  }
  return start;
}

/** An entry's bytes, inflated if they are deflated, as UTF-8 text. */
async function entryText(data: Bytes, file: ZipEntry, maxBytes: number): Promise<string> {
  const start = dataStart(data, file);
  const raw = new Blob([data.bytes.slice(start, start + file.compressedSize)]).stream();
  const inflated =
    file.method === method.deflated ? raw.pipeThrough(new DecompressionStream("deflate-raw")) : raw;
  const limit = limitBytes(maxBytes, `${file.name} unzips to more than ${String(maxBytes)} bytes.`);
  try {
    return await new Response(inflated.pipeThrough(limit)).text();
  } catch (error) {
    throw error instanceof ZipError
      ? error
      : new ZipError(`${file.name} is damaged and does not unzip.`, { cause: error });
  }
}

/** Reads a ZIP archive's directory, or says why the bytes are not one:
 *
 *   const reading = readZip(new Uint8Array(await file.arrayBuffer()));
 *   if (reading.ok) {
 *     const workbook = await reading.archive.text("xl/workbook.xml", 50_000_000);
 *   }
 */
function readZip(bytes: Uint8Array): ZipReading {
  const data = { bytes, view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) };
  const at = bytes.byteLength < end.length ? undefined : findEnd(data);
  const directory = at === undefined ? undefined : directoryOf(data, at);
  const entries = directory === undefined ? undefined : entriesOf(data, directory);
  if (entries === undefined) {
    return { ok: false, reason: "its ZIP directory is missing or cut short." };
  }
  const byName = new Map(entries.map((file) => [file.name.toLowerCase(), file] as const));
  const text = async (name: string, maxBytes: number): Promise<string | undefined> => {
    const file = byName.get(name.toLowerCase());
    return file === undefined ? undefined : entryText(data, file, maxBytes);
  };
  return { archive: { names: entries.map((file) => file.name), text }, ok: true };
}

export { readZip, ZipError };
export type { ZipArchive, ZipReading };
