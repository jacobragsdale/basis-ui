/* The orval configuration every basis-ui app's client is generated with, as spike 0.2 settled it
 * (docs/spikes/orval.md). `vp run client-pull` and `vp run client-check` use it; an app keeps no orval configuration of
 * its own. It generates, from the app's `openapi.json`:
 *
 * - a Zod 4 schema per model, which keeps the fields it knows and drops the rest, so an API can add a response field
 *   without breaking a deployed UI;
 * - a TanStack Query v5 hook per operation, each response parsed by its schema in `apiFetch`, the mutator;
 * - MSW handlers for every operation and status, for tests and fixture mode;
 * - each dataset route, one that answers Arrow, as a `Blob` requested with Arrow's Accept header.
 *
 * Two settings must never change. `zod.strict` stays off, since with reusable schemas it would make every response
 * schema reject fields it does not know. And `override.zod.schemaExtension` is never set: it is the one path on which
 * orval calls TypeScript's compiler API, which TypeScript 7 does not have. */

import { readFileSync } from "node:fs";
import path from "node:path";

import type { Options } from "orval";
import { z } from "zod";

import { formatMocks } from "./client-mocks.ts";

/** Where an app keeps its pinned copy of the API's document, and where its generated client goes, from its root. */
const documentFile = "openapi.json";
const generatedFolder = "src/api/generated";

const arrowStream = "application/vnd.apache.arrow.stream";
const problemJson = "application/problem+json";

/** What `basisOrval` reads of an OpenAPI document: each operation's id and its responses' media types. */
const mediaTypesSchema = z.record(z.string(), z.unknown());
const responseSchema = z.object({ content: mediaTypesSchema.optional() });
const operationSchema = z.object({
  operationId: z.string(),
  responses: z.record(z.string(), responseSchema),
});
const pathItemSchema = z.record(z.string(), z.unknown());
const documentSchema = z.object({ paths: z.record(z.string(), pathItemSchema) });

interface DatasetOverride {
  readonly contentType: { readonly include: readonly string[] };
  readonly requestOptions: { readonly headers: Readonly<Record<string, string>> };
}

/** basis's contract: a dataset route returns Arrow when the request asks for it. orval would type its 200 as
 * `Exposure[] | Blob` and send no Accept header, so each dataset operation is generated as Arrow only, with the header.
 * A dataset route is one whose 200 lists Arrow, so no route is named by hand. */
function datasetOperations(document: unknown): Record<string, DatasetOverride> {
  const { paths } = documentSchema.parse(document);
  const ids = Object.values(paths)
    .flatMap((pathItem) => Object.values(pathItem))
    .flatMap((candidate) => {
      const operation = operationSchema.safeParse(candidate);
      return operation.success &&
        operation.data.responses["200"]?.content?.[arrowStream] !== undefined
        ? [operation.data.operationId]
        : [];
    });
  return Object.fromEntries(
    ids.map((id) => [
      id,
      {
        contentType: { include: [arrowStream, problemJson] },
        requestOptions: { headers: { Accept: arrowStream } },
      },
    ]),
  );
}

/** The app's `openapi.json` as text, or a failure with the command that copies it. */
function readText(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    throw new Error(
      `ERROR ${file} is missing, and the client is generated from it: copy the API's document with vp run client-pull PATH TAG, or vp run client-pull URL.`,
    );
  }
}

/** Reads the app's `openapi.json`, or fails with the command that copies it. */
function readDocument(file: string): unknown {
  const text = readText(file);
  try {
    const document: unknown = JSON.parse(text);
    return document;
  } catch {
    throw new Error(
      `ERROR ${file} is not JSON: copy the API's document again with vp run client-pull PATH TAG, or vp run client-pull URL, rather than editing it.`,
    );
  }
}

interface BasisOrvalOptions {
  /** The app's root folder, which holds `openapi.json` and `src/api/generated`. The working directory by default. */
  readonly root?: string;
}

/** The configuration for the app at `root`, writing to `output`. `vp run client-check` writes to a temporary folder,
 * whose files are the same as the app's would be, since every import in them is relative or names a package. */
function orvalOptions(root: string, output: string): Options {
  const input = path.resolve(root, documentFile);
  return {
    input: { target: input },
    output: {
      clean: true,
      client: "react-query",
      httpClient: "fetch",
      mock: { generators: [{ delay: false, generateEachHttpStatus: true, type: "msw" }] },
      mode: "split",
      override: {
        fetch: { forceSuccessResponse: true, runtimeValidation: true },
        // Each format's mock that orval's own fails the check its Zod output makes (client-mocks.ts).
        mock: { format: formatMocks },
        includeZodSchemaInArguments: true,
        mutator: { name: "apiFetch", path: "@basis/ui/mutator" },
        operations: datasetOperations(readDocument(input)),
        query: { signal: true, version: 5 },
        zod: {
          exactOptional: true,
          generateReusableSchemas: true,
          strict: { body: false, response: false },
          version: 4,
        },
      },
      schemas: { path: path.join(output, "model"), type: "zod" },
      target: path.join(output, "client.ts"),
    },
  };
}

/** The orval configuration for the app at `root`: one project, read from `openapi.json` and written to
 * `src/api/generated`. Its mutator is `@basis/ui/mutator`, so every call goes through `apiFetch`. */
function basisOrval({ root = process.cwd() }: BasisOrvalOptions = {}): Options {
  return orvalOptions(root, path.resolve(root, generatedFolder));
}

export { basisOrval, documentFile, generatedFolder, orvalOptions };
export type { BasisOrvalOptions };
