/* The command palette, Ctrl+K (Cmd+K on a Mac): every page of the app, from its route tree, and any commands the app
 * adds, found by typing. */

import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactElement } from "react";

import { useTelemetry } from "#shell/telemetry.ts";

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandList } from "./command.tsx";
import { CommandDialog } from "./command-dialog.tsx";
import { CommandItem } from "./command-item.tsx";
import { useRouteEntries } from "./route-entries.ts";
import { useShortcut } from "./shortcuts-context.ts";

/** A command the palette offers beside the app's pages. */
interface PaletteCommand {
  readonly id: string;
  readonly label: string;
  readonly run: () => void;
}

const noCommands: readonly PaletteCommand[] = [];

/** The palette's list: the app's pages, then its commands. */
function PaletteList({
  commands,
  onRun,
}: {
  readonly commands: readonly PaletteCommand[];
  readonly onRun: (action: () => void) => void;
}): ReactElement {
  const entries = useRouteEntries();
  const navigate = useNavigate();
  const telemetry = useTelemetry();
  const report = (failure: unknown): void => {
    telemetry.error(failure, { source: "command-palette" });
  };
  return (
    <CommandList>
      <CommandEmpty>Nothing matches.</CommandEmpty>
      <CommandGroup heading="Go to">
        {entries.map(({ id, title, to }) => (
          <CommandItem
            key={id}
            onSelect={() => {
              onRun(() => {
                navigate({ to }).catch(report);
              });
            }}
          >
            {title}
          </CommandItem>
        ))}
      </CommandGroup>
      {commands.length === 0 ? null : (
        <CommandGroup heading="Commands">
          {commands.map((command) => (
            <CommandItem
              key={command.id}
              onSelect={() => {
                onRun(command.run);
              }}
            >
              {command.label}
            </CommandItem>
          ))}
        </CommandGroup>
      )}
    </CommandList>
  );
}

/** Opens with Ctrl+K and goes to any page of the app, or runs one of `commands`. `AppShell` holds one.
 *
 * @example
 * ```tsx
 * import { CommandPalette, ShortcutProvider } from "@basis/ui";
 *
 * <ShortcutProvider>
 *   <CommandPalette commands={[{ id: "refresh", label: "Refresh prices", run: () => undefined }]} />
 * </ShortcutProvider>;
 * ```
 */
function CommandPalette({
  commands = noCommands,
}: {
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
    <CommandDialog open={open} onOpenChange={setOpen} title="Go to or run">
      <Command label="Go to or run">
        <CommandInput placeholder="Type a page or a command" />
        <PaletteList commands={commands} onRun={run} />
      </Command>
    </CommandDialog>
  );
}

export { CommandPalette };
export type { PaletteCommand };
