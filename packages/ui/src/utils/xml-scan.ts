/* Scanning the XML an Excel workbook's parts hold: their tags in order, each by its local name, so that `<c>` and the
 * `<x:c>` the .NET Open XML SDK writes read alike, and the text between them, with XML's entities and CDATA read.
 * It is not a general XML parser: it checks no well-formedness and reads no DTD, which a workbook's parts never have,
 * and it skips comments and processing instructions. It finds each `<` with `indexOf` rather than a regular
 * expression, which the measurement in docs/spikes/xlsx-reader.md found several times faster on a sheet's cells. */

/** One tag: an opening, closing or empty-element tag, by its local name. */
interface XmlTag {
  /** The element's name without its namespace prefix. */
  readonly name: string;
  readonly closing: boolean;
  /** Whether it is an empty-element tag, `<c/>`, which no closing tag follows. */
  readonly empty: boolean;
  /** The tag's attributes as written, for `attribute` to read. */
  readonly attributes: string;
}

/** The tags of an XML text in order, each of them once. */
interface XmlScanner {
  readonly next: () => XmlTag | undefined;
  /** The text from the end of the last tag to the next tag, read, CDATA included. */
  readonly text: () => string;
}

/** A piece of markup: a tag, a CDATA section's text, or a comment or instruction, which readers skip. */
interface Markup {
  readonly tag: XmlTag | undefined;
  readonly cdata: string | undefined;
  readonly start: number;
  readonly end: number;
}

const code = {
  colon: 58,
  doubleQuote: 34,
  equals: 61,
  exclamation: 33,
  greater: 62,
  question: 63,
  singleQuote: 39,
  slash: 47,
  space: 32,
} as const;
const comment = { close: "-->", open: "<!--" } as const;
const cdataSection = { close: "]]>", open: "<![CDATA[" } as const;
const entity = /&(?:(?<named>amp|lt|gt|quot|apos)|#x(?<hex>[\da-f]+)|#(?<decimal>\d+));/giu;
const named = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["quot", '"'],
]);
const decimal = 10;
const hexadecimal = 16;
const lastCodePoint = 0x10_ff_ff;

/** An entity's or character reference's character, or the reference as written when it names none. */
function decodeEntity(whole: string): string {
  const body = whole.slice(1, -1);
  if (!body.startsWith("#")) {
    return named.get(body.toLowerCase()) ?? whole;
  }
  const hex = body.startsWith("#x") || body.startsWith("#X");
  const point = hex
    ? Number.parseInt(body.slice(2), hexadecimal)
    : Number.parseInt(body.slice(1), decimal);
  return Number.isSafeInteger(point) && point <= lastCodePoint
    ? String.fromCodePoint(point)
    : whole;
}

/** Text with XML's five named entities and its character references read. */
function unescapeXml(text: string): string {
  return text.includes("&") ? text.replaceAll(entity, (whole) => decodeEntity(whole)) : text;
}

/** Whether a character is XML's white space, or one below it, which a tag never holds; false past the text's end. */
function isSpace(character: number | undefined): boolean {
  return character !== undefined && character <= code.space;
}

/** Whether a character ends a tag's name: white space, `/` or `>`. */
function endsName(character: number | undefined): boolean {
  return isSpace(character) || character === code.slash || character === code.greater;
}

/** The index of the first character at or after `from` that is not white space. */
function skipSpace(text: string, from: number): number {
  let at = from;
  while (at < text.length && isSpace(text.codePointAt(at))) {
    at += 1;
  }
  return at;
}

/** Where a value starts when `=` and a quote follow `from`, with white space allowed around the `=`; else -1. */
function quotedAfter(attributes: string, from: number): number {
  const equals = skipSpace(attributes, from);
  if (attributes.codePointAt(equals) !== code.equals) {
    return -1;
  }
  const quote = skipSpace(attributes, equals + 1);
  const character = attributes.codePointAt(quote);
  return character === code.doubleQuote || character === code.singleQuote ? quote + 1 : -1;
}

/** Where an attribute's name ends: at white space, `=`, or the end of the text. */
function nameEnd(attributes: string, from: number): number {
  let at = from;
  while (
    at < attributes.length &&
    !isSpace(attributes.codePointAt(at)) &&
    attributes.codePointAt(at) !== code.equals
  ) {
    at += 1;
  }
  return at;
}

/** The attribute that starts at `at`: its name as written, where its value starts, and where the next attribute may
 * start; `undefined` when the attributes are not written as `name="value"`. */
function attributeAt(
  attributes: string,
  at: number,
): { readonly written: string; readonly start: number; readonly next: number } | undefined {
  const end = nameEnd(attributes, at);
  const start = quotedAfter(attributes, end);
  const close = start === -1 ? -1 : attributes.indexOf(attributes.charAt(start - 1), start);
  return close === -1
    ? undefined
    : { next: skipSpace(attributes, close + 1), start, written: attributes.slice(at, end) };
}

/** Where the value of an attribute named `name`, with or without a prefix, starts in a tag's attributes, or -1. It
 * reads the attributes one by one, name, `=` and quoted value, so a name that appears inside another attribute's
 * value, as in a sheet named `P&L id='s2'`, is never taken for one. */
function valueStart(attributes: string, name: string): number {
  for (
    let found = attributeAt(attributes, skipSpace(attributes, 0));
    found !== undefined;
    found = found.next < attributes.length ? attributeAt(attributes, found.next) : undefined
  ) {
    if (found.written === name || found.written.endsWith(`:${name}`)) {
      return found.start;
    }
  }
  return -1;
}

/** An attribute's value, read, by its local name, or `undefined` when the tag has none. */
function attribute(tag: XmlTag, name: string): string | undefined {
  const { attributes } = tag;
  const start = valueStart(attributes, name);
  if (start === -1) {
    return undefined;
  }
  const end = attributes.indexOf(attributes.charAt(start - 1), start);
  return unescapeXml(attributes.slice(start, end === -1 ? attributes.length : end));
}

/** Where a tag ends: its `>`, at or after `from`, past any `>` inside a quoted attribute value; -1 if never. */
function tagEnd(xml: string, from: number): number {
  let quote = 0;
  for (let at = from; at < xml.length; at += 1) {
    const character = xml.codePointAt(at);
    if (quote !== 0) {
      quote = character === quote ? 0 : quote;
    } else if (character === code.doubleQuote || character === code.singleQuote) {
      quote = character;
    } else if (character === code.greater) {
      return at;
    }
  }
  return -1;
}

/** A tag's name, without its prefix, which starts at `from`, and the index just past it. */
function nameAt(xml: string, from: number): { readonly name: string; readonly end: number } {
  let at = from;
  while (at < xml.length && !endsName(xml.codePointAt(at))) {
    at += 1;
  }
  const qualified = xml.slice(from, at);
  return { end: at, name: qualified.slice(qualified.indexOf(":") + 1) };
}

/** The tag whose `<` is at `start`, and where it ends; `undefined` when it never ends. */
function tagAt(xml: string, start: number): Markup | undefined {
  const closing = xml.codePointAt(start + 1) === code.slash;
  const { name, end } = nameAt(xml, closing ? start + 2 : start + 1);
  const close = tagEnd(xml, end);
  if (close === -1) {
    return undefined;
  }
  const empty = xml.codePointAt(close - 1) === code.slash;
  const attributes = xml.slice(end, empty ? close - 1 : close);
  return { cdata: undefined, end: close + 1, start, tag: { attributes, closing, empty, name } };
}

/** What opens and closes the comment, CDATA section, or declaration or instruction at `start`. */
function delimitersAt(
  xml: string,
  start: number,
): { readonly open: string; readonly close: string } {
  if (xml.startsWith(comment.open, start)) {
    return comment;
  }
  return xml.startsWith(cdataSection.open, start) ? cdataSection : { close: ">", open: "<" };
}

/** The comment, CDATA section, declaration or processing instruction at `start`. */
function otherAt(xml: string, start: number): Markup | undefined {
  const { open, close } = delimitersAt(xml, start);
  const end = xml.indexOf(close, start + open.length);
  if (end === -1) {
    return undefined;
  }
  const cdata = open === cdataSection.open ? xml.slice(start + open.length, end) : undefined;
  return { cdata, end: end + close.length, start, tag: undefined };
}

/** The markup at or after `from`, or `undefined` at the end of the text. */
function markupAfter(xml: string, from: number): Markup | undefined {
  const start = xml.indexOf("<", from);
  if (start === -1) {
    return undefined;
  }
  const kind = xml.codePointAt(start + 1);
  return kind === code.exclamation || kind === code.question
    ? otherAt(xml, start)
    : tagAt(xml, start);
}

/** Scans `xml` from its start. */
function scanXml(xml: string): XmlScanner {
  // Where the markup last read ends, and a tag `text` came to, which `next` returns before reading on.
  let position = 0;
  let pending: XmlTag | undefined = undefined;
  const next = (): XmlTag | undefined => {
    if (pending !== undefined) {
      const tag = pending;
      pending = undefined;
      return tag;
    }
    let found = markupAfter(xml, position);
    while (found !== undefined && found.tag === undefined) {
      found = markupAfter(xml, found.end);
    }
    position = found?.end ?? xml.length;
    return found?.tag;
  };
  const text = (): string => {
    let read = "";
    for (
      let found = markupAfter(xml, position);
      found !== undefined;
      found = markupAfter(xml, position)
    ) {
      read += unescapeXml(xml.slice(position, found.start)) + (found.cdata ?? "");
      position = found.end;
      if (found.tag !== undefined) {
        pending = found.tag;
        return read;
      }
    }
    read += unescapeXml(xml.slice(position));
    position = xml.length;
    return read;
  };
  return { next, text };
}

export { attribute, scanXml, unescapeXml };
export type { XmlScanner, XmlTag };
