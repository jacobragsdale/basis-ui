/* The dialogs `SavedViews` opens from its menu: one that names a view, to save a new one or rename one, and one that
 * asks before a view is deleted. Each is controlled by its `open`, since a menu item opens it after the menu closes. */

import { useState } from "react";
import type { ReactElement } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog.tsx";
import { Button } from "./button.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog.tsx";
import { Input } from "./input.tsx";
import { Label } from "./label.tsx";

interface NameDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  /** The name the field starts with. */
  readonly initial: string;
  /** What the button that confirms says, such as "Save view". */
  readonly confirm: string;
  readonly onConfirm: (name: string) => void;
}

/** The field and its form, which start again from `initial` each time the dialog opens. */
function NameForm({
  initial,
  confirm,
  onConfirm,
}: Pick<NameDialogProps, "initial" | "confirm" | "onConfirm">): ReactElement {
  const [name, setName] = useState(initial);
  const trimmed = name.trim();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed !== "") {
          onConfirm(trimmed);
        }
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="saved-view-name">Name</Label>
        <Input
          id="saved-view-name"
          value={name}
          autoComplete="off"
          onChange={(event) => {
            setName(event.currentTarget.value);
          }}
        />
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={trimmed === ""}>
          {confirm}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** A dialog that asks for a view's name. */
function ViewNameDialog({
  open,
  onOpenChange,
  title,
  description,
  ...form
}: NameDialogProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {open ? <NameForm {...form} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/** A dialog that asks before the view `name` is deleted. */
function DeleteViewDialog({
  open,
  onOpenChange,
  name,
  onConfirm,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly name: string;
  readonly onConfirm: () => void;
}): ReactElement {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete the view {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            The page keeps what it shows now; only the saved view goes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Delete view
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { DeleteViewDialog, ViewNameDialog };
