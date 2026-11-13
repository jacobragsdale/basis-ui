/* The page `vp run new form` writes: a form on TanStack Form for each field the operation's request body requires,
 * checked as it changes by the Zod schema orval generates, each field one of @basis/ui's form fields, an amount read
 * by AmountInput, a date by DatePicker, a choice by NativeSelect and a flag by Checkbox, and sent with the generated
 * mutation. A 422 lands on the fields its errors name, through `submitErrors`; any other failure shows above the
 * button; a success raises a toast. */

import { jsxAttribute, jsxText, parameterArgument } from "./scaffold-code.ts";
import { access } from "./scaffold-fields.ts";
import { failureLines, widgets } from "./scaffold-form-parts.ts";
import type { Field, FieldKind } from "./scaffold-fields.ts";
import { opening } from "./scaffold-plan.ts";
import type { Scaffold } from "./scaffold-plan.ts";
import { choiceReaders, paramsLine } from "./scaffold-view.ts";

/** Each kind of field's starting value when the body requires it: empty text, no amount, unticked, or the first
 * choice. */
const emptyValues: Readonly<Record<FieldKind, (field: Field) => string>> = {
  boolean: () => "false",
  choice: (field) => JSON.stringify(field.options[0] ?? ""),
  date: () => '""',
  instant: () => '""',
  number: () => "null",
  text: () => '""',
};

/** How a field may be empty, as step 7.3's form fields say it: `nullable` holds `null` while empty, `optional` holds
 * `undefined`, so the body leaves the field out, and a required field holds its kind's empty value. An amount's
 * `null` is AmountInput's own, so it says only `optional`. */
function emptiness(field: Field): "nullable" | "optional" | "required" {
  if (field.nullable) {
    return "nullable";
  }
  return field.required ? "required" : "optional";
}

/** A field's starting value, empty as its emptiness says. */
function emptyValue(field: Field): string {
  const empty = emptiness(field);
  if (empty === "required") {
    return emptyValues[field.kind](field);
  }
  return empty === "nullable" ? "null" : "undefined";
}

/** The prop that says how a field may be empty, if it says one. */
function emptinessProps(field: Field): readonly string[] {
  const empty = emptiness(field);
  if (empty === "required" || (empty === "nullable" && field.kind === "number")) {
    return [];
  }
  return [empty];
}

/** The fields a form has: each value the body takes, but a flag it does not require, since a checkbox holds no empty
 * state. */
function formFields(scaffold: Scaffold): readonly Field[] {
  return scaffold.fields.fields.filter(
    (field) => field.kind !== "boolean" || emptiness(field) === "required",
  );
}

function fieldElement(scaffold: Scaffold, field: Field): string {
  const id = `${scaffold.name}-${field.name.replaceAll(/[^\dA-Za-z]+/gu, "-")}`;
  const props = [
    jsxAttribute("id", id),
    jsxAttribute("label", field.label),
    ...(field.description === undefined ? [] : [jsxAttribute("description", field.description)]),
    ...emptinessProps(field),
    ...(field.kind === "choice"
      ? [
          `options={${JSON.stringify(field.options.map((option) => ({ label: option, value: option })))} as const}`,
        ]
      : []),
  ];
  return `        <form.Field name=${JSON.stringify(field.name)}>
          {(field) => <${widgets[field.kind].component} ${props.join(" ")} field={field} />}
        </form.Field>`;
}

/** A field's line in the form's schema, where it differs from the body's: an amount is what AmountInput holds, a
 * number once its text reads as one, and a field the body may leave out holds `undefined` while empty. */
function schemaLine(model: string, field: Field): string | undefined {
  const shape = `${model}.shape${access(field.name)}`;
  const empty = emptiness(field);
  const held = empty === "optional" ? `${shape}.optional()` : shape;
  if (field.kind !== "number") {
    return empty === "optional" ? `  ${JSON.stringify(field.name)}: ${held},` : undefined;
  }
  const amount = empty === "required" ? "amountSchema()" : `amountSchema().${empty}()`;
  return `  ${JSON.stringify(field.name)}: ${amount}.pipe(${held}),`;
}

/** The form's schema: the body's, each amount read from what AmountInput holds and checked by the body's own rule,
 * and each field the body may leave out empty as `undefined`. */
function schemaLines(scaffold: Scaffold, fields: readonly Field[]): string {
  const model = scaffold.model.name;
  const lines = fields.flatMap((field) => schemaLine(model, field) ?? []);
  if (lines.length === 0) {
    return `const formSchema = ${model};`;
  }
  return `/** The body as the form holds it: each amount is what AmountInput holds, a number once its text reads as one, and a
 * field the body may leave out is \`undefined\` while empty. */
const formSchema = ${model}.extend({
${lines.join("\n")}
});`;
}

/** Whether the form holds a field the body may leave out, which it drops before the body's schema reads it. */
function leavesOut(fields: readonly Field[]): boolean {
  return fields.some((field) => emptiness(field) === "optional");
}

const filledLines = `/** The form's value without the fields left empty, which the body leaves out rather than send as \`undefined\`. */
function filled(value: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, held]) => held !== undefined));
}`;

/** What every form imports from @basis/ui, whatever its fields. */
const formParts = [
  "Button",
  "ErrorAlert",
  "FieldGroup",
  "Page",
  "errorsOnFields",
  "submitErrors",
  "toast",
  "useTelemetry",
];

function formImports(scaffold: Scaffold, fields: readonly Field[]): string {
  const ui = new Set([
    ...formParts,
    ...fields.flatMap(({ kind }) => [widgets[kind].component, ...widgets[kind].ui]),
  ]);
  const router =
    scaffold.parameters.length > 0 ? `import { useParams } from "@tanstack/react-router";\n` : "";
  return `import { ${[...ui].toSorted().join(", ")} } from "@basis/ui";
import { useForm } from "@tanstack/react-form";
${router}import type { ReactElement } from "react";
import type { z } from "zod";

import { ${[scaffold.model.name, scaffold.client.hook].toSorted().join(", ")} } from "#api/client.ts";`;
}

/** The form component's hooks: the route's parameters, the mutation, and the form, which sends what its schema
 * reads. */
function formHooks(scaffold: Scaffold, fields: readonly Field[]): string {
  const sent = [
    ...scaffold.parameters.map((parameter) =>
      parameter.kind === "text"
        ? parameter.variable
        : `${parameter.variable}: ${parameterArgument(parameter)}`,
    ),
    "data",
  ];
  const parse = leavesOut(fields)
    ? `${scaffold.model.name}.parse(filled(formSchema.parse(value)))`
    : "formSchema.parse(value)";
  return `${paramsLine(scaffold)}  const telemetry = useTelemetry();
  const report = (error: unknown): void => {
    telemetry.error(error, { source: ${JSON.stringify(scaffold.name)} });
  };
  const sending = ${scaffold.client.hook}({
    mutation: {
      meta: { errorToast: false },
      onSuccess: () => {
        toast.add({ title: ${JSON.stringify(`${scaffold.title}: sent`)}, type: "success" });
      },
    },
  });
  const form = useForm({
    defaultValues: emptyForm,
    validators: {
      onChange: formSchema,
      onSubmitAsync: async ({ value }) => {
        const data = ${parse};
        const failure = await failureOf(async () => sending.mutateAsync({ ${sent.join(", ")} }));
        return failure === null
          ? undefined
          : submitErrors(failure, { fields: fieldNames, message: "It was not sent." });
      },
    },
  });`;
}

/** The form component: its fields, the mutation, and the submit. */
function formComponent(scaffold: Scaffold, fields: readonly Field[], button: string): string {
  return `function ${scaffold.component}(): ReactElement {
${formHooks(scaffold, fields)}
  return (
    <Page title=${JSON.stringify(scaffold.title)}>
      <form
        noValidate
        aria-label=${JSON.stringify(scaffold.title)}
        className="flex max-w-md flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          form.handleSubmit().catch(report);
        }}
      >
        <FieldGroup>
${fields.map((field) => fieldElement(scaffold, field)).join("\n")}
        </FieldGroup>
        <ErrorAlert error={errorsOnFields(sending.error, fieldNames) === undefined ? sending.error : null} />
        <Button type="submit" disabled={sending.isPending} className="self-start">
          ${jsxText(button)}
        </Button>
      </form>
    </Page>
  );
}`;
}

/** The submit button's text: the operation's summary, else the page's title, in sentence case unless it is in Title
 * Case, as `Record Settlement`, where only its first word keeps its capital; `Book FX trade` stays as written. */
function buttonText(scaffold: Scaffold): string {
  const summary = scaffold.operation.summary ?? scaffold.title;
  const words = summary.split(" ");
  const titled = words.length > 1 && words.every((word) => /^[A-Z][a-z]/u.test(word));
  const text = titled ? summary.toLowerCase() : summary;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** `vp run new form`: a form for the operation's request body. */
function formPage(scaffold: Scaffold): string {
  const fields = formFields(scaffold);
  const flags = scaffold.fields.fields
    .filter((field) => !fields.includes(field))
    .map(({ name }) => name);
  const left = [...flags, ...scaffold.fields.skipped];
  const leftNote =
    left.length === 0
      ? ""
      : ` It leaves out ${left.join(", ")}, a flag the body does not require or a field that holds an object or a list: add a field for each the page needs.`;
  const comment = opening(
    `${scaffold.title}: a form for operation ${scaffold.operation.id} (${scaffold.operation.method} ${scaffold.operation.template}), as vp run new form wrote it, a field for each value its body takes, checked by the schema orval generates. A 422 lands on the fields its errors name; any other failure shows above the button.${leftNote}`,
  );
  const empty = fields.map((field) => `  ${JSON.stringify(field.name)}: ${emptyValue(field)},`);
  return `${comment}

${formImports(scaffold, fields)}

${schemaLines(scaffold, fields)}

/** The form's fields, each named as the body names it, so a pointer such as \`#/settle\` finds it. */
const fieldNames = ${JSON.stringify(fields.map(({ name }) => name))} as const;

const emptyForm: z.input<typeof formSchema> = {
${empty.join("\n")}
};

${failureLines}
${leavesOut(fields) ? `\n${filledLines}\n` : ""}${choiceReaders(scaffold)}
${formComponent(scaffold, fields, buttonText(scaffold))}

export { ${scaffold.component} };
`;
}

export { buttonText, emptiness, formFields, formPage };
