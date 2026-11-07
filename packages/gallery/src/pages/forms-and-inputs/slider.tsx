/* Slider on the forms and inputs page: one value, a range, disabled, and vertical. */

import { Slider } from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";
import { Demo } from "./demo.tsx";

// The range example's maturities, in years.
const shortestMaturity = 2;
const longestMaturity = 10;
const maturityLimit = 30;

function SliderSection(): ReactElement {
  return (
    <Section
      title="Slider"
      description="A value or a range on a track. The arrow keys move a thumb; each thumb sits in a 24 px target."
    >
      <div className="flex flex-wrap items-start gap-10">
        <Demo label="one value">
          <Slider className="w-56" defaultValue={25} aria-label="Hedge ratio" />
        </Demo>
        <Demo label="range">
          <Slider
            className="w-56"
            defaultValue={[shortestMaturity, longestMaturity]}
            min={0}
            max={maturityLimit}
            aria-label="Maturity in years"
          />
        </Demo>
        <Demo label="disabled">
          <Slider className="w-56" defaultValue={60} disabled aria-label="Fill rate" />
        </Demo>
        <Demo label="vertical">
          <div className="h-40">
            <Slider defaultValue={40} orientation="vertical" aria-label="Volume" />
          </div>
        </Demo>
      </div>
    </Section>
  );
}

export { SliderSection };
