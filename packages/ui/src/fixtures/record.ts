/* The fixture record: one exchange with a basis API, as one JSON file, which fixture mode answers a request with.
 * basis's `basis records export` writes recorded exchanges in this format into an app's `.fixtures/`, which git
 * ignores because they hold client data, and an app writes synthetic ones into `fixtures/`, in git, in the same
 * format. The schema below is the format: `schema/fixture-record.schema.json` is written from it, for basis to test its
 * export against, and a test fails when the two differ.
 *
 *   {
 *     "format": "basis-ui-fixture/1",
 *     "operation_id": "bond",
 *     "recorded_at": "2026-11-06T14:30:00Z",
 *     "request": { "method": "GET", "path": "/bonds/US91282CRF04", "query": {} },
 *     "response": { "status": 200, "headers": {}, "media_type": "application/json", "body": { ... } }
 *   }
 *
 * A record never holds the bearer token: a request keeps no headers, a response refuses the headers that carry
 * credentials, and no string anywhere in a record may hold a JWT. */

import { z } from "zod";

/** The format's name and version, the first member of every record. */
const fixtureFormat = "basis-ui-fixture/1";

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

/** Text of any kind but a JWT, so that a token copied into a body or a header is refused. */
const textSchema = described(
  z.string().regex(new RegExp(String.raw`^(?![\s\S]*${jwt})`, "u"), {
    error: "holds a JWT, which a record never does: remove the token",
  }),
  { description: "Any text that holds no JWT.", id: "Text" },
);

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
      z.record(z.string(), jsonValueSchema),
    ]),
  ),
  { description: "Any JSON value whose strings hold no JWT.", id: "JsonValue" },
);

const methodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

const pathSchema = described(
  z.string().regex(/^\/[^?#]*$/u, {
    error:
      "starts with / and holds no ? or #: the query goes in query, and the path leaves out /api",
  }),
  {
    description:
      "The route's path as the request's URL holds it, percent-encoded, without the /api prefix the ingress removes, such as /bonds/US91282CRF04.",
  },
);

const querySchema = described(z.record(z.string().min(1), z.array(textSchema).min(1)), {
  description:
    'Each query key with its values, in the order the URL gives them, such as {"security": ["A", "B"]} for ?security=A&security=B. No key, or no query, means no query.',
});

/* Headers that carry credentials, the content type, which is `media_type`, and the transport's own, which would be
 * wrong once the body is served again. */
const refusedHeaders = [
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "content-type",
  "content-length",
  "content-encoding",
  "transfer-encoding",
  "connection",
  "keep-alive",
];

const headerNameSchema = z
  .string()
  .regex(new RegExp(`^(?!(?:${refusedHeaders.join("|")})$)[a-z0-9!#$%&'*+.^_\`|~-]+$`, "u"), {
    error: `is a header's name in lower case, and none of ${refusedHeaders.join(", ")}: give the content type as media_type, and leave the rest out`,
  });

const headersSchema = described(z.record(headerNameSchema, textSchema), {
  description:
    "The response's headers that matter to a UI, by their names in lower case, such as www-authenticate, x-request-id, vary, location and retry-after. Never a header that carries a credential, the content type, which is media_type, or the transport's own.",
  id: "Headers",
});

const mediaTypeSchema = described(
  z.string().regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u, {
    error: "is a media type in lower case with no parameters, such as application/json",
  }),
  {
    description:
      "The body's media type, with no parameters, such as application/vnd.apache.arrow.stream.",
  },
);

const jsonMediaTypeSchema = described(
  z.string().regex(/^application\/(?:[a-z0-9!#$&^_.-]+\+)?json$/u, {
    error:
      "is a JSON media type, such as application/json or application/problem+json, since body holds JSON: give other bytes as body_base64",
  }),
  {
    description:
      "The JSON body's media type: application/json, or one ending +json, such as application/problem+json.",
  },
);

const requestBodySchema = described(jsonValueSchema.optional(), {
  description:
    "The request's JSON body, if it has one. Fixture mode keeps it for reading, and does not match on it.",
});

const requestSchema = described(
  z.strictObject({
    method: methodSchema,
    path: pathSchema,
    query: querySchema.optional(),
    body: requestBodySchema,
  }),
  {
    description:
      "The request, matched by its method, path and query. It keeps no headers, so never the bearer token.",
  },
);

/* The statuses a response can have, which a browser's Response accepts, and those that never come with a body. */
const lowestStatus = 200;
const highestStatus = 599;
const noContent = 204;
const resetContent = 205;
const notModified = 304;

const statusError = {
  error: `is an HTTP status a response can have, an integer from ${String(lowestStatus)} to ${String(highestStatus)}`,
};
const statusSchema = z
  .int(statusError)
  .min(lowestStatus, statusError)
  .max(highestStatus, statusError);

/** A status whose response may have a body: any but 204, 205 and 304, which never do. */
const bodyStatusError = {
  error: `is a status a body can come with, from ${String(lowestStatus)} to ${String(highestStatus)} but for ${String(noContent)}, ${String(resetContent)} and ${String(notModified)}, which have none`,
};
function statusRange(lowest: number, highest: number): z.ZodInt {
  return z.int(bodyStatusError).min(lowest, bodyStatusError).max(highest, bodyStatusError);
}
const bodyStatusSchema = z.union([
  statusRange(lowestStatus, noContent - 1),
  statusRange(resetContent + 1, notModified - 1),
  statusRange(notModified + 1, highestStatus),
]);

/** The headers that matter to a UI, which every response may hold. */
const headers = headersSchema.optional();

const base64BodySchema = described(z.base64(), {
  description:
    "The body's bytes in base64, as RFC 4648 section 4 writes them, such as an Arrow IPC stream.",
});

const responseSchema = described(
  z.union([
    z.strictObject({
      status: bodyStatusSchema,
      headers,
      media_type: jsonMediaTypeSchema,
      body: jsonValueSchema,
    }),
    z.strictObject({
      status: bodyStatusSchema,
      headers,
      media_type: mediaTypeSchema,
      body_base64: base64BodySchema,
    }),
    z.strictObject({ status: statusSchema, headers }),
  ]),
  {
    description:
      "The response: a JSON body as body, with its media_type; other bytes, such as an Arrow IPC stream, as body_base64, with theirs; or no body, and no media_type.",
  },
);

const formatSchema = z.literal(fixtureFormat, {
  error: `is "${fixtureFormat}", the only format this @basis/ui reads`,
});

const operationIdSchema = described(z.string().min(1), {
  description:
    "The operation's id in the API's document, such as bond, which basis takes from the handler's name.",
});

const recordedAtSchema = described(z.iso.datetime({ offset: true }), {
  description:
    "When the API answered, or when a synthetic response was written, with its offset, such as 2026-11-06T14:30:00Z.",
});

/** One recorded exchange with a basis API. */
const fixtureRecordSchema = described(
  z.strictObject({
    format: formatSchema,
    operation_id: operationIdSchema,
    recorded_at: recordedAtSchema,
    request: requestSchema,
    response: responseSchema,
  }),
  {
    description: `One exchange with a basis API, which basis-ui's fixture mode answers a request with, in the format "${fixtureFormat}". basis records export writes these into a UI repo's .fixtures/, and a UI repo writes synthetic ones into fixtures/. A record never holds the bearer token.`,
  },
);

type FixtureRecord = z.infer<typeof fixtureRecordSchema>;
type FixtureRequest = FixtureRecord["request"];
type FixtureResponse = FixtureRecord["response"];

/** Where a fixture came from: a record exported into `.fixtures/`, or a synthetic response in `fixtures/`. */
type FixtureSource = "fixture" | "record";

/** A fixture as fixture mode holds it: the record, where it came from, and its file, from the app's root. */
interface LoadedFixture {
  readonly source: FixtureSource;
  readonly file: string;
  readonly record: FixtureRecord;
}

/** The format's JSON Schema, which `schema/fixture-record.schema.json` holds for basis to test its export against. */
function fixtureRecordJsonSchema(): Record<string, unknown> {
  const { $schema, ...schema } = z.toJSONSchema(fixtureRecordSchema, {
    metadata: documentation,
    target: "draft-2020-12",
  });
  return {
    $schema,
    $id: "urn:basis-ui:fixture-record:1",
    title: "A basis-ui fixture record",
    ...schema,
  };
}

export { fixtureFormat, fixtureRecordJsonSchema, fixtureRecordSchema };
export type {
  FixtureRecord,
  FixtureRequest,
  FixtureResponse,
  FixtureSource,
  JsonValue,
  LoadedFixture,
};
