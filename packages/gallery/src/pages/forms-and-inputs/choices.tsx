/* Checkbox, RadioGroup and Switch on the forms and inputs page: each unchecked, checked, disabled and invalid, and the
 * switch at both sizes. An invalid choice says why in words beside it. */

import {
  Checkbox,
  Field,
  FieldError,
  FieldLabel,
  Label,
  RadioGroup,
  RadioGroupItem,
  Switch,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";
import { focused } from "#pages/shot.ts";
import { Demo } from "./demo.tsx";

/** Checkboxes disabled, unticked and ticked, and invalid with the error in words. */
function CheckboxStates(): ReactElement {
  return (
    <>
      <Demo label="disabled">
        <Field orientation="horizontal">
          <Checkbox id="checkbox-disabled" disabled />
          <FieldLabel htmlFor="checkbox-disabled">Short sales</FieldLabel>
        </Field>
      </Demo>
      <Demo label="disabled, checked">
        <Field orientation="horizontal">
          <Checkbox id="checkbox-disabled-checked" disabled defaultChecked />
          <FieldLabel htmlFor="checkbox-disabled-checked">Best execution</FieldLabel>
        </Field>
      </Demo>
      <Demo label="invalid">
        <Field orientation="horizontal" data-invalid>
          <Checkbox id="checkbox-invalid" aria-invalid aria-describedby="checkbox-invalid-error" />
          <FieldLabel htmlFor="checkbox-invalid">I have read the term sheet</FieldLabel>
        </Field>
        <FieldError id="checkbox-invalid-error">Confirm the term sheet to continue.</FieldError>
      </Demo>
    </>
  );
}

function CheckboxSection(): ReactElement {
  return (
    <Section
      title="Checkbox"
      description="A choice that is on or off, ticked with Space. Its box sits in a 24 px target."
    >
      <div className="flex flex-wrap items-start gap-6">
        <Demo label="unchecked">
          <Field orientation="horizontal">
            <Checkbox id="checkbox-unchecked" />
            <FieldLabel htmlFor="checkbox-unchecked">Include accrued interest</FieldLabel>
          </Field>
        </Demo>
        <Demo label="checked">
          <Field orientation="horizontal">
            <Checkbox id="checkbox-checked" defaultChecked />
            <FieldLabel htmlFor="checkbox-checked">Net by counterparty</FieldLabel>
          </Field>
        </Demo>
        <Demo label="focused">
          <Field orientation="horizontal">
            <Checkbox id="checkbox-focused" defaultChecked {...focused} />
            <FieldLabel htmlFor="checkbox-focused">Show accrued</FieldLabel>
          </Field>
        </Demo>
        <CheckboxStates />
      </div>
    </Section>
  );
}

/** A group with one item chosen and one disabled, and a group disabled whole. */
function RadioGroups(): ReactElement {
  return (
    <>
      <Demo label="one chosen and focused, one disabled">
        <RadioGroup defaultValue="t1" aria-labelledby="radio-settlement-label">
          <Label id="radio-settlement-label">Settlement</Label>
          <Field orientation="horizontal">
            <RadioGroupItem value="t0" id="radio-t0" />
            <FieldLabel htmlFor="radio-t0">Same day</FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <RadioGroupItem value="t1" id="radio-t1" {...focused} />
            <FieldLabel htmlFor="radio-t1">T+1</FieldLabel>
          </Field>
          <Field orientation="horizontal" data-disabled="true">
            <RadioGroupItem value="t2" id="radio-t2" disabled />
            <FieldLabel htmlFor="radio-t2">T+2</FieldLabel>
          </Field>
        </RadioGroup>
      </Demo>
      <Demo label="disabled group">
        <RadioGroup defaultValue="clean" aria-label="Price convention" disabled>
          <Field orientation="horizontal">
            <RadioGroupItem value="clean" id="radio-clean" />
            <FieldLabel htmlFor="radio-clean">Clean</FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <RadioGroupItem value="dirty" id="radio-dirty" />
            <FieldLabel htmlFor="radio-dirty">Dirty</FieldLabel>
          </Field>
        </RadioGroup>
      </Demo>
    </>
  );
}

/** A group with no choice made, invalid, with its error in words. */
function InvalidRadioGroup(): ReactElement {
  return (
    <Demo label="invalid">
      <RadioGroup aria-label="Side" aria-describedby="radio-side-error">
        <Field orientation="horizontal" data-invalid>
          <RadioGroupItem value="buy" id="radio-buy" aria-invalid />
          <FieldLabel htmlFor="radio-buy">Buy</FieldLabel>
        </Field>
        <Field orientation="horizontal" data-invalid>
          <RadioGroupItem value="sell" id="radio-sell" aria-invalid />
          <FieldLabel htmlFor="radio-sell">Sell</FieldLabel>
        </Field>
      </RadioGroup>
      <FieldError id="radio-side-error">Choose a side.</FieldError>
    </Demo>
  );
}

function RadioGroupSection(): ReactElement {
  return (
    <Section
      title="RadioGroup"
      description="One choice of several. The arrow keys move the choice; each circle sits in a 24 px target."
    >
      <div className="flex flex-wrap items-start gap-10">
        <RadioGroups />
        <InvalidRadioGroup />
      </div>
    </Section>
  );
}

/** A switch disabled, and one invalid with the error in words. */
function SwitchStates(): ReactElement {
  return (
    <>
      <Demo label="disabled">
        <Field orientation="horizontal">
          <Switch id="switch-disabled" disabled defaultChecked />
          <FieldLabel htmlFor="switch-disabled">Auto-hedge</FieldLabel>
        </Field>
      </Demo>
      <Demo label="invalid">
        <Field orientation="horizontal" data-invalid>
          <Switch id="switch-invalid" aria-invalid aria-describedby="switch-invalid-error" />
          <FieldLabel htmlFor="switch-invalid">Accept the risk limits</FieldLabel>
        </Field>
        <FieldError id="switch-invalid-error">Accept the limits to trade.</FieldError>
      </Demo>
    </>
  );
}

function SwitchSection(): ReactElement {
  return (
    <Section
      title="Switch"
      description="A setting that takes effect at once, switched with Space. Both sizes sit in a target at least 24 px square."
    >
      <div className="flex flex-wrap items-start gap-6">
        <Demo label="off">
          <Field orientation="horizontal">
            <Switch id="switch-off" />
            <FieldLabel htmlFor="switch-off">Streaming prices</FieldLabel>
          </Field>
        </Demo>
        <Demo label="on">
          <Field orientation="horizontal">
            <Switch id="switch-on" defaultChecked />
            <FieldLabel htmlFor="switch-on">Show yields</FieldLabel>
          </Field>
        </Demo>
        <Demo label="small, off and on">
          <Field orientation="horizontal">
            <Switch id="switch-sm-off" size="sm" />
            <FieldLabel htmlFor="switch-sm-off">Compact rows</FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Switch id="switch-sm-on" size="sm" defaultChecked />
            <FieldLabel htmlFor="switch-sm-on">Totals row</FieldLabel>
          </Field>
        </Demo>
        <Demo label="focused">
          <Field orientation="horizontal">
            <Switch id="switch-focused" defaultChecked {...focused} />
            <FieldLabel htmlFor="switch-focused">Live P&amp;L</FieldLabel>
          </Field>
        </Demo>
        <SwitchStates />
      </div>
    </Section>
  );
}

export { CheckboxSection, RadioGroupSection, SwitchSection };
