/* The chrome around a chart's canvas, from @basis/ui's components: the legend, whose toggles hide and show series; the
 * drawing tools; a note's text box; a measurement's card; and the status line. */

import { Button, Input, Toggle, ToggleGroup, ToggleGroupItem } from "@basis/ui";
import { cn } from "cn";
import { useEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { maxNote } from "#layout/chart.ts";

import { measureLines } from "./drawing-editor.ts";
import type { MeasureCard } from "./drawing-editor.ts";
import type { Tool } from "./drawings.ts";
import type { LegendEntry, Point } from "./model-types.ts";

/** The drawing tools, as their buttons name them. */
const tools: readonly { readonly tool: Tool; readonly label: string }[] = [
  { label: "Trend line", tool: "trend" },
  { label: "Horizontal line", tool: "horizontal" },
  { label: "Fibonacci", tool: "fibonacci" },
  { label: "Rectangle", tool: "rectangle" },
  { label: "Note", tool: "note" },
  { label: "Measure", tool: "measure" },
];

/** Where a note's box sits from its anchor. */
const noteOffset = { x: 8, y: -11 };

interface ChartLegendProps {
  readonly entries: readonly LegendEntry[];
  readonly onToggle: (label: string) => void;
  /** Beside a big pie the legend is a column: key, label, and the share right-aligned. */
  readonly beside: boolean;
}

/** The legend: a toggle per series, pressed while the series is shown. */
function ChartLegend({ entries, onToggle, beside }: ChartLegendProps): ReactNode {
  return (
    <fieldset
      data-slot="chart-legend"
      className={cn("flex flex-wrap gap-x-1 gap-y-0.5", beside && "flex-col flex-nowrap")}
    >
      <legend className="sr-only">Series</legend>
      {entries.map((entry) => (
        <Toggle
          key={entry.label}
          size="sm"
          pressed={!entry.hidden}
          onPressedChange={() => {
            onToggle(entry.label);
          }}
          className={cn(beside && "w-full")}
        >
          <span
            aria-hidden="true"
            style={{ "--key": entry.color }}
            className={cn(
              "shrink-0 bg-(--key)",
              entry.shape === "line" && "h-0.5 w-3.5 rounded-full",
              entry.shape === "rect" && "size-2.5 rounded-sm",
              entry.shape === "dot" && "size-2.5 rounded-full",
              entry.hidden && "opacity-40",
            )}
          />
          <span
            className={cn("flex-1 text-left", entry.hidden && "text-muted-foreground line-through")}
          >
            {entry.label}
          </span>
          {entry.note === undefined || entry.note === "" ? null : (
            <span className="text-muted-foreground tabular-nums">{entry.note}</span>
          )}
        </Toggle>
      ))}
    </fieldset>
  );
}

interface ChartToolsProps {
  readonly tool: Tool | null;
  readonly selected: boolean;
  readonly onPick: (tool: Tool | null) => void;
  readonly onRemove: () => void;
}

/** The drawing tools: a toggle per kind of drawing, pressed while it is in hand, and one to delete the selected
 * drawing. */
function ChartTools({ tool, selected, onPick, onRemove }: ChartToolsProps): ReactNode {
  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      data-slot="chart-tools"
      className="ml-auto flex flex-wrap items-center gap-1"
    >
      <ToggleGroup
        size="sm"
        variant="outline"
        spacing={1}
        value={tool === null ? [] : [tool]}
        onValueChange={(values: readonly unknown[]) => {
          onPick(tools.find((entry) => values.includes(entry.tool))?.tool ?? null);
        }}
      >
        {tools.map((entry) => (
          <ToggleGroupItem key={entry.tool} value={entry.tool}>
            {entry.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Button size="sm" variant="outline" disabled={!selected} onClick={onRemove}>
        Delete drawing
      </Button>
    </div>
  );
}

interface ChartNoteProps {
  readonly at: Point;
  /** The note's text, or null when it was dropped. */
  readonly onDone: (text: string | null) => void;
}

/** A note's text box: Enter keeps it, Escape drops it, and leaving it keeps any text. */
function ChartNote({ at, onDone }: ChartNoteProps): ReactNode {
  const inputRef = useRef<HTMLInputElement>(null);
  const finishedRef = useRef(false);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const finish = (text: string | null): void => {
    if (!finishedRef.current) {
      finishedRef.current = true;
      onDone(text === null || text.trim() === "" ? null : text.trim());
    }
  };
  const key = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") {
      finish(event.currentTarget.value);
    } else if (event.key === "Escape") {
      // The Escape is spent dropping the note, so a maximized chart stays maximized.
      event.preventDefault();
      finish(null);
    }
  };
  return (
    <div
      data-slot="chart-note"
      style={{
        "--note-x": `${String(at.x + noteOffset.x)}px`,
        "--note-y": `${String(at.y + noteOffset.y)}px`,
      }}
      className="absolute top-(--note-y) left-(--note-x) z-20 w-56"
    >
      <Input
        ref={inputRef}
        type="text"
        aria-label="Note text"
        maxLength={maxNote}
        onKeyDown={key}
        onBlur={(event) => {
          finish(event.currentTarget.value);
        }}
      />
    </div>
  );
}

interface ChartMeasureCardProps {
  readonly card: MeasureCard;
  /** The card's element, which the chart places beside the band it measures. */
  readonly cardRef: (card: HTMLElement | null) => void;
}

/** What the engine measured across a band: the change, the bars, and the values at each end. */
function ChartMeasureCard({ card, cardRef }: ChartMeasureCardProps): ReactNode {
  const lines = measureLines(card);
  return (
    <output
      ref={cardRef}
      data-slot="chart-measure"
      hidden={lines.length === 0}
      className="pointer-events-none absolute z-10 block rounded-md border bg-popover px-2 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md"
    >
      {lines.map((line) => (
        <div
          key={`${line.value}\u0000${line.label}`}
          className="flex items-center gap-1.5 tabular-nums"
        >
          <strong>{line.value}</strong>
          <span className="text-muted-foreground">{line.label}</span>
        </div>
      ))}
    </output>
  );
}

interface ChartStatusProps {
  readonly dataset: string;
  /** The summary's element, which the chart writes as it draws. */
  readonly summaryRef: (element: HTMLElement | null) => void;
  /** The as-of time's element, which the chart writes from its frames. */
  readonly asOfRef: (element: HTMLElement | null) => void;
}

/** The line under a chart that says where its numbers come from: the dataset, what is drawn, and when the source was
 * read. */
function ChartStatus({ dataset, summaryRef, asOfRef }: ChartStatusProps): ReactNode {
  return (
    <div
      data-slot="chart-status"
      className="flex min-h-6 items-center gap-3 border-t px-2 text-xs whitespace-nowrap text-muted-foreground"
    >
      <span>{dataset}</span>
      <span ref={summaryRef} data-slot="chart-summary" className="tabular-nums" />
      <span ref={asOfRef} data-slot="chart-as-of" className="tabular-nums" />
    </div>
  );
}

export { ChartLegend, ChartMeasureCard, ChartNote, ChartStatus, ChartTools };
