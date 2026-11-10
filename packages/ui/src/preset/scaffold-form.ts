/* The page `vp run new form` writes: a form on TanStack Form for each field the operation's request body requires,
 * checked as it changes by the Zod schema orval generates, an amount read by AmountInput, a date by AsOfDatePicker, a
 * choice by NativeSelect and a flag by Checkbox, and sent with the generated mutation. A 422 lands on the fields its
 * errors name, through `fieldErrors`; any other failure shows above the button; a success raises a toast. */

import { access } from "./scaffold-fields.ts";
import { bindingTypes, failureLines, fieldComponents, widgets } from "./scaffold-form-parts.ts";
import type { Field, FieldKind } from "./scaffold-fields.ts";
import { opening } from "./scaffold-plan.ts";
import type { Scaffold } from "./scaffold-plan.ts";

/** Each kind of field's starting value: empty text, no amount, unticked, or the first choice. */
const emptyValues: Readonly<Record<FieldKind, (field: Field) => string>> = {
  boolean: () => "false",
  choice: (field) => JSON.stringify(field.options[0] ?? ""),
  date: () => '""',
  instant: () => '""',
  number: () => "null",
  text: () => '""',
};

function fieldElement(scaffold: Scaffold, field: Field): string {
  const id = `${scaffold.name}-${field.name.replaceAll(/[^\dA-Za-z]+/gu, "-")}`;
  const props = [
    `id=${JSON.stringify(id)}`,
    `label=${JSON.stringify(field.label)}`,
    ...(field.description === undefined
      ? []
      : [`description=${JSON.stringify(field.description)}`]),
    ...(field.kind === "choice" ? [`options={${JSON.stringify(field.options)} as const}`] : []),
  ];
  return `        <form.Field name=${JSON.stringify(field.name)}>
          {(field) => <${widgets[field.kind].component} ${props.join(" ")} field={field} />}
        </form.Field>`;
}

/** The form's schema: the body's, each amount read from what AmountInput holds and checked by the body's own rule. */
function schemaLines(scaffold: Scaffold, fields: readonly Field[]): string {
  const model = scaffold.model.name;
  const amounts = fields.filter(({ kind }) => kind === "number");
  if (amounts.length === 0) {
    return `const formSchema = ${model};`;
  }
  const lines = amounts.map(
    ({ name }) => `  ${JSON.stringify(name)}: amountSchema().pipe(${model}.shape${access(name)}),`,
  );
  return `/** The body as the form holds it: each amount is what AmountInput holds, a number once its text reads as one. */
const formSchema = ${model}.extend({
${lines.join("\n")}
});`;
}

/** What every form imports from @basis/ui, whatever its fields. */
const formParts = [
  "Button",
  "ErrorAlert",
  "Field",
  "FieldDescription",
  "FieldError",
  "FieldGroup",
  "FieldLabel",
  "Page",
  "fieldErrors",
  "isApiError",
  "toast",
  "useTelemetry",
];

function formImports(scaffold: Scaffold, fields: readonly Field[]): string {
  const ui = new Set([...formParts, ...fields.flatMap(({ kind }) => widgets[kind].ui)]);
  const router =
    scaffold.parameters.length > 0 ? `import { useParams } from "@tanstack/react-router";\n` : "";
  return `import { ${[...ui].toSorted().join(", ")} } from "@basis/ui";
import { useForm } from "@tanstack/react-form";
${router}import type { ComponentProps, ReactElement } from "react";
import type { z } from "zod";

import { ${[scaffold.model.name, scaffold.client.hook].toSorted().join(", ")} } from "#api/client.ts";`;
}

/** The form component's hooks: the route's parameters, the mutation, and the form, which sends what its schema
 * reads. */
function formHooks(scaffold: Scaffold): string {
  const names = scaffold.parameters.map(({ variable }) => variable);
  const params =
    names.length === 0
      ? ""
      : `  const { ${names.join(", ")} } = useParams({ from: ${JSON.stringify(scaffold.routePath)} });\n`;
  return `${params}  const telemetry = useTelemetry();
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
        const data = formSchema.parse(value);
        const failure = await failureOf(async () => sending.mutateAsync({ ${[...names, "data"].join(", ")} }));
        return failure === null ? undefined : submitErrors(failure);
      },
    },
  });`;
}

/** The form component: its fields, the mutation, and the submit. */
function formComponent(scaffold: Scaffold, fields: readonly Field[], button: string): string {
  return `function ${scaffold.component}(): ReactElement {
${formHooks(scaffold)}
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
        <ErrorAlert error={errorsOnFields(sending.error) === undefined ? sending.error : null} />
        <Button type="submit" disabled={sending.isPending} className="self-start">
          ${button}
        </Button>
      </form>
    </Page>
  );
}`;
}

/** The submit button's text: the operation's summary, else the page's title. */
function buttonText(scaffold: Scaffold): string {
  const summary = scaffold.operation.summary ?? scaffold.title;
  return `${summary.charAt(0).toUpperCase()}${summary.slice(1).toLowerCase()}`;
}

/** `vp run new form`: a form for the operation's request body. */
function formPage(scaffold: Scaffold): string {
  const fields = scaffold.fields.fields.filter(({ required }) => required);
  const optional = scaffold.fields.fields
    .filter(({ required }) => !required)
    .map(({ name }) => name);
  const left = [...optional, ...scaffold.fields.skipped];
  const leftNote =
    left.length === 0
      ? ""
      : ` It leaves out ${left.join(", ")}, which the body does not require or which hold an object or a list: add a field for each the page needs.`;
  const components = [...new Set(fields.map(({ kind }) => widgets[kind].component))].toSorted();
  const comment = opening(
    `${scaffold.title}: a form for operation ${scaffold.operation.id} (${scaffold.operation.method} ${scaffold.operation.template}), as vp run new form wrote it, a field for each one its body requires, checked by the schema orval generates. A 422 lands on the fields its errors name; any other failure shows above the button.${leftNote}`,
  );
  const empty = fields.map(
    (field) => `  ${JSON.stringify(field.name)}: ${emptyValues[field.kind](field)},`,
  );
  return `${comment}

${formImports(scaffold, fields)}

/** The status of a request the API refused, whose problem names each field at fault. */
const unprocessableContent = 422;

${schemaLines(scaffold, fields)}

/** The form's fields, each named as the body names it, so a pointer such as \`#/settle\` finds it. */
const fieldNames = new Set<string>(${JSON.stringify(fields.map(({ name }) => name))});

const emptyForm: z.input<typeof formSchema> = {
${empty.join("\n")}
};

${failureLines}

${bindingTypes}

${components.map((name) => fieldComponents[name]).join("\n\n")}

${formComponent(scaffold, fields, buttonText(scaffold))}

export { ${scaffold.component} };
`;
}

export { buttonText, formPage };
