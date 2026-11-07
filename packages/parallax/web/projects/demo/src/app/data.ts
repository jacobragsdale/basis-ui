/**
 * The demo's datasets. `pnpm build:data` generates them with parallax-datagen as Arrow IPC streams into
 * `public/data`, the build serves them beside the app, and each page loads the ones it shows into the page's engine,
 * as an app loads its API's answers. The large ones are at the browser's limits: 150,000 rows, and positions'
 * 69 MB of Arrow is just under 70 MB.
 */

import { Injectable, inject } from "@angular/core";
import { ParallaxClient } from "parallax";

/** Each dataset's primary key, which makes a reload a diff. */
const DATASETS = {
  /** 150,000 positions. */
  positions: "position_id",
  /** 150,000 trades. */
  trades: "trade_id",
  /** Daily prices for 50 tickers since 2016, about 136,000 rows. */
  prices: null,
  /** 300 positions. */
  book: "position_id",
  /** 500 trades. */
  blotter: "trade_id"
} as const satisfies Readonly<Record<string, string | null>>;

/** A dataset the demo serves. */
export type DemoDataset = keyof typeof DATASETS;

/** Whether `name` is a dataset the demo serves, such as the one a shared link's layout names. */
export function isDemoDataset(name: string): name is DemoDataset {
  return Object.hasOwn(DATASETS, name);
}

/** Fetches a dataset's Arrow stream as the app's API would send it. */
async function fetchArrow(name: DemoDataset): Promise<ArrayBuffer> {
  const url = `data/${name}.arrows`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} answered ${String(response.status)}; the demo's data is built by pnpm build:data`);
  }
  return response.arrayBuffer();
}

/** Loads the demo's datasets into the page's engine, each once. */
@Injectable({ providedIn: "root" })
export class DemoData {
  private readonly client = inject(ParallaxClient);
  private readonly started = new Set<DemoDataset>();

  /**
   * Starts loading each dataset a page shows. Call it before the page's views open, as in its constructor: the loads
   * are under way from this call, so a view waits for its data, and one whose data fails to load says why.
   */
  public need(...names: readonly DemoDataset[]): void {
    for (const name of names) {
      if (!this.started.has(name)) {
        this.started.add(name);
        // Every view of the dataset reports a failed load, so nothing more is done with it here.
        this.client.load(name, fetchArrow(name), { primaryKey: DATASETS[name] }).catch(() => undefined);
      }
    }
  }
}
