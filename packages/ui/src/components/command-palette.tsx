/* The command palette, Ctrl+K (Cmd+K on a Mac): every page of the app, from its route tree, and any commands the app
 * adds, under their groups, found by typing their label or keywords. A command with a shortcut shows its keys, and
 * its keys run it while the palette is mounted, closed or open, so the command is declared once. */

import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { ComponentType, ReactElement, SVGProps } from "react";

import { useTelemetry } from "#shell/telemetry.ts";

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList } from "./command.tsx";
import { CommandDialog } from "./command-dialog.tsx";
import { CommandItem, CommandShortcut } from "./command-item.tsx";
import { useRouteEntries } from "./route-entries.ts";
import { keyLabels, useShortcut } from "./shortcuts-context.ts";

/** A command the palette offers beside the app's pages. */
interface PaletteCommand {
  /** What tells it from the others; unique among the commands. */
  readonly id: string;
  /** What the palette shows and the search matches, such as "Refresh prices". */
  readonly label: string;
  /** What choosing it, or pressing its shortcut, does. */
  readonly run: () => void;
  /** More words the search matches, such as `["reload", "update"]`. */
  readonly keywords?: readonly string[] | undefined;
  /** The heading it is listed under, such as "View"; "Commands" unless set. The groups come in the order of their
   * first commands. */
  readonly group?: string | undefined;
  /** The icon before its label, one of `@basis/ui`'s. */
  readonly icon?: ComponentType<SVGProps<SVGSVGElement>> | undefined;
  /** Its keys, such as `mod+shift+r`: shown beside it, listed by `?`, and bound to `run` while the palette is
   * mounted. */
  readonly shortcut?: string | undefined;
}

const noCommands: readonly PaletteCommand[] = [];

/** The group a command is listed under unless it names one. */
const defaultGroup = "Commands";

/** Binds a command's shortcut to its `run`. */
function CommandKeys({
  keys,
  label,
  run,
}: {
  readonly keys: string;
  readonly label: string;
  readonly run: () => void;
}): null {
  useShortcut(keys, label, run);
  return null;
}

/** A command's shortcut as the palette shows it, such as `Ctrl+Shift+R`. */
function shortcutText(keys: string): string {
  return keyLabels(keys).join("+");
}

/** The app's pages, each with its icon, found by its title or its group. */
function PageItems({ onRun }: { readonly onRun: (action: () => void) => void }): ReactElement {
  const entries = useRouteEntries();
  const navigate = useNavigate();
  const telemetry = useTelemetry();
  const report = (failure: unknown): void => {
    telemetry.error(failure, { source: "command-palette" });
  };
  return (
    <CommandGroup heading="Go to">
      {entries.map(({ id, title, to, icon: Icon, group }) => (
        <CommandItem
          key={id}
          value={title}
          keywords={group === undefined ? [] : [group]}
          onSelect={() => {
            onRun(() => {
              navigate({ to }).catch(report);
            });
          }}
        >
          {Icon === undefined ? null : <Icon />}
          {title}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

/** The palette's list: the app's pages, then its commands in their groups. */
function PaletteList({
  commands,
  onRun,
}: {
  readonly commands: readonly PaletteCommand[];
  readonly onRun: (action: () => void) => void;
}): ReactElement {
  const groups = Map.groupBy(commands, ({ group }) => group ?? defaultGroup);
  return (
    <CommandList>
      <CommandEmpty>Nothing matches.</CommandEmpty>
      <PageItems onRun={onRun} />
      {[...groups.entries()].map(([heading, grouped]) => (
        <CommandGroup key={heading} heading={heading}>
          {grouped.map(({ id, label, run, keywords = [], icon: Icon, shortcut }) => (
            <CommandItem
              key={id}
              value={label}
              keywords={keywords}
              onSelect={() => {
                onRun(run);
              }}
            >
              {Icon === undefined ? null : <Icon />}
              {label}
              {shortcut === undefined ? null : (
                <CommandShortcut>{shortcutText(shortcut)}</CommandShortcut>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      ))}
    </CommandList>
  );
}

/** Opens with Ctrl+K and goes to any page of the app, or runs one of `commands`, each under its group, with its icon
 * and shortcut. `AppShell` holds one.
 *
 * @use AppShell holds one, and takes its `commands`; use it alone only in a layout of the app's own. For a searchable
 * list inside a page, use Command.
 * @see AppShell, Command, CommandDialog, useShortcut
 *
 * @example
 * ```tsx
 * import { CommandPalette, RefreshCwIcon, ShortcutProvider } from "@basis/ui";
 *
 * <ShortcutProvider>
 *   <CommandPalette
 *     commands={[
 *       {
 *         group: "Prices",
 *         icon: RefreshCwIcon,
 *         id: "refresh",
 *         keywords: ["reload"],
 *         label: "Refresh prices",
 *         run: () => undefined,
 *         shortcut: "mod+shift+r",
 *       },
 *     ]}
 *   />
 * </ShortcutProvider>;
 * ```
 */
function CommandPalette({
  commands = noCommands,
}: {
  /** The app's own commands, each with its label and what it runs, and its keywords, group, icon and shortcut if it
   * has them, listed after the app's pages. */
  readonly commands?: readonly PaletteCommand[] | undefined;
}): ReactElement {
  const [open, setOpen] = useState(false);
  useShortcut("mod+k", "Open the command palette", () => {
    setOpen(true);
  });
  const run = (action: () => void): void => {
    setOpen(false);
    action();
  };
  return (
    <>
      {commands.map(({ id, label, run: runCommand, shortcut }) =>
        shortcut === undefined ? null : (
          <CommandKeys key={id} keys={shortcut} label={label} run={runCommand} />
        ),
      )}
      <CommandDialog open={open} onOpenChange={setOpen} title="Go to or run">
        <Command label="Go to or run">
          <CommandInput placeholder="Type a page or a command" />
          <PaletteList commands={commands} onRun={run} />
        </Command>
      </CommandDialog>
    </>
  );
}

export { CommandPalette };
export type { PaletteCommand };
