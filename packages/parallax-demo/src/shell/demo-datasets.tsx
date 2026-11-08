/* Loads every dataset a page of the demo has asked for, with `needDatasets`, into the engine of the
 * `ParallaxProvider` around it, and keeps it loaded. */

import { useDataset } from "@basis/parallax";
import type { Dataset, DatasetSource } from "@basis/parallax";
import { useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { datasetBytes, datasetKeys } from "#api/datasets.ts";
import type { DemoDataset } from "#api/datasets.ts";

import { DatasetsContext, wanted } from "./datasets.ts";
import type { Datasets } from "./datasets.ts";

/** Each dataset's source: one function each, so a dataset never loads twice from the same request. */
const sources: Readonly<Record<DemoDataset, DatasetSource>> = {
  attribution: async () => datasetBytes("attribution"),
  blotter: async () => datasetBytes("blotter"),
  bonds: async () => datasetBytes("bonds"),
  book: async () => datasetBytes("book"),
  positions: async () => datasetBytes("positions"),
  prices: async () => datasetBytes("prices"),
  trades: async () => datasetBytes("trades"),
};

/** One dataset, loading once it is wanted. */
function useDemoDatasetLoad(name: DemoDataset, names: ReadonlySet<DemoDataset>): Dataset {
  return useDataset(name, names.has(name) ? sources[name] : null, {
    primaryKey: datasetKeys[name],
  });
}

/** Loads every dataset a page has asked for into the engine of the `ParallaxProvider` around it. */
function DemoDatasets({ children }: { readonly children: ReactNode }): ReactNode {
  const names = useSyncExternalStore(wanted.subscribe, wanted.getSnapshot);
  const attribution = useDemoDatasetLoad("attribution", names);
  const blotter = useDemoDatasetLoad("blotter", names);
  const bonds = useDemoDatasetLoad("bonds", names);
  const book = useDemoDatasetLoad("book", names);
  const positions = useDemoDatasetLoad("positions", names);
  const prices = useDemoDatasetLoad("prices", names);
  const trades = useDemoDatasetLoad("trades", names);
  const datasets: Datasets = useMemo(
    () => ({ attribution, blotter, bonds, book, positions, prices, trades }),
    [attribution, blotter, bonds, book, positions, prices, trades],
  );
  return <DatasetsContext value={datasets}>{children}</DatasetsContext>;
}

export { DemoDatasets };
