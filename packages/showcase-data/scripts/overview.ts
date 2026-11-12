/* The overview the showcase's API would answer on 30 October: its figures summed from the positions, each with a walk
 * of its last 20 days that ends at it, P&L and value by fund, exposure by sector and by rating, and the day's alerts. */

import type { Table } from "apache-arrow";

interface Totals {
  mv: number;
  pnl: number;
  dv01: number;
}

/** The scale of the positions' money columns, decimals of two places. */
const moneyScale = 2;
const trendDays = 20;
/** The day before the last, from the trend's end. */
const dayBefore = -2;
/** A walk's daily step, at most this fraction of the figure either way. */
const stepFraction = 0.04;
const half = 0.5;
/** A linear congruential generator's constants, glibc's, so the walk is the same on every run. */
const multiplier = 1_103_515_245;
const increment = 12_345;
const modulus = 2_147_483_648;

/** A 32-bit word's place value, and its greatest value. */
const wordBits = 32;
const wordValue = 2 ** wordBits;
const wordMax = wordValue - 1;
/** A 128-bit integer is negative when its highest word's top bit is set. */
const signBit = wordValue / 2;
const wordCount = 4;
const decimal = 10;

/** A decimal cell as a double, from the four 32-bit words apache-arrow gives its 128-bit integer, lowest first, or 0
 * for none. A negative integer is read by its complement, so its magnitude keeps a double's precision. */
function decimalOf(value: unknown, scale: number): number {
  if (!(value instanceof Uint32Array)) {
    return 0;
  }
  const negative = (value[wordCount - 1] ?? 0) >= signBit;
  let magnitude = 0;
  for (let index = wordCount - 1; index >= 0; index -= 1) {
    const word = value[index] ?? 0;
    magnitude = magnitude * wordValue + (negative ? wordMax - word : word);
  }
  return (negative ? -(magnitude + 1) : magnitude) / decimal ** scale;
}

function money(value: unknown): number {
  return decimalOf(value, moneyScale);
}

/** Adds a row's figures to its group's totals in `groups`. */
function addRow(groups: Map<string, Totals>, group: unknown, row: Totals): void {
  if (typeof group !== "string") {
    return;
  }
  const totals = groups.get(group) ?? { dv01: 0, mv: 0, pnl: 0 };
  totals.mv += row.mv;
  totals.pnl += row.pnl;
  totals.dv01 += row.dv01;
  groups.set(group, totals);
}

/** Each value of `key`'s totals of the positions' market value, P&L on the day and DV01. */
function totalsBy(positions: Table, key: string): Map<string, Totals> {
  const groups = new Map<string, Totals>();
  const [keys, mv, pnl, dv01] = [key, "market_value_usd", "daily_pnl_usd", "dv01_usd"].map((name) =>
    positions.getChild(name),
  );
  for (let index = 0; index < positions.numRows; index += 1) {
    addRow(groups, keys?.get(index), {
      dv01: Number(dv01?.get(index) ?? 0),
      mv: money(mv?.get(index)),
      pnl: money(pnl?.get(index)),
    });
  }
  return groups;
}

/** The last 20 days of a figure that ends at `value`, a walk the same on every run from `seed`. */
function trendTo(value: number, seed: number): number[] {
  const points = [value];
  let state = seed;
  for (let index = 1; index < trendDays; index += 1) {
    state = (state * multiplier + increment) % modulus;
    const step = (state / modulus - half) * stepFraction * Math.abs(value);
    points.push((points.at(-1) ?? value) - step);
  }
  return points.toReversed();
}

/** A figure for a card: its value, its change on the day as a fraction of the day before's, and its trend. */
function kpi(
  id: string,
  label: string,
  { seed, value }: { readonly seed: number; readonly value: number },
): object {
  const trend = trendTo(value, seed);
  const before = trend.at(dayBefore) ?? value;
  return { change: (value - before) / Math.abs(before), id, kind: "money", label, trend, value };
}

function exposure(groups: Map<string, Totals>): object[] {
  return [...groups].map(([group, totals]) => ({
    dv01_usd: totals.dv01,
    group,
    market_value_usd: totals.mv,
  }));
}

function alerts(worstFund: string): object[] {
  return [
    {
      detail: `${worstFund} lost the most on the day.`,
      id: "a1",
      raised_at: "2026-10-30T20:15:00Z",
      severity: "warning",
      title: "Largest loss by fund",
    },
    {
      detail: "Three trades failed to settle on T+1 and wait on the counterparty.",
      id: "a2",
      raised_at: "2026-10-30T18:40:00Z",
      severity: "critical",
      title: "Settlement fails",
    },
    {
      detail: "The Treasury curve's 2s10s spread moved 8 bp on the day.",
      id: "a3",
      raised_at: "2026-10-30T16:05:00Z",
      severity: "info",
      title: "Curve steepened",
    },
  ];
}

/** The overview's body, from the positions. */
function overviewOf(positions: Table): object {
  const byFund = totalsBy(positions, "fund");
  const funds = [...byFund.values()];
  const sum = (pick: (totals: Totals) => number): number =>
    funds.reduce((total, totals) => total + pick(totals), 0);
  const [[worst] = [""]] = [...byFund].toSorted((left, right) => left[1].pnl - right[1].pnl);
  return {
    alerts: alerts(worst),
    as_of: "2026-10-30",
    exposure_by_rating: exposure(totalsBy(positions, "credit_rating")),
    exposure_by_sector: exposure(totalsBy(positions, "sector")),
    kpis: [
      kpi("market_value", "Market value", { seed: 7, value: sum((totals) => totals.mv) }),
      kpi("day_pnl", "P&L on the day", { seed: 11, value: sum((totals) => totals.pnl) }),
      kpi("dv01", "DV01", { seed: 13, value: sum((totals) => totals.dv01) }),
    ],
    pnl_by_fund: [...byFund].map(([fund, totals]) => ({
      aum_usd: totals.mv,
      fund,
      pnl_usd: totals.pnl,
    })),
  };
}

export { decimalOf, overviewOf };
