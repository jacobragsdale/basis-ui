/* The demo's datasets: the Arrow streams `scripts/data.sh` writes with parallax-datagen into `public/data`, which the
 * build serves beside the app. This is the demo's client layer: it calls no API, so its one `fetch` reads those files,
 * as an app's generated client reads its API's Arrow. */

/** Each dataset's primary key, which makes a reload a diff, or null for none. */
const datasetKeys = {
  /** 1,000,000 positions. */
  positions: "position_id",
  /** 1,000,000 trades. */
  trades: "trade_id",
  /** Daily prices for 50 tickers since 2016, about 136,000 rows. */
  prices: null,
  /** 300 positions. */
  book: "position_id",
  /** 500 trades. */
  blotter: "trade_id",
  /** 600 bonds, with their spreads and the fitted curve's. */
  bonds: "cusip",
  /** Four bond portfolios' P&L explained by factor on each of October 2026's trading days, 968 rows. */
  attribution: null,
  /** The Treasury curve, 11 tenors, on each day of 2026 to November that SIFMA recommends trading. */
  curves: null,
  /** 2-, 10- and 30-year Treasury yields every 5 minutes through Thanksgiving week's electronic sessions. */
  yields: null,
} as const satisfies Readonly<Record<string, string | null>>;

/** A dataset the demo serves. */
type DemoDataset = keyof typeof datasetKeys;

const datasetNames = Object.keys(datasetKeys).filter((name): name is DemoDataset =>
  Object.hasOwn(datasetKeys, name),
);

/** The date each dataset of one day is for, its business date, which a grid of it shows as its status bar's "as of":
 * the date parallax-datagen's positions and bonds are on. The others span many days, and show when they were read. */
const datasetDates: Readonly<Partial<Record<DemoDataset, string>>> = {
  bonds: "2026-10-30",
  book: "2026-10-30",
  positions: "2026-10-30",
};

/** Whether `name` is a dataset the demo serves, such as the one a shared link's layout names. */
function isDemoDataset(name: string): name is DemoDataset {
  return Object.hasOwn(datasetKeys, name);
}

/** Fetches a dataset's Arrow stream, as the app's API would send it. */
async function datasetBytes(name: DemoDataset): Promise<ArrayBuffer> {
  const url = `data/${name}.arrows`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `${url} answered ${String(response.status)}; write the demo's data with vp run @basis/parallax-demo#data, then build it again.`,
    );
  }
  return response.arrayBuffer();
}

export { datasetBytes, datasetDates, datasetKeys, datasetNames, isDemoDataset };
export type { DemoDataset };
