/* Reading text that may be any of the identifiers a security goes by, as a search box for securities takes it: a CUSIP,
 * an ISIN or a SEDOL, told apart by their lengths, 9, 12 and 7, and then checked as that identifier, check digit and
 * all. */

import { parseCusip, parseIsin, parseSedol } from "./identifiers.ts";
import type { Cusip, IdentifierReading, Isin, Sedol } from "./identifiers.ts";

/** Which identifier a security was named by. */
type SecurityIdentifierKind = "cusip" | "isin" | "sedol";

/** A checked identifier, with the kind it is, so a search can ask for the right one. */
type SecurityIdentifier =
  | { readonly kind: "cusip"; readonly value: Cusip }
  | { readonly kind: "isin"; readonly value: Isin }
  | { readonly kind: "sedol"; readonly value: Sedol };

/** The kinds a reading tries unless told otherwise: all three. */
const securityIdentifierKinds: readonly SecurityIdentifierKind[] = ["cusip", "isin", "sedol"];

const lengths: Readonly<Record<SecurityIdentifierKind, number>> = { cusip: 9, isin: 12, sedol: 7 };
const names: Readonly<Record<SecurityIdentifierKind, string>> = {
  cusip: "a CUSIP",
  isin: "an ISIN",
  sedol: "a SEDOL",
};
const either = new Intl.ListFormat("en-US", { type: "disjunction" });
const both = new Intl.ListFormat("en-US", { type: "conjunction" });

/** A reading of one kind, as a reading of a security identifier. */
function withKind<TKind extends SecurityIdentifierKind, TValue>(
  kind: TKind,
  reading: IdentifierReading<TValue>,
): IdentifierReading<{ readonly kind: TKind; readonly value: TValue }> {
  return reading.ok ? { ok: true, value: { kind, value: reading.value } } : reading;
}

const readers: Readonly<
  Record<SecurityIdentifierKind, (code: string) => IdentifierReading<SecurityIdentifier>>
> = {
  cusip: (code) => withKind("cusip", parseCusip(code)),
  isin: (code) => withKind("isin", parseIsin(code)),
  sedol: (code) => withKind("sedol", parseSedol(code)),
};

/** Why text of the wrong length is none of the kinds, naming each kind's length. */
function lengthReason(code: string, kinds: readonly SecurityIdentifierKind[]): string {
  const lengthsText = kinds.map((kind, index) =>
    index === 0
      ? `${names[kind]} has ${String(lengths[kind])} characters`
      : `${names[kind]} ${String(lengths[kind])}`,
  );
  return `"${code}" is not ${either.format(kinds.map((kind) => names[kind]))}: ${both.format(lengthsText)}, not ${String(code.length)}.`;
}

/** Reads `text` as one of `kinds`, all three unless set, by its length, then checks it as that identifier:
 *
 *   parseSecurityIdentifier("91282CRF0"); // { ok: true, value: { kind: "cusip", value: "91282CRF0" } }
 *   parseSecurityIdentifier("91282CRF1"); // its check digit should be 0
 *   parseSecurityIdentifier("UST 4 1/4 2034"); // "UST 4 1/4 2034" is not a CUSIP, an ISIN, or a SEDOL: ...
 *
 * Like the single readers, it trims the text and reads it in upper case. */
function parseSecurityIdentifier(
  text: string,
  kinds: readonly SecurityIdentifierKind[] = securityIdentifierKinds,
): IdentifierReading<SecurityIdentifier> {
  const code = text.trim().toUpperCase();
  const kind = kinds.find((each) => lengths[each] === code.length);
  if (kind === undefined) {
    return { ok: false, reason: lengthReason(code, kinds) };
  }
  return readers[kind](code);
}

export { parseSecurityIdentifier, securityIdentifierKinds };
export type { SecurityIdentifier, SecurityIdentifierKind };
