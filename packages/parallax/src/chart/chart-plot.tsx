/* A chart's plot: the canvas, the parts the scene moves over it, and the chrome that sits on it while a note is typed,
 * a measurement shows or something is wrong. */

import { Alert, AlertDescription } from "@basis/ui";
import type { ReactNode } from "react";

import { ChartMeasureCard, ChartNote } from "./chart-chrome.tsx";
import type { EditorState } from "./drawing-editor.ts";
import type { ChartScene } from "./scene.ts";

interface ChartPlotProps {
  readonly scene: ChartScene;
  readonly editor: EditorState;
  /** What the chart draws, which names its plot for a screen reader. */
  readonly description: string;
  /** The text alternative's element, which describes the plot. */
  readonly wordsId: string;
  readonly problem: string | null;
}

/** The parts the scene moves over the canvas: the brush, a measurement's band, the crosshair and the tooltip. */
function Overlays({ scene }: { readonly scene: ChartScene }): ReactNode {
  const { band, measureBand, crosshair, tip } = scene.parts.mount;
  return (
    <>
      <div
        ref={band}
        hidden
        data-slot="chart-brush"
        className="pointer-events-none absolute border-x border-ring bg-selection"
      />
      <div
        ref={measureBand}
        hidden
        data-slot="chart-measure-band"
        className="pointer-events-none absolute border border-dashed border-ring bg-selection opacity-60"
      />
      <div
        ref={crosshair}
        hidden
        data-slot="chart-crosshair"
        className="pointer-events-none absolute w-px bg-muted-foreground"
      />
      <div
        ref={tip}
        hidden
        role="tooltip"
        data-slot="chart-tip"
        className="pointer-events-none absolute z-10 max-w-xs rounded-md border bg-popover px-2 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md"
      />
    </>
  );
}

/** The plot, which takes the pointer, the wheel and the chart's keys. */
function ChartPlot(props: ChartPlotProps): ReactNode {
  const { scene, editor, problem } = props;
  const { plot, canvas } = scene.parts.mount;
  return (
    <div
      ref={plot}
      role="application"
      aria-roledescription="chart"
      aria-label={props.description}
      aria-describedby={props.wordsId}
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the plot takes the chart's keys (zoom, pan, delete, escape), so the keyboard must reach it; role="application" has a screen reader pass them through.
      tabIndex={0}
      data-slot="chart-plot"
      className="relative min-h-0 flex-1 cursor-crosshair touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-panning:cursor-grabbing data-pick:cursor-pointer"
    >
      <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 block" />
      <Overlays scene={scene} />
      {editor.note === null ? null : (
        <ChartNote
          at={editor.note.point}
          onDone={(text) => {
            scene.noteDone(text);
          }}
        />
      )}
      {editor.measure === null ? null : (
        <ChartMeasureCard card={editor.measure} cardRef={scene.measureCardRef} />
      )}
      {problem === null ? null : (
        <div className="absolute inset-x-2 bottom-2 z-20">
          <Alert variant="destructive">
            <AlertDescription>{problem}</AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}

export { ChartPlot };
