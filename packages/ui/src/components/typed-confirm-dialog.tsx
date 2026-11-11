/* The typed confirmation: an action that cannot be undone, such as deleting a book or closing a fund, asks for the
 * name of what it acts on to be typed before its button works, so a click alone cannot do it. */

import { useId, useState } from "react";
import type { ReactElement, ReactNode } from "react";

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
import { Input } from "./input.tsx";
import { Label } from "./label.tsx";

interface TypedConfirmDialogProps {
  /** Whether the dialog is open; the page holds it, as the action's button opens it. */
  readonly open: boolean;
  /** Called to open or close it: Cancel, Escape and a confirmed action close it. */
  readonly onOpenChange: (open: boolean) => void;
  /** What is asked, such as "Delete the book Rates?". */
  readonly title: string;
  /** What the action does and what it cannot undo. */
  readonly description: ReactNode;
  /** The text to type, such as the book's name; it must match exactly, case and all. */
  readonly confirmText: string;
  /** The button's words, such as "Delete book". */
  readonly actionLabel: string;
  /** Runs once the text matches and the button is pressed; the dialog closes. */
  readonly onConfirm: () => void;
}

/** The field that asks for the text, and the buttons, which start again each time the dialog opens. */
function ConfirmBody({
  confirmText,
  actionLabel,
  onConfirm,
  onOpenChange,
}: Pick<
  TypedConfirmDialogProps,
  "confirmText" | "actionLabel" | "onConfirm" | "onOpenChange"
>): ReactElement {
  const [typed, setTyped] = useState("");
  const id = useId();
  const matches = typed === confirmText;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (matches) {
          onConfirm();
          onOpenChange(false);
        }
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>
          Type <span className="font-semibold">{confirmText}</span> to confirm
        </Label>
        <Input
          id={id}
          value={typed}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setTyped(event.currentTarget.value);
          }}
        />
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction type="submit" variant="destructive" disabled={!matches}>
          {actionLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </form>
  );
}

/**
 * A dialog that asks for a name to be typed before an action that cannot be undone.
 *
 * @use For deleting or closing something with consequences, such as a book, a fund or a saved model. For an action a
 * click may confirm, use AlertDialog.
 * @see AlertDialog, UnsavedChangesGuard
 *
 * @example
 * ```tsx
 * import { Button, TypedConfirmDialog } from "@basis/ui";
 * import { useState } from "react";
 *
 * const [open, setOpen] = useState(false);
 *
 * <>
 *   <Button variant="destructive" onClick={() => { setOpen(true); }}>Delete book</Button>
 *   <TypedConfirmDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="Delete the book Rates?"
 *     description="Its positions move to Unassigned. This cannot be undone."
 *     confirmText="Rates"
 *     actionLabel="Delete book"
 *     onConfirm={() => undefined}
 *   />
 * </>;
 * ```
 */
function TypedConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  actionLabel,
  onConfirm,
}: TypedConfirmDialogProps): ReactElement {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {open ? (
          <ConfirmBody
            confirmText={confirmText}
            actionLabel={actionLabel}
            onConfirm={onConfirm}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { TypedConfirmDialog };
export type { TypedConfirmDialogProps };
