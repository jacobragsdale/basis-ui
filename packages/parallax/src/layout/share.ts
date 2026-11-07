/* Layouts in links. A layout is compressed with deflate and written as base64url, so a shared view fits in a URL
 * parameter, and it is checked against the schema when it is read back: a link someone edited by hand fails loudly
 * instead of opening a different view. */

import { parseLayout } from "./layout.ts";
import type { Layout, LayoutInput } from "./layout.ts";

const prefix = "1.";

/** The bytes after passing through a compression or decompression stream. */
async function piped(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const output = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

/** Encodes a layout for a URL parameter. Deflate shrinks the many default fields to a few bytes each. */
async function encodeLayout(layout: LayoutInput): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(parseLayout(layout)));
  const compressed = await piped(json, new CompressionStream("deflate-raw"));
  return prefix + compressed.toBase64({ alphabet: "base64url", omitPadding: true });
}

/** Decodes and checks a layout from a URL parameter. */
async function decodeLayout(text: string): Promise<Layout> {
  if (!text.startsWith(prefix)) {
    throw new Error("This is not a parallax layout link: it should start with 1.");
  }
  const compressed = Uint8Array.fromBase64(text.slice(prefix.length), { alphabet: "base64url" });
  const json = await piped(compressed, new DecompressionStream("deflate-raw"));
  const value: unknown = JSON.parse(new TextDecoder().decode(json));
  return parseLayout(value);
}

export { decodeLayout, encodeLayout };
