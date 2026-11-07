/* Kbd on the feedback and display page: single keys, a combination, an icon key, and keys within a sentence. */

import { ArrowUpIcon, Kbd, KbdGroup } from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

function KbdSection(): ReactElement {
  return (
    <Section title="Kbd" description="A key or a combination of keys, as the keyboard shows it.">
      <div className="flex flex-wrap items-center gap-4">
        <Kbd>Esc</Kbd>
        <Kbd>F6</Kbd>
        <KbdGroup>
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
        <Kbd>
          <ArrowUpIcon />
          <span className="sr-only">Up arrow</span>
        </Kbd>
      </div>
      <p className="text-sm text-muted-foreground">
        Press{" "}
        <KbdGroup>
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>{" "}
        to open the command palette, or <Kbd>?</Kbd> for every shortcut.
      </p>
    </Section>
  );
}

export { KbdSection };
