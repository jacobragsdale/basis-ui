/* Select and NativeSelect on the forms and inputs page: both sizes, groups, disabled and invalid. No select is left
 * open: Base UI's Select moves focus into its list as it opens, so the page would load scrolled to it, and hides the
 * rest of the page from assistive technology; the tests open one instead. */

import {
  FieldError,
  Label,
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";
import { usePictured } from "#pages/shot.ts";
import { Demo } from "./demo.tsx";

const tenors = [
  { label: "Choose a tenor", value: null },
  { label: "2Y", value: "2y" },
  { label: "5Y", value: "5y" },
  { label: "10Y", value: "10y" },
  { label: "30Y", value: "30y" },
];

const desks = [
  { label: "Treasuries", value: "ust" },
  { label: "Agencies", value: "agency" },
  { label: "Investment grade", value: "ig" },
  { label: "High yield", value: "hy" },
];

/** The tenors as a select's items. */
function TenorItems(): ReactElement {
  return (
    <SelectContent>
      {tenors.map((tenor) => (
        <SelectItem key={tenor.label} value={tenor.value}>
          {tenor.label}
        </SelectItem>
      ))}
    </SelectContent>
  );
}

/** Selects at both sizes, with a placeholder, a choice, and groups. */
function SelectSizes(): ReactElement {
  const pictured = usePictured();
  return (
    <>
      <Demo label="placeholder">
        <Label htmlFor="select-tenor">Tenor</Label>
        <Select items={tenors}>
          <SelectTrigger id="select-tenor" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <TenorItems />
        </Select>
      </Demo>
      <Demo label="small, chosen">
        <Label htmlFor="select-tenor-sm">Tenor</Label>
        <Select items={tenors} defaultValue="10y">
          <SelectTrigger id="select-tenor-sm" size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <TenorItems />
        </Select>
      </Demo>
      <Demo label="groups">
        <Label htmlFor="select-desk">Desk</Label>
        <Select items={desks} defaultValue="ig" defaultOpen={pictured}>
          <SelectTrigger id="select-desk" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Rates</SelectLabel>
              <SelectItem value="ust">Treasuries</SelectItem>
              <SelectItem value="agency">Agencies</SelectItem>
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Credit</SelectLabel>
              <SelectItem value="ig">Investment grade</SelectItem>
              <SelectItem value="hy">High yield</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Demo>
    </>
  );
}

/** Selects disabled and invalid, with the error in words. */
function SelectStates(): ReactElement {
  return (
    <>
      <Demo label="disabled">
        <Label htmlFor="select-disabled">Tenor</Label>
        <Select items={tenors} defaultValue="5y" disabled>
          <SelectTrigger id="select-disabled" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <TenorItems />
        </Select>
      </Demo>
      <Demo label="invalid">
        <Label htmlFor="select-invalid">Tenor</Label>
        <Select items={tenors}>
          <SelectTrigger
            id="select-invalid"
            className="w-40"
            aria-invalid
            aria-describedby="select-invalid-error"
          >
            <SelectValue />
          </SelectTrigger>
          <TenorItems />
        </Select>
        <FieldError id="select-invalid-error">Choose a tenor.</FieldError>
      </Demo>
    </>
  );
}

function SelectSection(): ReactElement {
  return (
    <Section
      title="Select"
      description="A choice from a list that opens from its trigger. The arrow keys move through the list and typing finds an item."
    >
      <div className="flex flex-wrap items-start gap-6">
        <SelectSizes />
        <SelectStates />
      </div>
    </Section>
  );
}

function NativeSelectSection(): ReactElement {
  return (
    <Section
      title="NativeSelect"
      description="The browser's own select, in Input's look, for lists the platform's picker serves best."
    >
      <div className="flex flex-wrap items-start gap-6">
        <Demo label="default">
          <Label htmlFor="native-currency">Currency</Label>
          <NativeSelect id="native-currency" defaultValue="usd">
            <NativeSelectOption value="usd">USD</NativeSelectOption>
            <NativeSelectOption value="eur">EUR</NativeSelectOption>
            <NativeSelectOption value="gbp">GBP</NativeSelectOption>
          </NativeSelect>
        </Demo>
        <Demo label="small, with groups">
          <Label htmlFor="native-calendar">Calendar</Label>
          <NativeSelect id="native-calendar" size="sm" defaultValue="sifma">
            <NativeSelectOptGroup label="United States">
              <NativeSelectOption value="sifma">SIFMA</NativeSelectOption>
              <NativeSelectOption value="nyse">NYSE</NativeSelectOption>
            </NativeSelectOptGroup>
            <NativeSelectOptGroup label="Euro area">
              <NativeSelectOption value="target2">TARGET2</NativeSelectOption>
            </NativeSelectOptGroup>
          </NativeSelect>
        </Demo>
        <Demo label="disabled">
          <Label htmlFor="native-disabled">Currency</Label>
          <NativeSelect id="native-disabled" defaultValue="usd" disabled>
            <NativeSelectOption value="usd">USD</NativeSelectOption>
          </NativeSelect>
        </Demo>
        <Demo label="invalid">
          <Label htmlFor="native-invalid">Currency</Label>
          <NativeSelect
            id="native-invalid"
            defaultValue=""
            aria-invalid
            aria-describedby="native-invalid-error"
          >
            <NativeSelectOption value="">Choose</NativeSelectOption>
            <NativeSelectOption value="usd">USD</NativeSelectOption>
          </NativeSelect>
          <FieldError id="native-invalid-error">Choose a currency.</FieldError>
        </Demo>
      </div>
    </Section>
  );
}

export { NativeSelectSection, SelectSection };
