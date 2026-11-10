/* Keyboard shortcuts: a registry the shell keeps, one listener on the document, and the `?` overlay that lists every
 * shortcut the page has, under the scope it belongs to. A component declares its own with `useShortcut`, so the
 * overlay never goes out of date; `ShortcutScope`, which AppShell holds round the page shown, gives a part of the app
 * shortcuts that win over the app's own.
 *
 * A conflict, two shortcuts taking the same keys at the same depth, is logged with `console.error` as an `ERROR` line
 * with its fix, and the first declared keeps the keys. It is not thrown: the two are often declared by components
 * that meet only on some pages or in some states, and a throw there would take the page down for its users over a
 * key, where the log reaches the developer through the console, the gallery's checks and `vp run shot`. */

import { use, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./dialog.tsx";
import { Kbd, KbdGroup } from "./kbd.tsx";
import {
  ShortcutContext,
  ShortcutScopeContext,
  conflictLine,
  conflictOf,
  keyLabels,
  matchesKeys,
  normalKeys,
  typedIntoField,
  useShortcut,
  winner,
} from "./shortcuts-context.ts";
import type { ScopedShortcut, ShortcutRegistry, ShortcutScopeValue } from "./shortcuts-context.ts";
import { Table, TableBody, TableCell, TableHead, TableRow } from "./table.tsx";

/** The registry, held in a ref so a shortcut added or removed renders nothing. A shortcut that conflicts with one
 * already held is logged, and kept, so the `?` overlay and the key still find the first. */
function useRegistry(): ShortcutRegistry {
  const shortcuts = useRef<ScopedShortcut[]>([]);
  return useMemo(
    () => ({
      list: () => shortcuts.current,
      register: (shortcut: ScopedShortcut) => {
        const taken = conflictOf(shortcuts.current, shortcut);
        if (taken !== undefined) {
          // oxlint-disable-next-line eslint/no-console -- a conflict is the developer's to see, and a throw would take the page down.
          console.error(conflictLine(taken, shortcut));
        }
        shortcuts.current = [...shortcuts.current, shortcut];
        return () => {
          shortcuts.current = shortcuts.current.filter((held) => held !== shortcut);
        };
      },
    }),
    [],
  );
}

/** Runs the shortcut each key press names, the innermost scope's; one without a modifier waits while the user types
 * into a field, or while a control or dialog that takes keys has focus. */
function useKeyListener(registry: ShortcutRegistry): void {
  useEffect(() => {
    const listener = (event: KeyboardEvent): void => {
      const shortcut = winner(registry.list().filter(({ keys }) => matchesKeys(keys, event)));
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

/** The shortcuts a key press can run: for each keys, the one the listener picks. */
function answering(shortcuts: readonly ScopedShortcut[]): readonly ScopedShortcut[] {
  const byKeys = Map.groupBy(shortcuts, ({ keys }) => normalKeys(keys));
  return [...byKeys.values()].flatMap((taking) => {
    const runs = winner(taking);
    return runs === undefined ? [] : [runs];
  });
}

/** The answering shortcuts by scope, the innermost scope first and the whole app's last. */
function byScope(
  shortcuts: readonly ScopedShortcut[],
): readonly (readonly [ShortcutScopeValue | null, readonly ScopedShortcut[]])[] {
  const groups = [...Map.groupBy(answering(shortcuts), ({ scope }) => scope).entries()];
  return groups.toSorted(([one], [other]) => (other?.depth ?? 0) - (one?.depth ?? 0));
}

/** The `?` overlay: every shortcut the page has, with its keys, each keys once, under its scope's name, or
 * "Everywhere" for the app's own. */
function ShortcutList({ registry }: { readonly registry: ShortcutRegistry }): ReactElement {
  return (
    <Table>
      {byScope(registry.list()).map(([scope, shortcuts]) => (
        <TableBody key={scope?.name ?? ""}>
          <TableRow>
            <TableHead colSpan={2} scope="rowgroup">
              {scope?.name ?? "Everywhere"}
            </TableHead>
          </TableRow>
          {shortcuts.map((shortcut) => (
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
      ))}
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

/** A part of the app whose shortcuts win over the app's: a key that a shortcut inside it and one outside both take runs
 * the one inside, while it is shown. The `?` overlay lists them under its `name`. AppShell holds one round the page
 * shown, named by its title, so a page's shortcuts are its own.
 *
 * @use For a part of a page whose keys differ from the page's, such as a panel; AppShell already holds one round each
 * page. Two shortcuts in the same scope, or in two scopes as deep, that take the same keys conflict: the first
 * runs, and the second logs an ERROR line.
 * @see useShortcut, ShortcutProvider, AppShell
 *
 * @example
 * ```tsx
 * import { ShortcutProvider, ShortcutScope, useShortcut } from "@basis/ui";
 *
 * function Panel() {
 *   // Inside the scope, r is the panel's, whatever the app's r does.
 *   useShortcut("r", "Refresh the panel's quotes", () => undefined);
 *   return null;
 * }
 *
 * <ShortcutProvider>
 *   <ShortcutScope name="Quotes">
 *     <Panel />
 *   </ShortcutScope>
 * </ShortcutProvider>;
 * ```
 */
function ShortcutScope({
  name,
  children,
}: {
  /** What the `?` overlay heads its shortcuts with, such as the page's title. */
  readonly name: string;
  /** The part of the app whose components declare the scope's shortcuts with `useShortcut`. */
  readonly children?: ReactNode;
}): ReactElement {
  const outer = use(ShortcutScopeContext);
  const scope = useMemo(() => ({ depth: (outer?.depth ?? 0) + 1, name }), [outer, name]);
  return <ShortcutScopeContext value={scope}>{children}</ShortcutScopeContext>;
}

export { ShortcutProvider, ShortcutScope };
