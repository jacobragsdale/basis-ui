/* The theme's scales on the tokens page: the type scale, the radii, the shadows and the motion, each drawn by its
 * Tailwind class with the value the stylesheet computes for it, so the page shows what the theme generates. */

import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

import { useComputedStyle } from "./theme-values.ts";

const typeProperties = ["font-size", "line-height"] as const;
const radiusProperties = ["border-radius"] as const;
const shadowProperties = ["box-shadow"] as const;
const motionProperties = ["transition-duration"] as const;

interface SampleProps {
  readonly name: string;
  readonly className: string;
  readonly properties: readonly string[];
  readonly text?: string;
}

/** One step of a scale: its class, the values the page computes for it, and an element drawn with it. */
function Sample({ name, className, properties, text = "" }: SampleProps): ReactElement {
  const [ref, values] = useComputedStyle<HTMLDivElement>(properties);
  return (
    <li className="flex items-center gap-4">
      <div className="flex w-56 shrink-0 flex-col text-xs">
        <code className="font-mono font-medium">{name}</code>
        <code className="font-mono text-2xs text-muted-foreground">
          {values.join(" / ") || "—"}
        </code>
      </div>
      <div ref={ref} className={className}>
        {text}
      </div>
    </li>
  );
}

// Each class is written out whole, so Tailwind finds it in this file and generates it.
const typeScale = [
  ["text-2xs", "text-2xs"],
  ["text-xs", "text-xs"],
  ["text-sm", "text-sm"],
  ["text-base", "text-base"],
  ["text-lg", "text-lg"],
  ["text-xl", "text-xl"],
  ["text-2xl", "text-2xl"],
] as const;

const radii = [
  ["rounded-sm", "size-12 rounded-sm border bg-muted"],
  ["rounded-md", "size-12 rounded-md border bg-muted"],
  ["rounded-lg", "size-12 rounded-lg border bg-muted"],
  ["rounded-xl", "size-12 rounded-xl border bg-muted"],
  ["rounded-pill: a badge or a switch", "h-6 w-24 rounded-pill border bg-muted"],
] as const;

const shadows = [
  ["shadow-sm", "h-12 w-24 rounded-lg bg-card shadow-sm"],
  ["shadow-md", "h-12 w-24 rounded-lg bg-card shadow-md"],
] as const;

const motion = [
  ["transition-colors (the default)", "h-6 w-24 rounded-md bg-muted transition-colors"],
  ["duration-popup: a popup's fade and scale", "h-6 w-24 rounded-md bg-muted duration-popup"],
  ["duration-panel: a panel that slides", "h-6 w-24 rounded-md bg-muted duration-panel"],
] as const;

function TypeScaleSection(): ReactElement {
  return (
    <Section
      title="Type scale"
      description="Inter at each size, with the line height the theme pairs with it. text-2xs is the theme's own, for axes and dense labels."
    >
      <ul className="flex flex-col gap-2">
        {typeScale.map(([name, className]) => (
          <Sample
            key={name}
            name={name}
            className={className}
            properties={typeProperties}
            text="Duration by sector, 1,204 positions"
          />
        ))}
      </ul>
    </Section>
  );
}

function RadiiSection(): ReactElement {
  return (
    <Section
      title="Radii"
      description="Every radius derives from the theme's one base radius, which rounded-lg is, but a pill's, whose ends are half-circles."
    >
      <ul className="flex flex-col gap-2">
        {radii.map(([name, className]) => (
          <Sample key={name} name={name} className={className} properties={radiusProperties} />
        ))}
      </ul>
    </Section>
  );
}

function ShadowsSection(): ReactElement {
  return (
    <Section
      title="Shadows"
      description="The theme's two shadows, both subtle; Tailwind's others are removed, and so is blur."
    >
      <ul className="flex flex-col gap-4">
        {shadows.map(([name, className]) => (
          <Sample key={name} name={name} className={className} properties={shadowProperties} />
        ))}
      </ul>
    </Section>
  );
}

function MotionSection(): ReactElement {
  return (
    <Section
      title="Motion"
      description="Transitions are short and stop under prefers-reduced-motion. Canvases never animate."
    >
      <ul className="flex flex-col gap-2">
        {motion.map(([name, className]) => (
          <Sample key={name} name={name} className={className} properties={motionProperties} />
        ))}
      </ul>
    </Section>
  );
}

export { MotionSection, RadiiSection, ShadowsSection, TypeScaleSection };
