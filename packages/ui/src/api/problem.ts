/* RFC 9457 problem details, as basis's contract promises every error is. `@basis/ui` carries its own schemas rather
 * than an app's generated ones, so the shared client can read any app's errors. A 422 names each field at fault in
 * `errors`, by a JSON Pointer into the body or by a parameter's name, as basis's docs/contract.md (Errors) gives it. */

import { z } from "zod";

/** Problem details. Every member is optional in RFC 9457; `type` defaults to `about:blank`. basis's document declares
 * `detail` and `instance` as a string or `null`. Unknown members are kept, since a problem type may add its own, as
 * basis's `data` does. */
const problemSchema = z.looseObject({
  detail: z.string().nullish(),
  instance: z.string().nullish(),
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

/** A fragment's text, percent-decoded, or `undefined` for one with a `%` the API did not encode, which names nothing this
 * client can find. */
function decodedFragment(fragment: string): string | undefined {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return undefined;
  }
}

/** The path a JSON Pointer in URI-fragment form names, such as `#/legs/0/price` → `["legs", 0, "price"]`. `#` alone
 * names the whole body, an empty path. Returns `undefined` for text that is not a fragment pointer. */
function pointerPath(pointer: string): readonly (string | number)[] | undefined {
  const decoded = pointer.startsWith("#") ? decodedFragment(pointer.slice(1)) : undefined;
  if (decoded === undefined) {
    return undefined;
  }
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

/** An entry of `errors` the contract does not name, such as `{ detail, header }`: its detail still says what was
 * wrong. */
const otherErrorSchema = z.object({ detail: z.string() });

/** A problem's `errors`, each entry read on its own. */
const errorsSchema = z.object({ errors: z.array(z.unknown()) });

/** The field an entry of a 422's `errors` names: by its pointer or its parameter, or `""`, the whole request, for an
 * entry of another kind or a pointer that names nothing. */
function fieldOf(error: FieldError | z.infer<typeof otherErrorSchema>): string {
  if ("pointer" in error) {
    const path = pointerPath(error.pointer);
    return path === undefined ? "" : fieldName(path);
  }
  return "parameter" in error ? error.parameter : "";
}

/** A 422's errors keyed by the form field each names, in TanStack Form's naming, such as `legs[0].price`; errors for
 * the whole body sit under `""`, and parameters under their names. An entry of a kind the contract does not name sits
 * under `""` too, and one with no `detail` is left out, since a problem type may define its own `errors` member. */
function fieldErrors(problem: Problem | ValidationProblem): ReadonlyMap<string, readonly string[]> {
  const byField = new Map<string, string[]>();
  for (const entry of errorsSchema.safeParse(problem).data?.errors ?? []) {
    const known = fieldErrorSchema.safeParse(entry);
    const error = known.success ? known.data : otherErrorSchema.safeParse(entry).data;
    if (error !== undefined) {
      const key = fieldOf(error);
      byField.set(key, [...(byField.get(key) ?? []), error.detail]);
    }
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
