# Spike 0.2: orval

orval generates the client the design describes from a basis-style `openapi.json`: a Zod 4 schema per model that drops
unknown response fields, a TanStack Query v5 hook per operation, and MSW 3 handlers that serve data in Vitest's browser
mode. It needs one pnpm override to keep TypeScript 6 out of the tree, and configuration to turn the Arrow route into a
binary response with its Accept header. Placing an API's errors on form fields works, but only because the sample API
names the fields; basis's contract does not say how yet. Run on 2026-11-07.

## Versions

| Side   | Versions                                                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client | orval 8.46.0, TypeScript 7.1.0-beta, Zod 4.6.7, @tanstack/react-query 5.107.1, MSW 3.0.4, @faker-js/faker 10.6.0, React 19.3.1, apache-arrow 21.2.0, @tanstack/form-core 1.33.5 |
| Tests  | Vitest 5.1.0 with @vitest/browser-playwright 5.1.0, Playwright 1.64.0 (Chromium 156.0.8078.4, build 1248, headless), vitest-browser-react 2.3.0, Vite 8.3.6                     |
| Tools  | Node 26.13.0, pnpm 12.11.2                                                                                                                                                      |
| API    | Python 3.14.7, uv 0.13.6, FastAPI 0.162.0, Pydantic 2.14.3, pyarrow 26.0.1, uvicorn 0.54.0, ruff 0.17.4, ty 0.0.99                                                              |

## Setup

[`orval/app.py`](orval/app.py) is the sample API. Its [`openapi.json`](orval/openapi.json) stands in for basis's until
basis's step 2.5 publishes one. Regenerate it with `uv run python app.py > openapi.json` in that folder. The app follows
basis's contract:

- Operation ids are handler names (`generate_unique_id_function` returns `route.name`), so the client reads
  `getPositions`.
- Every model has `extra="forbid"`, which Pydantic writes as `additionalProperties: false`. Request bodies are also
  `strict=True`.
- Routes: `GET /positions` with a query model (`book`, `symbol` repeated, `as_of`, `limit`); `GET
  /positions/{position_id}`; `POST /positions`; and `GET /exposures`, a dataset that returns JSON, or an Arrow IPC
  stream when the request's Accept asks for `application/vnd.apache.arrow.stream`.
- Every error is RFC 9457 problem details, served and declared as `application/problem+json`: `default` on every
  route, `404` on the read by id, and `422` on every route with input. A 422 carries an `errors` array in the shape of
  RFC 9457's own example, `{"detail", "pointer"}`, plus `{"detail", "parameter"}` for query and path parameters. Request
  validation and a business rule (a closed book) produce the same shape.
- An optional `HTTPBearer` scheme is declared on every operation.

The client project lived outside the repo, in `~/dev/basis-ui-spikes/0.2-orval/client`, with the packages above, the
strict tsconfig below, and a `vitest.config.ts` that runs every test in Chromium through the Playwright provider. It
does not need step 1.2's preset. Two more settings make the tests work. `msw({ mode: "worker-only" })` from `msw/vite`
serves the worker script. A Vite proxy stands in for the ingress: it sends `/api` to the API on port 8841 and removes
the prefix.

```json
{
  "compilerOptions": {
    "target": "es2024",
    "lib": ["es2024", "dom", "dom.iterable"],
    "module": "preserve",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "types": [],
    "noEmit": true,
    "skipLibCheck": false,
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "allowUnreachableCode": false,
    "allowUnusedLabels": false,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "erasableSyntaxOnly": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["src"]
}
```

## The configuration

`pnpm-workspace.yaml`:

```yaml
allowBuilds:
  esbuild: true
overrides:
  typescript: 7.1.0-beta
```

[`orval/orval.config.ts`](orval/orval.config.ts), exactly as used:

```ts
import { readFileSync } from "node:fs";

import { defineConfig } from "orval";
import { z } from "zod";

const OPENAPI = "./openapi.json";
const ARROW_STREAM = "application/vnd.apache.arrow.stream";
const PROBLEM_JSON = "application/problem+json";

const Operation = z.object({
  operationId: z.string(),
  responses: z.record(
    z.string(),
    z.object({ content: z.record(z.string(), z.unknown()).optional() }),
  ),
});
const Document = z.object({ paths: z.record(z.string(), z.record(z.string(), z.unknown())) });

/**
 * basis's contract: a dataset route returns Arrow when the request asks for it. orval types such a 200 as
 * `Exposure[] | Blob` and sends no Accept header, so each dataset operation is generated as Arrow only, with the header.
 */
const datasetOperations = (): Record<
  string,
  { contentType: { include: string[] }; requestOptions: { headers: Record<string, string> } }
> => {
  const document = Document.parse(JSON.parse(readFileSync(OPENAPI, "utf8")));
  const ids = Object.values(document.paths)
    .flatMap((pathItem) => Object.values(pathItem))
    .flatMap((candidate) => {
      const operation = Operation.safeParse(candidate);
      return operation.success &&
        operation.data.responses["200"]?.content?.[ARROW_STREAM] !== undefined
        ? [operation.data.operationId]
        : [];
    });
  return Object.fromEntries(
    ids.map((id) => [
      id,
      {
        contentType: { include: [ARROW_STREAM, PROBLEM_JSON] },
        requestOptions: { headers: { Accept: ARROW_STREAM } },
      },
    ]),
  );
};

export default defineConfig({
  api: {
    input: { target: OPENAPI },
    output: {
      mode: "split",
      target: "./src/api/generated/client.ts",
      schemas: { path: "./src/api/generated/model", type: "zod" },
      client: "react-query",
      httpClient: "fetch",
      mock: { generators: [{ type: "msw", delay: false, generateEachHttpStatus: true }] },
      clean: true,
      override: {
        mutator: { path: "./src/api/fetch.ts", name: "apiFetch" },
        includeZodSchemaInArguments: true,
        fetch: { runtimeValidation: true, forceSuccessResponse: true },
        query: { version: 5, signal: true },
        zod: {
          version: 4,
          generateReusableSchemas: true,
          exactOptional: true,
          // Responses drop unknown fields. With reusable schemas, `body: true` would make every model strict, responses
          // included; the API refuses unknown request fields itself.
          strict: { body: false, response: false },
        },
        operations: datasetOperations(),
      },
    },
  },
});
```

## The mutator

`src/api/fetch.ts`. Every generated call goes through it, and it is the only code that calls `fetch`.

```ts
import type { ZodType } from "zod";

import { Problem, ValidationProblem } from "./generated/model";
import type { ProblemOutput, ValidationProblemOutput } from "./generated/model";

/** The ingress routes `/api` to the API and the rest to the UI, so every request stays on the page's origin. */
const API_PREFIX = "/api";
const ARROW_STREAM = "application/vnd.apache.arrow.stream";

/** Supplies the signed-in user's JWT, or `null` when the user is anonymous. Step 1.3's sign-in adapter provides it. */
export type TokenSource = () => Promise<string | null>;

let tokenSource: TokenSource = () => Promise.resolve(null);

export const setTokenSource = (source: TokenSource): void => {
  tokenSource = source;
};

/** orval passes the response's Zod schema as `schema` when `includeZodSchemaInArguments` is on. */
export interface ApiRequestInit extends RequestInit {
  readonly schema?: ZodType;
}

export type AnyProblem = ProblemOutput | ValidationProblemOutput;

/** What a failed call throws, so TanStack Query's `error` holds the parsed problem details. */
export class ApiError<TProblem = AnyProblem> extends Error {
  readonly status: number;
  readonly problem: TProblem;

  constructor(status: number, problem: TProblem, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }
}

/** orval reads this export and types each hook's error as `ErrorType<the operation's problem types>`. */
export type ErrorType<TProblem> = ApiError<TProblem>;

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

/** JSON first, since a failed Arrow request still answers with problem details; orval's Arrow mock says octet-stream. */
const readBody = async (response: Response, wantsArrow: boolean): Promise<unknown> => {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    const body: unknown = await response.json();
    return body;
  }
  if (wantsArrow || contentType.startsWith(ARROW_STREAM)) {
    return response.blob();
  }
  return response.text();
};

/** A 422 names its fields; anything that is not problem details, such as a proxy's HTML error page, becomes one. */
const toProblem = (response: Response, body: unknown): AnyProblem => {
  const parsed =
    response.status === 422 ? ValidationProblem.safeParse(body) : Problem.safeParse(body);
  if (parsed.success) {
    return parsed.data;
  }
  return {
    type: "about:blank",
    title: response.statusText || "Request failed",
    status: response.status,
  };
};

export const apiFetch = async <T>(url: string, init: ApiRequestInit): Promise<T> => {
  const { schema, ...request } = init;
  const headers = new Headers(request.headers);
  const token = await tokenSource();
  if (token !== null) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${API_PREFIX}${url}`, { ...request, headers });
  const body = await readBody(response, headers.get("accept") === ARROW_STREAM);
  if (!response.ok) {
    const problem = toProblem(response, body);
    throw new ApiError(response.status, problem, problem.title);
  }
  const data = schema === undefined ? body : schema.parse(body);
  // orval's mutator contract is generic in the response type T; the schema above is what makes this value a T.
  return { data, status: response.status, headers: response.headers } as T;
};
```

The one `as T` is orval's design: a mutator is generic in a type it has no value for.

## Answers

| #   | Question                                                                     | Answer                                                          |
| --- | ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | Does orval 8.46 run with only TypeScript 7 installed?                        | **Yes, with one pnpm override. No without it.**                 |
| 2   | A Zod 4 schema per model, dropping unknown response fields?                  | **Yes.**                                                        |
| 3   | TanStack Query v5 hooks, one per operation, readable names?                  | **Yes.**                                                        |
| 4   | MSW 3 handlers that serve data in a test?                                    | **Yes**, in Vitest's browser mode with the Playwright provider. |
| 5   | The Arrow route as a binary response with Accept set?                        | **Yes, by configuration.** orval's default is wrong for it.     |
| 6   | A mutator that attaches the JWT and prefixes `/api`?                         | **Yes.**                                                        |
| 7   | Every response parsed by its schema, by generation or configuration?         | **Yes**, configuration plus one line in the mutator.            |
| 8   | Does the generated code type-check under the strict tsconfig on TS 7.1 beta? | **Yes**, with no errors and no exclusions.                      |
| 9   | Are problem details typed, and can a field error reach its field?            | **Typed: yes. Placed: only with a contract addition.**          |

### 1. TypeScript 7 only

Since orval 8.45.0, `@orval/zod` and `@orval/hono` depend on `typescript` 6.0.3. A project with only `orval@8.46.0` and
`typescript@7.1.0-beta` in its `package.json` runs `pnpm install`, then `pnpm why typescript`:

```text
typescript@6.0.3
├─┬ @orval/hono@8.46.0
│ └─┬ orval@8.46.0
│   └── q1-plain (devDependencies)
└─┬ @orval/zod@8.46.0
  ├── @orval/hono@8.46.0 [deduped]
  ├─┬ @orval/mcp@8.46.0
  │ └── orval@8.46.0 [deduped]
  └── orval@8.46.0 [deduped]

typescript@7.1.0-beta
└── q1-plain (devDependencies)

Found 2 versions of typescript
```

With `overrides: { typescript: 7.1.0-beta }` and a clean install, the client project shows one version:

```text
$ pnpm why typescript
typescript@7.1.0-beta
├─┬ @orval/hono@8.46.0
├─┬ @orval/zod@8.46.0
├─┬ msw@3.0.4
└── orval-spike-client (devDependencies)

Found 1 version of typescript
```

(Trimmed: each branch leads back to `orval@8.46.0` or the project.) `node_modules/.pnpm` holds only
`typescript@7.1.0-beta` and its native binary, and orval generates the whole client.

`@orval/zod` imports `typescript` at the top of its module, but calls it only in `serializeCallable`, which renders
`override.zod.schemaExtension` refinements. TypeScript 7's package exports only its version
(`default,module.exports,version,versionMajorMinor`; `createSourceFile` and `createProgram` are `undefined`), so
`schemaExtension` would fail under the override. The configuration does not use it.

Fallback: if a later orval calls the TypeScript API on a path the UI needs, pin orval 8.44.0. `npm view` shows no
`typescript` dependency in any of its packages.

### 2. Zod 4 schemas that drop unknown fields

`schemas: { type: "zod" }` with `generateReusableSchemas` writes one file per model under `model/`, and the TypeScript
types are inferred from them. All eight are `zod.object`, which strips unknown keys in Zod 4, although every model in
the document says `additionalProperties: false`:

```ts
export const Position = zod.object({
  position_id: zod.int(),
  book: zod.string(),
  symbol: zod.string(),
  quantity: zod.int(),
  price: zod.string(),
  as_of: zod.iso.date(),
  note: zod.union([zod.string(), zod.null()]),
});
```

The parse, from `schemas.test.ts`:

```ts
const parsed = Position.parse({ ...position, desk: "Macro" });
expect(parsed).toStrictEqual(position); // passes
expect(Object.keys(parsed)).not.toContain("desk"); // passes
expect(() => Position.parse({ ...position, quantity: "5000" })).toThrow(/expected number/); // passes
```

The same holds end to end. An MSW handler returns a position with `desk` added, and `getPositions()` gives the caller
the position without it.

A trap: `override.zod.strict.body: true` makes every reusable schema `zod.strictObject`, `Position` included, so a UI
would reject every new response field. `strict.query` and `strict.param` change nothing in reusable schemas. Keep
`strict` off.

### 3. TanStack Query v5 hooks

One hook per operation, named from the handler: `useGetPositions`, `useGetPosition`, `useCreatePosition` and
`useGetExposures`. Each sits beside its plain function (`getPositions`, and so on), its query options and its query key.
The helpers read `getGetPositionsQueryKey`, since orval prefixes `get` to the operation name. orval reads the project's
`package.json` to choose the TanStack Query version. With no dependency there it printed "Could not determine the
installed @tanstack/react-query version, so hooks are generated for v4", so the configuration also sets
`query.version: 5`. `a query hook reads through the mocks` renders `useGetPositions` with `vitest-browser-react` and
passes.

### 4. MSW 3 handlers

orval emits a handler per operation and, with `generateEachHttpStatus`, one per declared status
(`getCreatePositionMockHandler422`, `getGetPositionMockHandler404`, and so on). The handlers import `http` and
`HttpResponse` from `msw`, which MSW 3 still exports beside its new `msw/http`. The MSW file's lines from `npx vitest run
--reporter=verbose`:

```text
 ✓ |chromium| src/tests/msw.test.tsx > MSW 3 runs as a service worker, served by msw/vite
 ✓ |chromium| src/tests/msw.test.tsx > orval's MSW handlers serve data that its schemas accept
 ✓ |chromium| src/tests/msw.test.tsx > the mutator sends the JWT as a bearer token and prefixes /api
 ✓ |chromium| src/tests/msw.test.tsx > an anonymous request sends no Authorization header
 ✓ |chromium| src/tests/msw.test.tsx > a response's schema drops a field the client does not know before the caller sees it
 ✓ |chromium| src/tests/msw.test.tsx > a response that breaks its schema rejects before the caller sees it
 ✓ |chromium| src/tests/msw.test.tsx > a query hook reads through the mocks
 ✓ |chromium| src/tests/msw.test.tsx > a mutation hook's error holds the parsed problem details
 ✓ |chromium| src/tests/msw.test.tsx > orval's default Arrow mock is a Blob of random bytes, labelled octet-stream
 ✓ |chromium| src/tests/msw.test.tsx > an Arrow fixture served through orval's handler reaches the caller as a Blob
 Test Files  3 passed (3)
      Tests  20 passed (20)
```

The first test checks that `worker.start()` registered `/mockServiceWorker.js`, so MSW ran as a service worker rather
than its fallback. Two MSW 3 changes matter. `worker.start()` takes `onUnhandledFrame`, not MSW 2's
`onUnhandledRequest`. And `msw/vite` serves the worker script, so no `msw init` copy is needed.

orval's mock for the Arrow route is 1 to 64 random bytes labelled `application/octet-stream`. That is not Arrow, and it
is not the declared media type. Fixture mode passes real Arrow bytes as the handler's override argument, as the last
test does with bytes from apache-arrow's `tableToIPC`.

### 5. The Arrow route

By default orval generates one `getExposures` whose 200 is `{ data: Exposure[] } | { data: Blob }`. Both members have
`status: 200`, so a caller cannot tell them apart. orval sends no Accept header, so the server answers JSON whatever
the type says, and orval passes no schema. orval sets Accept itself only for an NDJSON-only response.

The configuration's `datasetOperations()` finds every operation whose 200 declares
`application/vnd.apache.arrow.stream`. For each one it keeps only that content type and problem details, and adds the
header through `requestOptions`. No route is named by hand. The result:

```ts
export type getExposuresResponse200 = {
  data: Blob;
  status: 200;
};
export const getExposures = async (
  options?: Parameters<typeof apiFetch>[1],
): Promise<getExposuresResponseSuccess> => {
  // ...
  return apiFetch<getExposuresResponseSuccess>(getGetExposuresUrl(), {
    ...options,
    method: "GET",
    headers: { Accept: `application/vnd.apache.arrow.stream`, ...getHeaders(options?.headers) },
  });
};
```

Against the real FastAPI app, through the proxy, `the dataset route answers the client's Accept header with Arrow
bytes` passes. The response's content type is `application/vnd.apache.arrow.stream`. apache-arrow's `tableFromIPC`
reads `book: Utf8, sector: Utf8, as_of: Date32<DAY>, exposure: Decimal[18e+2]` and the three sectors.

orval types only `{"type": "string", "format": "binary"}` as `Blob`. OpenAPI 3.1's `{"type": "string",
"contentMediaType": "application/vnd.apache.arrow.stream"}` came out as `data: string`, and an empty schema as `data:
unknown`.

The cost: the client has no JSON form of a dataset route. If a UI needs one, the cleanest route is a second orval target
for the dataset operations, with its own operation names and its own query keys. The default key, `['/exposures']`,
would be the same for both forms and share one cache entry. Not tested.

### 6. The JWT and `/api`

The mutator above takes the token from a `TokenSource` and sets `Authorization: Bearer …` only when there is one. A
handler wrapped by orval's `getGetPositionsMockHandler` recorded:

```ts
{ authorization: "Bearer header.payload.signature", path: "/api/positions", search: "?book=RATES&symbol=UST10Y&symbol=UST2Y" }
```

With no token, it recorded `null`. The prefix assumes that the document's paths carry no `/api` and that the ingress
removes it. uvicorn's `--root-path /api` assumes the same thing: it served `/positions`, and `/api/positions` returned 404.

### 7. Parsing every response

Three settings do it. `schemas: { type: "zod" }` makes the models Zod schemas. `fetch.runtimeValidation: true` turns
validation on. With a mutator, orval does not parse responses itself. `includeZodSchemaInArguments: true` passes the
schema instead, so every generated call hands the mutator its response schema (`schema: zod.array(Position)`, `schema:
Position`). The mutator's `schema.parse(body)` is the only hand-written part, and it runs for every operation and every
hook. `a response that breaks its schema rejects before the caller sees it` passes: a mocked `as_of: "06/11/2026"`
rejects with Zod's `Invalid ISO date`. Binary responses have no schema. orval passes only the success schema, so the
mutator parses error bodies with the generated `Problem` and `ValidationProblem` schemas itself.

### 8. Type checking

`npx tsc -p tsconfig.json` with TypeScript 7.1.0-beta exits 0 over `src/api/generated`, the mutator and the tests, with
every flag above and `skipLibCheck: false`. `--showConfig` lists every flag in effect, and a planted `const x: number =
"a"` fails, so the check is live. No flag needs an exclusion. `exactOptional: true` makes Zod emit `.exactOptional()`,
so an optional field infers `note?: string | null`, with no `| undefined`.

Three things fall outside the check:

- The config files (`orval.config.ts`, `vitest.config.ts`) need their own tsconfig with `types: ["node"]`. With
  `skipLibCheck: false` they fail on two dependency declarations. `@orval/core`'s types import
  `@modelcontextprotocol/server`, an optional peer, and `fdir` imports `picomatch`, which ships no types. That tsconfig
  sets `skipLibCheck: true`. Installing `@modelcontextprotocol/server` and `@types/picomatch` should work as well, but
  that was not tried.
- The generated code holds 21 type assertions and no `any`, and orval does not format its output. Oxlint and Oxfmt must
  ignore `src/api/generated`.
- Generation is deterministic: a second run produced identical files (`diff -r`), so `vp check` can regenerate and
  compare.

### 9. Problem details and form fields

Each status has its own type, keyed by status:

```ts
export type getPositionsResponse422 = { data: ValidationProblem; status: 422 };
export type getPositionsResponseDefault = {
  data: Problem;
  status: Exclude<HTTPStatusCodes, 200 | 422>;
};
```

With `forceSuccessResponse`, a hook's data is only the success shape. Its error is `ErrorType<ValidationProblem |
Problem>`, which the mutator defines as `ApiError`, holding the parsed problem. `a mutation hook's error holds the
parsed problem details` passes.

The sample's 422 names each field with an RFC 6901 pointer in URI fragment form, as in RFC 9457's example.
`#/legs/0/price` maps to TanStack Form's `legs[0].price`. A form-level `onSubmitAsync` returns `{ form, fields }`: each
error goes on the field its pointer names, and the rest joins the form's message. Against the real API, the form's
errors were:

```text
book:   ["String should have at least 1 character"]
symbol: ["String should match pattern '^[A-Z0-9]{1,12}$'"]
price:  ["Input should be greater than 0"]
book:   ["Book ARCHIVE is closed to new positions."]   (the business rule, on a second form)
```

A bad query parameter came back as `{ detail: "Input should be less than or equal to 1000", parameter: "limit" }`.

The helper, for step 1.10:

```ts
export const pointerToFieldName = (pointer: string): string | undefined => {
  if (!pointer.startsWith("#")) return undefined;
  const tokens = pointer
    .slice(1)
    .split("/")
    .slice(1)
    .map((token) => decodeURIComponent(token).replaceAll("~1", "/").replaceAll("~0", "~"));
  if (tokens.length === 0) return undefined;
  return tokens.reduce(
    (name, token) =>
      /^\d+$/.test(token) ? `${name}[${token}]` : name === "" ? token : `${name}.${token}`,
    "",
  );
};
```

basis's contract says every error is RFC 9457 problem details, but not how a 422 names its fields. Placement works here
only because the sample API adds `errors`. Until basis adds it, the fallback is to show the problem's `title` and
`detail` at the top of the form.

## What basis's contract needs to add

1. **Field errors.** A 422 carries `errors`, a list of `{ "detail", "pointer" }` for request body fields. `pointer` is
   an RFC 6901 JSON Pointer in URI fragment form (`#/legs/0/price`), as in RFC 9457's example, and `#` means the whole
   body. Query and path parameters use `{ "detail", "parameter" }`. Request validation and business rules use the same
   shape. The document declares it as a `ValidationProblem` schema on each route's 422.
2. **The media type in the document.** Error responses are declared under `application/problem+json`. FastAPI files a
   response's model under `application/json`, so the sample moves them in an `openapi()` override, in about ten lines.
3. **How a dataset route is declared.** The 200 lists `application/vnd.apache.arrow.stream` with `{"type": "string",
   "format": "binary"}` beside the JSON schema. orval reads no other form as binary, and the configuration finds
   dataset routes by that content type.
4. **The `/api` prefix.** The document's paths carry no `/api`, and the ingress removes it before the API sees the
   request. The contract names the route but not which side owns the prefix.

## What step 1.3 must do

- Pin `orval` 8.46.0 with the pnpm override above, and never use `override.zod.schemaExtension`. Re-run `pnpm why
  typescript` when orval is upgraded.
- Declare `@tanstack/react-query` and `zod` in the app's `package.json`, and keep `query.version: 5` and `zod.version:
  4` explicit.
- Use the configuration above, with paths moved to the app's layout. Keep `zod.strict` off.
- Ship the mutator in `@basis/ui`, with its token source from the sign-in adapter. It must keep three things: the
  exported `ErrorType`, the `schema.parse`, and the Arrow branch of `readBody`. It cannot import an app's generated
  schemas, so `@basis/ui` carries its own Zod schemas for the contract's problem details, and a type test checks that
  the generated ones match.
- Make the mutator the only file allowed to call `fetch`, through `no-restricted-globals`. Generated code calls only
  the mutator.
- Exclude `src/api/generated` from Oxlint and Oxfmt, and have `vp check` regenerate the client and fail on a
  difference.
- Hooks return `{ data, status, headers }`, so a component reads `query.data.data`. orval's
  `includeHttpResponseReturnType: false` returns the body alone. That was not tried, and it would drop the headers a
  staleness display might need.
- In `vp dev` against a live API, proxy `/api` and remove the prefix, as the Vitest configuration does.
- For step 1.5: Arrow fixtures need real Arrow bytes passed to orval's handlers, and MSW 3's `msw/vite` plugin serves
  the worker.
- `@tanstack/react-query` 5.107.1 was published on 2026-11-06, inside pnpm 12's default minimum release age, and pnpm
  wrote a `minimumReleaseAgeExclude` entry for it. Pin a release old enough to need none.

## Also found

basis's design says request bodies are strict, "no value is coerced". With FastAPI 0.162, Pydantic's `strict=True`
refuses every date and decimal in a JSON body. FastAPI validates the parsed body with `validate_python`, and in Python
mode a strict `date` or `Decimal` refuses a string. `model_validate_json` on the same bytes passes. The sample opts
those fields out with `Field(strict=False)`. In the request schema, Pydantic declares a `Decimal` as `number | string`
with no pattern on the string, so the client accepts a JSON number for a price, which a browser may round. A
string-only decimal would be safer. Both are for basis to settle.

## Not determined

- Windows and Citrix desktops: everything above ran on Linux.
- A JSON form of a dataset route beside the Arrow form (the second orval target in answer 5).
- `fetch.includeHttpErrorResponse`, which passes error statuses to the mutator. orval's source rejects it when a route
  declares `default`, as the sample does.
