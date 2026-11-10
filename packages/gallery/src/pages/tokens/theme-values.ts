/* The theme's values as the page's stylesheet computes them, so the tokens page shows what the generated theme.css
 * declares rather than a copy: every colour token's custom property and its luminance, read again when the mode or the
 * density changes, and a sample element's computed style, for the scales Tailwind builds from the theme. */

import { tokenNames } from "@basis/ui";
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { RefObject } from "react";

import { linearColour, luminance } from "./contrast.ts";

/** A token's value as the stylesheet declares it, such as `oklch(0.981 0.0011 255)`, and its luminance, unknown where
 * the browser computes no colours, as in a Node DOM. */
interface TokenValue {
  readonly declared: string;
  readonly luminance: number | undefined;
}

const root = (): HTMLElement => document.documentElement;

/** Calls `onChange` whenever the root's mode class or density changes, as the user menu or a query changes them. */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(root(), { attributeFilter: ["class", "data-density"], attributes: true });
  return () => {
    observer.disconnect();
  };
}

/** Every token's declared value and its colour in linear sRGB as the browser computes it, one token a line in
 * `tokenNames`' order: a string, so React compares snapshots by value. */
function snapshot(): string {
  const style = getComputedStyle(root());
  const probe = document.createElement("span");
  root().append(probe);
  const lines = tokenNames.map((name) => {
    probe.style.color = linearColour(name);
    return `${style.getPropertyValue(`--${name}`).trim()}\t${getComputedStyle(probe).color}`;
  });
  probe.remove();
  return lines.join("\n");
}

function serverSnapshot(): string {
  return "";
}

/** Each colour token's value in the current mode. */
function useTokenValues(): ReadonlyMap<string, TokenValue> {
  const lines = useSyncExternalStore(subscribe, snapshot, serverSnapshot).split("\n");
  return new Map(
    tokenNames.map((name, index) => {
      const [declared = "", computed = ""] = (lines[index] ?? "").split("\t");
      return [name, { declared, luminance: luminance(computed) }];
    }),
  );
}

/** A ref for a sample element, and the computed values of `properties` on it once it is laid out, such as
 * `font-size`; empty until then. */
function useComputedStyle<TElement extends HTMLElement>(
  properties: readonly string[],
): readonly [RefObject<TElement | null>, readonly string[]] {
  const ref = useRef<TElement>(null);
  const [values, setValues] = useState<readonly string[]>([]);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element !== null) {
      const style = getComputedStyle(element);
      setValues(properties.map((property) => style.getPropertyValue(property)));
    }
  }, [properties]);
  return [ref, values];
}

export { useComputedStyle, useTokenValues };
export type { TokenValue };
