/* Whether a body is one an operation's schema accepts, read as the generated client reads it: every field the schema
 * declares is checked, its type, format, pattern, bounds and enum, and a field it does not declare passes, since the
 * client drops those, so that an API can add a field without breaking a UI. The schema is turned into Zod by Zod's own
 * `fromJSONSchema`, with the document's components as its definitions. */

import { z } from "zod";

import { objectOf } from "./api-operations.ts";
import type { Schema } from "./api-operations.ts";

const componentPrefix = "#/components/schemas/";

/** An object of keywords, as Zod's `fromJSONSchema` takes one. */
const jsonSchema = z.custom<z.core.JSONSchema.JSONSchema>(
  (value) => typeof value === "object" && value !== null,
);

/* A time as the generated client reads one, `zod.iso.time({})`: `14:30:00` or `14:30`, with no offset, where JSON
 * Schema's `time`, which Zod's `fromJSONSchema` follows, requires one. */
const clientTime = z.core.regexes.time({}).source;

/** `value` with each component `$ref` pointed at `$defs`, no `additionalProperties: false`, which the client's
 * schemas never hold, and each `format: time` read as the client reads it. */
function loosened(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => loosened(item));
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, held]) => {
      if (key === "additionalProperties" && held === false) {
        return [];
      }
      if (key === "format" && held === "time") {
        return [["pattern", clientTime]];
      }
      if (key === "$ref" && typeof held === "string" && held.startsWith(componentPrefix)) {
        return [[key, `#/$defs/${held.slice(componentPrefix.length)}`]];
      }
      return [[key, loosened(held)]];
    }),
  );
}

/** A Zod issue's place in the body, as `0.year_days`, or `the body` for the whole of it. */
function placeOf(issue: z.core.$ZodIssue): string {
  return issue.path.length === 0 ? "the body" : issue.path.map(String).join(".");
}

/** Why `value` fails `schema`, one reason for each field at fault, as `0.year_days: Invalid input: expected int,
 * received number`; none when it passes, or when the schema uses a keyword Zod cannot read. */
function schemaIssues(document: Schema, schema: Schema, value: unknown): string[] {
  const { openapi: version } = document;
  const definitions = loosened(objectOf(objectOf(document["components"])["schemas"]));
  const root = jsonSchema.parse({ ...objectOf(loosened(schema)), $defs: definitions });
  const older = typeof version === "string" && version.startsWith("3.0");
  let parser: z.ZodType | undefined = undefined;
  try {
    parser = z.fromJSONSchema(root, { defaultTarget: older ? "openapi-3.0" : "draft-2020-12" });
  } catch {
    return [];
  }
  const parsed = parser.safeParse(value);
  return parsed.success
    ? []
    : parsed.error.issues.map((issue) => `${placeOf(issue)}: ${issue.message}`);
}

export { schemaIssues };
