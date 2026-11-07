/* Picks filter values from a column's own values, searched by the engine with the view's other filters applied, as a
 * spreadsheet's filter list does. Values travel as exact JSON, so a decimal or a large integer matches what was
 * picked. One list is asked for at a time: while one is on its way, only the newest search waits for it, so typing
 * searches on every keystroke without a backlog on a large table. */

import { Checkbox, Input } from "@basis/ui";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { DistinctValues } from "#engine/view-types.ts";
import { pathValue } from "#format.ts";
import type { LayoutScalar } from "#layout/layout.ts";

/** Lists a column's values for a search. */
type ValueSource = (column: string, search: string, limit: number) => Promise<DistinctValues>;

/** How many values one search shows. */
const limit = 200;

interface Option {
  readonly key: string;
  readonly value: LayoutScalar;
  readonly text: string;
  readonly rows: string;
}

/** A list, and the column and search it answers. */
interface Listed {
  readonly asked: string;
  readonly options: readonly Option[];
  readonly truncated: boolean;
  readonly note: string;
}

interface ValuePickerProps {
  readonly column: string;
  readonly source: ValueSource;
  /** The values already chosen. */
  readonly values: readonly LayoutScalar[];
  /** Whether the list can be searched: the engine searches text columns only. */
  readonly searchable: boolean;
  readonly onChange: (values: readonly LayoutScalar[]) => void;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function optionsOf(result: DistinctValues): readonly Option[] {
  return result.values.map((entry) => {
    const value = pathValue(entry.value);
    return {
      key: JSON.stringify(value),
      rows: entry.rows.toLocaleString("en-US"),
      text: entry.text,
      value,
    };
  });
}

/** Asks one list at a time; a newer ask waits for the one on its way, replacing any already waiting. */
class OneAtATime {
  #running = false;
  #waiting: (() => Promise<void>) | null = null;

  public ask(work: () => Promise<void>): void {
    if (this.#running) {
      this.#waiting = work;
      return;
    }
    this.#run(work).catch(reportError);
  }

  async #run(work: () => Promise<void>): Promise<void> {
    this.#running = true;
    try {
      await work();
    } finally {
      this.#running = false;
      const next = this.#waiting;
      this.#waiting = null;
      if (next !== null) {
        this.ask(next);
      }
    }
  }
}

/** Asks for the list of a column and search, one at a time, handing it to `listed` unless the asking ends first;
 * returns a function that ends it. */
function ask(
  queue: OneAtATime,
  {
    source,
    column,
    search,
  }: { readonly source: ValueSource; readonly column: string; readonly search: string },
  listed: (list: Listed) => void,
): () => void {
  let current = true;
  const asked = JSON.stringify([column, search]);
  queue.ask(async () => {
    if (!current) {
      return;
    }
    try {
      const result = await source(column, search, limit);
      listed({
        asked,
        note: "No values match.",
        options: optionsOf(result),
        truncated: result.truncated,
      });
    } catch (error: unknown) {
      listed({ asked, note: describe(error), options: [], truncated: false });
    }
  });
  return () => {
    current = false;
  };
}

/** The list for a column and search, asked for whenever either changes; null while it loads. */
function useListed(source: ValueSource, column: string, search: string): Listed | null {
  const queue = useMemo(() => new OneAtATime(), []);
  const [listed, setListed] = useState<Listed | null>(null);
  useEffect(
    () => ask(queue, { column, search, source }, setListed),
    [column, queue, search, source],
  );
  return listed?.asked === JSON.stringify([column, search]) ? listed : null;
}

/** One value, ticked when it is kept, with how many rows hold it. */
function Choice({
  option,
  chosen,
  toggle,
}: {
  readonly option: Option;
  readonly chosen: boolean;
  readonly toggle: () => void;
}): ReactNode {
  return (
    <li>
      <label className="flex items-center gap-1.5 text-sm">
        <Checkbox checked={chosen} onCheckedChange={toggle} />
        <span className="flex-1 truncate">{option.text === "" ? "(blank)" : option.text}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{option.rows}</span>
      </label>
    </li>
  );
}

/** The values kept after `option` is ticked or unticked, exactly as JSON gave them. */
function toggled(
  values: readonly LayoutScalar[],
  options: readonly Option[],
  option: Option,
): readonly LayoutScalar[] {
  const known = new Map([
    ...values.map((value): [string, LayoutScalar] => [JSON.stringify(value), value]),
    ...options.map((entry): [string, LayoutScalar] => [entry.key, entry.value]),
  ]);
  const next = new Set(values.map((value) => JSON.stringify(value)));
  if (next.has(option.key)) {
    next.delete(option.key);
  } else {
    next.add(option.key);
  }
  return [...next].flatMap((key) => (known.has(key) ? [known.get(key) ?? null] : []));
}

/** The value picker. */
function ValuePicker({
  column,
  source,
  values,
  searchable,
  onChange,
}: ValuePickerProps): ReactNode {
  const [search, setSearch] = useState({ column, text: "" });
  // A new column starts a new list, unsearched.
  const text = search.column === column ? search.text : "";
  const listed = useListed(source, column, text);
  const chosen = new Set(values.map((value) => JSON.stringify(value)));
  const options = listed?.options ?? [];
  return (
    <div className="flex flex-col gap-1">
      {searchable ? (
        <Input
          type="search"
          aria-label="Search values"
          placeholder="Search…"
          value={text}
          onChange={(event) => {
            setSearch({ column, text: event.currentTarget.value });
          }}
        />
      ) : null}
      <ul aria-label="Values" className="max-h-56 overflow-auto">
        {options.length === 0 ? (
          <li className="text-xs text-muted-foreground">{listed?.note ?? "Loading…"}</li>
        ) : null}
        {options.map((option) => (
          <Choice
            key={option.key}
            option={option}
            chosen={chosen.has(option.key)}
            toggle={() => {
              onChange(toggled(values, options, option));
            }}
          />
        ))}
      </ul>
      {listed?.truncated === true ? (
        <p className="text-xs text-muted-foreground">
          Showing the first {limit}. Search to narrow them.
        </p>
      ) : null}
    </div>
  );
}

export { ValuePicker };
export type { ValueSource };
