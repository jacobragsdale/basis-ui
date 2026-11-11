/* Tree and TreeSelect on the forms and inputs page: the firm's books under their desks, a high-yield book chosen. Shown
 * alone, the tree select opens. */

import { Label, Tree, TreeSelect } from "@basis/ui";
import type { TreeNode } from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";
import { openedByKeyboard, usePictured } from "#pages/shot.ts";
import { Demo } from "./demo.tsx";

type Book = "rates" | "ust" | "agency" | "credit" | "ig" | "ig-fin" | "ig-util" | "hy" | "munis";

const books: readonly TreeNode<Book>[] = [
  {
    children: [
      { label: "Treasuries", value: "ust" },
      { label: "Agencies", value: "agency" },
    ],
    label: "Rates",
    value: "rates",
  },
  {
    children: [
      {
        children: [
          { label: "Financials", value: "ig-fin" },
          { label: "Utilities", value: "ig-util" },
        ],
        label: "Investment grade",
        value: "ig",
      },
      { label: "High yield", value: "hy" },
    ],
    label: "Credit",
    value: "credit",
  },
  { label: "Munis", value: "munis" },
];

function TreeSection(): ReactElement {
  return (
    <Section
      title="Tree"
      description="A hierarchy to choose from: the arrows move a row, Right and Left expand, collapse and move between levels, and Enter chooses."
    >
      <Tree aria-label="Books" nodes={books} defaultValue="ig-fin" className="w-72" />
    </Section>
  );
}

function TreeSelectSection(): ReactElement {
  const pictured = usePictured();
  return (
    <Section
      title="TreeSelect"
      description="A node of a hierarchy in a form: the button shows its path, and its popover opens on it with the branches above it expanded."
    >
      <div className="flex flex-wrap items-start gap-6">
        <Demo label="a book, leaves only">
          <Label htmlFor="book">Book</Label>
          <div {...(pictured ? openedByKeyboard() : {})}>
            <TreeSelect
              id="book"
              nodes={books}
              pickerLabel="Books"
              selectable="leaves"
              defaultValue="ig-util"
              className="w-72"
            />
          </div>
        </Demo>
        <Demo label="none chosen">
          <Label htmlFor="desk">Desk or book</Label>
          <TreeSelect id="desk" nodes={books} pickerLabel="Desks and books" className="w-72" />
        </Demo>
      </div>
    </Section>
  );
}

export { TreeSection, TreeSelectSection };
