/* The performance overlay, for checking the demo on a Citrix desktop. It shows the figures parallax's budgets name and
 * copies them as a report: frame time, as the median and 95th percentile of the last few seconds the tab was visible;
 * main-thread time blocked by long frames; for each grid on the page, its drawing time per frame, the time from asking
 * for rows to drawing them, the time from an input such as a click or a keystroke to drawing the change it made, and
 * the time to its first rows, inputs counting from when the overlay opened; and the tab's memory, from
 * `measureUserAgentSpecificMemory` when the page is cross-origin isolated, which then counts the worker too, or else
 * Chromium's main-thread JavaScript heap. */

import { Button, Card, CardContent, CardHeader, CardTitle, readPreferences } from "@basis/ui";
import { useLocation } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactNode } from "react";

import { pageList } from "#shell/pages.ts";

import { gridStats } from "./grid-stats.ts";
import { figureLines, report } from "./performance-figures.ts";
import type { Line } from "./performance-figures.ts";
import { usePerformance } from "./performance-sampler.ts";

/** What the page shows, for the report: the page, its grids, and the mode and density. */
function showing(path: string): string {
  const title = pageList.find((page) => page.path === path)?.title ?? path;
  const names = gridStats().map((grid) => grid.name);
  const grids = names.length === 0 ? "no grids" : `${names.join(" and ")}, grids`;
  const { density } = readPreferences();
  const mode = document.documentElement.classList.contains("dark") ? "dark" : "light";
  return `${title}, ${grids}, ${mode} mode, ${density} density`;
}

/** Copies the report of `lines`, taken now on this machine, saying how it went. */
async function copyReport(
  lines: readonly Line[],
  { path, setNote }: { readonly path: string; readonly setNote: (note: string) => void },
): Promise<void> {
  const text = report(lines, {
    browser: navigator.userAgent,
    isolated: crossOriginIsolated,
    page: location.href,
    processors: navigator.hardwareConcurrency,
    showing: showing(path),
    taken: new Date().toISOString(),
    window: `${String(innerWidth)} x ${String(innerHeight)} at ${String(devicePixelRatio)}x`,
  });
  try {
    await navigator.clipboard.writeText(text);
    setNote("Copied");
  } catch (error: unknown) {
    setNote(`Could not copy: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** The figures, a line each. */
function Figures({ lines }: { readonly lines: readonly Line[] }): ReactNode {
  return (
    <dl className="flex flex-col gap-0.5 text-xs">
      {lines.map((line) => (
        <div key={line.key} className="flex justify-between gap-2.5">
          <dt className="text-muted-foreground">{line.term}</dt>
          <dd data-figure={line.key} className="text-right tabular-nums">
            {line.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function PerformanceOverlay(): ReactNode {
  const { figures, memory } = usePerformance();
  const path = useLocation({ select: (location) => location.pathname });
  const [note, setNote] = useState("");
  const lines = figures === null ? [] : figureLines(figures, memory);
  return (
    <section aria-label="Performance" className="fixed right-3 bottom-3 z-20 w-100">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            <Figures lines={lines} />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  copyReport(lines, { path, setNote }).catch(reportError);
                }}
              >
                Copy report
              </Button>
              <output className="text-xs text-muted-foreground">{note}</output>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export { PerformanceOverlay };
