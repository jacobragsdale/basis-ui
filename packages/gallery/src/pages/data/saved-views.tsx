/* SavedViews on the data page: a table of positions sorted by a column the user picks, with its saved views beside the
 * choice. The views live in a store over an API, here one held in the page's memory and seeded with two views, the
 * second the default, as an app's would be over its generated client. Shown alone, its menu opens. */

import {
  Label,
  NativeSelect,
  NativeSelectOption,
  SavedViews,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  apiViewStore,
  numberText,
} from "@basis/ui";
import type { SavedView } from "@basis/ui";
import { useState } from "react";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";
import { openedByKeyboard } from "#pages/shot.ts";

const columns = ["issuer", "book", "par"] as const;
type SortColumn = (typeof columns)[number];

interface PositionsView {
  readonly sortBy: SortColumn;
}

const positions = [
  { book: "Rates", issuer: "US Treasury", par: 25_000_000 },
  { book: "Agency", issuer: "Federal Home Loan Banks", par: 10_000_000 },
  { book: "Credit", issuer: "Acme Power", par: 5_000_000 },
] as const;

function isColumn(value: unknown): value is SortColumn {
  return columns.some((column) => column === value);
}

/** A stored state the table takes: a sort by one of its columns. */
function parseView(state: unknown): PositionsView | undefined {
  return typeof state === "object" && state !== null && "sortBy" in state && isColumn(state.sortBy)
    ? { sortBy: state.sortBy }
    : undefined;
}

/** The API's views, in the page's memory: two, the second the default. */
const saved = new Map<string, SavedView<unknown>>([
  ["by-issuer", { id: "by-issuer", name: "By issuer", state: { sortBy: "issuer" } }],
  ["largest-first", { id: "largest-first", name: "Largest first", state: { sortBy: "par" } }],
]);
let defaultId: string | null = "largest-first";

const store = apiViewStore({
  calls: {
    list: async () => Promise.resolve({ defaultId, views: [...saved.values()] }),
    put: async (view) => Promise.resolve(saved.set(view.id, view)),
    remove: async (id) => Promise.resolve(saved.delete(id)),
    setDefault: async (id) => {
      defaultId = id;
      return Promise.resolve(id);
    },
  },
  key: "gallery.positions",
  parse: parseView,
});

/** The positions in the order the view asks for, the largest first by par. */
function sorted({ sortBy }: PositionsView): readonly (typeof positions)[number][] {
  return positions.toSorted((first, second) =>
    sortBy === "par" ? second.par - first.par : first[sortBy].localeCompare(second[sortBy]),
  );
}

/** The positions, in the view's order. */
function PositionsTable({ view }: { readonly view: PositionsView }): ReactElement {
  return (
    <Table aria-label="Positions by view">
      <TableHeader>
        <TableRow>
          <TableHead>Issuer</TableHead>
          <TableHead>Book</TableHead>
          <TableHead variant="numeric">Par</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted(view).map((position) => (
          <TableRow key={position.issuer}>
            <TableCell>{position.issuer}</TableCell>
            <TableCell>{position.book}</TableCell>
            <TableCell variant="numeric">{numberText(position.par, { decimals: 0 })}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SavedViewsSection(): ReactElement {
  const [view, setView] = useState<PositionsView>({ sortBy: "issuer" });
  return (
    <Section
      title="SavedViews"
      description="A page's views, saved by name in the browser or through the app's API: apply one, save the page's state as a new one, or update, rename, make the default or delete the one shown."
    >
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="positions-sort">Sort by</Label>
          <NativeSelect
            id="positions-sort"
            value={view.sortBy}
            onChange={(event) => {
              const { value } = event.currentTarget;
              if (isColumn(value)) {
                setView({ sortBy: value });
              }
            }}
          >
            {columns.map((column) => (
              <NativeSelectOption key={column} value={column}>
                {column}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div {...openedByKeyboard()}>
          <SavedViews label="Position views" store={store} state={view} onApply={setView} />
        </div>
      </div>
      <PositionsTable view={view} />
    </Section>
  );
}

export { SavedViewsSection };
