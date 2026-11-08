/* How FileImport finds the schema's columns in a file: by their headers, ignoring case, spaces and punctuation, so
 * `Par Amount`, `par_amount` and `PAR-AMOUNT` all match a key headed `parAmount` or declared as `"Par amount"`. A key
 * the file lacks is refused when the schema needs it, and left empty when its field is optional. */

import type { z } from "zod";

/** A schema an import checks rows against: an object whose keys are the file's columns. */
type ImportSchema = z.ZodObject<Readonly<Record<string, z.ZodType>>, z.core.$ZodObjectConfig>;

/** The header, or several, a key's column may go by in a file, besides the key itself. */
type ImportHeaders<TSchema extends ImportSchema> = {
  readonly [TKey in keyof TSchema["shape"]]?: string | readonly string[];
};

/** Each key's column in the file, by index, or the headers of the columns it lacks that the schema needs. */
type ColumnMatch =
  | { readonly ok: true; readonly indexes: ReadonlyMap<string, number> }
  | { readonly ok: false; readonly missing: readonly string[] };

const notLetterOrDigit = /[^\p{L}\p{N}]/gu;
/** What the schema sees for an empty cell, or for a column the file lacks. */
const missingCell = undefined;

/** A header as matching compares it: letters and digits only, in lower case. */
function headerKey(text: string): string {
  return text.normalize("NFKD").toLocaleLowerCase("en-US").replaceAll(notLetterOrDigit, "");
}

/** The headers a key's column may go by. */
function headersOf<TSchema extends ImportSchema>(
  key: string,
  headers: ImportHeaders<TSchema> | undefined,
): readonly string[] {
  const declared: unknown = headers === undefined ? undefined : Reflect.get(headers, key);
  if (typeof declared === "string") {
    return [declared, key];
  }
  return Array.isArray(declared) ? [...declared.map(String), key] : [key];
}

/** The header the preview shows over a key's column: the first it is declared with, or the key. */
function displayHeader<TSchema extends ImportSchema>(
  key: string,
  headers: ImportHeaders<TSchema> | undefined,
): string {
  return headersOf(key, headers)[0] ?? key;
}

/** Each key's column in the file, by index, or why the file lacks one the schema needs. */
function matchColumns<TSchema extends ImportSchema>(
  header: readonly string[],
  {
    schema,
    headers,
  }: { readonly schema: TSchema; readonly headers: ImportHeaders<TSchema> | undefined },
): ColumnMatch {
  const indexes = new Map<string, number>();
  const missing: string[] = [];
  const found = header.map((text) => headerKey(text));
  for (const [key, field] of Object.entries(schema.shape)) {
    const wanted = new Set(headersOf(key, headers).map((text) => headerKey(text)));
    const index = found.findIndex((text) => wanted.has(text));
    if (index !== -1) {
      indexes.set(key, index);
    } else if (!field.safeParse(missingCell).success) {
      missing.push(displayHeader(key, headers));
    }
  }
  return missing.length === 0 ? { indexes, ok: true } : { missing, ok: false };
}

export { displayHeader, matchColumns };
export type { ColumnMatch, ImportHeaders, ImportSchema };
