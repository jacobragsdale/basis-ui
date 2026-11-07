/* ButtonGroup on the forms and inputs page: buttons joined in a row and a column, with text, an input, a select, a
 * separator, and groups nested in a toolbar. */

import {
  Button,
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Input,
  MinusIcon,
  PlusIcon,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";
import { Demo } from "./demo.tsx";

const currencies = [
  { label: "USD", value: "usd" },
  { label: "EUR", value: "eur" },
  { label: "GBP", value: "gbp" },
];

/** Groups of buttons alone: in a row, in a column, split, and with a separator. */
function ButtonRows(): ReactElement {
  return (
    <>
      <Demo label="horizontal">
        <ButtonGroup aria-label="Quote as">
          <Button variant="outline">Price</Button>
          <Button variant="outline">Yield</Button>
          <Button variant="outline">Spread</Button>
        </ButtonGroup>
      </Demo>
      <Demo label="vertical">
        <ButtonGroup orientation="vertical" aria-label="Zoom">
          <Button variant="outline" size="icon" aria-label="Zoom in">
            <PlusIcon />
          </Button>
          <Button variant="outline" size="icon" aria-label="Zoom out">
            <MinusIcon />
          </Button>
        </ButtonGroup>
      </Demo>
      <Demo label="split button">
        <ButtonGroup aria-label="Export">
          <Button variant="outline">Export</Button>
          <Button variant="outline" size="icon" aria-label="More export formats">
            <ChevronDownIcon />
          </Button>
        </ButtonGroup>
      </Demo>
      <Demo label="separator">
        <ButtonGroup aria-label="Clipboard">
          <Button variant="secondary">Copy</Button>
          <ButtonGroupSeparator />
          <Button variant="secondary">Paste</Button>
        </ButtonGroup>
      </Demo>
    </>
  );
}

/** Groups that join text, an input and a select. */
function MixedGroups(): ReactElement {
  return (
    <>
      <Demo label="text and input">
        <ButtonGroup aria-label="Add par">
          <ButtonGroupText render={<label htmlFor="button-group-par">Par</label>} />
          <Input id="button-group-par" placeholder="1,000,000" />
          <Button variant="outline">Apply</Button>
        </ButtonGroup>
      </Demo>
      <Demo label="select and input">
        <ButtonGroup aria-label="Notional">
          <Select items={currencies} defaultValue="usd">
            <SelectTrigger aria-label="Currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((currency) => (
                <SelectItem key={currency.value} value={currency.value}>
                  {currency.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input aria-label="Notional" placeholder="5,000,000" />
        </ButtonGroup>
      </Demo>
    </>
  );
}

/** Groups nested in a toolbar, with small buttons. */
function NestedGroups(): ReactElement {
  return (
    <Demo label="nested, small">
      <ButtonGroup aria-label="Chart range">
        <ButtonGroup>
          <Button variant="outline" size="sm">
            1D
          </Button>
          <Button variant="outline" size="sm">
            1M
          </Button>
          <Button variant="outline" size="sm">
            1Y
          </Button>
        </ButtonGroup>
        <ButtonGroup>
          <Button variant="outline" size="icon-sm" aria-label="Earlier">
            <ChevronLeftIcon />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Later">
            <ChevronRightIcon />
          </Button>
        </ButtonGroup>
      </ButtonGroup>
    </Demo>
  );
}

function ButtonGroupSection(): ReactElement {
  return (
    <Section
      title="ButtonGroup"
      description="Buttons, inputs and selects joined into one control, in a row or a column, with text and separators between them."
    >
      <div className="flex flex-wrap items-start gap-6">
        <ButtonRows />
        <MixedGroups />
        <NestedGroups />
      </div>
    </Section>
  );
}

export { ButtonGroupSection };
