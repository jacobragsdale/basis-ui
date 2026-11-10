/* The test `vp run new` writes beside a page: written with @basis/ui/testing, so it runs in Chromium and in a Node DOM,
 * with the API answered by the generated client's handler with the body the fixture holds. A table's test finds the
 * table and its first text, a page's its heading and first text, and a form's fills each field from the fixture's
 * request, submits, and checks what was sent. */

import { literalOf } from "./scaffold-fields.ts";
import { buttonText } from "./scaffold-form.ts";
import type { Field } from "./scaffold-fields.ts";
import { opening } from "./scaffold-plan.ts";
import type { Scaffold } from "./scaffold-plan.ts";

/** The text the page shows of the first text field the response holds, if it holds one. */
function firstText(scaffold: Scaffold, body: unknown): string | undefined {
  const value: unknown = Array.isArray(body) ? body[0] : body;
  const named = scaffold.fields.fields.find(
    ({ kind, required }) => required && (kind === "text" || kind === "choice"),
  );
  if (named === undefined || typeof value !== "object" || value === null) {
    return undefined;
  }
  const text: unknown = Object.entries(value).find(([name]) => name === named.name)?.[1];
  return typeof text === "string" && text !== "" ? text : undefined;
}

function responseBody(scaffold: Scaffold): unknown {
  return scaffold.fixture.response["body"];
}

function header(scaffold: Scaffold, kind: string): string {
  return opening(
    `The page vp run new ${kind} wrote for operation ${scaffold.operation.id}, answered by the generated client's handler with the body its fixture holds. Written with @basis/ui/testing, so it runs in Chromium and in a Node DOM.`,
  );
}

/** A table's or a page's test. */
function viewTest(scaffold: Scaffold): string {
  const body = responseBody(scaffold);
  const text = firstText(scaffold, body);
  const table = scaffold.kind === "table";
  const role = table ? "cell" : undefined;
  const finds = [
    `  expect(await screen.findByRole("heading", { name: ${JSON.stringify(scaffold.title)} })).toBeTruthy();`,
  ];
  if (table) {
    finds.push(
      `  expect(await screen.findByRole("table", { name: ${JSON.stringify(scaffold.title)} })).toBeTruthy();`,
    );
  }
  if (text !== undefined) {
    finds.push(
      role === undefined
        ? `  expect(await screen.findByText(${JSON.stringify(text)})).toBeTruthy();`
        : `  expect(await screen.findByRole("cell", { name: ${JSON.stringify(text)} })).toBeTruthy();`,
    );
  }
  return `${header(scaffold, scaffold.kind)}

import { mockApi, renderApp, screen } from "@basis/ui/testing";
import { afterAll, expect, test } from "vite-plus/test";

import { ${scaffold.client.handler} } from "#api/mocks.ts";
import { routeTree } from "#routes.ts";

const api = await mockApi(${scaffold.client.handler}(${literalOf(body)}));

afterAll(async () => {
  await api.close();
});

test(${JSON.stringify(`the ${scaffold.title.toLowerCase()} page shows what the API answers`)}, async () => {
  renderApp(routeTree, ${JSON.stringify(scaffold.openPath)});
${finds.join("\n")}
});
`;
}

/** The steps that fill a field with the value the fixture's request gives it. */
function fillLines(field: Field, value: unknown, first: boolean): string[] {
  const found = first
    ? `await screen.findByLabelText(${JSON.stringify(field.label)})`
    : `screen.getByLabelText(${JSON.stringify(field.label)})`;
  if (field.kind === "boolean") {
    return value === true ? [`  await user.click(${found});`] : [];
  }
  if (field.kind === "choice") {
    return [`  await user.selectOptions(${found}, ${JSON.stringify(value)});`];
  }
  const typed = `  await user.type(${found}, ${JSON.stringify(String(value))});`;
  // A date is taken as the field is left.
  return field.kind === "date" ? [typed, "  await user.tab();"] : [typed];
}

/** A form's test. */
function formTest(scaffold: Scaffold): string {
  const sent = scaffold.fixture.request.body;
  const values =
    typeof sent === "object" && sent !== null
      ? new Map(Object.entries(sent))
      : new Map<string, unknown>();
  const fields = scaffold.fields.fields.filter(({ required }) => required);
  const fills = fields.flatMap((field, index) =>
    fillLines(field, values.get(field.name), index === 0),
  );
  return `${header(scaffold, "form")}

import { mockApi, renderApp, screen, userEvent } from "@basis/ui/testing";
import { afterAll, expect, test } from "vite-plus/test";

import { ${scaffold.client.handler} } from "#api/mocks.ts";
import { routeTree } from "#routes.ts";

const sent: unknown[] = [];

const api = await mockApi(
  ${scaffold.client.handler}(async ({ request }) => {
    sent.push(await request.json());
    return ${literalOf(responseBody(scaffold))};
  }),
);

afterAll(async () => {
  await api.close();
});

test(${JSON.stringify(`the ${scaffold.title.toLowerCase()} form sends what it is given`)}, async () => {
  renderApp(routeTree, ${JSON.stringify(scaffold.openPath)});
  const user = userEvent.setup();
${fills.length === 0 ? `  await screen.findByRole("form", { name: ${JSON.stringify(scaffold.title)} });` : fills.join("\n")}
  await user.click(screen.getByRole("button", { name: ${JSON.stringify(buttonText(scaffold))} }));
  expect(await screen.findByText(${JSON.stringify(`${scaffold.title}: sent`)})).toBeTruthy();
  expect(sent).toStrictEqual([${literalOf(sent ?? {})}]);
});
`;
}

export { formTest, viewTest };
