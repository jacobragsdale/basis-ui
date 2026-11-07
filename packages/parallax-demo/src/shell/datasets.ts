/* The demo's datasets in the page's engine. Each loads the first time a page needs it and stays loaded while the demo
 * is open, so moving between pages loads nothing twice. A route's loader says which datasets its page shows, with
 * `needDatasets`, before the page renders; `DemoDatasets` loads them, and pages read them with `useDemoDataset`. */

import type { Dataset } from "@basis/parallax";
import { createContext, use } from "react";

import type { DemoDataset } from "#api/datasets.ts";

/** The datasets the demo's pages have asked for, which only grows. */
class Wanted {
  #names: ReadonlySet<DemoDataset> = new Set();
  readonly #listeners = new Set<() => void>();

  /** Adds `names`, telling the listeners if any is new. */
  public need(names: readonly DemoDataset[]): void {
    const next = new Set([...this.#names, ...names]);
    if (next.size === this.#names.size) {
      return;
    }
    this.#names = next;
    for (const listener of this.#listeners) {
      listener();
    }
  }

  public readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  public readonly getSnapshot = (): ReadonlySet<DemoDataset> => this.#names;
}

const wanted = new Wanted();

/** Asks for the datasets a page shows, from its route's loader: they load once, and stay loaded. */
function needDatasets(...names: readonly DemoDataset[]): void {
  wanted.need(names);
}

type Datasets = Readonly<Record<DemoDataset, Dataset>>;

const DatasetsContext = createContext<Datasets | null>(null);

/** A dataset of the demo's, which the page's route asked for with `needDatasets`. */
function useDemoDataset(name: DemoDataset): Dataset {
  const datasets = use(DatasetsContext);
  if (datasets === null) {
    throw new Error(
      "useDemoDataset is used outside DemoDatasets, which the demo's layout renders.",
    );
  }
  return datasets[name];
}

export { DatasetsContext, needDatasets, useDemoDataset, wanted };
export type { Datasets };
