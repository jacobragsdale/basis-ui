/* The studio's controls: the shipped theme to start from, the name to export under, each hue's angle and chroma, the
 * radius and the focus ring. Each control hands the next inputs to `change`. */

import { Input, Label, NativeSelect, NativeSelectOption, Slider, numberText } from "@basis/ui";
import { themes } from "@basis/ui/theming";
import type { HueName, ThemeInputs } from "@basis/ui/theming";
import type { ReactElement } from "react";

import {
  focusPixels,
  hueNames,
  maxChroma,
  radiusPixels,
  withFocus,
  withHue,
  withRadius,
} from "./state.ts";

interface ControlsProps {
  readonly inputs: ThemeInputs;
  readonly change: (next: ThemeInputs) => void;
}

/** A slider under its label, with its value shown. */
function Ranged(props: {
  readonly label: string;
  readonly value: number;
  readonly shown: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly set: (value: number) => void;
}): ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <p className="flex justify-between text-sm">
        <span>{props.label}</span>
        <span className="text-muted-foreground">{props.shown}</span>
      </p>
      <Slider
        aria-label={props.label}
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onValueChange={(value) => {
          if (typeof value === "number") {
            props.set(value);
          }
        }}
      />
    </div>
  );
}

/** The places a chroma is shown to, as the themes write it. */
const chromaDecimals = 3;

/** One hue's angle and chroma. */
function HueControls({
  inputs,
  change,
  name,
}: ControlsProps & { readonly name: HueName }): ReactElement {
  const { chroma, hue } = inputs.hues[name];
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="pb-1 text-sm font-medium capitalize">{name}</legend>
      <Ranged
        label={`${name} hue`}
        value={hue}
        shown={`${String(hue)}°`}
        min={0}
        max={360}
        step={1}
        set={(value) => {
          change(withHue(inputs, name, { hue: value }));
        }}
      />
      <Ranged
        label={`${name} chroma`}
        value={chroma}
        shown={numberText(chroma, { decimals: chromaDecimals })}
        min={0}
        max={maxChroma(name)}
        step={0.001}
        set={(value) => {
          change(withHue(inputs, name, { chroma: value }));
        }}
      />
    </fieldset>
  );
}

/** The radius and the focus ring. */
function ShapeControls({ inputs, change }: ControlsProps): ReactElement {
  const radius = radiusPixels(inputs);
  const width = focusPixels(inputs.focus.width);
  const offset = focusPixels(inputs.focus.offset);
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="pb-1 text-sm font-medium">Shape</legend>
      <Ranged
        label="Radius"
        value={radius}
        shown={`${String(radius)} px`}
        min={0}
        max={12}
        step={1}
        set={(value) => {
          change(withRadius(inputs, value));
        }}
      />
      <Ranged
        label="Focus ring width"
        value={width}
        shown={`${String(width)} px`}
        min={1}
        max={4}
        step={1}
        set={(value) => {
          change(withFocus(inputs, { width: value }));
        }}
      />
      <Ranged
        label="Focus ring offset"
        value={offset}
        shown={`${String(offset)} px`}
        min={0}
        max={3}
        step={1}
        set={(value) => {
          change(withFocus(inputs, { offset: value }));
        }}
      />
    </fieldset>
  );
}

/** The theme to start from and the name to export under. */
function StartControls({
  inputs,
  change,
  name,
  rename,
}: ControlsProps & {
  readonly name: string;
  readonly rename: (name: string) => void;
}): ReactElement {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="studio-start">Start from</Label>
        <NativeSelect
          id="studio-start"
          value={themes.find((theme) => theme === inputs)?.name ?? ""}
          onChange={(event) => {
            const chosen = themes.find((theme) => theme.name === event.currentTarget.value);
            if (chosen !== undefined) {
              change(chosen);
            }
          }}
        >
          <NativeSelectOption value="">Your changes</NativeSelectOption>
          {themes.map((theme) => (
            <NativeSelectOption key={theme.name} value={theme.name}>
              {theme.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="studio-name">Theme name</Label>
        <Input
          id="studio-name"
          value={name}
          onChange={(event) => {
            rename(event.currentTarget.value);
          }}
        />
      </div>
    </div>
  );
}

/** Every control. */
function Controls(
  props: ControlsProps & { readonly name: string; readonly rename: (name: string) => void },
): ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <StartControls {...props} />
      <div className="grid grid-cols-2 gap-6">
        {hueNames.map((name) => (
          <HueControls key={name} inputs={props.inputs} change={props.change} name={name} />
        ))}
        <ShapeControls inputs={props.inputs} change={props.change} />
      </div>
    </div>
  );
}

export { Controls };
