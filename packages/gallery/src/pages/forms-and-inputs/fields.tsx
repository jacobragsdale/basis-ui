/* Label and Field on the forms and inputs page: a field in each orientation, valid and invalid, sets of fields under
 * a legend, a separator, and choice cards. */

import {
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Switch,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";
import { Demo } from "./demo.tsx";

function LabelSection(): ReactElement {
  return (
    <Section title="Label" description="A control's name. It dims when its control is disabled.">
      <div className="flex flex-wrap items-start gap-6">
        <Demo label="for an input">
          <Label htmlFor="label-trader">Trader</Label>
          <Input id="label-trader" placeholder="Initials" />
        </Demo>
        <Demo label="beside a checkbox">
          <div className="flex items-center gap-2">
            <Checkbox id="label-confirm" />
            <Label htmlFor="label-confirm">Send a confirmation</Label>
          </div>
        </Demo>
        <Demo label="beside a disabled checkbox">
          <div className="flex items-center gap-2">
            <Checkbox id="label-locked" disabled />
            <Label htmlFor="label-locked">Locked by compliance</Label>
          </div>
        </Demo>
      </div>
    </Section>
  );
}

/** A vertical field, at rest and invalid with one error or several. */
function VerticalFields(): ReactElement {
  return (
    <>
      <Demo label="vertical, with a description">
        <Field>
          <FieldLabel htmlFor="field-counterparty">Counterparty</FieldLabel>
          <Input id="field-counterparty" placeholder="Name or LEI" />
          <FieldDescription>The legal entity the trade is with.</FieldDescription>
        </Field>
      </Demo>
      <Demo label="invalid">
        <Field data-invalid>
          <FieldLabel htmlFor="field-quantity">Quantity</FieldLabel>
          <Input
            id="field-quantity"
            defaultValue="0"
            aria-invalid
            aria-describedby="field-quantity-error"
          />
          <FieldError
            id="field-quantity-error"
            errors={[{ message: "Enter a quantity above zero." }]}
          />
        </Field>
      </Demo>
      <Demo label="several errors">
        <Field data-invalid>
          <FieldLabel htmlFor="field-ticker">Ticker</FieldLabel>
          <Input
            id="field-ticker"
            defaultValue="t!"
            aria-invalid
            aria-describedby="field-ticker-error"
          />
          <FieldError
            id="field-ticker-error"
            errors={[
              "Use capital letters.",
              "Use letters and digits only.",
              "Use capital letters.",
            ]}
          />
        </Field>
      </Demo>
    </>
  );
}

/** Fields beside their controls, always or once the group is wide enough. */
function HorizontalFields(): ReactElement {
  return (
    <>
      <Demo label="horizontal">
        <Field orientation="horizontal">
          <Checkbox id="field-allocate" defaultChecked />
          <FieldLabel htmlFor="field-allocate">Allocate to sub-accounts</FieldLabel>
        </Field>
      </Demo>
      <Demo label="horizontal, with content">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="field-alerts">Price alerts</FieldLabel>
            <FieldDescription>Tell me when a watched bond moves a point.</FieldDescription>
          </FieldContent>
          <Switch id="field-alerts" />
        </Field>
      </Demo>
      <Demo label="responsive, in a field group">
        <FieldGroup>
          <Field orientation="responsive">
            <FieldLabel htmlFor="field-book">Book</FieldLabel>
            <Input id="field-book" placeholder="RATES-NY" />
          </Field>
        </FieldGroup>
      </Demo>
    </>
  );
}

/** A fieldset under a legend, with a separator between its fields. */
function SettlementSet(): ReactElement {
  return (
    <FieldSet>
      <FieldLegend>Settlement</FieldLegend>
      <FieldDescription>Where the bonds and the cash go.</FieldDescription>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="fieldset-custodian">Custodian</FieldLabel>
          <Input id="fieldset-custodian" placeholder="Custodian bank" />
        </Field>
        <FieldSeparator>or</FieldSeparator>
        <Field>
          <FieldLabel htmlFor="fieldset-dtc">DTC participant</FieldLabel>
          <Input id="fieldset-dtc" placeholder="0000" />
        </Field>
      </FieldGroup>
    </FieldSet>
  );
}

/** A fieldset of radios under a label-sized legend. */
function DayCountSet(): ReactElement {
  return (
    <FieldSet>
      <FieldLegend variant="label">Day count</FieldLegend>
      <RadioGroup defaultValue="30-360" aria-label="Day count">
        <Field orientation="horizontal">
          <RadioGroupItem value="30-360" id="fieldset-30-360" />
          <FieldLabel htmlFor="fieldset-30-360">30/360</FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <RadioGroupItem value="act-act" id="fieldset-act-act" />
          <FieldLabel htmlFor="fieldset-act-act">Actual/Actual</FieldLabel>
        </Field>
      </RadioGroup>
    </FieldSet>
  );
}

/** Radios as choice cards: each a FieldLabel wrapping a whole field, tinted while chosen. */
function ChoiceCards(): ReactElement {
  return (
    <FieldSet>
      <FieldLegend variant="label">Settle on, as choice cards</FieldLegend>
      <RadioGroup defaultValue="t1" aria-label="Settle on">
        <FieldLabel htmlFor="card-t1">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>T+1</FieldTitle>
              <FieldDescription>The next business day, the default.</FieldDescription>
            </FieldContent>
            <RadioGroupItem value="t1" id="card-t1" />
          </Field>
        </FieldLabel>
        <FieldLabel htmlFor="card-t0">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Same day</FieldTitle>
              <FieldDescription>Cash settlement, before the wire cutoff.</FieldDescription>
            </FieldContent>
            <RadioGroupItem value="t0" id="card-t0" />
          </Field>
        </FieldLabel>
      </RadioGroup>
    </FieldSet>
  );
}

function FieldSection(): ReactElement {
  return (
    <Section
      title="Field"
      description="A label, its control, a description and an error laid out together, and sets of fields under a legend. An invalid field says why in words."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <VerticalFields />
        <HorizontalFields />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <SettlementSet />
        <DayCountSet />
        <ChoiceCards />
      </div>
    </Section>
  );
}

export { FieldSection, LabelSection };
