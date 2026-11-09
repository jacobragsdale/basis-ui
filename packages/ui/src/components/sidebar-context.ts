/* Sidebar's state, from shadcn's Base UI source: whether it is open, kept in the `basis-ui-sidebar` cookie for a
 * week, toggled by Ctrl+B or Cmd+B, and a sheet of its own below the `md` breakpoint. shadcn's app reads the cookie
 * on the server and passes it as `defaultOpen`; @basis/ui's apps render in the browser, so the provider reads the
 * cookie itself, and the user's last choice wins over `defaultOpen`. It lives apart from sidebar.tsx because a
 * component file exports only components. */

import { createContext, use, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { ShortcutContext, matchesKeys, useShortcut } from "./shortcuts-context.ts";

type SidebarState = "expanded" | "collapsed";

interface SidebarContextProps {
  readonly state: SidebarState;
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly openMobile: boolean;
  readonly setOpenMobile: (open: boolean) => void;
  readonly isMobile: boolean;
  readonly toggleSidebar: () => void;
}

interface SidebarStateOptions {
  readonly defaultOpen: boolean;
  readonly open: boolean | undefined;
  readonly onOpenChange: ((open: boolean) => void) | undefined;
}

/** The cookie that keeps whether the sidebar is open, as `true` or `false`. */
const sidebarCookie = "basis-ui-sidebar";
const secondsPerDay = 86_400;
const cookieDays = 7;
/** The keys that toggle the sidebar: Ctrl+B, or Cmd+B on a Mac. */
const sidebarShortcut = "mod+b";
/** Below Tailwind's `md` breakpoint, the sidebar is a sheet. */
const mobileQuery = "(max-width: 767px)";

const SidebarContext = createContext<SidebarContextProps | null>(null);

/** The sidebar's state and its setters, inside a SidebarProvider. */
function useSidebar(): SidebarContextProps {
  const context = use(SidebarContext);
  if (context === null) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }
  return context;
}

/** Whether the cookie says the sidebar was left open, or `undefined` when it says nothing. */
function readSidebarCookie(): boolean | undefined {
  for (const part of document.cookie.split(";")) {
    const [name, value] = part.trim().split("=");
    if (name === sidebarCookie && (value === "true" || value === "false")) {
      return value === "true";
    }
  }
  return undefined;
}

function writeSidebarCookie(open: boolean): void {
  const attributes = `Path=/; Max-Age=${String(secondsPerDay * cookieDays)}; SameSite=Lax`;
  // oxlint-disable-next-line unicorn/no-document-cookie -- shadcn keeps the sidebar's state in a cookie, as the design asks.
  document.cookie = `${sidebarCookie}=${String(open)}; ${attributes}`;
}

function subscribeToMobile(onChange: () => void): () => void {
  const media = matchMedia(mobileQuery);
  media.addEventListener("change", onChange);
  return () => {
    media.removeEventListener("change", onChange);
  };
}

function isMobileNow(): boolean {
  return matchMedia(mobileQuery).matches;
}

/** Whether the window is narrower than the `md` breakpoint, following it as it changes. */
function useIsMobile(): boolean {
  return useSyncExternalStore(subscribeToMobile, isMobileNow, () => false);
}

/** Calls `toggle` on Ctrl+B or Cmd+B, anywhere in the page. Inside a ShortcutProvider, as in AppShell, it is one of
 * the provider's shortcuts, which the `?` list names; outside one it listens for itself, by the same rule. Either way
 * the key is matched whatever its case, so Caps Lock does not stop it. */
function useSidebarShortcut(toggle: () => void): void {
  const registry = use(ShortcutContext);
  useShortcut(sidebarShortcut, "Toggle the sidebar", toggle);
  useEffect((): (() => void) | undefined => {
    if (registry !== null) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (matchesKeys(sidebarShortcut, event)) {
        event.preventDefault();
        toggle();
      }
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => {
      globalThis.removeEventListener("keydown", onKeyDown);
    };
  }, [registry, toggle]);
}

/** The provider's state: open or not, from `open` when the app controls it, else its own, from the cookie or
 * `defaultOpen`; every change is written to the cookie, and told to `onOpenChange` whether or not the app controls
 * it. */
function useSidebarState({
  defaultOpen,
  open: openProp,
  onOpenChange,
}: SidebarStateOptions): SidebarContextProps {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = useState(false);
  const [ownOpen, setOwnOpen] = useState(() => readSidebarCookie() ?? defaultOpen);
  const open = openProp ?? ownOpen;
  const value = useMemo<SidebarContextProps>(() => {
    const setOpen = (next: boolean): void => {
      if (openProp === undefined) {
        setOwnOpen(next);
      }
      onOpenChange?.(next);
      writeSidebarCookie(next);
    };
    const toggleSidebar = (): void => {
      if (isMobile) {
        setOpenMobile(!openMobile);
      } else {
        setOpen(!open);
      }
    };
    const state = open ? "expanded" : "collapsed";
    return { isMobile, open, openMobile, setOpen, setOpenMobile, state, toggleSidebar };
  }, [isMobile, onOpenChange, open, openMobile, openProp]);
  useSidebarShortcut(value.toggleSidebar);
  return value;
}

export { SidebarContext, sidebarCookie, useSidebar, useSidebarState };
export type { SidebarContextProps, SidebarState };
