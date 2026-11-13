/* The test `vp run new` writes beside a page: written with @basis/ui/testing, so it runs in Chromium and in a Node DOM,
 * with the API answered by the generated client's handler with the body the fixture holds. A table's test finds the
 * table and its first text, a page's its heading and first text, and a form's fills each field from the fixture's
 * request, submits, and checks what was sent. */

import { literalOf } from "./scaffold-fields.ts";
import { buttonText, emptiness, formFields } from "./scaffold-form.ts";
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

/** What the form sends for a field the test leaves as it starts: a required flag unticked, a required choice's first
 * option, `null` for a field that may be null, and nothing for one the body may leave out. */
function startingValue(field: Field): readonly (readonly [string, unknown])[] {
  const empty = emptiness(field);
  if (empty === "optional") {
    return [];
  }
  if (empty === "nullable") {
    return [[field.name, null]];
  }
  return [[field.name, field.kind === "boolean" ? false : (field.options[0] ?? null)]];
}

/** Whether the test fills a field with `value`: it is given, and for a flag, ticked. */
function fills(field: Field, value: unknown): boolean {
  return value !== undefined && value !== null && (field.kind !== "boolean" || value === true);
}

/** What the form sends once the test has filled each field the fixture's request gives a value. */
function sentBody(fields: readonly Field[], values: ReadonlyMap<string, unknown>): unknown {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const value = values.get(field.name);
      return value === undefined || value === null ? startingValue(field) : [[field.name, value]];
    }),
  );
}

/** The step that fills a field with the value the fixture's request gives it, as a function `inTurn` takes. */
function fillStep(field: Field, value: unknown): string {
  const label = JSON.stringify(field.label);
  if (field.kind === "boolean") {
    return `    async () => user.click(screen.getByRole("checkbox", { name: ${label} })),`;
  }
  if (field.kind === "choice") {
    return `    async () => user.selectOptions(screen.getByLabelText(${label}), ${JSON.stringify(value)}),`;
  }
  const typed = `user.type(screen.getByLabelText(${label}), ${JSON.stringify(String(value))})`;
  // A date is taken as the field is left.
  return field.kind === "date"
    ? `    async () => {\n      await ${typed};\n      await user.tab();\n    },`
    : `    async () => ${typed},`;
}

/* Each step taken once the one before has finished, so that a form of many fields stays one test of few statements. */
const inTurnLines = `/** Takes each step once the one before has finished. */
async function inTurn(steps: readonly (() => Promise<unknown>)[]): Promise<void> {
  const [step, ...rest] = steps;
  if (step !== undefined) {
    await step();
    await inTurn(rest);
  }
}`;

/** A form's test. */
function formTest(scaffold: Scaffold): string {
  const sent = scaffold.fixture.request.body;
  const values =
    typeof sent === "object" && sent !== null
      ? new Map(Object.entries(sent))
      : new Map<string, unknown>();
  const fields = formFields(scaffold);
  const steps = fields
    .filter((field) => fills(field, values.get(field.name)))
    .map((field) => fillStep(field, values.get(field.name)));
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
${steps.length === 0 ? "" : `\n${inTurnLines}\n`}
test(${JSON.stringify(`the ${scaffold.title.toLowerCase()} form sends what it is given`)}, async () => {
  renderApp(routeTree, ${JSON.stringify(scaffold.openPath)});
  const user = userEvent.setup();
  await screen.findByRole("form", { name: ${JSON.stringify(scaffold.title)} });
${steps.length === 0 ? "" : `  await inTurn([\n${steps.join("\n")}\n  ]);\n`}
  await user.click(screen.getByRole("button", { name: ${JSON.stringify(buttonText(scaffold))} }));
  expect(await screen.findByText(${JSON.stringify(`${scaffold.title}: sent`)})).toBeTruthy();
  expect(sent).toStrictEqual([${literalOf(sentBody(fields, values))}]);
});
`;
}

export { formTest, viewTest };
