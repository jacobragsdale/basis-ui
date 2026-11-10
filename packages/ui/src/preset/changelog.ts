/* `@basis/ui`'s CHANGELOG.md, which ships in the package, read as `vp run upgrade` reads it. Its shape:
 *
 *   # Changelog
 *   (a paragraph or more saying what it is)
 *   ## Unreleased                 at most one, first: what is merged and not yet released
 *   ## 0.4.0 - 2026-12-01         a release: its version and its date, newest first
 *   - An entry: what changed, then "What to do:" and what an app does about it, its lines after the
 *     first indented by two spaces.
 *
 * A release renames `## Unreleased` to `## VERSION - DATE`, as packages/ui/CONTRIBUTING.md says. Every other line under
 * a heading is a blank or part of an entry, so a test of the shipped changelog finds a section written otherwise. Each
 * failure is one line that starts with ERROR and ends with the fix. */

import { compareVersions } from "./installed.ts";
import { TaskError } from "./task-error.ts";

/** One section of the changelog: a release's version and date, or neither for `## Unreleased`, and its entries, each
 * as written, its first line starting `- `. */
interface Release {
  readonly version: string | undefined;
  readonly date: string | undefined;
  readonly entries: readonly string[];
}

const headingPattern =
  /^## (?:Unreleased|(?<version>\d+\.\d+\.\d+(?:-[\w.]+)?) - (?<date>\d{4}-\d{2}-\d{2}))$/u;

/** The way a heading is written, for the messages. */
const headingShape =
  "## Unreleased, or ## VERSION - DATE for a release, such as ## 0.4.0 - 2026-12-01";

/** The failure for line `index` of the changelog, 0-based, which `problem` describes. */
function malformed(index: number, problem: string): TaskError {
  return new TaskError(`ERROR CHANGELOG.md line ${index + 1} ${problem}`);
}

/** The section a heading line opens. */
function opened(line: string, index: number): Release {
  const match = headingPattern.exec(line);
  if (match === null) {
    throw malformed(index, `is a heading of no release: write it as ${headingShape}.`);
  }
  const { date, version } = match.groups ?? {};
  if (date !== undefined && Number.isNaN(Date.parse(date))) {
    throw malformed(index, `dates its release ${date}, no day: write the date as YYYY-MM-DD.`);
  }
  return { date, entries: [], version };
}

/** The failure, if any, for a section that follows `previous`: Unreleased comes first, and releases newest first. */
function outOfOrder(previous: Release | undefined, next: Release, index: number): void {
  if (previous === undefined) {
    return;
  }
  if (next.version === undefined) {
    throw malformed(index, "is a second Unreleased, or one below a release: keep one, first.");
  }
  if (previous.version !== undefined && compareVersions(next.version, previous.version) >= 0) {
    throw malformed(
      index,
      `lists ${next.version} below ${previous.version}: list the releases newest first, each once.`,
    );
  }
}

/** Adds a line under a heading to its section's entries. */
function added(section: Release, line: string, index: number): Release {
  if (line.startsWith("- ")) {
    return { ...section, entries: [...section.entries, line] };
  }
  const last = section.entries.at(-1);
  if (last === undefined || !line.startsWith("  ")) {
    throw malformed(
      index,
      "is neither an entry nor part of one: start an entry with - , and indent its other lines by two spaces.",
    );
  }
  return { ...section, entries: [...section.entries.slice(0, -1), `${last}\n${line}`] };
}

/** Reads one line into the sections so far. */
function read(sections: Release[], line: string, index: number): void {
  const current = sections.at(-1);
  if (line.startsWith("## ")) {
    const next = opened(line, index);
    outOfOrder(current, next, index);
    sections.push(next);
  } else if (current !== undefined && line.trim() !== "") {
    sections[sections.length - 1] = added(current, line, index);
  }
}

/** The changelog's sections, as they are written, newest first. */
function parseChangelog(text: string): readonly Release[] {
  const lines = text.split("\n");
  if (lines[0] !== "# Changelog") {
    throw malformed(0, "is not # Changelog: start the file with that title.");
  }
  const sections: Release[] = [];
  for (const [index, line] of lines.entries()) {
    read(sections, line, index);
  }
  return sections;
}

/** The sections of the changelog of the package at `version` after `from` and up to that version, newest first, as an
 * upgrade from `from` to that package brings them. Unreleased is the package's own version, since a package built from main holds it
 * unrenamed. */
function releasesBetween(
  sections: readonly Release[],
  from: string,
  version: string,
): readonly Release[] {
  return sections.filter((section) => {
    const released = section.version ?? version;
    return compareVersions(released, from) > 0 && compareVersions(released, version) <= 0;
  });
}

/** An entry's "What to do:" in one line, or `undefined` when it asks nothing of an app. */
function whatToDo(entry: string): string | undefined {
  const [, asked] = entry.split("What to do:");
  return asked === undefined ? undefined : asked.replaceAll(/\s+/gu, " ").trim();
}

/** A section's heading, as the changelog writes it. */
function headingOf(section: Release): string {
  return section.version === undefined
    ? "## Unreleased"
    : `## ${section.version} - ${section.date ?? ""}`;
}

export { headingOf, parseChangelog, releasesBetween, whatToDo };
export type { Release };
