/* Dialog and Alert Dialog on the overlays and menus page: a dialog that edits a position, and alert dialogs that
 * confirm deleting a saved view and discarding changes. */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  TrashIcon,
} from "@basis/ui";
import { useState } from "react";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";
import { usePictured } from "#pages/shot.ts";

const position = [
  ["Security", "UST 4.25% 11/15/2034"],
  ["Model", "Core Plus"],
  ["Target weight", "4.50%"],
  ["Current weight", "4.12%"],
] as const;

/** A dialog that edits a position's target weight. */
function DialogExample(): ReactElement {
  return (
    <Dialog defaultOpen={usePictured()}>
      <DialogTrigger render={<Button variant="outline" />}>Edit position</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit position</DialogTitle>
          <DialogDescription>Change the target weight of a holding in its model.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-2 gap-2">
          {position.map(([term, detail]) => (
            <div key={term} className="contents">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="text-right tabular-nums">{detail}</dd>
            </div>
          ))}
        </dl>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <DialogClose render={<Button />}>Save</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** An alert dialog that confirms deleting a saved view. Its action closes it once it has run. */
function AlertDialogExample(): ReactElement {
  const [open, setOpen] = useState(usePictured());
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="destructive" />}>Delete view</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <TrashIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete the saved view?</AlertDialogTitle>
          <AlertDialogDescription>
            Duration by sector is removed for everyone it is shared with. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              setOpen(false);
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The small alert dialog, whose text is centred and whose actions sit side by side. */
function SmallAlertDialogExample(): ReactElement {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" />}>Discard changes</AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
          <AlertDialogDescription>
            The order ticket goes back to its last saved state.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogCancel variant="default">Discard</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DialogSections(): ReactElement {
  return (
    <>
      <Section
        title="Dialog"
        description="A window over the page that holds the user until Escape, a click outside or its close button closes it."
      >
        <div className="flex flex-wrap gap-2">
          <DialogExample />
        </div>
      </Section>
      <Section
        title="Alert Dialog"
        description="A dialog that asks to confirm an action. A click outside does not close it; Escape and Cancel do."
      >
        <div className="flex flex-wrap gap-2">
          <AlertDialogExample />
          <SmallAlertDialogExample />
        </div>
      </Section>
    </>
  );
}

export { AlertDialogExample, DialogExample, DialogSections, SmallAlertDialogExample };
