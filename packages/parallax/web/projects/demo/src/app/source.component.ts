import { ChangeDetectionStrategy, Component, inject, input, signal } from "@angular/core";
import { GridComponent, MAX_ARROW_BYTES, MAX_ROWS, ParallaxClient, standardTheme } from "parallax";
import type { Density, LayoutInput, ParallaxTheme, Scheme } from "parallax";

import { sampleOrders } from "./sample";

/** The dataset the page loads when it opens. */
export const SAMPLE = "orders";

const GROUPED = new Intl.NumberFormat("en-US");

/** A dataset name for a file: its name without the extension, in letters, digits and underscores. */
function datasetFor(file: string): string {
  const name = file.replace(/\.[^.]*$/u, "").replace(/[^A-Za-z0-9_]/gu, "_");
  return name === "" ? "data" : name;
}

/**
 * Data the app makes itself, as its own API would send it: the bytes move into the page's worker, every view of
 * them runs there, and exports are written there too. A file of the user's own loads the same way, within the
 * browser's limits, and a load the engine cannot hold ends in a plain reason and a fresh engine.
 */
@Component({
  selector: "demo-source",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GridComponent],
  template: `
    <div class="bar">
      <label class="file">
        Open an Arrow stream file
        <input type="file" accept=".arrow,.arrows,.ipc,application/vnd.apache.arrow.stream" (change)="open($event)" />
      </label>
      <span class="limit">At most {{ maxRows }} rows or {{ maxMegabytes }} MB of Arrow</span>
      <span class="note" role="status" data-testid="source-note">{{ note() }}</span>
    </div>
    @if (ready()) {
      <px-grid [(layout)]="layout" [scheme]="scheme()" [theme]="theme()" [density]="density()" />
    }
  `,
  styles: `
    :host {
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 8px;
      height: 100%;
      padding: 0 12px 12px;
      box-sizing: border-box;
    }
    .bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 16px;
      font-size: 13px;
    }
    .file {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .limit,
    .note {
      color: var(--demo-muted);
    }
    px-grid {
      min-height: 0;
      box-shadow: var(--demo-shadow);
    }
  `
})
export class SourceComponent {
  public readonly scheme = input<Scheme>("light");
  public readonly theme = input<ParallaxTheme>(standardTheme);
  public readonly density = input<Density>("compact");

  protected readonly maxRows = GROUPED.format(MAX_ROWS);
  protected readonly maxMegabytes = GROUPED.format(MAX_ARROW_BYTES / 1_000_000);
  protected readonly layout = signal<LayoutInput>({ dataset: SAMPLE });
  protected readonly ready = signal(false);
  protected readonly note = signal("");
  private readonly client = inject(ParallaxClient);

  constructor() {
    this.client.onRestart((reason) => {
      this.note.set(reason);
    });
    this.client.load(SAMPLE, sampleOrders(Date.now())).then(
      () => {
        this.ready.set(true);
      },
      (failure: unknown) => {
        this.note.set(`The sample did not load: ${failure instanceof Error ? failure.message : String(failure)}`);
      }
    );
  }

  /** Loads the file chosen as a dataset of its own name, then shows it; a file that does not load leaves the grid as it was. */
  protected open(event: Event): void {
    const picker = event.target;
    const file = picker instanceof HTMLInputElement ? picker.files?.[0] : undefined;
    if (!(picker instanceof HTMLInputElement) || file === undefined) {
      return;
    }
    const dataset = datasetFor(file.name);
    this.note.set(`Loading ${file.name}…`);
    file
      .arrayBuffer()
      .then((bytes) => this.client.load(dataset, bytes))
      .then(
        ({ rows }) => {
          this.note.set(`Loaded ${GROUPED.format(rows)} rows from ${file.name}.`);
          this.layout.set({ dataset });
          this.ready.set(true);
        },
        (failure: unknown) => {
          this.note.set(`${file.name} did not load: ${failure instanceof Error ? failure.message : String(failure)}`);
        }
      )
      .finally(() => {
        // The same file may be chosen again.
        picker.value = "";
      });
  }
}
