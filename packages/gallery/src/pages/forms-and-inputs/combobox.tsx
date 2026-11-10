/* Combobox on the forms and inputs page: an input that filters a list, with a clear button, groups, several choices
 * as chips, disabled and invalid. None is left open: an open Base UI combobox hides the rest of the page from
 * assistive technology, so the tests open one instead. */

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxValue,
  FieldError,
  Label,
  useComboboxAnchor,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";
import { usePictured } from "#pages/shot.ts";
import { Demo } from "./demo.tsx";

const issuers = [
  "Treasury",
  "Fannie Mae",
  "Freddie Mac",
  "Ginnie Mae",
  "World Bank",
  "Tennessee Valley",
];

const sectors = [
  { value: "Rates", items: ["Treasuries", "Agencies", "Supranationals"] },
  { value: "Credit", items: ["Investment grade", "High yield"] },
];

/** The issuers as the list's items, with what it says when none match. */
function IssuerList(): ReactElement {
  return (
    <ComboboxContent>
      <ComboboxEmpty>No issuer matches.</ComboboxEmpty>
      <ComboboxList>
        {(issuer: string) => (
          <ComboboxItem key={issuer} value={issuer}>
            {issuer}
          </ComboboxItem>
        )}
      </ComboboxList>
    </ComboboxContent>
  );
}

/** Several issuers chosen as chips. */
function IssuerChips(): ReactElement {
  const anchor = useComboboxAnchor();
  return (
    <Combobox multiple items={issuers} defaultValue={["Treasury", "World Bank"]}>
      <ComboboxChips ref={anchor} className="w-72">
        <ComboboxValue>
          {(chosen: readonly string[]) => (
            <>
              {chosen.map((issuer) => (
                <ComboboxChip key={issuer}>{issuer}</ComboboxChip>
              ))}
              <ComboboxChipsInput id="combobox-chips" aria-label="Issuers" />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No issuer matches.</ComboboxEmpty>
        <ComboboxList>
          {(issuer: string) => (
            <ComboboxItem key={issuer} value={issuer}>
              {issuer}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/** Single comboboxes at rest, chosen with a clear button, and in groups. */
function SingleComboboxes(): ReactElement {
  const pictured = usePictured();
  return (
    <>
      <Demo label="at rest">
        <Label htmlFor="combobox-issuer">Issuer</Label>
        <Combobox items={issuers}>
          <ComboboxInput id="combobox-issuer" placeholder="Search issuers" />
          <IssuerList />
        </Combobox>
      </Demo>
      <Demo label="chosen, with a clear button">
        <Label htmlFor="combobox-clear">Issuer</Label>
        <Combobox items={issuers} defaultValue="Fannie Mae">
          <ComboboxInput id="combobox-clear" showClear />
          <IssuerList />
        </Combobox>
      </Demo>
      <Demo label="groups">
        <Label htmlFor="combobox-sector">Sector</Label>
        <Combobox items={sectors} defaultOpen={pictured}>
          <ComboboxInput id="combobox-sector" placeholder="Search sectors" />
          <ComboboxContent>
            <ComboboxEmpty>No sector matches.</ComboboxEmpty>
            <ComboboxList>
              {(group: (typeof sectors)[number]) => (
                <ComboboxGroup key={group.value} items={group.items}>
                  <ComboboxLabel>{group.value}</ComboboxLabel>
                  <ComboboxCollection>
                    {(sector: string) => (
                      <ComboboxItem key={sector} value={sector}>
                        {sector}
                      </ComboboxItem>
                    )}
                  </ComboboxCollection>
                  <ComboboxSeparator />
                </ComboboxGroup>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </Demo>
    </>
  );
}

/** Comboboxes disabled, and invalid with the error in words. */
function ComboboxStates(): ReactElement {
  return (
    <>
      <Demo label="disabled">
        <Label htmlFor="combobox-disabled">Issuer</Label>
        <Combobox items={issuers} defaultValue="Treasury" disabled>
          <ComboboxInput id="combobox-disabled" disabled />
          <IssuerList />
        </Combobox>
      </Demo>
      <Demo label="invalid">
        <Label htmlFor="combobox-invalid">Issuer</Label>
        <Combobox items={issuers}>
          <ComboboxInput
            id="combobox-invalid"
            placeholder="Search issuers"
            aria-invalid
            aria-describedby="combobox-invalid-error"
          />
          <IssuerList />
        </Combobox>
        <FieldError id="combobox-invalid-error">Choose an issuer.</FieldError>
      </Demo>
    </>
  );
}

function ComboboxSection(): ReactElement {
  return (
    <Section
      title="Combobox"
      description="An input that filters a list as the user types. The arrow keys move through the matches and Enter chooses one; with multiple, the choices are chips."
    >
      <div className="flex flex-wrap items-start gap-6">
        <SingleComboboxes />
        <Demo label="multiple">
          <Label htmlFor="combobox-chips">Issuers</Label>
          <IssuerChips />
        </Demo>
        <ComboboxStates />
      </div>
    </Section>
  );
}

export { ComboboxSection };
