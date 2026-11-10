/* The theme's colours on the tokens page: every token @basis/ui exports, as a swatch with its value in this mode and
 * its contrast against the surfaces it sits on, read from the page's stylesheet. Text, lines and solid fills list the
 * surfaces under them; a surface lists the text drawn on it. The chart palettes are in their own section. */

import { Num, tokenNames } from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

import { contrastRatio } from "./contrast.ts";
import { useTokenValues } from "./theme-values.ts";
import type { TokenValue } from "./theme-values.ts";

/** The surfaces a page, a card and a popup are drawn on, which text, lines and charts sit on. */
const pageSurfaces = ["background", "card", "popover"] as const;
/** The fills that text in `foreground` also sits on: a muted panel, a secondary button and a hovered item. */
const fills = ["muted", "secondary", "accent"] as const;
const statuses = ["destructive", "success", "warning", "info"] as const;

const names = new Set(tokenNames);

/** How a colour is used, so where it sits: on surfaces, or under text. */
interface Pairing {
  /** The tokens it sits on, for text, a line or a solid fill drawn on a surface. */
  readonly on: readonly string[];
  /** The tokens drawn on it, for a surface. */
  readonly under: readonly string[];
}

/** Tokens whose pairing no rule below gives. */
const special: Readonly<Record<string, Pairing>> = {
  background: { on: [], under: ["foreground", "muted-foreground"] },
  foreground: { on: [...pageSurfaces, ...fills, "selection", "highlight"], under: [] },
  highlight: { on: [], under: ["foreground"] },
  "muted-foreground": { on: [...pageSurfaces, "muted"], under: [] },
  selection: { on: [], under: ["foreground"] },
};

const foregroundSuffix = "-foreground";
const subtleSuffix = "-subtle";

/** Text on a fill (`X-foreground` on `X`), a tint under its status's text (`X-subtle`), a fill with its own text and,
 * for a status, the page under it, a part of the sidebar on the sidebar, and anything else on the page's surfaces. */
function pairingOf(name: string): Pairing {
  const base = name.endsWith(foregroundSuffix) ? name.slice(0, -foregroundSuffix.length) : "";
  if (name.endsWith(subtleSuffix)) {
    return { on: [], under: [name.slice(0, -subtleSuffix.length)] };
  }
  if (base !== "") {
    return { on: names.has(base) ? [base] : [], under: [] };
  }
  if (names.has(`${name}${foregroundSuffix}`)) {
    const isStatus = (statuses as readonly string[]).includes(name);
    return { on: isStatus ? pageSurfaces : [], under: [`${name}${foregroundSuffix}`] };
  }
  return { on: name.startsWith("sidebar-") ? ["sidebar"] : pageSurfaces, under: [] };
}

interface PairProps {
  readonly label: string;
  readonly ratio: number | undefined;
}

function Pair({ label, ratio }: PairProps): ReactElement {
  return (
    <li className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      {ratio === undefined ? (
        <span>—</span>
      ) : (
        <span>
          <Num value={ratio} decimals={1} />
          :1
        </span>
      )}
    </li>
  );
}

interface SwatchProps {
  readonly name: string;
  readonly values: ReadonlyMap<string, TokenValue>;
}

/** One token: its colour, its name and value, and its contrast with each token it is paired with. */
function Swatch({ name, values }: SwatchProps): ReactElement {
  const value = values.get(name);
  const { on, under } = special[name] ?? pairingOf(name);
  return (
    <li data-token={name} className="flex flex-col gap-2 rounded-lg border bg-card p-2 text-xs">
      <div
        className="h-10 rounded-md border bg-(--swatch)"
        style={{ "--swatch": `var(--${name})` }}
      />
      <div className="flex flex-col">
        <code className="font-mono font-medium">{name}</code>
        <code className="font-mono text-2xs text-muted-foreground">{value?.declared ?? "—"}</code>
      </div>
      <ul className="flex flex-col">
        {on.map((surface) => (
          <Pair
            key={`on-${surface}`}
            label={`on ${surface}`}
            ratio={contrastRatio(value?.luminance, values.get(surface)?.luminance)}
          />
        ))}
        {under.map((text) => (
          <Pair
            key={`under-${text}`}
            label={`${text} on it`}
            ratio={contrastRatio(value?.luminance, values.get(text)?.luminance)}
          />
        ))}
      </ul>
    </li>
  );
}

const chartPrefixes = ["chart-", "seq-", "div-"] as const;

function isChartColour(name: string): boolean {
  return chartPrefixes.some((prefix) => name.startsWith(prefix));
}

function SwatchGrid({ tokens }: { readonly tokens: readonly string[] }): ReactElement {
  const values = useTokenValues();
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {tokens.map((name) => (
        <Swatch key={name} name={name} values={values} />
      ))}
    </ul>
  );
}

function ColoursSection(): ReactElement {
  return (
    <Section
      title="Colours"
      description="Every semantic token in this mode, with its contrast against the surfaces it sits on, or of the text drawn on it. Text needs 5.5:1, and outlines and rings 3:1."
    >
      <SwatchGrid tokens={tokenNames.filter((name) => !isChartColour(name))} />
    </Section>
  );
}

function ChartPalettesSection(): ReactElement {
  return (
    <Section
      title="Chart palettes"
      description="The eight series colours in their fixed order, the sequential scale and the diverging scale, each against the page and a card, as parallax's canvases draw them."
    >
      {chartPrefixes.map((prefix) => (
        <SwatchGrid key={prefix} tokens={tokenNames.filter((name) => name.startsWith(prefix))} />
      ))}
    </Section>
  );
}

export { ChartPalettesSection, ColoursSection };
