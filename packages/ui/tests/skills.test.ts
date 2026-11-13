/* The skills' front matter, which every agent that reads `.agents/skills/` parses as YAML. Claude Code tolerates a
 * plain scalar holding `: `, and strict parsers (js-yaml, yaml) refuse it, so each value is held to a form every
 * parser reads alike: `name` a bare word that names the skill's folder, and `description` a double-quoted string
 * with JSON's escapes, which YAML's double-quoted scalars share. */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vite-plus/test";

const skills = fileURLToPath(new URL("../skills", import.meta.url));
const names = readdirSync(skills, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

/** The lines between a file's opening `---` and the next. */
function frontMatter(text: string): readonly string[] {
  const lines = text.split("\n");
  const end = lines.indexOf("---", 1);
  return lines[0] === "---" && end > 0 ? lines.slice(1, end) : [];
}

describe.each(names)("the skill %s", (name) => {
  const lines = frontMatter(readFileSync(path.join(skills, name, "SKILL.md"), "utf8"));

  test("names itself by its folder, and quotes its description as every YAML parser reads it", () => {
    expect(lines.map((line) => line.slice(0, line.indexOf(":")))).toStrictEqual([
      "name",
      "description",
    ]);
    expect(lines[0]).toBe(`name: ${name}`);
    const description = lines[1]?.slice("description: ".length) ?? "";
    expect(description).toMatch(/^".+"$/u);
    const parsed: unknown = JSON.parse(description);
    expect(typeof parsed === "string" && parsed.length > 0).toBe(true);
  });
});
