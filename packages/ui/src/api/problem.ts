/* RFC 9457 problem details, as basis's contract promises every error is. `@basis/ui` carries its own schemas rather
 * than an app's generated ones, so the shared client can read any app's errors; the field-error shape is the one
 * basis-ui asked basis to add to its contract (jacobragsdale/basis#7). */

import { z } from "zod";

/** Problem details. Every member is optional in RFC 9457; `type` defaults to `about:blank`. Unknown members are kept,
 * since a problem type may add its own. */
const problemSchema = z.looseObject({
  detail: z.string().optional(),
  instance: z.string().optional(),
  status: z.number().int().optional(),
  title: z.string().optional(),
  type: z.string().default("about:blank"),
});

/** One field's error in a 422: a request-body field named by a JSON Pointer, or a query or path parameter by name. */
const fieldErrorSchema = z.union([
  z.object({ detail: z.string(), pointer: z.string() }),
  z.object({ detail: z.string(), parameter: z.string() }),
]);

/** A 422's problem details, naming each field at fault. */
const validationProblemSchema = problemSchema.extend({
  errors: z.array(fieldErrorSchema),
});

type Problem = z.infer<typeof problemSchema>;
type FieldError = z.infer<typeof fieldErrorSchema>;
type ValidationProblem = z.infer<typeof validationProblemSchema>;

/** The path a JSON Pointer in URI-fragment form names, such as `#/legs/0/price` → `["legs", 0, "price"]`. `#` alone
 * names the whole body, an empty path. Returns `undefined` for text that is not a fragment pointer. */
function pointerPath(pointer: string): readonly (string | number)[] | undefined {
  if (!pointer.startsWith("#")) {
    return undefined;
  }
  const decoded = decodeURIComponent(pointer.slice(1));
  if (decoded === "") {
    return [];
  }
  if (!decoded.startsWith("/")) {
    return undefined;
  }
  return decoded
    .slice(1)
    .split("/")
    .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"))
    .map((token) => (/^(?:0|[1-9]\d*)$/u.test(token) ? Number(token) : token));
}

/** A JSON Pointer's path as TanStack Form names the field: `["legs", 0, "price"]` → `legs[0].price`. */
function fieldName(path: readonly (string | number)[]): string {
  return path
    .map((segment, index) => {
      if (typeof segment === "number") {
        return `[${String(segment)}]`;
      }
      return index === 0 ? segment : `.${segment}`;
    })
    .join("");
}

/** A 422's errors keyed by the form field each names, in TanStack Form's naming, such as `legs[0].price`; errors for
 * the whole body sit under `""`, and parameters under their names. */
function fieldErrors(problem: Problem | ValidationProblem): ReadonlyMap<string, readonly string[]> {
  const byField = new Map<string, string[]>();
  // A problem type may define its own `errors` member, so only the contract's shape is read.
  const parsed = validationProblemSchema.safeParse(problem);
  if (!parsed.success) {
    return byField;
  }
  for (const error of parsed.data.errors) {
    const path = "pointer" in error ? pointerPath(error.pointer) : [error.parameter];
    const key = path === undefined ? "" : fieldName(path);
    byField.set(key, [...(byField.get(key) ?? []), error.detail]);
  }
  return byField;
}

export {
  fieldErrorSchema,
  fieldErrors,
  fieldName,
  pointerPath,
  problemSchema,
  validationProblemSchema,
};
export type { FieldError, Problem, ValidationProblem };
