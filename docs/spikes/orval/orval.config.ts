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
