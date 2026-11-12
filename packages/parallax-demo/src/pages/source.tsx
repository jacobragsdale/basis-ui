/* Data the app makes itself, as its own API would send it: the bytes move into the page's worker, every view of them
 * runs there, and exports are written there too. A file of the user's own loads the same way, within the browser's
 * limits, and a load the engine cannot hold ends in a plain reason and a fresh engine. */

import { Grid, maxArrowBytes, maxRows, useDataset } from "@basis/parallax";
import { Input, Label, numberText, Page } from "@basis/ui";
import { useState } from "react";
import type { ReactNode } from "react";

import { pages } from "#shell/pages.ts";

import { firstSlots, newestFirst, noteOf, shownOf, withFile } from "./source-loads.ts";
import type { Slots } from "./source-loads.ts";

const bytesPerMegabyte = 1_000_000;
/** The dataset name the empty slot waits under. */
const empty = "unused";

function SourcePage(): ReactNode {
  const [slots, setSlots] = useState<Slots>(firstSlots);
  const [first, second] = slots;
  const firstData = useDataset(first.name, first.source);
  const secondData = useDataset(second?.name ?? empty, second?.source ?? null);
  const loads = newestFirst([
    { dataset: firstData, load: first },
    second === null ? null : { dataset: secondData, load: second },
  ]);
  const shown = shownOf(loads);
  return (
    <Page title={pages.source.title} description={pages.source.about} layout="fill">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Label htmlFor="source-file">Open an Arrow stream file</Label>
          <Input
            id="source-file"
            type="file"
            accept=".arrow,.arrows,.ipc,application/vnd.apache.arrow.stream"
            className="w-72"
            onChange={(event) => {
              const picker = event.currentTarget;
              const file = picker.files?.[0];
              if (file !== undefined) {
                setSlots(withFile(slots, shown?.load ?? null, file));
              }
              // The same file may be chosen again.
              picker.value = "";
            }}
          />
        </div>
        <span className="text-muted-foreground">
          At most {numberText(maxRows, { decimals: 0 })} rows or{" "}
          {numberText(maxArrowBytes / bytesPerMegabyte, { decimals: 0 })} MB of Arrow
        </span>
        <output data-testid="source-note" className="text-muted-foreground">
          {noteOf(loads[0])}
        </output>
      </div>
      {shown === null ? null : (
        <Grid key={shown.load.name} dataset={shown.dataset} layout={{ dataset: shown.load.name }} />
      )}
    </Page>
  );
}

export { SourcePage };
