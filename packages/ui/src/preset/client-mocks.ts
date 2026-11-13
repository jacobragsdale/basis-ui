/* What `vp run client-pull` repairs in orval 8.46's MSW mocks, `client.msw.ts`, so that each mock passes its own
 * schema and the strict tsconfig as generated:
 *
 * - an enum field's pick, `Object.values(Convention)`, written for the plain object orval's TypeScript models declare:
 *   with Zod models, `Convention` is a Zod enum, whose own properties are no value of it, so every mock with an enum
 *   failed its own schema. A Zod 4 enum lists its values in `options`.
 * - a property the schema leaves out of `required`, picked as `notes: faker.helpers.arrayElement([TEXT, undefined])`:
 *   under `exactOptionalPropertyTypes` a model's `notes?: string` takes no `undefined`, so the mock failed `tsc`. It
 *   becomes `...faker.helpers.arrayElement([{ notes: TEXT }, {}])`, which leaves the property out instead. */

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const zodEnumMock =
  /faker\.helpers\.arrayElement\(Object\.values\((?<schema>[A-Za-z_$][\w$]*)\)\)/gu;

/** A property's pick between values, `KEY: faker.helpers.arrayElement([`, at a property's place in an object. */
const propertyPick =
  /(?<=[{,]\s*)(?<key>[A-Za-z_$][\w$]*|"(?:[^"\\]|\\.)*"):\s*faker\.helpers\.arrayElement\(\[/gu;

const opening = new Set(["(", "[", "{"]);
const closing = new Set([")", "]", "}"]);
const quotes = new Set(['"', "'", "`"]);

/** Where the quoted text that starts at `start` ends, past its closing quote. */
function pastQuote(text: string, start: number): number {
  const quote = text.charAt(start);
  let at = start + 1;
  while (at < text.length && text.charAt(at) !== quote) {
    at += text.charAt(at) === "\\" ? 2 : 1;
  }
  return at + 1;
}

/** Where a scan of an array's items stands: how deep in brackets, and the array's own commas so far. */
interface Scan {
  depth: number;
  readonly commas: number[];
}

/** How the character at `at` moves `scan`: past a quoted text, into or out of brackets, or at one of the array's own
 * commas; the index it goes on from. */
function advance(text: string, at: number, scan: Scan): number {
  const character = text.charAt(at);
  if (quotes.has(character)) {
    return pastQuote(text, at);
  }
  if (opening.has(character)) {
    scan.depth += 1;
  } else if (closing.has(character)) {
    scan.depth -= 1;
  } else if (character === "," && scan.depth === 0) {
    scan.commas.push(at);
  }
  return at + 1;
}

/** The elements of the array whose items start at `start`, split at its own commas, and where its `]` is; or
 * `undefined` for text that never closes it. */
function arrayAt(
  text: string,
  start: number,
): { readonly elements: readonly string[]; readonly end: number } | undefined {
  const scan: Scan = { commas: [], depth: 0 };
  for (let at = start; at < text.length; at = advance(text, at, scan)) {
    if (scan.depth === 0 && closing.has(text.charAt(at))) {
      const bounds = [start - 1, ...scan.commas, at];
      const elements = bounds
        .slice(1)
        .map((end, index) => text.slice((bounds[index] ?? 0) + 1, end));
      return { elements, end: at };
    }
  }
  return undefined;
}

/** A pick's choices as objects of the property, `{}` for `undefined`, or `undefined` for a pick that never leaves the
 * property out. */
function choicesOf(elements: readonly string[], key: string): string | undefined {
  const given = elements.map((element) => element.trim()).filter((element) => element !== "");
  if (!given.includes("undefined")) {
    return undefined;
  }
  return given
    .map((element) => (element === "undefined" ? "{}" : `{ ${key}: ${element} }`))
    .join(", ");
}

/** `text` with the pick at `match` written as a spread that leaves the property out where it picked `undefined`. */
function withOptionalPick(text: string, match: RegExpExecArray): string {
  const array = arrayAt(text, match.index + match[0].length);
  // The pick's `])` closes it, after the array's `]`.
  const choices =
    array === undefined || text.charAt(array.end + 1) !== ")"
      ? undefined
      : choicesOf(array.elements, match.groups?.["key"] ?? "");
  if (array === undefined || choices === undefined) {
    return text;
  }
  return `${text.slice(0, match.index)}...faker.helpers.arrayElement([${choices}])${text.slice(array.end + 2)}`;
}

/** The generated mocks with each enum pick reading the Zod enum's `options`, and each optional property's pick
 * leaving the property out rather than setting it to `undefined`. The last pick is rewritten first, so a pick inside
 * another's value is rewritten before the one that holds it. */
function repairedMocks(text: string): string {
  let written = text.replaceAll(zodEnumMock, "faker.helpers.arrayElement($<schema>.options)");
  for (const match of [...written.matchAll(propertyPick)].toReversed()) {
    written = withOptionalPick(written, match);
  }
  return written;
}

/** Repairs the generated mocks in `output`, as `repairedMocks` says. */
async function repairMocks(output: string): Promise<void> {
  const file = path.join(output, "client.msw.ts");
  if (!existsSync(file)) {
    return;
  }
  const text = await readFile(file, "utf8");
  const repaired = repairedMocks(text);
  if (repaired !== text) {
    await writeFile(file, repaired);
  }
}

export { repairMocks, repairedMocks };
