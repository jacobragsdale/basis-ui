/* The changelog's shape, which `vp run upgrade` reads (src/preset/changelog.ts): the shipped CHANGELOG.md parses,
 * every codemod's folder is a release it lists, and each way of writing it wrong fails with its fix. Versions compare
 * as semver orders them, and a codemod's change prints as the lines it removes and adds. */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vite-plus/test";

import { parseChangelog, releasesBetween, whatToDo } from "#preset/changelog.ts";
import { compareVersions } from "#preset/installed.ts";
import { changedLines } from "#preset/line-diff.ts";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const shipped = readFileSync(path.join(packageRoot, "CHANGELOG.md"), "utf8");

function failure(text: string): string {
  try {
    parseChangelog(text);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}

describe("the shipped CHANGELOG.md", () => {
  test("parses, Unreleased first if anywhere, then releases newest first, each entry a bullet", () => {
    const sections = parseChangelog(shipped);
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      // Unreleased is empty from a release until the next change lands; a release lists what it brings.
      if (section.version !== undefined) {
        expect(section.entries.length).toBeGreaterThan(0);
      }
      for (const entry of section.entries) {
        expect(entry).toMatch(/^- \S/u);
      }
    }
  });

  test("lists the release of every codemod's folder, or Unreleased for src/codemods/unreleased", () => {
    const sections = parseChangelog(shipped);
    const listed = new Set(sections.map(({ version }) => version ?? "unreleased"));
    for (const folder of readdirSync(path.join(packageRoot, "src/codemods"))) {
      expect(listed).toContain(folder);
    }
  });
});

describe("parseChangelog", () => {
  const good = [
    "# Changelog",
    "",
    "What changed.",
    "",
    "## Unreleased",
    "",
    "- A change. What to do: run vp run sync,",
    "  then vp run verify.",
    "",
    "## 0.2.0 - 2026-12-01",
    "",
    "- Another.",
    "## 0.2.0-rc.1 - 2026-11-28",
    "- A candidate.",
    "",
  ].join("\n");

  test("reads each section's version, date and entries, the lines of each entry as written", () => {
    expect(parseChangelog(good)).toStrictEqual([
      {
        date: undefined,
        entries: ["- A change. What to do: run vp run sync,\n  then vp run verify."],
        version: undefined,
      },
      { date: "2026-12-01", entries: ["- Another."], version: "0.2.0" },
      { date: "2026-11-28", entries: ["- A candidate."], version: "0.2.0-rc.1" },
    ]);
  });

  test.each([
    [
      "## v0.3.0",
      "ERROR CHANGELOG.md line 2 is a heading of no release: write it as ## Unreleased, or ## VERSION - DATE for a release, such as ## 0.4.0 - 2026-12-01.",
    ],
    [
      "## 0.3.0 - 2026-13-45",
      "ERROR CHANGELOG.md line 2 dates its release 2026-13-45, no day: write the date as YYYY-MM-DD.",
    ],
  ])("a heading %s fails with its fix", (heading, message) => {
    expect(failure(`# Changelog\n${heading}\n- An entry.\n`)).toBe(message);
  });

  test("a release below an older one, or a second Unreleased, fails with its fix", () => {
    expect(failure("# Changelog\n## 0.1.0 - 2026-11-01\n## 0.2.0 - 2026-12-01\n")).toBe(
      "ERROR CHANGELOG.md line 3 lists 0.2.0 below 0.1.0: list the releases newest first, each once.",
    );
    expect(failure("# Changelog\n## 0.1.0 - 2026-11-01\n## Unreleased\n")).toBe(
      "ERROR CHANGELOG.md line 3 is a second Unreleased, or one below a release: keep one, first.",
    );
  });

  test("a line that is no entry, or a file without its title, fails with its fix", () => {
    expect(failure("# Changelog\n## Unreleased\nA paragraph.\n")).toBe(
      "ERROR CHANGELOG.md line 3 is neither an entry nor part of one: start an entry with - , and indent its other lines by two spaces.",
    );
    expect(failure("# Changes\n")).toBe(
      "ERROR CHANGELOG.md line 1 is not # Changelog: start the file with that title.",
    );
  });

  test("releasesBetween takes the sections after the installed version, Unreleased as the package's own", () => {
    const sections = parseChangelog(good);
    expect(
      releasesBetween(sections, "0.2.0-rc.1", "0.3.0").map(({ version }) => version),
    ).toStrictEqual([undefined, "0.2.0"]);
    expect(releasesBetween(sections, "0.2.0", "0.2.0")).toStrictEqual([]);
    expect(
      releasesBetween(sections, "0.1.0", "0.2.0-rc.1").map(({ version }) => version),
    ).toStrictEqual([undefined, "0.2.0-rc.1"]);
  });

  test("whatToDo gives an entry's ask in one line, or nothing", () => {
    const [unreleased] = parseChangelog(good);
    expect(whatToDo(unreleased?.entries[0] ?? "")).toBe("run vp run sync, then vp run verify.");
    expect(whatToDo("- A fix.")).toBeUndefined();
  });
});

describe("compareVersions", () => {
  test.each([
    ["0.1.0", "0.2.0", -1],
    ["0.10.0", "0.9.0", 1],
    ["1.0.0", "1.0.0", 0],
    ["1.0.0-rc.1", "1.0.0", -1],
    ["1.0.0-rc.2", "1.0.0-rc.10", -1],
    ["1.0.0-alpha", "1.0.0-alpha.1", -1],
    ["1.0.0-1", "1.0.0-alpha", -1],
  ])("%s against %s is %i", (left, right, order) => {
    expect(compareVersions(left, right)).toBe(order);
    expect(compareVersions(right, left)).toBe(order === 0 ? 0 : -order);
  });
});

describe("changedLines", () => {
  test("gives each line removed at its number before, and each added at its number after", () => {
    expect(changedLines("a\nb\nc\nd\n", "a\nB\nc\nd\ne\n")).toStrictEqual([
      { line: 2, mark: "-", text: "b" },
      { line: 2, mark: "+", text: "B" },
      { line: 5, mark: "+", text: "e" },
    ]);
  });
});
