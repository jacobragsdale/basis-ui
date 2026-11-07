/* Making and editing a chart's drawings with the pointer. With a tool in hand, a press anchors a drawing and a drag
 * stretches it to its second anchor; a horizontal line takes one press, and a note asks for its text. Without one, a
 * press on a drawing selects it, a drag of a handle moves that anchor, and Delete removes it. Anchors snap to the data,
 * and a change reaches the layout only when the pointer is let go. After each change the editor tells its host whether
 * what the page shows changed (`state`: tool, selection, note, measurement card) or only the canvas (`paint`). */

import type { LayoutDrawing } from "#layout/chart.ts";

import { drawingFrom } from "./drawings.ts";
import type { Shape, Snap, Tool } from "./drawings.ts";
import {
  choiceAt,
  measuringAt,
  onPrice,
  resting,
  sameState,
  selectedOf,
  snapAt,
  stateOf,
  wideEnough,
} from "./editor-state.ts";
import type { Choice, DrawingHost, EditorState, Move, Sketch } from "./editor-state.ts";
import {
  askMeasure,
  dragged,
  movedDrawings,
  pressDrawings,
  shapesNow,
  shownDrawings,
  sketchDrawing,
} from "./editor-steps.ts";
import type { Measuring } from "./measure.ts";
import type { Point } from "./model-types.ts";

/** Makes and edits a chart's drawings, which it saves in the layout through its host. */
class DrawingEditor {
  readonly #host: DrawingHost;
  #tool: Tool | null = null;
  #measuring: Measuring | null = null;
  #choice: Choice | null = null;
  #note: Snap | null = null;
  #sketch: Sketch | null = null;
  #moving: Move | null = null;
  #state: EditorState = resting;

  public constructor(host: DrawingHost) {
    this.#host = host;
  }

  /** What the page shows of the editor: the same object until it changes. */
  public get state(): EditorState {
    return this.#state;
  }

  /** The measurement shown, with its band's ends, or null. */
  public get measuring(): Measuring | null {
    return this.#measuring;
  }

  /** The drawings as drawn now: a drawing being made or moved included. */
  public shown(): readonly LayoutDrawing[] {
    return shownDrawings(this.#host.drawings(), { moving: this.#moving, sketch: this.#sketch });
  }

  /** The drawings in pixels. */
  public shapes(): readonly Shape[] {
    return shapesNow(this.#host, this.shown());
  }

  /** The host's drawings changed: the selection holds only while the layout still has the drawing chosen there. */
  public refresh(): void {
    this.#refreshState();
  }

  /** Picks up a tool, or puts it down with null. */
  public pick(tool: Tool | null): void {
    this.#tool = tool;
    this.#choice = null;
    this.#changed();
  }

  /** A press on the plot: true if it made, picked or grabbed a drawing, and so is not a pan or a brush. */
  public down(at: Point): boolean {
    // Any press puts a measurement away.
    this.#measuring = null;
    const taken = this.#press(at);
    this.#changed();
    return taken;
  }

  /** A move of the pointer: true while it stretches or moves a drawing, or drags a measurement. */
  public move(at: Point): boolean {
    if (this.#measuring?.state === "dragging") {
      this.#dragMeasure(at);
      return true;
    }
    if (this.#sketch === null && this.#moving === null) {
      return false;
    }
    this.#stretch(at);
    this.#changed();
    return true;
  }

  /** The pointer let go: true if it finished making or moving a drawing, which then reaches the layout. */
  public up(): boolean {
    if (this.#measuring?.state === "dragging") {
      this.#ask();
      this.#changed();
      return true;
    }
    const finished = this.#finish();
    this.#changed();
    return finished;
  }

  /** A note's text typed, or null if it was dropped. */
  public noteDone(text: string | null): void {
    const at = this.#note;
    this.#note = null;
    if (at !== null && text !== null) {
      this.#add(drawingFrom("note", { from: at, text, to: at }));
    }
    this.#changed();
  }

  /** Removes the selected drawing, dropping any drag in progress: true if there was one. */
  public remove(): boolean {
    const selected = selectedOf(this.#host, this.#choice);
    this.#drop();
    if (selected !== null) {
      this.#choice = null;
      this.#host.save(this.#host.drawings().filter((_drawing, index) => index !== selected));
    }
    this.#changed();
    return selected !== null;
  }

  /** Drops a drawing being made or moved, as when the browser cancels the pointer. */
  public abandon(): void {
    this.#drop();
    this.#changed();
  }

  /** Escape: puts down the tool, drops a drawing in progress, the selection and a measurement. True if there was any. */
  public cancel(): boolean {
    const busy =
      this.#tool !== null ||
      this.#sketch !== null ||
      this.#moving !== null ||
      selectedOf(this.#host, this.#choice) !== null;
    const shown = this.#measuring !== null;
    this.#tool = null;
    this.#drop();
    this.#choice = null;
    this.#measuring = null;
    this.#changed();
    return busy || shown;
  }

  /** What a press does: starts a drawing with the tool in hand, grabs the selected drawing's handle, or selects. */
  #press(at: Point): boolean {
    const tool = this.#tool;
    if (tool !== null && onPrice(this.#host, at)) {
      this.#start(tool, at);
      return true;
    }
    const pressed = pressDrawings(this.#host, { at, choice: this.#choice, shapes: this.shapes() });
    this.#moving = pressed.moving;
    this.#choice = pressed.choice;
    return pressed.moving !== null || pressed.choice !== null;
  }

  #start(tool: Tool, at: Point): void {
    const anchor = snapAt(this.#host, at);
    if (anchor === null) {
      return;
    }
    if (tool === "measure") {
      this.#measuring = measuringAt(this.#host, anchor) ?? this.#measuring;
    } else if (tool === "horizontal") {
      this.#add(drawingFrom(tool, { from: anchor, to: anchor }));
    } else if (tool === "note") {
      // The tool is put down while the text is typed, so a press elsewhere only leaves the box.
      this.#tool = null;
      this.#note = anchor;
    } else {
      this.#sketch = { from: anchor, to: anchor, tool };
    }
  }

  /** Moves the end of the measurement being dragged to the data at `at`. */
  #dragMeasure(at: Point): void {
    const next = this.#measuring === null ? null : dragged(this.#host, this.#measuring, at);
    if (next !== null) {
      this.#measuring = next;
      this.#changed();
    }
  }

  /** Moves the anchor being stretched or dragged to the data at `at`. */
  #stretch(at: Point): void {
    const to = snapAt(this.#host, at);
    if (to !== null && this.#sketch !== null) {
      this.#sketch = { ...this.#sketch, to };
    }
    if (to !== null && this.#moving !== null) {
      this.#moving = { ...this.#moving, to };
    }
  }

  /** Finishes the drawing being made or moved: true if there was one. */
  #finish(): boolean {
    const [sketch, move] = [this.#sketch, this.#moving];
    this.#drop();
    if (sketch !== null) {
      const drawing = sketchDrawing(sketch);
      if (drawing !== null) {
        this.#add(drawing);
      }
      return true;
    }
    if (move !== null) {
      this.#finishMove(move);
    }
    return move !== null;
  }

  /** Saves a moved anchor, only if the layout still holds the drawing grabbed, where it was. */
  #finishMove(move: Move): void {
    const drawings = movedDrawings(this.#host.drawings(), move);
    if (drawings !== null) {
      this.#host.save(drawings);
      this.#choice = choiceAt(this.#host, move.index);
    }
  }

  /** Asks the engine what changed across the band dragged, and shows its answer if the band is still shown. */
  #ask(): void {
    const measuring = this.#measuring;
    this.#tool = null;
    const asking: Measuring | null =
      measuring === null || !wideEnough(this.#host, measuring)
        ? null
        : { ...measuring, state: "asking" };
    this.#measuring = asking;
    if (asking !== null) {
      askMeasure(this.#host, asking, (next) => {
        this.#settle(asking, next);
      });
    }
  }

  /** Shows the engine's answer, if the measurement it answers is still the one shown. */
  #settle(asking: Measuring, next: Measuring): void {
    if (this.#measuring === asking) {
      this.#measuring = next;
      this.#changed();
    }
  }

  #add(drawing: LayoutDrawing): void {
    this.#host.save([...this.#host.drawings(), drawing]);
    this.#tool = null;
    this.#choice = choiceAt(this.#host, this.#host.drawings().length - 1);
  }

  #drop(): void {
    this.#sketch = null;
    this.#moving = null;
  }

  /** Takes a new `state` and tells the host, if what the page shows changed: true if it did. */
  #refreshState(): boolean {
    const next = stateOf(this.#host, {
      choice: this.#choice,
      measuring: this.#measuring,
      note: this.#note,
      tool: this.#tool,
    });
    if (sameState(next, this.#state)) {
      return false;
    }
    this.#state = next;
    this.#host.changed("state");
    return true;
  }

  /** Tells the host what changed: the page's state, with a new `state`, or only the canvas. */
  #changed(): void {
    if (!this.#refreshState()) {
      this.#host.changed("paint");
    }
  }
}

export { DrawingEditor };
export { measureLines, measureView } from "./measure.ts";
export type { MeasureCard, MeasureLine, MeasurePlace, Measuring } from "./measure.ts";
export type { DrawingHost, EditorState } from "./editor-state.ts";
