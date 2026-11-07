/* The theme studio, a panel beside any page: it makes a theme for parallax's grids, pivots and charts by hand. Each
 * control sets one of parallax's `--px-*` tokens on the page, which every canvas draws with over @basis/ui's theme;
 * their toolbars, menus and status bars are @basis/ui's components and keep the firm's theme. The theme stays for the
 * next visit, and copies as CSS or as a `defineTheme` call. */

import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  NativeSelect,
  NativeSelectOption,
  Slider,
  Switch,
  XIcon,
} from "@basis/ui";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { useTools } from "#shell/tools.ts";

import {
  applySettings,
  colors,
  font,
  fonts,
  ranges,
  settingsCss,
  settingsTypescript,
  storedSettings,
  switches,
  withSetting,
} from "./studio-settings.ts";
import type { Settings } from "./studio-settings.ts";

interface ControlsProps {
  readonly settings: Settings;
  readonly set: (property: string, value: string) => void;
}

/** A range's value in pixels: the one set, or where it starts. */
function pixels(settings: Settings, property: string, start: number): number {
  const value = settings[property];
  return value === undefined ? start : Number(value.replace(/px$/u, ""));
}

/** The colours and the font. */
function Looks({ settings, set }: ControlsProps): ReactNode {
  return (
    <div className="grid grid-cols-3 gap-3">
      {colors.map((control) => (
        <div key={control.property} className="flex flex-col gap-1.5">
          <Label htmlFor={`studio${control.property}`}>{control.label}</Label>
          <Input
            id={`studio${control.property}`}
            type="color"
            value={settings[control.property] ?? control.start}
            onChange={(event) => {
              set(control.property, event.currentTarget.value);
            }}
          />
        </div>
      ))}
      <div className="col-span-3 flex flex-col gap-1.5">
        <Label htmlFor="studio-font">{font.label}</Label>
        <NativeSelect
          id="studio-font"
          value={settings[font.property] ?? ""}
          onChange={(event) => {
            set(font.property, event.currentTarget.value);
          }}
        >
          {fonts.map((option) => (
            <NativeSelectOption key={option.label} value={option.value}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}

/** The sizes, in pixels, and the lines. */
function Sizes({ settings, set }: ControlsProps): ReactNode {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      {ranges.map((control) => {
        const value = pixels(settings, control.property, control.start);
        return (
          <div key={control.property} className="flex flex-col gap-2">
            <p className="text-sm">
              {control.label}: <span className="tabular-nums">{value}</span> px
            </p>
            <Slider
              aria-label={control.label}
              min={control.min}
              max={control.max}
              value={value}
              onValueChange={(next) => {
                set(control.property, `${String(next)}px`);
              }}
            />
          </div>
        );
      })}
      {switches.map((control) => (
        <div key={control.property} className="flex items-center gap-2">
          <Switch
            id={`studio${control.property}`}
            checked={settings[control.property] !== control.off}
            onCheckedChange={(checked) => {
              set(control.property, checked ? "" : control.off);
            }}
          />
          <Label htmlFor={`studio${control.property}`}>{control.label}</Label>
        </div>
      ))}
    </div>
  );
}

/** The studio's settings, on the page from the first paint, kept for the next visit. */
function useSettings(): readonly [Settings, (next: Settings) => void] {
  const [settings, setSettings] = useState<Settings>(storedSettings);
  useEffect(() => {
    applySettings(settings);
  }, [settings]);
  return [settings, setSettings];
}

/** Copies the settings as CSS or TypeScript, saying how it went. */
async function copySettings(
  settings: Settings,
  { as, setNote }: { readonly as: "CSS" | "TypeScript"; readonly setNote: (note: string) => void },
): Promise<void> {
  const text = as === "CSS" ? settingsCss(settings) : settingsTypescript(settings);
  try {
    await navigator.clipboard.writeText(text);
    setNote(`${as} copied`);
  } catch {
    setNote("The clipboard refused it");
  }
}

/** The studio's buttons: copy the theme either way, or reset it. */
function StudioActions({
  settings,
  reset,
}: {
  readonly settings: Settings;
  readonly reset: () => void;
}): ReactNode {
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        onClick={() => {
          copySettings(settings, { as: "CSS", setNote }).catch(reportError);
        }}
      >
        Copy CSS
      </Button>
      <Button
        variant="outline"
        onClick={() => {
          copySettings(settings, { as: "TypeScript", setNote }).catch(reportError);
        }}
      >
        Copy TypeScript
      </Button>
      <Button
        variant="ghost"
        disabled={Object.keys(settings).length === 0}
        onClick={() => {
          reset();
          setNote("");
        }}
      >
        Reset
      </Button>
      <output className="text-xs text-muted-foreground">{note}</output>
    </div>
  );
}

/** The studio's title, what it does, and its close button. */
function StudioHeader({ close }: { readonly close: () => void }): ReactNode {
  return (
    <CardHeader>
      <CardTitle id="studio-title">Theme studio</CardTitle>
      <CardDescription>
        Each control sets one of parallax&apos;s <code>--px-*</code> tokens on the page, which every
        grid, pivot and chart draws with over @basis/ui&apos;s theme.
      </CardDescription>
      <CardAction>
        <Button size="icon-sm" variant="ghost" aria-label="Close the theme studio" onClick={close}>
          <XIcon />
        </Button>
      </CardAction>
    </CardHeader>
  );
}

/**
 * The studio, open beside the page rather than over it, so that the grids and charts it themes stay in view, as they
 * are, and in use. The page's tokens are its settings whether it is open or not.
 */
function ThemeStudio(): ReactNode {
  const { studio, handleStudio } = useTools();
  const [settings, setSettings] = useSettings();
  const set = (property: string, value: string): void => {
    setSettings(withSetting(settings, property, value));
  };
  if (!studio) {
    return null;
  }
  return (
    <dialog
      open
      aria-labelledby="studio-title"
      className="fixed inset-y-3 right-3 left-auto z-20 m-0 w-90 border-0 bg-transparent p-0"
    >
      <Card size="sm" className="h-full">
        <StudioHeader
          close={() => {
            handleStudio(false);
          }}
        />
        <CardContent className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-5">
            <Looks settings={settings} set={set} />
            <Sizes settings={settings} set={set} />
            <pre
              data-testid="studio-css"
              className="overflow-auto rounded-lg border bg-muted p-2.5 font-mono text-xs whitespace-pre-wrap"
            >
              {settingsCss(settings)}
            </pre>
          </div>
        </CardContent>
        <CardFooter>
          <StudioActions
            settings={settings}
            reset={() => {
              setSettings({});
            }}
          />
        </CardFooter>
      </Card>
    </dialog>
  );
}

export { ThemeStudio };
