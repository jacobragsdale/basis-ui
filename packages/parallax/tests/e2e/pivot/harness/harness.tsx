/* The end-to-end harness: the Angular demo's pivot page, rebuilt on `<Pivot>`. The address bar picks the view
 * (`preset`: pivot, or flat for a grid of the same rows), the scheme (`theme`), the canvas's theme (`look`: standard,
 * parallax's own and the demo's, so a canvas here can be compared with the demo's; or basis, the look an app on
 * `@basis/ui` gets), the density, and a shared view (`layout`), which opens as a pivot if it groups and as a grid
 * otherwise, as the demo's did. "Copy link to this view" writes the view into the address bar. */

import { Button, NativeSelect, NativeSelectOption } from "@basis/ui";
import { useEffect, useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";

import {
  Grid,
  ParallaxProvider,
  Pivot,
  basisTheme,
  decodeLayout,
  encodeLayout,
  standardTheme,
  useDataset,
} from "#index.ts";
import type { LayoutInput, ResolvedScheme } from "#index.ts";

import { flatPositions, positions, referencePivot } from "./data.ts";

const looks = { basis: basisTheme, standard: standardTheme } as const;
const presets = { flat: flatPositions, pivot: referencePivot } as const;

/** What the address bar asks for. */
interface Search {
  readonly preset: keyof typeof presets;
  readonly theme: ResolvedScheme;
  readonly look: keyof typeof looks;
  readonly density: "compact" | "comfortable";
  /** A shared view's layout, as "Copy link to this view" wrote it. */
  readonly link: string | null;
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
    density: pick("density", ["compact", "comfortable"], "compact"),
    link: new URLSearchParams(location.search).get("layout"),
    look: pick("look", ["standard", "basis"], "standard"),
    preset: pick("preset", ["pivot", "flat"], "pivot"),
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

/** Whether a layout groups its rows, which opens it as a pivot. */
function grouped(layout: LayoutInput): boolean {
  return [layout.group_by, layout.split_by, layout.measures].some(
    (list) => (list?.length ?? 0) > 0,
  );
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
    document.title = "Parallax pivot harness";
  }, [density, scheme]);
  const chooseScheme = (value: string): void => {
    setScheme(value === "dark" ? "dark" : "light");
  };
  return [scheme, chooseScheme, density, setDensity];
}

/** What reading or writing a link sets: the view, and the note that says what happened. */
interface Shown {
  readonly setLayout: (layout: LayoutInput) => void;
  readonly setNote: (note: string) => void;
}

/** Shows a shared view, or the preset when its link cannot be read, saying why. */
async function readLink(link: string, preset: Search["preset"], shown: Shown): Promise<void> {
  try {
    shown.setLayout(await decodeLayout(link));
  } catch (error: unknown) {
    shown.setNote(`The link's layout could not be read, so the preset is shown: ${String(error)}`);
    shown.setLayout(presets[preset]);
  }
}

/** Writes the view into the address bar, and says so. */
async function share(layout: LayoutInput, setNote: Shown["setNote"]): Promise<void> {
  try {
    const params = new URLSearchParams(location.search);
    params.set("layout", await encodeLayout(layout));
    history.replaceState(null, "", `?${params.toString()}`);
    setNote("The address bar now links to this view.");
  } catch (error: unknown) {
    setNote(String(error));
  }
}

/** The view the page shows, and what it says: the preset's, or a shared view's once its link is read. */
function useView(
  search: Search,
): readonly [LayoutInput | null, (layout: LayoutInput) => void, string, (note: string) => void] {
  const [layout, setLayout] = useState<LayoutInput | null>(
    search.link === null ? presets[search.preset] : null,
  );
  const [note, setNote] = useState("");
  const { link, preset } = search;
  useEffect(() => {
    if (link !== null) {
      readLink(link, preset, { setLayout, setNote }).catch(reportError);
    }
  }, [link, preset]);
  return [layout, setLayout, note, setNote];
}

/** The positions as a pivot, or as a grid for a flat view. */
function View({
  layout,
  onChange,
}: {
  readonly layout: LayoutInput;
  readonly onChange: (layout: LayoutInput) => void;
}): ReactNode {
  const dataset = useDataset("positions", positions, { primaryKey: "position_id" });
  return grouped(layout) ? (
    <Pivot dataset={dataset} layout={layout} onLayoutChange={onChange} />
  ) : (
    <Grid dataset={dataset} layout={layout} onLayoutChange={onChange} />
  );
}

/** The harness. */
function Harness(): ReactNode {
  const search = readSearch();
  const [scheme, setScheme, density, setDensity] = usePage(search);
  const [layout, setLayout, note, setNote] = useView(search);
  return (
    <ParallaxProvider worker={startWorker} theme={looks[search.look]} scheme={scheme}>
      <header>
        <strong>parallax</strong>
        <Choice label="Scheme" value={scheme} options={["light", "dark"]} onChange={setScheme} />
        <Choice
          label="Row height"
          value={density}
          options={["compact", "comfortable"]}
          onChange={setDensity}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={layout === null}
          onClick={() => {
            if (layout !== null) {
              share(layout, setNote).catch(reportError);
            }
          }}
        >
          Copy link to this view
        </Button>
        <details>
          <summary>Layout</summary>
          <pre data-testid="layout-json">{JSON.stringify(layout, null, 2)}</pre>
        </details>
        <output>{note}</output>
      </header>
      <main>{layout === null ? null : <View layout={layout} onChange={setLayout} />}</main>
    </ParallaxProvider>
  );
}

export { Harness };
