import { ChangeDetectionStrategy, Component, input, signal, viewChild } from "@angular/core";
import { GridComponent } from "parallax";
import type { Density, LayoutInput, ThemeName } from "parallax";

import type { GridStats } from "./performance.component";

/**
 * Two small tables side by side: a few hundred rows, the size most tables are. The book is held in the page and
 * run by the WebAssembly engine; the blotter is held on the server. Every change should feel instant at this size,
 * and the performance overlay times each one.
 */
@Component({
  selector: "demo-small",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GridComponent],
  template: `
    <section data-table="book">
      <h2>Book <span>300 positions, held in this page</span></h2>
      <px-grid #bookGrid [(layout)]="book" [theme]="theme()" [density]="density()" />
    </section>
    <section data-table="blotter">
      <h2>Blotter <span>500 trades, held on the server</span></h2>
      <px-grid #blotterGrid [(layout)]="blotter" [theme]="theme()" [density]="density()" />
    </section>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
      gap: 12px;
      height: 100%;
      padding: 0 12px 12px;
      box-sizing: border-box;
      overflow: auto;
    }
    section {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    h2 {
      margin: 4px 0 6px;
      font-size: 14px;
    }
    h2 span {
      margin-left: 6px;
      font-weight: normal;
      color: #667085;
    }
    px-grid {
      flex: 1;
      min-height: 0;
    }
  `
})
export class SmallComponent {
  public readonly theme = input<ThemeName>("light");
  public readonly density = input<Density>("compact");

  protected readonly book = signal<LayoutInput>({ dataset: "book" });
  protected readonly blotter = signal<LayoutInput>({ dataset: "blotter" });

  private readonly bookGrid = viewChild("bookGrid", { read: GridComponent });
  private readonly blotterGrid = viewChild("blotterGrid", { read: GridComponent });

  /** Each grid's drawing counters, for the performance overlay. */
  public stats(): readonly GridStats[] {
    const stats: GridStats[] = [];
    for (const [name, grid] of [
      ["book", this.bookGrid()],
      ["blotter", this.blotterGrid()]
    ] as const) {
      if (grid !== undefined) {
        stats.push({ name, stats: grid.drawStats() });
      }
    }
    return stats;
  }
}
