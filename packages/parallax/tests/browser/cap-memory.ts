/* Caps the engine's WebAssembly memory, so that a load within the browser's limits still runs it out of memory, as a
 * large one does on a real desktop. The capped worker patches its `fetch` with this before the engine starts. */

const pageBytes = 65_536;
/** 32 MB: room for a small table, not for 24 MB more. */
const cappedPages = 512;
const memorySection = 5;
const headerBytes = 8;
const continuation = 128;
const hasMaximum = 1;

/** Reads an unsigned LEB128 number at `from`, returning it and where it ends. */
function leb(bytes: Uint8Array, from: number): readonly [number, number] {
  let value = 0;
  let scale = 1;
  let at = from;
  let byte = continuation;
  while (byte >= continuation) {
    byte = bytes[at] ?? 0;
    at += 1;
    value += (byte % continuation) * scale;
    scale *= continuation;
  }
  return [value, at];
}

/** Writes an unsigned LEB128 number. */
function encode(value: number): readonly number[] {
  const out: number[] = [];
  let rest = value;
  do {
    const byte = rest % continuation;
    rest = Math.floor(rest / continuation);
    out.push(rest === 0 ? byte : byte + continuation);
  } while (rest !== 0);
  return out;
}

/** A memory section that caps the module's one memory at `pages`, or its initial size if that is larger. */
function cappedSection(wasm: Uint8Array, start: number, pages: number): readonly number[] {
  // One memory: its flags, then its initial pages; the maximum replaces any it had.
  const [initial] = leb(wasm, start + 2);
  const payload = [1, hasMaximum, ...encode(initial), ...encode(Math.max(initial, pages))];
  return [memorySection, ...encode(payload.length), ...payload];
}

/** The module with its one memory's maximum set to `pages` of 64 KiB, or its initial size if that is larger. */
function capMemory(wasm: Uint8Array, pages = cappedPages): Uint8Array<ArrayBuffer> {
  const parts: (readonly number[])[] = [[...wasm.subarray(0, headerBytes)]];
  let at = headerBytes;
  while (at < wasm.length) {
    const [size, start] = leb(wasm, at + 1);
    parts.push(
      wasm[at] === memorySection
        ? cappedSection(wasm, start, pages)
        : [...wasm.subarray(at, start + size)],
    );
    at = start + size;
  }
  return Uint8Array.from(parts.flat());
}

export { capMemory, cappedPages, pageBytes };
