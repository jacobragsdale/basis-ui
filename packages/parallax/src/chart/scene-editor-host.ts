/* What a scene's drawing editor reads from it and how it saves: the model and frame, the layout's drawings and hidden
 * series, the chart font's widths, the engine's measurements, and the changes it makes. */

import type { ViewHandle } from "#engine/view.ts";
import type { Measurement } from "#engine/view-types.ts";
import type { Layout } from "#layout/layout.ts";

import type { DrawingHost } from "./drawing-editor.ts";
import type { TextMeasurer } from "./measurer.ts";
import type { ChartModel } from "./model-types.ts";
import { hasDrawingTools } from "./scene-inputs.ts";
import type { SceneModel } from "./scene-model.ts";
import { hiddenLabels } from "./series-keys.ts";

/** The scene's parts the editor reads and changes. */
interface EditorParts {
  readonly model: SceneModel;
  readonly drawn: () => ChartModel | null;
  readonly handle: () => ViewHandle | null;
  readonly measurer: () => TextMeasurer | null;
  readonly changeLayout: (next: Layout) => void;
  /** The editor changed: what React shows, or only what the canvas does. */
  readonly changed: (what: "state" | "paint") => void;
}

/** The drawing editor's host over a scene's parts. */
function editorHostOf(parts: EditorParts): DrawingHost {
  const { model } = parts;
  return {
    changed: parts.changed,
    drawings: () => model.chart?.drawings ?? [],
    editable: () => hasDrawingTools(model.chart),
    frame: () => model.frame,
    hidden: () => (model.chart === null ? [] : hiddenLabels(model.chart, model.frame)),
    measure: (text) => parts.measurer()?.measure(text, model.theme.font) ?? 0,
    measureChart: async (from, to, series): Promise<Measurement | null> => {
      const handle = parts.handle();
      return handle === null ? null : handle.measure(from, to, series);
    },
    model: parts.drawn,
    price: () => model.chart?.y[0] ?? "",
    save: (drawings) => {
      model.drawn(drawings, parts.changeLayout);
    },
  };
}

export { editorHostOf };
