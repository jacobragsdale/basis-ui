/* The technical-analysis page: one instrument's chart, whose indicators, kind and range the controls set, and its days
 * below, which a brush narrows, as in the Angular demo. */

import { useState } from "react";
import type { ChangeEvent, ReactNode } from "react";

import { Chart, useDataset } from "#index.ts";
import type { Layout, LayoutFilter, LayoutInput } from "#index.ts";

import { datasetBytes } from "./api/datasets.ts";
import { LinkedRows } from "./linked-rows.tsx";
import {
  chartLayout,
  daysLayout,
  firstSettings,
  fits,
  kinds,
  options,
  starts,
  tickers,
} from "./technical-settings.ts";
import type { Kept, Settings } from "./technical-settings.ts";

const prices = async (): Promise<ArrayBuffer> => datasetBytes("prices");

/** What a change of settings changes: the rows drawn, which drops the zoom and the brush, or the prices' units, which
 * drops the drawings too. */
interface Change {
  readonly rows: boolean;
  readonly units: boolean;
}

/** Applies new settings, with what they change. */
type Apply = (next: Settings, change: Change) => void;

/** The value among `values` that is `value`, or null. */
function parse<TValue extends string>(values: readonly TValue[], value: string): TValue | null {
  return values.find((candidate) => candidate === value) ?? null;
}

/** What the chart keeps of the one before it: its drawings unless the units change, its zoom unless the rows do, and
 * its hidden series. */
function keptOf(chart: LayoutInput["chart"], change: Change): Kept {
  return {
    ...(change.units || chart?.drawings === undefined ? {} : { drawings: chart.drawings }),
    ...(change.rows ? {} : { range: chart?.range ?? null }),
    ...(chart?.hidden === undefined ? {} : { hidden: chart.hidden }),
  };
}

/** The page's settings and its chart. */
interface Shown {
  readonly settings: Settings;
  readonly chart: LayoutInput;
}

/** The page's settings, its chart and its days, and how a change of settings remakes them. */
function useTechnical(): Shown & {
  readonly handleLayout: (layout: Layout) => void;
  readonly brush: readonly LayoutFilter[];
  readonly handleBrush: (filters: readonly LayoutFilter[] | null) => void;
  readonly apply: Apply;
} {
  const [shown, setShown] = useState<Shown>(() => ({
    chart: chartLayout(firstSettings, {}),
    settings: firstSettings,
  }));
  const [brush, setBrush] = useState<readonly LayoutFilter[]>([]);
  return {
    ...shown,
    apply: (next, change) => {
      setShown((was) => ({
        chart: chartLayout(next, keptOf(was.chart.chart, change)),
        settings: next,
      }));
      if (change.rows) {
        setBrush([]);
      }
    },
    brush,
    handleBrush: (filters) => {
      setBrush(filters ?? []);
    },
    handleLayout: (layout) => {
      setShown((was) => ({ ...was, chart: layout }));
    },
  };
}

interface ControlProps {
  readonly settings: Settings;
  readonly apply: Apply;
}

/** A value as it is shown. */
function same(value: string): string {
  return value;
}

/** A month's start as its year and month. */
function month(since: string): string {
  return since.slice(0, "YYYY-MM".length);
}

/** A choice among `values`, labelled `label`, showing each as `shown` does. */
function Choice<TValue extends string>(props: {
  readonly label: string;
  readonly name: string;
  readonly values: readonly TValue[];
  readonly value: TValue;
  readonly disabled: boolean;
  readonly shown: (value: TValue) => string;
  readonly onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
}): ReactNode {
  return (
    <label>
      {props.label}{" "}
      <select
        aria-label={props.name}
        value={props.value}
        disabled={props.disabled}
        onChange={props.onChange}
      >
        {props.values.map((value) => (
          <option key={value} value={value}>
            {props.shown(value)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The ticker, the chart's kind and its first day. */
function Choices({ settings, apply }: ControlProps): ReactNode {
  const pick =
    (field: "ticker" | "kind" | "since") =>
    (event: ChangeEvent<HTMLSelectElement>): void => {
      const { value } = event.currentTarget;
      const ticker = field === "ticker" ? parse(tickers, value) : settings.ticker;
      const kind = field === "kind" ? parse(kinds, value) : settings.kind;
      const since = field === "since" ? parse(starts, value) : settings.since;
      if (ticker !== null && kind !== null && since !== null) {
        apply(
          { ...settings, kind, since, ticker },
          { rows: field !== "kind", units: field === "ticker" },
        );
      }
    };
  return (
    <>
      <Choice
        label="Ticker"
        name="Ticker"
        values={tickers}
        value={settings.ticker}
        disabled={settings.compare}
        shown={same}
        onChange={pick("ticker")}
      />
      <Choice
        label="Chart"
        name="Chart kind"
        values={kinds}
        value={settings.kind}
        disabled={settings.compare}
        shown={same}
        onChange={pick("kind")}
      />
      <Choice
        label="Since"
        name="Since"
        values={starts}
        value={settings.since}
        disabled={false}
        shown={month}
        onChange={pick("since")}
      />
    </>
  );
}

/** The comparison, the events and the log scale. */
function Flags({ settings, apply }: ControlProps): ReactNode {
  const flag = (field: "compare" | "events" | "log") => (): void => {
    const compare = field === "compare";
    apply({ ...settings, [field]: !settings[field] }, { rows: compare, units: compare });
  };
  return (
    <>
      <label>
        <input type="checkbox" checked={settings.compare} onChange={flag("compare")} /> Compare
        three tickers
      </label>
      <label>
        <input type="checkbox" checked={settings.events} onChange={flag("events")} /> Events
      </label>
      <label>
        <input
          type="checkbox"
          checked={settings.log}
          disabled={settings.compare}
          onChange={flag("log")}
        />{" "}
        Log scale
      </label>
    </>
  );
}

/** A box per indicator, off where it does not fit the chart. */
function Indicators({ settings, apply }: ControlProps): ReactNode {
  const toggle = (key: string) => (): void => {
    const on = new Set(settings.on);
    if (!on.delete(key)) {
      on.add(key);
    }
    apply({ ...settings, on }, { rows: false, units: false });
  };
  return (
    <fieldset className="flex flex-wrap gap-x-3 gap-y-1 rounded-xl border px-2 pb-1">
      <legend className="text-xs">Indicators</legend>
      {options.map((option) => (
        <label key={option.key}>
          <input
            type="checkbox"
            checked={settings.on.has(option.key)}
            disabled={!fits(option, settings)}
            onChange={toggle(option.key)}
          />{" "}
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

/** The technical-analysis page. */
function TechnicalPage(): ReactNode {
  const data = useDataset("prices", prices);
  const page = useTechnical();
  const { settings, apply } = page;
  return (
    <main className="flex h-screen flex-col gap-2 px-3 pt-2 pb-3">
      <form
        aria-label="Chart settings"
        className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm"
      >
        <Choices settings={settings} apply={apply} />
        <Flags settings={settings} apply={apply} />
        <Indicators settings={settings} apply={apply} />
      </form>
      <section
        data-slot="technical-chart"
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-sm"
      >
        <Chart
          className="min-h-0 flex-1"
          dataset={data}
          layout={page.chart}
          onLayoutChange={page.handleLayout}
          onBrush={page.handleBrush}
        />
      </section>
      <LinkedRows
        linked="technical"
        data={data}
        layout={daysLayout(settings, page.brush)}
        title={
          page.brush.length === 0
            ? "Every day shown, newest first: Shift-drag on the chart to narrow them"
            : "The days brushed on the chart"
        }
      />
    </main>
  );
}

export { TechnicalPage };
