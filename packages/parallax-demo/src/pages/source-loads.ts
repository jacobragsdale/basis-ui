/* The "Data from the app" page's loads: the sample the page makes, then each file the user opens. The page keeps two,
 * the one its grid shows and the one loading, so that a file that does not load leaves the grid as it was. */

import type { Dataset, DatasetSource } from "@basis/parallax";

import { sampleName, sampleOrders } from "#api/sample.ts";

/** One load: the dataset's name, what the page calls it, its source, and its place in the order of loads. */
interface Load {
  readonly name: string;
  readonly label: string;
  readonly source: DatasetSource;
  readonly order: number;
}

/** The two loads the page keeps; the second is empty until a file is opened. */
type Slots = readonly [Load, Load | null];

/** A load with the dataset `useDataset` made of it. */
interface Loaded {
  readonly load: Load;
  readonly dataset: Dataset;
}

const grouped = new Intl.NumberFormat("en-US");

/** The page's first load: the sample, as the app's API would send it now. */
function firstSlots(): Slots {
  return [
    { label: "the sample", name: sampleName, order: 0, source: sampleOrders(Date.now()) },
    null,
  ];
}

/** A dataset name for a file: its name without the extension, in letters, digits and underscores. */
function datasetFor(file: string): string {
  const name = file.replace(/\.[^.]*$/u, "").replaceAll(/[^A-Za-z0-9_]/gu, "_");
  return name === "" ? "data" : name;
}

/** The loads, newest first. */
function newestFirst(loads: readonly (Loaded | null)[]): Loaded[] {
  return loads
    .filter((loaded) => loaded !== null)
    .toSorted((first, second) => second.load.order - first.load.order);
}

/** The load the grid shows: the newest that has loaded, else the newest still loading, else the newest. */
function shownOf(loads: readonly Loaded[]): Loaded | null {
  return (
    loads.find((loaded) => loaded.dataset.status === "loaded") ??
    loads.find((loaded) => loaded.dataset.status !== "failed") ??
    loads[0] ??
    null
  );
}

/** The slots with a file's load in the slot the grid does not show. */
function withFile(slots: Slots, shown: Load | null, file: File): Slots {
  const order = Math.max(slots[0].order, slots[1]?.order ?? 0) + 1;
  const load: Load = {
    label: file.name,
    name: datasetFor(file.name),
    order,
    source: async () => file.arrayBuffer(),
  };
  return shown === slots[0] ? [slots[0], load] : [load, slots[1]];
}

/** What the page says of the newest load. */
function noteOf(newest: Loaded | undefined): string {
  if (newest === undefined) {
    return "";
  }
  const { load, dataset } = newest;
  if (dataset.status === "failed") {
    const what = load.order === 0 ? "The sample" : load.label;
    return `${what} did not load: ${dataset.error ?? "no reason was given"}`;
  }
  if (load.order === 0) {
    return "";
  }
  return dataset.status === "loaded"
    ? `Loaded ${grouped.format(dataset.rows ?? 0)} rows from ${load.label}.`
    : `Loading ${load.label}…`;
}

export { firstSlots, newestFirst, noteOf, shownOf, withFile };
export type { Load, Loaded, Slots };
