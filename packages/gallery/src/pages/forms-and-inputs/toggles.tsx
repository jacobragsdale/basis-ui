/* Toggle and ToggleGroup on the forms and inputs page: every variant at every size, pressed and disabled, and groups
 * that choose one or several, apart or joined, in a row or a column. */

import {
  EyeIcon,
  FunnelIcon,
  Toggle,
  ToggleGroup,
  ToggleGroupItem,
  TrendingDownIcon,
  TrendingUpIcon,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";
import { focused, hovered } from "#pages/shot.ts";
import { Demo } from "./demo.tsx";

const variants = ["default", "outline"] as const;
const sizes = ["sm", "default", "lg"] as const;

function ToggleSection(): ReactElement {
  return (
    <Section
      title="Toggle"
      description="A button that stays pressed until pressed again. Its small size keeps a 24 px target in the compact density."
    >
      <div className="flex flex-col gap-4">
        {variants.map((variant) => (
          <div key={variant} className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-sm font-medium">{variant}</span>
            {sizes.map((size) => (
              <Toggle key={`icon-${size}`} variant={variant} size={size} aria-label="Show filters">
                <FunnelIcon />
              </Toggle>
            ))}
            {sizes.map((size) => (
              <Toggle key={`text-${size}`} variant={variant} size={size} defaultPressed>
                <EyeIcon data-icon="inline-start" />
                Watched
              </Toggle>
            ))}
            <Toggle variant={variant} {...hovered}>
              Hovered
            </Toggle>
            <Toggle variant={variant} {...focused}>
              Focused
            </Toggle>
            <Toggle variant={variant} disabled>
              Locked
            </Toggle>
          </div>
        ))}
      </div>
    </Section>
  );
}

/** Groups that choose one, or several. */
function ChoosingGroups(): ReactElement {
  return (
    <>
      <Demo label="one at a time">
        <ToggleGroup defaultValue={["1m"]} aria-label="Chart range">
          <ToggleGroupItem value="1d">1D</ToggleGroupItem>
          <ToggleGroupItem value="1m">1M</ToggleGroupItem>
          <ToggleGroupItem value="1y">1Y</ToggleGroupItem>
        </ToggleGroup>
      </Demo>
      <Demo label="several, outline">
        <ToggleGroup
          multiple
          variant="outline"
          defaultValue={["bid", "ask"]}
          aria-label="Quote columns"
        >
          <ToggleGroupItem value="bid">Bid</ToggleGroupItem>
          <ToggleGroupItem value="ask">Ask</ToggleGroupItem>
          <ToggleGroupItem value="mid">Mid</ToggleGroupItem>
        </ToggleGroup>
      </Demo>
    </>
  );
}

/** Groups joined, in a column, and disabled. */
function ArrangedGroups(): ReactElement {
  return (
    <>
      <Demo label="joined (spacing 0), small">
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          defaultValue={["buy"]}
          aria-label="Side"
        >
          <ToggleGroupItem value="buy">
            <TrendingUpIcon data-icon="inline-start" />
            Buy
          </ToggleGroupItem>
          <ToggleGroupItem value="sell">
            <TrendingDownIcon data-icon="inline-start" />
            Sell
          </ToggleGroupItem>
        </ToggleGroup>
      </Demo>
      <Demo label="vertical, large">
        <ToggleGroup
          orientation="vertical"
          size="lg"
          defaultValue={["price"]}
          aria-label="Quote as"
        >
          <ToggleGroupItem value="price">Price</ToggleGroupItem>
          <ToggleGroupItem value="yield">Yield</ToggleGroupItem>
          <ToggleGroupItem value="spread">Spread</ToggleGroupItem>
        </ToggleGroup>
      </Demo>
      <Demo label="disabled">
        <ToggleGroup variant="outline" defaultValue={["usd"]} disabled aria-label="Currency">
          <ToggleGroupItem value="usd">USD</ToggleGroupItem>
          <ToggleGroupItem value="eur">EUR</ToggleGroupItem>
        </ToggleGroup>
      </Demo>
    </>
  );
}

function ToggleGroupSection(): ReactElement {
  return (
    <Section
      title="ToggleGroup"
      description="Toggles of which one, or with multiple several, are pressed. The arrow keys move between them; at spacing 0 they join."
    >
      <div className="flex flex-wrap items-start gap-6">
        <ChoosingGroups />
        <ArrangedGroups />
      </div>
    </Section>
  );
}

export { ToggleGroupSection, ToggleSection };
