/* Exporting what a grid shows: the engine in the page writes an Excel workbook or a CSV file of the view, and the
 * browser saves it as a download, named after the dataset and the time in New York. */

import type { ParallaxClient } from "#engine/client.ts";
import type { ExportFormat } from "#engine/messages.ts";
import type { Layout } from "#layout/layout.ts";

const exportTime = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  timeZone: "America/New_York",
  year: "numeric",
});

/** How long a download's object URL is kept; the download holds its own reference to the file once it starts. */
const keepUrlMs = 60_000;

/** An export's file name: the dataset, made safe, and the time in New York, such as `positions-2026-11-07-1430.xlsx`. */
function exportFileName(dataset: string, extension: string, at: Date): string {
  const parts = new Map(exportTime.formatToParts(at).map((part) => [part.type, part.value]));
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.get(type) ?? "";
  const safe = dataset.replaceAll(/[^\w-]/gu, "_");
  return `${safe}-${part("year")}-${part("month")}-${part("day")}-${part("hour")}${part("minute")}.${extension}`;
}

/** Saves `file` as a download named `name`. */
function download(file: Blob, name: string): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  Object.assign(link, { download: name, hidden: true, href: url });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, keepUrlMs);
}

/** What an export says in the status bar while it runs, when it is done, and when it fails. */
function exportNotes(format: ExportFormat): { readonly running: string; readonly done: string } {
  return format === "xlsx"
    ? { done: "Exported to Excel; your browser saves the file.", running: "Exporting to Excel…" }
    : { done: "Exported to CSV; your browser saves the file.", running: "Exporting to CSV…" };
}

/**
 * Downloads the view as an Excel workbook or a CSV file, written by the engine in the browser, which holds its table.
 * An export of another load than the screen shows, `shown`, is refused, so the file holds what the screen does. `say`
 * shows each step, a refusal included, such as more cells than an xlsx in the browser holds.
 */
async function exportView(
  client: ParallaxClient,
  {
    layout,
    format,
    shown,
  }: { readonly layout: Layout; readonly format: ExportFormat; readonly shown: bigint | null },
  say: (message: string) => void,
): Promise<void> {
  const name = exportFileName(layout.dataset, format, new Date());
  const notes = exportNotes(format);
  say(notes.running);
  try {
    download(await client.export(JSON.stringify(layout), format, shown), name);
    say(notes.done);
  } catch (error: unknown) {
    say(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export { exportFileName, exportView };
