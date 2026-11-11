/* The unsaved-changes guard: while a form holds changes not yet saved, leaving the page asks first. A link, Back or
 * a navigation the app makes opens a dialog, Stay or Leave without saving, through TanStack Router's blocker; closing
 * the tab or reloading asks through the browser's own prompt, the only one a page may show then. */

import { useBlocker } from "@tanstack/react-router";
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

interface UnsavedChangesGuardProps {
  /** Whether the page holds changes not yet saved, such as TanStack Form's `form.state.isDirty` until it submits. */
  readonly when: boolean;
  /** The dialog's title; "Leave without saving?" unless set. */
  readonly title?: string | undefined;
  /** What leaving loses; "Your changes on this page are not saved, and leaving discards them." unless set. */
  readonly description?: string | undefined;
}

/**
 * Asks before the page is left while `when` holds: a dialog for a navigation inside the app, and the browser's own
 * prompt for closing the tab or reloading.
 *
 * @use For a form whose changes would be lost by leaving, such as a trade ticket half filled in.
 * @see TypedConfirmDialog, AlertDialog, FormTextField
 *
 * @example
 * ```tsx
 * import { UnsavedChangesGuard } from "@basis/ui";
 *
 * // In a page on TanStack Form: useSelector(form.store, (state) => state.isDirty && !state.isSubmitting
 * // && !state.isSubmitSuccessful), so the page a successful submit opens is not stopped.
 * const dirty = true;
 *
 * <UnsavedChangesGuard when={dirty} />;
 * ```
 */
function UnsavedChangesGuard({
  when,
  title = "Leave without saving?",
  description = "Your changes on this page are not saved, and leaving discards them.",
}: UnsavedChangesGuardProps): ReactElement {
  const blocker = useBlocker({
    enableBeforeUnload: () => when,
    shouldBlockFn: () => when,
    withResolver: true,
  });
  return (
    <AlertDialog
      open={blocker.status === "blocked"}
      onOpenChange={(open) => {
        if (!open) {
          blocker.reset?.();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay on this page</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              blocker.proceed?.();
            }}
          >
            Leave without saving
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { UnsavedChangesGuard };
export type { UnsavedChangesGuardProps };
