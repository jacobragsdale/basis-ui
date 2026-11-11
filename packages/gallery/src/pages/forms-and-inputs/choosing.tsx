/* MultiSelect, NumberField and Toolbar on the forms and inputs page: books chosen several at a time with a count and
 * "Select all", a look-back stepped in days, and a row of a grid's actions. Shown alone, the multi-select opens. */

import {
  DownloadIcon,
  Label,
  MultiSelect,
  NumberField,
  RefreshCwIcon,
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarSeparator,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";
import { usePictured } from "#pages/shot.ts";
import { Demo } from "./demo.tsx";

const books = [
  { label: "Rates", value: "rates" },
  { label: "Agency", value: "agency" },
  { label: "Credit", value: "credit" },
  { label: "High yield", value: "hy" },
  { label: "Munis", value: "munis" },
] as const;

function MultiSelectSection(): ReactElement {
  const pictured = usePictured();
  return (
    <Section
      title="MultiSelect"
      description="Several choices from a short list: the trigger counts them or names the one, and Select all chooses every option, or clears them."
    >
      <div className="flex flex-wrap items-start gap-6">
        <Demo label="three chosen">
          <Label htmlFor="books-some">Books</Label>
          <MultiSelect
            id="books-some"
            options={books}
            noun="books"
            defaultValue={["rates", "agency", "credit"]}
            defaultOpen={pictured}
            className="w-56"
          />
        </Demo>
        <Demo label="one, and all">
          <Label htmlFor="books-one">One book</Label>
          <MultiSelect
            id="books-one"
            options={books}
            noun="books"
            defaultValue={["credit"]}
            className="w-56"
          />
          <Label htmlFor="books-all">Every book</Label>
          <MultiSelect
            id="books-all"
            options={books}
            noun="books"
            defaultValue={books.map((book) => book.value)}
            className="w-56"
          />
        </Demo>
      </div>
    </Section>
  );
}

function NumberFieldSection(): ReactElement {
  return (
    <Section
      title="NumberField"
      description="A small count stepped by its buttons, the arrow keys or the wheel, held between its bounds."
    >
      <div className="flex flex-wrap items-start gap-6">
        <Demo label="days">
          <Label htmlFor="lookback">Look back, in days</Label>
          <NumberField id="lookback" defaultValue={30} min={1} max={365} className="w-40" />
        </Demo>
        <Demo label="at its least">
          <Label htmlFor="contracts">Contracts</Label>
          <NumberField id="contracts" defaultValue={1} min={1} className="w-40" />
        </Demo>
        <Demo label="disabled">
          <Label htmlFor="precision">Decimals</Label>
          <NumberField id="precision" defaultValue={2} disabled className="w-40" />
        </Demo>
      </div>
    </Section>
  );
}

function ToolbarSection(): ReactElement {
  return (
    <Section
      title="Toolbar"
      description="A row of actions, such as a grid's: Tab reaches it once, and the arrow keys move between its buttons."
    >
      <Toolbar aria-label="Positions" className="self-start">
        <ToolbarGroup aria-label="Data">
          <ToolbarButton>
            <RefreshCwIcon data-icon="inline-start" />
            Refresh
          </ToolbarButton>
          <ToolbarButton>Group by book</ToolbarButton>
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarButton>
          <DownloadIcon data-icon="inline-start" />
          Export
        </ToolbarButton>
      </Toolbar>
    </Section>
  );
}

export { MultiSelectSection, NumberFieldSection, ToolbarSection };
