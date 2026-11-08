/* The user menu: who is signed in, the mode and the density they see every app in, and signing in or out. The mode and
 * density are the cookie every app of the firm's shares (docs/design.md, The theme), so a change here reaches them all. */

import { useState } from "react";
import type { ReactElement } from "react";

import { useSession } from "#shell/session.ts";
import { useTelemetry } from "#shell/telemetry.ts";
import { readPreferences, writePreferences } from "#theme/preferences.ts";
import type { Density, ModePreference, Preferences } from "#theme/preferences.ts";
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

/** The signed-in user's menu: the mode (system, light or dark) and density (comfortable or compact) every app shows,
 * and signing in or out. Inside `BasisApp`, which keeps the session; `AppShell` puts it in the sidebar's footer.
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
        <DropdownMenuGroup>
          <DropdownMenuLabel>Mode</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={preferences.mode}
            onValueChange={(mode: ModePreference) => {
              change({ mode });
            }}
          >
            {modes.map(([mode, label]) => (
              <DropdownMenuRadioItem key={mode} value={mode}>
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Density</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={preferences.density}
            onValueChange={(density: Density) => {
              change({ density });
            }}
          >
            {densities.map(([density, label]) => (
              <DropdownMenuRadioItem key={density} value={density}>
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <SessionItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { UserMenu };
