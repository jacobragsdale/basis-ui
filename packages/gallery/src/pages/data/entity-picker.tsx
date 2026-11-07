/* EntityPicker and SecurityPicker on the data page: an issuer search, one issuer or several as chips, and a search for
 * securities by CUSIP, ISIN or SEDOL that checks the identifier before it asks. None is left open: an open Base UI
 * combobox hides the rest of the page from assistive technology, so the tests open them instead. */

import { EntityPicker, Label, SecurityPicker } from "@basis/ui";
import { useState } from "react";
import type { ReactElement } from "react";

import { Demo } from "#pages/forms-and-inputs/demo.tsx";
import { Section } from "#pages/section.tsx";

import { issuers } from "./fixtures.ts";
import type { Issuer, Security } from "./fixtures.ts";
import { findSecurities, searchIssuers } from "./searches.ts";

/** An issuer in the list: its name, and its sector after it. */
function IssuerItem({ issuer }: { readonly issuer: Issuer }): ReactElement {
  return (
    <span className="flex w-full items-baseline justify-between gap-4">
      <span>{issuer.name}</span>
      <span className="text-xs text-muted-foreground">{issuer.sector}</span>
    </span>
  );
}

/** A security in the list: its description, and its CUSIP after it. */
function SecurityItem({ security }: { readonly security: Security }): ReactElement {
  return (
    <span className="flex w-full items-baseline justify-between gap-4">
      <span>{security.description}</span>
      <span className="font-mono text-xs text-muted-foreground">{security.cusip}</span>
    </span>
  );
}

const startingIssuers = issuers.filter((issuer) => issuer.sector === "Agency").slice(0, 2);

function EntityPickerSection(): ReactElement {
  return (
    <Section
      title="EntityPicker"
      description="A combobox that searches through the app's function, normally a generated client's, once typing stops. A newer text aborts the search before it, and only the last text's results show; the arrow keys move through them and Enter chooses one."
    >
      <div className="flex flex-wrap items-start gap-6">
        <Demo label="one issuer">
          <Label htmlFor="picker-issuer">Issuer</Label>
          <EntityPicker
            id="picker-issuer"
            className="w-72"
            placeholder="Search issuers"
            search={searchIssuers}
            itemKey={(issuer) => issuer.id}
            itemLabel={(issuer) => issuer.name}
            renderItem={(issuer) => <IssuerItem issuer={issuer} />}
          />
        </Demo>
        <Demo label="several, as chips">
          <Label htmlFor="picker-issuers">Issuers</Label>
          <EntityPicker
            multiple
            id="picker-issuers"
            className="w-80"
            defaultValue={startingIssuers}
            search={searchIssuers}
            itemKey={(issuer) => issuer.id}
            itemLabel={(issuer) => issuer.name}
            renderItem={(issuer) => <IssuerItem issuer={issuer} />}
          />
        </Demo>
        <Demo label="disabled">
          <Label htmlFor="picker-disabled">Issuer</Label>
          <EntityPicker
            id="picker-disabled"
            className="w-72"
            disabled
            defaultValue={issuers[0]}
            search={searchIssuers}
            itemKey={(issuer) => issuer.id}
            itemLabel={(issuer) => issuer.name}
          />
        </Demo>
      </div>
    </Section>
  );
}

function SecurityPickerSection(): ReactElement {
  const [chosen, setChosen] = useState<Security | null>(null);
  return (
    <Section
      title="SecurityPicker"
      description="An EntityPicker for securities by identifier. It reads the text as a CUSIP, an ISIN or a SEDOL by its length and checks it, check digit and all, before it searches; a text that is none of them is never sent, and the picker says why."
    >
      <Demo label="by identifier">
        <Label htmlFor="picker-security">Security</Label>
        <SecurityPicker
          id="picker-security"
          className="w-96"
          search={findSecurities}
          itemKey={(security) => security.cusip}
          itemLabel={(security) => security.description}
          renderItem={(security) => <SecurityItem security={security} />}
          onValueChange={setChosen}
        />
        <output className="text-sm text-muted-foreground">
          {chosen === null ? "No security chosen." : `${chosen.cusip}, ISIN ${chosen.isin}`}
        </output>
      </Demo>
    </Section>
  );
}

export { EntityPickerSection, SecurityPickerSection };
