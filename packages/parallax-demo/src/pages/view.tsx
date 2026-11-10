/* A page of one view: the positions' pivot, or a grid of trades or prices, filling the page. Every change the user makes
 * is a layout, which the header shows and copies as a link that opens the same view: a layout that groups opens as a
 * pivot, and one that does not as a grid. */

import { Grid, Pivot, encodeLayout } from "@basis/parallax";
import type { LayoutInput } from "@basis/parallax";
import { Button, CopyIcon, Page, Popover, PopoverContent, PopoverTrigger } from "@basis/ui";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactNode } from "react";

import { datasetDates } from "#api/datasets.ts";
import { useDemoDataset } from "#shell/datasets.ts";
import type { DemoPage } from "#shell/pages.ts";
import { trackGrid } from "#tools/grid-stats.ts";

import { grouped } from "./layouts.ts";
import type { OpenedView } from "./view-link.ts";

interface ActionsProps {
  readonly page: DemoPage;
  readonly layout: LayoutInput;
  readonly note: string;
  readonly setNote: (note: string) => void;
}

/** Puts a link to the view on the clipboard, saying how it went. */
async function copyLink(
  href: (encoded: string) => string,
  { layout, setNote }: Pick<ActionsProps, "layout" | "setNote">,
): Promise<void> {
  try {
    const link = new URL(href(await encodeLayout(layout)), location.href);
    await navigator.clipboard.writeText(link.toString());
    setNote("A link to this view is on the clipboard.");
  } catch (error: unknown) {
    setNote(
      `The link could not be copied: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** The view's layout, as JSON, and a link to it. */
function ViewActions({ page, layout, note, setNote }: ActionsProps): ReactNode {
  const router = useRouter();
  // The history writes the address as the page shows it: under the hash, on the demo's router.
  const href = (encoded: string): string =>
    router.history.createHref(
      router.buildLocation({ search: { layout: encoded }, to: page.path }).href,
    );
  return (
    <div className="flex shrink-0 items-center gap-2">
      <output className="text-xs text-muted-foreground">{note}</output>
      <Popover>
        <PopoverTrigger render={<Button size="sm" variant="outline" />}>Layout</PopoverTrigger>
        <PopoverContent align="end" className="w-120">
          <pre data-testid="layout-json" className="max-h-120 overflow-auto font-mono text-xs">
            {JSON.stringify(layout, null, 2)}
          </pre>
        </PopoverContent>
      </Popover>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          copyLink(href, { layout, setNote }).catch(reportError);
        }}
      >
        <CopyIcon />
        Copy link to this view
      </Button>
    </div>
  );
}

/** The page of one view, as its route's loader opened it. */
function ViewPage({
  page,
  opened,
}: {
  readonly page: DemoPage;
  readonly opened: OpenedView;
}): ReactNode {
  const dataset = useDemoDataset(opened.dataset);
  const [layout, setLayout] = useState<LayoutInput>(opened.layout);
  const [note, setNote] = useState(opened.note);
  const view = grouped(layout) ? (
    <Pivot
      ref={trackGrid(opened.dataset)}
      dataset={dataset}
      layout={layout}
      onLayoutChange={setLayout}
      asOf={datasetDates[opened.dataset]}
    />
  ) : (
    <Grid
      ref={trackGrid(opened.dataset)}
      dataset={dataset}
      layout={layout}
      onLayoutChange={setLayout}
      asOf={datasetDates[opened.dataset]}
    />
  );
  return (
    <Page
      title={page.title}
      description={page.about}
      layout="fill"
      actions={<ViewActions page={page} layout={layout} note={note} setNote={setNote} />}
    >
      {view}
    </Page>
  );
}

export { ViewPage };
