/* Command on the overlays and menus page: a command menu on the page, and the same commands in the command palette,
 * each saying which command ran last. */

import {
  Button,
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
  SearchIcon,
  SettingsIcon,
  UserIcon,
} from "@basis/ui";
import { useState } from "react";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

const pages = ["Positions", "Trades", "Risk"] as const;

interface CommandsProps {
  /** Called with the value of the command that runs. */
  readonly onRun: (value: string) => void;
}

/** The commands: pages to go to, the user's settings, and one the user may not run. */
function Commands({ onRun }: CommandsProps): ReactElement {
  return (
    <>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Go to">
          {pages.map((page) => (
            <CommandItem key={page} onSelect={onRun}>
              {page}
            </CommandItem>
          ))}
          <CommandItem disabled onSelect={onRun}>
            Archive
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem onSelect={onRun}>
            <UserIcon />
            Profile
            <CommandShortcut>Ctrl+P</CommandShortcut>
          </CommandItem>
          <CommandItem keywords={["preferences", "theme"]} onSelect={onRun}>
            <SettingsIcon />
            Settings
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </>
  );
}

/** The command menu on the page, which keeps its search after a command runs. */
function CommandExample({ onRun }: CommandsProps): ReactElement {
  return (
    <div className="w-full max-w-sm rounded-xl border">
      <Command label="Go to or run">
        <Commands onRun={onRun} />
      </Command>
    </div>
  );
}

/** The command palette, which closes when a command runs. */
function CommandDialogExample({ onRun }: CommandsProps): ReactElement {
  const [open, setOpen] = useState(false);
  function run(value: string): void {
    setOpen(false);
    onRun(value);
  }
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        <SearchIcon data-icon="inline-start" />
        Command palette
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command label="Go to or run">
          <Commands onRun={run} />
        </Command>
      </CommandDialog>
    </>
  );
}

function CommandSection(): ReactElement {
  const [ran, setRan] = useState<string | null>(null);
  return (
    <Section
      title="Command"
      description="A search over commands, narrowed as the user types; Enter runs the highlighted one. The palette puts it in a dialog."
    >
      <div className="flex flex-wrap items-start gap-4">
        <CommandExample onRun={setRan} />
        <CommandDialogExample onRun={setRan} />
      </div>
      <p className="text-sm text-muted-foreground">Last ran: {ran ?? "nothing yet"}</p>
    </Section>
  );
}

export { CommandDialogExample, CommandExample, CommandSection };
