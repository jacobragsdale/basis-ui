/* Security identifiers and their check digits: CUSIP (9 characters, the US and Canada), ISIN (12, ISO 6166) and
 * SEDOL (7, the London Stock Exchange's). Each has a branded type that only its parsing function makes, so a ticker
 * or a SEDOL cannot pass where a CUSIP is due. A parsing function trims the text and reads it in upper case; the `is`
 * checks take the text exactly as given. */

declare const brand: unique symbol;

/** A string that passed `parseCusip`. */
type Cusip = string & { readonly [brand]: "Cusip" };
/** A string that passed `parseIsin`. */
type Isin = string & { readonly [brand]: "Isin" };
/** A string that passed `parseSedol`. */
type Sedol = string & { readonly [brand]: "Sedol" };

/** An identifier read from text, or why it is not one. */
type IdentifierReading<TValue> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly reason: string };

const cusipLength = 9;
const isinLength = 12;
const sedolLength = 7;
const radix = 10;
/** Letters count from 10, A, to 35, Z, in all three check digits. */
const letterBase = 10;
/** CUSIP's three symbols, `*`, `@` and `#`, count 36, 37 and 38, after the letters. */
const cusipSymbols = "*@#";
const firstSymbolValue = 36;
/** SEDOL's weights, one digit for each of its first six characters. */
const sedolWeights = "131739";
const codeOfA = "A".codePointAt(0) ?? 0;

const cusipShape = /^[\dA-Z*@#]{8}\d$/u;
const isinShape = /^[A-Z]{2}[\dA-Z]{9}\d$/u;
const sedolShape = /^[\dB-DF-HJ-NP-TV-Z]{6}\d$/u;

/** A character's value in a check digit: a digit's own value, then A to Z from 10. */
function valueOf(character: string): number {
  const digit = Number.parseInt(character, radix);
  return Number.isNaN(digit) ? (character.codePointAt(0) ?? 0) - codeOfA + letterBase : digit;
}

/** The sum of a number's decimal digits. */
function digitSum(value: number): number {
  return Math.trunc(value / radix) + (value % radix);
}

/** The digit that brings a weighted sum up to a multiple of ten. */
function tensComplement(sum: number): number {
  return (radix - (sum % radix)) % radix;
}

/** The check digit of a CUSIP's first eight characters: every second value doubled, the digits of each summed. The
 * codes the checks reach are ASCII, so a character is one UTF-16 unit. */
function cusipCheckDigit(base: string): number {
  let sum = 0;
  for (let index = 0; index < base.length; index += 1) {
    const character = base.charAt(index);
    const symbol = cusipSymbols.indexOf(character);
    const value = symbol === -1 ? valueOf(character) : firstSymbolValue + symbol;
    sum += digitSum(index % 2 === 1 ? value * 2 : value);
  }
  return tensComplement(sum);
}

/** Whether a string of digits passes the Luhn check, its last digit being the check digit: from the right, every
 * second digit is doubled and the digits of the results summed. */
function passesLuhn(digits: string): boolean {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    const value = Number.parseInt(digits.charAt(digits.length - 1 - index), radix);
    sum += digitSum(index % 2 === 1 ? value * 2 : value);
  }
  return sum % radix === 0;
}

/** An ISIN with each letter written as its two-digit value, for the Luhn check. */
function expanded(code: string): string {
  return code.replaceAll(/[A-Z]/gu, (letter) => String(valueOf(letter)));
}

/** The check digit of an ISIN's first eleven characters. */
function isinCheckDigit(base: string): number {
  for (let digit = 0; digit < radix; digit += 1) {
    if (passesLuhn(expanded(`${base}${String(digit)}`))) {
      return digit;
    }
  }
  throw new RangeError(`"${base}" has no ISIN check digit.`);
}

/** The check digit of a SEDOL's first six characters, each value times its weight. */
function sedolCheckDigit(base: string): number {
  let sum = 0;
  for (let index = 0; index < base.length; index += 1) {
    sum += valueOf(base.charAt(index)) * Number(sedolWeights.charAt(index));
  }
  return tensComplement(sum);
}

type Kind = "CUSIP" | "ISIN" | "SEDOL";

/** An identifier's name with its article: a CUSIP, an ISIN. */
function named(kind: Kind): string {
  return `${kind === "ISIN" ? "an" : "a"} ${kind}`;
}

function lengthReason(kind: Kind, code: string, length: number): string {
  return `"${code}" is not ${named(kind)}: ${named(kind)} has ${String(length)} characters, not ${String(code.length)}.`;
}

function checkReason(kind: Kind, code: string, expected: number): string {
  return `"${code}" is not ${named(kind)}: its check digit should be ${String(expected)}; look for a mistyped character.`;
}

/** Why `code` is not a CUSIP, or `undefined` if it is one. */
function cusipProblem(code: string): string | undefined {
  if (code.length !== cusipLength) {
    return lengthReason("CUSIP", code, cusipLength);
  }
  if (!cusipShape.test(code)) {
    return `"${code}" is not a CUSIP: it takes letters, digits, *, @ and #, and ends in a digit.`;
  }
  const expected = cusipCheckDigit(code.slice(0, -1));
  return expected === Number(code.at(-1)) ? undefined : checkReason("CUSIP", code, expected);
}

/** Why `code` is not an ISIN, or `undefined` if it is one. */
function isinProblem(code: string): string | undefined {
  if (code.length !== isinLength) {
    return lengthReason("ISIN", code, isinLength);
  }
  if (!isinShape.test(code)) {
    return `"${code}" is not an ISIN: it starts with a two-letter country code and ends in a digit.`;
  }
  return passesLuhn(expanded(code))
    ? undefined
    : checkReason("ISIN", code, isinCheckDigit(code.slice(0, -1)));
}

/** Why `code` is not a SEDOL, or `undefined` if it is one. */
function sedolProblem(code: string): string | undefined {
  if (code.length !== sedolLength) {
    return lengthReason("SEDOL", code, sedolLength);
  }
  if (!sedolShape.test(code)) {
    return `"${code}" is not a SEDOL: it takes digits and consonants, and ends in a digit.`;
  }
  const expected = sedolCheckDigit(code.slice(0, -1));
  return expected === Number(code.at(-1)) ? undefined : checkReason("SEDOL", code, expected);
}

// The brands are made only by these guards, which run every check, and only the parsing functions call them.
function isCusipCode(code: string): code is Cusip {
  return cusipProblem(code) === undefined;
}

function isIsinCode(code: string): code is Isin {
  return isinProblem(code) === undefined;
}

function isSedolCode(code: string): code is Sedol {
  return sedolProblem(code) === undefined;
}

/** Text as an identifier is written: without surrounding space, in upper case. */
function normalized(text: string): string {
  return text.trim().toUpperCase();
}

/** Reads a CUSIP: eight letters, digits or `*`, `@` and `#`, then the check digit. */
function parseCusip(text: string): IdentifierReading<Cusip> {
  const code = normalized(text);
  return isCusipCode(code)
    ? { ok: true, value: code }
    : { ok: false, reason: cusipProblem(code) ?? "" };
}

/** Reads an ISIN: a two-letter country code, nine letters or digits, then the check digit, which checks the code
 * with its letters written as numbers. The check cannot catch two adjacent letters swapped. */
function parseIsin(text: string): IdentifierReading<Isin> {
  const code = normalized(text);
  return isIsinCode(code)
    ? { ok: true, value: code }
    : { ok: false, reason: isinProblem(code) ?? "" };
}

/** Reads a SEDOL: six digits or consonants, then the check digit. */
function parseSedol(text: string): IdentifierReading<Sedol> {
  const code = normalized(text);
  return isSedolCode(code)
    ? { ok: true, value: code }
    : { ok: false, reason: sedolProblem(code) ?? "" };
}

/** Whether `text` is a CUSIP, exactly as given. */
function isCusip(text: string): boolean {
  return cusipProblem(text) === undefined;
}

/** Whether `text` is an ISIN, exactly as given. */
function isIsin(text: string): boolean {
  return isinProblem(text) === undefined;
}

/** Whether `text` is a SEDOL, exactly as given. */
function isSedol(text: string): boolean {
  return sedolProblem(text) === undefined;
}

/** The ISIN of a CUSIP-numbered security: its country code, the CUSIP, and a check digit. `country` is `"US"` by
 * default; Canadian issues take `"CA"`. */
function cusipToIsin(cusip: Cusip, country = "US"): Isin {
  const reading = parseIsin(`${country}${cusip}${String(isinCheckDigit(`${country}${cusip}`))}`);
  if (!reading.ok) {
    throw new RangeError(`"${country}" is not a country code: ${reading.reason}`);
  }
  return reading.value;
}

export { cusipToIsin, isCusip, isIsin, isSedol, parseCusip, parseIsin, parseSedol };
export type { Cusip, IdentifierReading, Isin, Sedol };
