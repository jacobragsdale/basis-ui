/* The parts of the fixture record every other part is made of (record.ts): the registry the JSON Schema takes its
 * descriptions from, and text, keys and JSON values, none of which may hold a JWT. */

import { z } from "zod";

/** What the JSON Schema says of each part of the format: its descriptions, and the names of the parts it reuses. */
const documentation = z.registry<{ readonly id?: string; readonly description?: string }>();

function described<TSchema extends z.ZodType>(
  schema: TSchema,
  meta: { readonly id?: string; readonly description: string },
): TSchema {
  documentation.add(schema, meta);
  return schema;
}

/** A JWT: a base64url header and payload, each a JSON object and so starting `eyJ`, then the signature. */
const jwt = String.raw`eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.`;

/** What every string of a record, and the text of its base64 bytes, must not match. */
const noJwt = new RegExp(String.raw`^(?![\s\S]*${jwt})`, "u");
const jwtRefused = { error: "holds a JWT, which a record never does: remove the token" };

/** Text of any kind but a JWT, so that a token copied into a body or a header is refused. */
const textSchema = described(z.string().regex(noJwt, jwtRefused), {
  description: "Any text that holds no JWT.",
  id: "Text",
});

/** Whether `text` holds a JWT, which a record's issue lines never repeat. */
function holdsJwt(text: string): boolean {
  return !noJwt.test(text);
}

/** An object's key, which holds no JWT either. */
const keySchema = z.string().regex(noJwt, {
  error: "has a key that holds a JWT, which a record never does: remove the token",
});

type JsonValue = boolean | number | string | null | readonly JsonValue[] | JsonObject;
interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** Any JSON value, with no JWT in any of its strings. */
const jsonValueSchema: z.ZodType<JsonValue> = described(
  z.lazy(() =>
    z.union([
      textSchema,
      z.number(),
      z.boolean(),
      z.null(),
      z.array(jsonValueSchema),
      z.record(keySchema, jsonValueSchema),
    ]),
  ),
  { description: "Any JSON value whose strings hold no JWT.", id: "JsonValue" },
);

export {
  described,
  documentation,
  holdsJwt,
  jsonValueSchema,
  jwtRefused,
  keySchema,
  noJwt,
  textSchema,
};
export type { JsonValue };
