/* The harness's datasets: the Arrow streams `parallax-datagen` writes, which the harness's server serves beside the
 * page, as the Angular demo served them. This is the harness's client layer: it has no API and no generated client,
 * so its one `fetch` is here. */

/** Each dataset's primary key, which makes a reload a diff, as in the Angular demo. */
const datasets = {
  bonds: "cusip",
  positions: "position_id",
  prices: null,
  trades: "trade_id",
} as const satisfies Readonly<Record<string, string | null>>;

/** A dataset the harness serves. */
type HarnessDataset = keyof typeof datasets;

/** Fetches a dataset's Arrow stream, as an app's API would send it. */
async function datasetBytes(name: HarnessDataset): Promise<ArrayBuffer> {
  const url = `/data/${name}.arrows`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `${url} answered ${String(response.status)}; the e2e data is written by vp run @basis/parallax#e2e.`,
    );
  }
  return response.arrayBuffer();
}

export { datasetBytes, datasets };
export type { HarnessDataset };
