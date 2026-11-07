/* A component that draws in parallax's theme as a canvas would: it reads its tokens on mount, and again whenever the
 * theme says they may have changed, and shows what it read. */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { useParallaxTheme } from "#react/use-theme.ts";

interface Read {
  readonly accent: string;
  readonly background: string;
  readonly series: string;
  readonly ramp: number;
  readonly font: string;
}

function Swatch(): ReactNode {
  const { attributes, read: readTokens, scheme } = useParallaxTheme();
  const element = useRef<HTMLDivElement>(null);
  const [read, setRead] = useState<Read | null>(null);
  useEffect(() => {
    const host = element.current;
    if (host !== null) {
      const { colors, theme } = readTokens(host);
      setRead({
        accent: theme.accent,
        background: theme.background,
        font: theme.font,
        ramp: colors.ramp.length,
        series: colors.series[0] ?? "",
      });
    }
  }, [readTokens]);
  return (
    <div ref={element} {...attributes}>
      <output aria-label="scheme">{scheme}</output>
      <output aria-label="accent">{read?.accent}</output>
      <output aria-label="background">{read?.background}</output>
      <output aria-label="series">{read?.series}</output>
      <output aria-label="ramp">{read?.ramp}</output>
      <output aria-label="font">{read?.font}</output>
    </div>
  );
}

export { Swatch };
