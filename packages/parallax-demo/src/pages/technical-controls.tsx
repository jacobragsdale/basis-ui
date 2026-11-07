/* The technical-analysis page's controls: the ticker, the chart's kind and its first day, the comparison, the events
 * and the log scale, and a box per indicator, off where it does not fit the chart. */

import {
  Checkbox,
  FieldLegend,
  FieldSet,
  Label,
  NativeSelect,
  NativeSelectOption,
} from "@basis/ui";
import type { ChangeEvent, ReactNode } from "react";

import { fits, kinds, options, starts, tickers } from "./technical-settings.ts";
import type { Settings } from "./technical-settings.ts";

/** What a change of settings changes: the rows drawn, which drops the zoom and the brush, or the prices' units, which
 * drops the drawings too. */
interface Change {
  readonly rows: boolean;
  readonly units: boolean;
}

/** Applies new settings, with what they change. */
type Apply = (next: Settings, change: Change) => void;

interface ControlProps {
  readonly settings: Settings;
  readonly apply: Apply;
}

/** The value among `values` that is `value`, or null. */
function parse<TValue extends string>(values: readonly TValue[], value: string): TValue | null {
  return values.find((candidate) => candidate === value) ?? null;
}

/** A month's start as its year and month. */
function month(since: string): string {
  return since.slice(0, "YYYY-MM".length);
}

/** A choice among `values`, labelled `label`, each shown as `shown` says. */
function Choice<TValue extends string>(props: {
  readonly label: string;
  readonly name: string;
  readonly values: readonly TValue[];
  readonly value: TValue;
  readonly disabled: boolean;
  readonly shown?: (value: TValue) => string;
  readonly onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
}): ReactNode {
  const id = `technical-${props.label.toLowerCase()}`;
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id}>{props.label}</Label>
      <NativeSelect
        id={id}
        size="sm"
        aria-label={props.name}
        value={props.value}
        disabled={props.disabled}
        onChange={props.onChange}
      >
        {props.values.map((value) => (
          <NativeSelectOption key={value} value={value}>
            {props.shown === undefined ? value : props.shown(value)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
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
        onChange={pick("ticker")}
      />
      <Choice
        label="Chart"
        name="Chart kind"
        values={kinds}
        value={settings.kind}
        disabled={settings.compare}
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

/** A checkbox and its label. */
function Box(props: {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onChange: () => void;
}): ReactNode {
  return (
    <div className="flex items-center gap-1.5">
      <Checkbox
        id={props.id}
        checked={props.checked}
        disabled={props.disabled}
        onCheckedChange={props.onChange}
      />
      <Label htmlFor={props.id}>{props.label}</Label>
    </div>
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
      <Box
        id="technical-compare"
        label="Compare three tickers"
        checked={settings.compare}
        disabled={false}
        onChange={flag("compare")}
      />
      <Box
        id="technical-events"
        label="Events"
        checked={settings.events}
        disabled={false}
        onChange={flag("events")}
      />
      <Box
        id="technical-log"
        label="Log scale"
        checked={settings.log}
        disabled={settings.compare}
        onChange={flag("log")}
      />
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
    <FieldSet>
      <FieldLegend variant="label">Indicators</FieldLegend>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {options.map((option) => (
          <Box
            key={option.key}
            id={`technical-${option.key}`}
            label={option.label}
            checked={settings.on.has(option.key)}
            disabled={!fits(option, settings)}
            onChange={toggle(option.key)}
          />
        ))}
      </div>
    </FieldSet>
  );
}

/** Every control, in a form the chart's settings name. */
function TechnicalControls(props: ControlProps): ReactNode {
  return (
    <form
      aria-label="Chart settings"
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Choices {...props} />
        <Flags {...props} />
      </div>
      <Indicators {...props} />
    </form>
  );
}

export { TechnicalControls };
export type { Apply, Change };
