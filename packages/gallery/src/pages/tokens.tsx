/* The theme's tokens: every colour with its contrast, the chart palettes, the type scale, the radii, the shadows and
 * the motion, each read from the stylesheet the page runs on, so the page is the theme as generated, in each mode and
 * density. Each section's module is under tokens/. */

import type { ReactElement } from "react";

import { ChartPalettesSection, ColoursSection } from "./tokens/colours.tsx";
import { MotionSection, RadiiSection, ShadowsSection, TypeScaleSection } from "./tokens/scales.tsx";

function Tokens(): ReactElement {
  return (
    <div className="flex flex-col gap-8">
      <ColoursSection />
      <ChartPalettesSection />
      <TypeScaleSection />
      <RadiiSection />
      <ShadowsSection />
      <MotionSection />
    </div>
  );
}

export { Tokens };
