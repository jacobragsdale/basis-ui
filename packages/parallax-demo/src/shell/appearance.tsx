/* The user's mode, density and theme, in the sidebar's footer: @basis/ui's preferences, which every app of the firm shares
 * through one cookie, and which parallax's canvases follow. */

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SidebarMenuButton,
  SidebarMenuItem,
  SunMoonIcon,
  readPreferences,
  themeNames,
  writePreferences,
} from "@basis/ui";
import type { Density, ModePreference, Preferences, ThemeName } from "@basis/ui";
import { useState } from "react";
import type { ReactNode } from "react";

const modes: readonly (readonly [ModePreference, string])[] = [
  ["system", "System"],
  ["light", "Light"],
  ["dark", "Dark"],
];

const densities: readonly (readonly [Density, string])[] = [
  ["comfortable", "Comfortable"],
  ["compact", "Compact"],
];

/** The themes @basis/ui ships, each under its name with its first letter raised and its hyphens spaced. */
const themes: readonly (readonly [ThemeName, string])[] = themeNames.map((name) => [
  name,
  `${name.charAt(0).toUpperCase()}${name.slice(1).replaceAll("-", " ")}`,
]);

function isTheme(value: unknown): value is ThemeName {
  return themes.some(([theme]) => theme === value);
}

function isMode(value: unknown): value is ModePreference {
  return modes.some(([mode]) => mode === value);
}

function isDensity(value: unknown): value is Density {
  return densities.some(([density]) => density === value);
}

/** One preference's choices, under its label. */
function Choices<TValue extends string>(props: {
  readonly label: string;
  readonly choices: readonly (readonly [TValue, string])[];
  readonly value: TValue;
  readonly is: (value: unknown) => value is TValue;
  readonly choose: (value: TValue) => void;
}): ReactNode {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{props.label}</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={props.value}
        onValueChange={(value: unknown) => {
          if (props.is(value)) {
            props.choose(value);
          }
        }}
      >
        {props.choices.map(([value, label]) => (
          <DropdownMenuRadioItem key={value} value={value}>
            {label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}

/** The menu that sets the mode, the density and the theme, for this app and every app that shares its cookie. */
function AppearanceMenu(): ReactNode {
  const [preferences, setPreferences] = useState<Preferences>(readPreferences);
  const choose = (next: Preferences): void => {
    writePreferences(next);
    setPreferences(next);
  };
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger render={<SidebarMenuButton tooltip="Appearance" />}>
          <SunMoonIcon />
          <span>Appearance</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end">
          <Choices
            label="Mode"
            choices={modes}
            value={preferences.mode}
            is={isMode}
            choose={(mode) => {
              choose({ ...preferences, mode });
            }}
          />
          <DropdownMenuSeparator />
          <Choices
            label="Density"
            choices={densities}
            value={preferences.density}
            is={isDensity}
            choose={(density) => {
              choose({ ...preferences, density });
            }}
          />
          <DropdownMenuSeparator />
          <Choices
            label="Theme"
            choices={themes}
            value={preferences.theme}
            is={isTheme}
            choose={(theme) => {
              choose({ ...preferences, theme });
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

export { AppearanceMenu };
