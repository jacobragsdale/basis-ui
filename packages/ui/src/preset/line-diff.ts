/* The lines a change to a file removes and adds, as `vp run upgrade --dry-run` prints a codemod's change: each line
 * that goes, with `-` and its number before, and each that comes, with `+` and its number after. */

/** The most cells the comparison of a change's middle may take; past it, the middle is shown as removed and added
 * whole, which a codemod's change, a few lines, never reaches. */
const largestTable = 4_000_000;

/** One line of a change: `-` for one removed, at its number before, or `+` for one added, at its number after. */
interface ChangedLine {
  readonly mark: "-" | "+";
  readonly line: number;
  readonly text: string;
}

/** How many lines `before` and `after` share at their start, and then at their end, never overlapping. */
function sharedEnds(
  before: readonly string[],
  after: readonly string[],
): { readonly head: number; readonly tail: number } {
  const shorter = Math.min(before.length, after.length);
  let head = 0;
  while (head < shorter && before[head] === after[head]) {
    head += 1;
  }
  let tail = 0;
  while (tail < shorter - head && before.at(-1 - tail) === after.at(-1 - tail)) {
    tail += 1;
  }
  return { head, tail };
}

/** The length of the longest common run of lines from each position of `before` and `after` to their ends. */
function commonTable(before: readonly string[], after: readonly string[]): readonly Uint32Array[] {
  const table = Array.from({ length: before.length + 1 }, () => new Uint32Array(after.length + 1));
  for (let left = before.length - 1; left >= 0; left -= 1) {
    const row = table[left] ?? new Uint32Array();
    const below = table[left + 1] ?? new Uint32Array();
    for (let right = after.length - 1; right >= 0; right -= 1) {
      row[right] =
        before[left] === after[right]
          ? (below[right + 1] ?? 0) + 1
          : Math.max(below[right] ?? 0, row[right + 1] ?? 0);
    }
  }
  return table;
}

/** Where a removed or added line of the middle is: its index in the lines before, or in the lines after. */
interface Step {
  readonly mark: "-" | "+";
  readonly index: number;
}

/** The middles a change compares: the lines before it and after it. */
interface Middles {
  readonly before: readonly string[];
  readonly after: readonly string[];
}

/** One move along the middles from `left` in the lines before and `right` in the lines after: past a line both keep,
 * or past one removed or added, as the table of common runs says loses fewest. */
function advance(
  table: readonly Uint32Array[],
  { after, before }: Middles,
  [left, right]: readonly [number, number],
): { readonly at: readonly [number, number]; readonly step: Step | undefined } {
  if (left < before.length && before[left] === after[right]) {
    return { at: [left + 1, right + 1], step: undefined };
  }
  const drop =
    right >= after.length ||
    (left < before.length && (table[left + 1]?.[right] ?? 0) >= (table[left]?.[right + 1] ?? 0));
  return drop
    ? { at: [left + 1, right], step: { index: left, mark: "-" } }
    : { at: [left, right + 1], step: { index: right, mark: "+" } };
}

/** The steps that remove the whole middle before and add the whole middle after. */
function wholeSteps({ after, before }: Middles): readonly Step[] {
  return [
    ...before.map((_line, index) => ({ index, mark: "-" as const })),
    ...after.map((_line, index) => ({ index, mark: "+" as const })),
  ];
}

/** The steps along the middles, by the table of their common runs, that remove and add the fewest lines. */
function walk(table: readonly Uint32Array[], middles: Middles): readonly Step[] {
  const { after, before } = middles;
  const found: Step[] = [];
  let at: readonly [number, number] = [0, 0];
  while (at[0] < before.length || at[1] < after.length) {
    const moved = advance(table, middles, at);
    if (moved.step !== undefined) {
      found.push(moved.step);
    }
    ({ at } = moved);
  }
  return found;
}

/** The steps from the start of both middles to their ends that remove and add the fewest lines. */
function steps(middles: Middles): readonly Step[] {
  const { after, before } = middles;
  return before.length * after.length > largestTable
    ? wholeSteps(middles)
    : walk(commonTable(before, after), middles);
}

/** The lines `before` loses and `after` gains, in the order a reader meets them. */
function changedLines(before: string, after: string): readonly ChangedLine[] {
  const old = before.split("\n");
  const next = after.split("\n");
  const { head, tail } = sharedEnds(old, next);
  const oldMiddle = old.slice(head, old.length - tail);
  const nextMiddle = next.slice(head, next.length - tail);
  return steps({ after: nextMiddle, before: oldMiddle }).map(({ index, mark }) => ({
    line: head + index + 1,
    mark,
    text: (mark === "-" ? oldMiddle[index] : nextMiddle[index]) ?? "",
  }));
}

/** The width of a line's number, right-aligned, as a file of up to 9,999 lines needs. */
const numberWidth = 4;

/** The changed lines, one a line, indented under the file's path. */
function changeText(before: string, after: string): string {
  return changedLines(before, after)
    .map(({ line, mark, text }) => `      ${String(line).padStart(numberWidth)} ${mark} ${text}`)
    .join("\n");
}

export { changeText, changedLines };
export type { ChangedLine };
