/* Keyboard shortcuts: a registry the shell keeps, one listener on the document, and the `?` overlay that lists every
 * shortcut the page has. A component declares its own with `useShortcut`, so the overlay never goes out of date. */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./dialog.tsx";
import { Kbd, KbdGroup } from "./kbd.tsx";
import {
  ShortcutContext,
  keyLabels,
  matchesKeys,
  typedIntoField,
  useShortcut,
} from "./shortcuts-context.ts";
import type { Shortcut, ShortcutRegistry } from "./shortcuts-context.ts";
import { Table, TableBody, TableCell, TableRow } from "./table.tsx";

/** The registry, held in a ref so a shortcut added or removed renders nothing. */
function useRegistry(): ShortcutRegistry {
  const shortcuts = useRef<Shortcut[]>([]);
  return useMemo(
    () => ({
      list: () => shortcuts.current,
      register: (shortcut: Shortcut) => {
        shortcuts.current = [...shortcuts.current, shortcut];
        return () => {
          shortcuts.current = shortcuts.current.filter((held) => held !== shortcut);
        };
      },
    }),
    [],
  );
}

/** Runs the shortcut each key press names; one without a modifier waits while the user types into a field, or while
 * a control or dialog that takes keys has focus. */
function useKeyListener(registry: ShortcutRegistry): void {
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => {
      const shortcut = registry.list().find(({ keys }) => matchesKeys(keys, event));
      const plain = shortcut !== undefined && !/mod\+|alt\+/u.test(shortcut.keys);
      if (shortcut === undefined || (plain && typedIntoField(event))) {
        return;
      }
      event.preventDefault();
      shortcut.run();
    };
    document.addEventListener("keydown", listener);
    return (): void => {
      document.removeEventListener("keydown", listener);
    };
  }, [registry]);
}

/** The shortcuts a key press can run: of two that declare the same keys, the first declared, which the listener
 * finds first. */
function answering(shortcuts: readonly Shortcut[]): readonly Shortcut[] {
  const seen = new Set<string>();
  return shortcuts.filter(({ keys }) => {
    const key = keys.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/** The `?` overlay: every shortcut the page has, with its keys, each keys once. */
function ShortcutList({ registry }: { readonly registry: ShortcutRegistry }): ReactElement {
  return (
    <Table>
      <TableBody>
        {answering(registry.list()).map((shortcut) => (
          <TableRow key={shortcut.keys}>
            <TableCell>{shortcut.description}</TableCell>
            <TableCell>
              <KbdGroup>
                {keyLabels(shortcut.keys).map((label) => (
                  <Kbd key={label}>{label}</Kbd>
                ))}
              </KbdGroup>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Registers `?`, which opens the list of shortcuts. */
function OverlayShortcut({ onOpen }: { readonly onOpen: (open: boolean) => void }): null {
  useShortcut("?", "Show the keyboard shortcuts", () => {
    onOpen(true);
  });
  return null;
}

/** Keeps the page's keyboard shortcuts: one listener answers them, and `?` opens a list of every one. `AppShell`
 * holds one; an app without the shell wraps its routes in one to use `useShortcut`.
 *
 * @use AppShell holds one; wrap the routes in one only in an app without the shell. A component declares its shortcuts
 * with useShortcut.
 * @see useShortcut, AppShell, Kbd
 *
 * @example
 * ```tsx
 * import { Button, ShortcutProvider, useShortcut } from "@basis/ui";
 *
 * function Refresh({ onRefresh }: { readonly onRefresh: () => void }) {
 *   useShortcut("r", "Refresh the positions", onRefresh);
 *   return <Button onClick={onRefresh}>Refresh</Button>;
 * }
 *
 * <ShortcutProvider>
 *   <Refresh onRefresh={() => undefined} />
 * </ShortcutProvider>;
 * ```
 */
function ShortcutProvider({
  children,
}: {
  /** The part of the app whose components declare shortcuts with `useShortcut`. */
  readonly children?: ReactNode;
}): ReactElement {
  const registry = useRegistry();
  const [open, setOpen] = useState(false);
  useKeyListener(registry);
  return (
    <ShortcutContext value={registry}>
      <OverlayShortcut onOpen={setOpen} />
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>What each key does on this page.</DialogDescription>
          </DialogHeader>
          <ShortcutList registry={registry} />
        </DialogContent>
      </Dialog>
    </ShortcutContext>
  );
}

export { ShortcutProvider };
