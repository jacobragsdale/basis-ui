/* TypedConfirmDialog on the overlays and menus page: deleting a book, which asks for its name to be typed first.
 * Shown alone, it opens. */

import { Button, TypedConfirmDialog } from "@basis/ui";
import { useState } from "react";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";
import { usePictured } from "#pages/shot.ts";

function TypedConfirmExample(): ReactElement {
  const [open, setOpen] = useState(usePictured());
  const [deleted, setDeleted] = useState<string>();
  return (
    <div className="flex items-center gap-4">
      <Button
        variant="destructive"
        onClick={() => {
          setOpen(true);
        }}
      >
        Delete book
      </Button>
      <output className="text-sm text-muted-foreground">{deleted}</output>
      <TypedConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete the book Rates?"
        description="Its 214 positions move to Unassigned, and its limits are dropped. This cannot be undone."
        confirmText="Rates"
        actionLabel="Delete book"
        onConfirm={() => {
          setDeleted("Deleted the book Rates.");
        }}
      />
    </div>
  );
}

function TypedConfirmDialogSection(): ReactElement {
  return (
    <Section
      title="TypedConfirmDialog"
      description="An action that cannot be undone asks for the name of what it acts on to be typed, exactly, before its button works."
    >
      <TypedConfirmExample />
    </Section>
  );
}

export { TypedConfirmDialogSection, TypedConfirmExample };
