/* The pages `vp run new table` and `vp run new page` write: a DataTable with a column for each field of the response's
 * rows, or a card with each field of the response, each number shown by the display format the API declares. The
 * query's loading, error and retry are the DataTable's, or QueryState's. */

import { access } from "./scaffold-fields.ts";
import type { Field } from "./scaffold-fields.ts";
import { opening, skippedNote } from "./scaffold-plan.ts";
import type { Scaffold } from "./scaffold-plan.ts";

/** An import line of `names` from `module`, or none when there are none. */
function importOf(names: readonly string[], module: string, typeOnly = false): string[] {
  const sorted = [...new Set(names)].toSorted();
  return sorted.length === 0
    ? []
    : [`import ${typeOnly ? "type " : ""}{ ${sorted.join(", ")} } from "${module}";`];
}

/** The imports from `@basis/ui`, the router, React and the client a page needs. */
function importLines(scaffold: Scaffold, ui: readonly string[], types: readonly string[]): string {
  const { derived, name } = scaffold.model;
  const formatted = scaffold.fields.fields.some(({ format }) => format !== undefined);
  const client = [
    scaffold.client.hook,
    ...(derived ? [scaffold.client.call] : []),
    ...(formatted ? ["displayFormats"] : []),
  ];
  return [
    ...importOf(ui, "@basis/ui"),
    ...importOf(types, "@basis/ui", true),
    ...importOf(scaffold.parameters.length > 0 ? ["useParams"] : [], "@tanstack/react-router"),
    `import type { ReactElement } from "react";`,
    "",
    ...importOf(client, "#api/client.ts"),
    ...importOf(derived ? [] : [name], "#api/client.ts", true),
  ].join("\n");
}

/** The type the page names its value by: the model, or one derived from the request function's answer. */
function typeLine(scaffold: Scaffold, row: boolean): string {
  if (!scaffold.model.derived) {
    return "";
  }
  const element = row ? "[number]" : "";
  return `\n/** What operation ${scaffold.operation.id} answers${row ? ", a row of it" : ""}. */\ntype ${scaffold.model.name} = Awaited<ReturnType<typeof ${scaffold.client.call}>>["data"]${element};\n`;
}

/** The hook's call, with the route's parameters, and the line that reads them. */
function queryLines(scaffold: Scaffold, variable: string): string {
  const names = scaffold.parameters.map(({ variable: name }) => name);
  const params =
    names.length === 0
      ? ""
      : `  const { ${names.join(", ")} } = useParams({ from: ${JSON.stringify(scaffold.routePath)} });\n`;
  return `${params}  const ${variable} = ${scaffold.client.hook}(${names.join(", ")});`;
}

/** The value a row's field gives its column: as the API sends it, a yes or no for a flag. */
function columnValue(field: Field): string {
  const read = `row${access(field.name)}`;
  if (field.kind === "boolean") {
    return field.required && !field.nullable ? `(${read} ? "Yes" : "No")` : read;
  }
  return field.required ? read : `${read} ?? null`;
}

/** A field whose name says it holds an identifier: an id, as `id`, `security_id` or `tradeId`, or a security's code. */
const identifierName = /(?:^|_)(?:id|cusip|isin|sedol|figi)$/iu;
/** A camel-case name ending in an id, `tradeId`, where `paid` is no id. */
const camelIdentifierName = /[a-z]Id$/u;

/** A table's column for a field: a text column whose field names an identifier sorts by code point. */
function columnLine(field: Field): string {
  const numeric = field.kind === "number";
  const identifier =
    field.kind === "text" &&
    (identifierName.test(field.name) || camelIdentifierName.test(field.name));
  const instant = field.kind === "instant" && field.required && !field.nullable;
  const parts = [
    ...(instant ? [`cell: (row) => <DateTime value={row${access(field.name)}} />`] : []),
    ...(numeric && field.format !== undefined ? [`format: ${field.format}`] : []),
    `header: ${JSON.stringify(field.label)}`,
    `id: ${JSON.stringify(field.name)}`,
    ...(identifier ? ["identifier: true"] : []),
    `value: (row) => ${columnValue(field)}`,
    ...(numeric ? [`variant: "numeric"`] : []),
  ];
  return `  { ${parts.join(", ")} },`;
}

/** The field that names a row: an id, else the first text, else the first field. */
function rowId(fields: readonly Field[]): string {
  const textual = fields.filter(
    ({ kind, required, nullable }) => required && !nullable && kind !== "boolean",
  );
  const named =
    textual.find(({ name }) => name === "id" || /(?:_id|Id)$/u.test(name)) ??
    textual.find(({ kind }) => kind === "text" || kind === "choice") ??
    textual[0];
  if (named === undefined) {
    return "JSON.stringify(row)";
  }
  const read = `row${access(named.name)}`;
  return named.kind === "number" ? `String(${read})` : read;
}

/** `vp run new table`: a DataTable of the rows the operation answers. */
function tablePage(scaffold: Scaffold): string {
  const { fields } = scaffold.fields;
  const instants = fields.some(
    ({ kind, required, nullable }) => kind === "instant" && required && !nullable,
  );
  const ui = ["DataTable", "Page", "useTelemetry", ...(instants ? ["DateTime"] : [])];
  const comment = opening(
    `${scaffold.title}: a table of what operation ${scaffold.operation.id} answers (${scaffold.operation.method} ${scaffold.operation.template}), as vp run new table wrote it, a column for each field of a row, each number shown by the display format the API declares.${skippedNote(scaffold)}`,
  );
  return `${comment}

${importLines(scaffold, ui, ["DataTableColumn"])}
${typeLine(scaffold, true)}
const columns: readonly DataTableColumn<${scaffold.model.name}>[] = [
${fields.map((field) => columnLine(field)).join("\n")}
];

function ${scaffold.component}(): ReactElement {
${queryLines(scaffold, "rows")}
  const telemetry = useTelemetry();
  const report = (error: unknown): void => {
    telemetry.error(error, { source: ${JSON.stringify(scaffold.name)} });
  };
  return (
    <Page title=${JSON.stringify(scaffold.title)}>
      <DataTable
        label=${JSON.stringify(scaffold.title)}
        columns={columns}
        data={rows.data?.data}
        getRowId={(row) => ${rowId(fields)}}
        loading={rows.isPending}
        error={rows.error}
        onRetry={() => {
          rows.refetch().catch(report);
        }}
      />
    </Page>
  );
}

export { ${scaffold.component} };
`;
}

interface Shown {
  readonly code: string;
  readonly ui: readonly string[];
}

/** A number by its display format, or by Num's defaults where the API declares none. */
function numberShown(field: Field, read: string): Shown {
  const shown = field.required ? read : `${read} ?? null`;
  return field.format === undefined
    ? { code: `<Num value={${shown}} />`, ui: ["Num"] }
    : { code: `<Formatted value={${shown}} format={${field.format}} />`, ui: ["Formatted"] };
}

/** What the detail shows of a field: a number by its format, an instant by DateTime, a flag as yes or no. */
function detailValue(field: Field): Shown {
  const read = `value${access(field.name)}`;
  const present = field.required && !field.nullable;
  if (field.kind === "number") {
    return numberShown(field, read);
  }
  if (field.kind === "boolean") {
    return { code: present ? `{${read} ? "Yes" : "No"}` : `{String(${read} ?? "")}`, ui: [] };
  }
  return field.kind === "instant" && present
    ? { code: `<DateTime value={${read}} />`, ui: ["DateTime"] }
    : { code: `{${read}}`, ui: [] };
}

/** `vp run new page`: a card of each field the operation answers. */
function detailPage(scaffold: Scaffold): string {
  const { fields } = scaffold.fields;
  const shown = fields.map((field) => ({ field, shown: detailValue(field) }));
  const ui = ["Card", "CardContent", "Page", "QueryState", ...shown.flatMap((one) => one.shown.ui)];
  const rows = shown
    .map(
      ({ field, shown: { code } }) =>
        `          <dt className="text-muted-foreground">${field.label}</dt>\n          <dd>${code}</dd>`,
    )
    .join("\n");
  const comment = opening(
    `${scaffold.title}: what operation ${scaffold.operation.id} answers (${scaffold.operation.method} ${scaffold.operation.template}), as vp run new page wrote it, each field in a card, each number shown by the display format the API declares.${skippedNote(scaffold)}`,
  );
  return `${comment}

${importLines(scaffold, ui, [])}
${typeLine(scaffold, false)}
function Details({ value }: { readonly value: ${scaffold.model.name} }): ReactElement {
  return (
    <Card>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
${rows}
        </dl>
      </CardContent>
    </Card>
  );
}

function ${scaffold.component}(): ReactElement {
${queryLines(scaffold, "detail")}
  return (
    <Page title=${JSON.stringify(scaffold.title)}>
      <QueryState query={detail}>{(response) => <Details value={response.data} />}</QueryState>
    </Page>
  );
}

export { ${scaffold.component} };
`;
}

export { columnLine, detailPage, tablePage };
