/* The user menu: who is signed in, the mode, density and motion they see every app in, and signing in or out. The three
 * are the cookie every app of the firm's shares (docs/design.md, The theme), so a change here reaches them all. */

import { useState } from "react";
import type { ReactElement } from "react";

import { useSession } from "#shell/session.ts";
import { useTelemetry } from "#shell/telemetry.ts";
import { readPreferences, writePreferences } from "#theme/preferences.ts";
import type { Density, ModePreference, Motion, Preferences } from "#theme/preferences.ts";
import { ChevronDownIcon } from "#vendor/lucide/chevron-down.tsx";

import { Button } from "./button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu.tsx";

const modes: readonly (readonly [ModePreference, string])[] = [
  ["system", "System"],
  ["light", "Light"],
  ["dark", "Dark"],
];
const densities: readonly (readonly [Density, string])[] = [
  ["comfortable", "Comfortable"],
  ["compact", "Compact"],
];
const motions: readonly (readonly [Motion, string])[] = [
  ["full", "Full"],
  ["reduced", "Reduced"],
];

/** The stored preferences, and a setter that stores and applies a change at once. */
function usePreferences(): [Preferences, (change: Partial<Preferences>) => void] {
  const [preferences, setPreferences] = useState(readPreferences);
  const change = (next: Partial<Preferences>): void => {
    const updated = { ...preferences, ...next };
    writePreferences(updated);
    setPreferences(updated);
  };
  return [preferences, change];
}

interface ChoicesProps<Value extends string> {
  readonly label: string;
  readonly options: readonly (readonly [Value, string])[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
}

/** One preference's choices, under its label, the chosen one checked. */
function Choices<Value extends string>({
  label,
  options,
  value,
  onChange,
}: ChoicesProps<Value>): ReactElement {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={value}
        onValueChange={(next: Value) => {
          onChange(next);
        }}
      >
        {options.map(([option, text]) => (
          <DropdownMenuRadioItem key={option} value={option}>
            {text}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}

/** Signing in or out, as the app's sign-in adapter offers it: nothing under `anonymousSignIn`. */
function SessionItem(): ReactElement | null {
  const { user, offersSignIn, signIn, signOut } = useSession();
  const telemetry = useTelemetry();
  if (!offersSignIn) {
    return null;
  }
  const act = user === null ? signIn : signOut;
  const report = (failure: unknown): void => {
    telemetry.error(failure, { source: "user-menu" });
  };
  return (
    <DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={() => {
          act().catch(report);
        }}
      >
        {user === null ? "Sign in" : "Sign out"}
      </DropdownMenuItem>
    </DropdownMenuGroup>
  );
}

/** The signed-in user's menu: the mode (system, light or dark), density (comfortable or compact) and motion (full, or
 * reduced, which stops every transition as the operating system's setting does) every app shows, and signing in or
 * out. Inside `BasisApp`, which keeps the session; `AppShell` puts it in the sidebar's footer.
 *
 * @use AppShell puts one in its sidebar's footer; use it alone only in a layout of the app's own, under BasisApp.
 * @see AppShell, BasisApp, useSession, Preferences
 *
 * @example
 * ```tsx
 * import { UserMenu } from "@basis/ui";
 *
 * <UserMenu />;
 * ```
 */
function UserMenu(): ReactElement {
  const { user, offersSignIn } = useSession();
  const [preferences, change] = usePreferences();
  const absent = offersSignIn ? "Signed out" : "Guest";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
        {user?.name ?? absent}
        <ChevronDownIcon data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <Choices
          label="Mode"
          options={modes}
          value={preferences.mode}
          onChange={(mode) => {
            change({ mode });
          }}
        />
        <DropdownMenuSeparator />
        <Choices
          label="Density"
          options={densities}
          value={preferences.density}
          onChange={(density) => {
            change({ density });
          }}
        />
        <DropdownMenuSeparator />
        <Choices
          label="Motion"
          options={motions}
          value={preferences.motion}
          onChange={(motion) => {
            change({ motion });
          }}
        />
        <SessionItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { UserMenu };
