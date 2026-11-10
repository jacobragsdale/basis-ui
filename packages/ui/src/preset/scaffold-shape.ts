/* What a scaffold lays out of an operation: the rows a table's GET answers, the object a page's GET answers, or the
 * body a form sends, and the type it names that by. An operation a scaffold cannot make that kind of page from fails
 * with the kind it can, or with what to write by hand. */

import { arrowStream } from "#api/fetch.ts";

import {
  componentName,
  modelName,
  objectOf,
  pascal,
  resolved,
  successOf,
} from "./api-operations.ts";
import type { ApiDocument, ApiOperation, Schema } from "./api-operations.ts";
import { fieldsOf } from "./scaffold-fields.ts";
import type { Scaffold, ScaffoldKind } from "./scaffold-plan.ts";
import { TaskError } from "./task-error.ts";

/** An operation a scaffold reads, with the document it is in and the kind of page it makes. */
interface Reading {
  readonly api: ApiDocument;
  readonly operation: ApiOperation;
  readonly kind: ScaffoldKind;
}

/** The JSON schema of what an operation answers, or a failure for one with nothing a page can show. */
function answerOf({ operation, kind }: Reading): Schema {
  const { id, method } = operation;
  if (method !== "GET") {
    throw new TaskError(
      `ERROR operation ${id} is a ${method}, and a ${kind} shows what a GET answers: scaffold a form for it with vp run new form NAME --operation ${id}.`,
    );
  }
  const success = successOf(operation);
  if (success !== undefined && arrowStream in success.content) {
    throw new TaskError(
      `ERROR operation ${id} is a dataset route, which basis-ui's client asks for Arrow, and a scaffold reads JSON: show its rows in @basis/parallax's Grid, which vp run docs Grid describes.`,
    );
  }
  const schema = success?.content["application/json"];
  if (schema === undefined) {
    throw new TaskError(
      `ERROR operation ${id} answers no JSON success, so a ${kind} has nothing to show: scaffold an operation that answers JSON.`,
    );
  }
  return schema;
}

/** Whether a schema describes an object of fields. */
function isObject(api: ApiDocument, schema: Schema): boolean {
  const held = resolved(api.document, schema);
  return held["type"] === "object" || "properties" in held;
}

/** The body a form sends, or a failure for an operation that takes none. */
function bodyOf({ api, operation }: Reading): Schema {
  if (operation.body === undefined || !isObject(api, operation.body)) {
    throw new TaskError(
      `ERROR operation ${operation.id} takes no JSON object as its body, so it makes no form: scaffold what a GET answers with vp run new page or vp run new table, or write the form by hand.`,
    );
  }
  return operation.body;
}

/** Fails when a table's operation answers one object, or a page's a list. */
function checkList({ operation, kind }: Reading, list: boolean): void {
  const { id } = operation;
  if (kind === "table" && !list) {
    throw new TaskError(
      `ERROR operation ${id} answers one object, not a list of rows, so it makes no table: scaffold it with vp run new page NAME --operation ${id}.`,
    );
  }
  if (kind === "page" && list) {
    throw new TaskError(
      `ERROR operation ${id} answers a list of rows, which a table shows: scaffold it with vp run new table NAME --operation ${id}.`,
    );
  }
}

/** The schema a scaffold lays out: a row of the list a table shows, the object a page shows, or a form's body. */
function shapeOf(reading: Reading): Schema {
  if (reading.kind === "form") {
    return bodyOf(reading);
  }
  const answer = answerOf(reading);
  const held = resolved(reading.api.document, answer);
  const list = held["type"] === "array";
  checkList(reading, list);
  const shape = list ? objectOf(held["items"]) : answer;
  if (!isObject(reading.api, shape)) {
    throw new TaskError(
      `ERROR operation ${reading.operation.id} answers ${list ? "rows that are not objects" : "no object"}, so a ${reading.kind} has no fields to lay out: write the page by hand.`,
    );
  }
  return shape;
}

/** Fails for an operation a scaffold cannot call as written: one that requires query parameters, or a form whose
 * body requires a field that holds an object or a list. */
function checkCallable({ api, operation, kind }: Reading, shape: Schema): void {
  const query = operation.parameters.filter(
    (parameter) => parameter.in !== "path" && parameter.required,
  );
  if (query.length > 0) {
    throw new TaskError(
      `ERROR operation ${operation.id} requires the query parameters ${query.map(({ name }) => name).join(", ")}, which a scaffolded page cannot choose: write the page by hand, and its fixture with vp run fixtures new ${operation.id}.`,
    );
  }
  const { required } = resolved(api.document, shape);
  const { skipped } = fieldsOf(api.document, shape);
  const nested = skipped.filter((name) => Array.isArray(required) && required.includes(name));
  if (kind === "form" && nested.length > 0) {
    throw new TaskError(
      `ERROR the body of operation ${operation.id} requires ${nested.join(", ")}, which ${nested.length === 1 ? "holds" : "hold"} an object or a list, and a scaffolded form has fields only for values: write the form by hand.`,
    );
  }
}

/** The type a scaffold names the shape by: orval's model for a component, or a type derived from the call. */
function modelOf({ operation, kind }: Reading, shape: Schema): Scaffold["model"] {
  const component = componentName(shape);
  if (component !== undefined) {
    return { derived: false, name: modelName(component) };
  }
  if (kind === "form") {
    return { derived: false, name: `${pascal(operation.id)}Body` };
  }
  return { derived: true, name: kind === "table" ? "Row" : "Detail" };
}

export { checkCallable, modelOf, shapeOf };
export type { Reading };
