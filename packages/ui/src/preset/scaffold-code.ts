/* How a scaffold writes text from the API's document into the code of a page: a JSX attribute's value, JSX text, and
 * a comment, each so that quotes, braces, angle brackets and apostrophes in a schema's description or an operation's
 * summary leave the page as valid as the lint wants it. And a route's path parameter, which the router gives as
 * text, made the type the API declares before it reaches the generated hook. */

import { resolved } from "./api-operations.ts";
import type { ApiParameter, Schema } from "./api-operations.ts";

/** A JSX attribute as the formatter and `react/jsx-curly-brace-presence` want it: `name="text"`, `name='text'` for
 * text that holds a double quote, and `name={"text"}` only for text that holds both quotes or a line break, which no
 * JSX string can. */
function jsxAttribute(name: string, text: string): string {
  if (text.includes("\n") || (text.includes('"') && text.includes("'"))) {
    return `${name}={${JSON.stringify(text)}}`;
  }
  return text.includes('"') ? `${name}='${text}'` : `${name}="${text}"`;
}

const entities: Readonly<Record<string, string>> = {
  '"': "&quot;",
  "&": "&amp;",
  "'": "&apos;",
  "<": "&lt;",
  ">": "&gt;",
  "{": "&#123;",
  "}": "&#125;",
};

/** Text as a JSX child, each character JSX or `react/no-unescaped-entities` would read as code written as an entity. */
function jsxText(text: string): string {
  return text.replaceAll(/["&'<>{}]/gu, (character) => entities[character] ?? character);
}

/** Text for a comment, with no `*\/` to end it early. */
function commentText(text: string): string {
  return text.replaceAll("*/", String.raw`*\/`);
}

/** What the API declares a path parameter to hold: text, a number, or one of a list of choices. */
type ParameterKind = "choice" | "number" | "text";

/** A path parameter's kind and choices, from its schema. */
function parameterKind(
  document: Schema,
  parameter: ApiParameter,
): { readonly kind: ParameterKind; readonly options: readonly string[] } {
  const schema = resolved(document, parameter.schema);
  const choices: unknown = schema["enum"];
  if (schema["type"] === "integer" || schema["type"] === "number") {
    return { kind: "number", options: [] };
  }
  return Array.isArray(choices) && choices.every((choice) => typeof choice === "string")
    ? { kind: "choice", options: choices.map(String) }
    : { kind: "text", options: [] };
}

/** What a page passes for a route's parameter: the text itself, the number it reads as, or the choice it names. */
function parameterArgument({
  kind,
  variable,
}: {
  readonly kind: ParameterKind;
  readonly variable: string;
}): string {
  if (kind === "number") {
    return `Number(${variable})`;
  }
  return kind === "choice" ? `${variable}Of(${variable})` : variable;
}

/** The function a page reads a choice parameter with, as `sideOf`: the route's text as one of the API's choices, or
 * an error the app's error boundary shows for an address that names none. */
function choiceReader({
  name,
  options,
  variable,
}: {
  readonly name: string;
  readonly options: readonly string[];
  readonly variable: string;
}): string {
  const union = options.map((option) => JSON.stringify(option)).join(" | ");
  return `
/** The route's ${name}, one of those the API takes. */
function ${variable}Of(value: string): ${union} {
  const found = ([${options.map((option) => JSON.stringify(option)).join(", ")}] as const).find((one) => one === value);
  if (found === undefined) {
    throw new Error(\`The address names the ${name} \${value}, which is none of ${options.join(", ")}.\`);
  }
  return found;
}
`;
}

export { choiceReader, commentText, jsxAttribute, jsxText, parameterArgument, parameterKind };
export type { ParameterKind };
