/* The end-to-end harness: the Angular demo's grid pages, rebuilt on `<Grid>`. The address bar picks the page
 * (`preset`: pivot, trades or small), the scheme (`theme`), the canvas's theme (`look`: standard, airy or basis), the
 * density, @basis/ui's theme (`ui`, one of its `themeNames`), and the drawing counters (`performance=on`).
 * Standard is parallax's own look, the demo's, so a canvas here can be compared with the demo's screenshots; basis is
 * the look an app on `@basis/ui` gets. */

import { NativeSelect, NativeSelectOption, themeNames } from "@basis/ui";
import { useEffect, useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";

import { ParallaxProvider, basisTheme } from "#index.ts";

import { airyTheme, standardTheme } from "#theme/looks.ts";
import type { ResolvedScheme } from "#index.ts";

import { SinglePage, SmallTables } from "./pages.tsx";

// @basis/ui's theme, as `?ui=NAME` names it, before anything draws.
document.documentElement.dataset["theme"] =
  themeNames.find((name) => name === new URLSearchParams(location.search).get("ui")) ??
  themeNames[0];

const looks = { airy: airyTheme, basis: basisTheme, standard: standardTheme } as const;

/** What the address bar asks for. */
interface Search {
  readonly preset: "pivot" | "trades" | "small";
  readonly theme: ResolvedScheme;
  readonly look: keyof typeof looks;
  readonly density: "compact" | "comfortable";
  readonly performance: boolean;
  /** Whether the book draws rich cells: bars, heat, badges, a link and a rule. */
  readonly cells: boolean;
}

/** One of `allowed`, from the address bar, or `otherwise`. */
function pick<TValue extends string>(
  name: string,
  allowed: readonly TValue[],
  otherwise: TValue,
): TValue {
  const value = new URLSearchParams(location.search).get(name);
  return allowed.find((entry) => entry === value) ?? otherwise;
}

function readSearch(): Search {
  return {
    cells: pick("cells", ["1", "0"], "0") === "1",
    density: pick("density", ["compact", "comfortable"], "compact"),
    look: pick("look", ["standard", "airy", "basis"], "standard"),
    performance: pick("performance", ["on", "off"], "off") === "on",
    preset: pick("preset", ["pivot", "trades", "small"], "pivot"),
    theme: pick("theme", ["light", "dark"], "light"),
  };
}

/** Starts the engine's worker, from the package's source. */
function startWorker(): Worker {
  return new Worker(new URL("../../../../src/worker.ts", import.meta.url), {
    name: "parallax",
    type: "module",
  });
}

/** A select in the header, which the specs find by its label. */
function Choice({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly string[];
  readonly onChange: (value: string) => void;
}): ReactNode {
  return (
    <NativeSelect
      size="sm"
      aria-label={label}
      value={value}
      onChange={(event) => {
        onChange(event.currentTarget.value);
      }}
    >
      {options.map((option) => (
        <NativeSelectOption key={option} value={option}>
          {option}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

/** The page's scheme and density, as `@basis/ui`'s preferences put them on the root element. */
function usePage(
  search: Search,
): readonly [ResolvedScheme, (scheme: string) => void, string, (density: string) => void] {
  const [scheme, setScheme] = useState<ResolvedScheme>(search.theme);
  const [density, setDensity] = useState<string>(search.density);
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", scheme === "dark");
    document.documentElement.dataset["density"] = density;
  }, [density, scheme]);
  const chooseScheme = (value: string): void => {
    setScheme(value === "dark" ? "dark" : "light");
  };
  return [scheme, chooseScheme, density, setDensity];
}

/** The page's title, as the browser's tab shows it. */
function useTitle(preset: Search["preset"]): void {
  useEffect(() => {
    document.title = `Parallax grid harness: ${preset}`;
  }, [preset]);
}

/** The harness. */
function Harness(): ReactNode {
  const search = readSearch();
  const [scheme, setScheme, density, setDensity] = usePage(search);
  useTitle(search.preset);
  return (
    <ParallaxProvider worker={startWorker} theme={looks[search.look]} scheme={scheme}>
      {search.preset === "small" ? (
        <SmallTables performance={search.performance} cells={search.cells}>
          <Choice label="Scheme" value={scheme} options={["light", "dark"]} onChange={setScheme} />
          <Choice
            label="Row height"
            value={density}
            options={["compact", "comfortable"]}
            onChange={setDensity}
          />
        </SmallTables>
      ) : (
        <SinglePage preset={search.preset} performance={search.performance}>
          <Choice label="Scheme" value={scheme} options={["light", "dark"]} onChange={setScheme} />
          <Choice
            label="Row height"
            value={density}
            options={["compact", "comfortable"]}
            onChange={setDensity}
          />
        </SinglePage>
      )}
    </ParallaxProvider>
  );
}

export { Harness };
