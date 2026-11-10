/* The rule that refuses `fetch` in app code was `eslint/no-restricted-globals` and is `basis/no-fetch` (step 6.8.2), so
 * a comment that turns the old one off now turns off a rule that is off, which Oxlint reports, and leaves `fetch`
 * refused. This renames the rule in every `eslint-` or `oxlint-` disable or enable comment, as written with its
 * plugin or without, and leaves the rest of the comment, its reason after `--` among them, as it was. The comment is
 * found by Oxc's parser, so text in a string or a template that only looks like one is never touched. A comment
 * that turns `basis/no-fetch` off is itself refused by `basis/no-suppressions`, unless the allowlist names it, and
 * that ERROR line says what replaces it. */

import { parseSync } from "vite-plus";

import type { Codemod, CodemodFile } from "#preset/codemods.ts";

const oldRule = /(?<![\w/@-])(?:eslint\/)?no-restricted-globals(?![\w/-])/gu;
const newRule = "basis/no-fetch";
const directive =
  /^(?<lead>\s*(?:eslint|oxlint)-(?:disable|enable)(?:-next-line|-line)?)(?<rules>(?:\s(?:(?!--)[\s\S])*)?)(?<reason>--[\s\S]*)?$/u;

/** A comment's text, inside its markers, with the old rule renamed, or `undefined` when it names the old rule nowhere. */
function renamed(value: string): string | undefined {
  const match = directive.exec(value);
  const { lead = "", reason = "", rules = "" } = match?.groups ?? {};
  const named = rules.replaceAll(oldRule, newRule);
  if (match === null || named === rules) {
    return undefined;
  }
  // A comment that named both rules names the new one once.
  const listed = named.split(",").map((rule) => rule.trim());
  const unique = [...new Set(listed)];
  const once =
    unique.length === listed.length
      ? named
      : ` ${unique.join(", ")}${/\s$/u.test(named) ? " " : ""}`;
  return `${lead}${once}${reason}`;
}

/** A comment as Oxc's parser gives it: its kind, its text inside its markers, and where it is. */
type Comment = ReturnType<typeof parseSync>["comments"][number];

/** `text` with each of its `comments` that names the old rule rewritten, the last first, so the earlier ones stay
 * where the parser found them. */
function rewritten(text: string, comments: readonly Comment[]): string {
  let result = text;
  for (const comment of comments.toReversed()) {
    const value = renamed(comment.value);
    if (value !== undefined) {
      const written = comment.type === "Line" ? `//${value}` : `/*${value}*/`;
      result = `${result.slice(0, comment.start)}${written}${result.slice(comment.end)}`;
    }
  }
  return result;
}

/** The file's text with each of its directive comments renamed. */
function transform({ path, text }: CodemodFile): string {
  const parsed = parseSync(path, text);
  const [first] = parsed.errors;
  if (first !== undefined) {
    throw new Error(`it does not parse: ${first.message}`);
  }
  return rewritten(text, parsed.comments);
}

const codemod: Codemod = {
  description: `renames eslint/no-restricted-globals to ${newRule} in the comments that turn it off`,
  extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"],
  transform,
};

export { codemod };
