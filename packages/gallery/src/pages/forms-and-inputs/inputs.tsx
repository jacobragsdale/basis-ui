/* Input, Textarea and InputGroup on the forms and inputs page: each at rest, disabled and invalid, and the group with
 * every addon position and button size. An invalid control says why in words beside it, never by colour alone. */

import {
  CopyIcon,
  FieldError,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
  Label,
  SearchIcon,
  Textarea,
  XIcon,
} from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";
import { Demo } from "./demo.tsx";

function InputSection(): ReactElement {
  return (
    <Section
      title="Input"
      description="A text input. Invalid, its outline takes the destructive colour and an error beside it says why."
    >
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Demo label="at rest">
          <Label htmlFor="input-cusip">CUSIP</Label>
          <Input id="input-cusip" placeholder="912828XG0" />
        </Demo>
        <Demo label="with a value">
          <Label htmlFor="input-book">Book</Label>
          <Input id="input-book" defaultValue="RATES-NY" />
        </Demo>
        <Demo label="disabled">
          <Label htmlFor="input-desk">Desk</Label>
          <Input id="input-desk" defaultValue="Municipals" disabled />
        </Demo>
        <Demo label="invalid">
          <Label htmlFor="input-isin">ISIN</Label>
          <Input
            id="input-isin"
            defaultValue="US91282"
            aria-invalid
            aria-describedby="input-isin-error"
          />
          <FieldError id="input-isin-error">An ISIN is twelve letters and digits.</FieldError>
        </Demo>
        <Demo label="file">
          <Label htmlFor="input-file">Positions file</Label>
          <Input id="input-file" type="file" />
        </Demo>
      </div>
    </Section>
  );
}

function TextareaSection(): ReactElement {
  return (
    <Section title="Textarea" description="A multi-line text input that grows with its text.">
      <div className="grid gap-6 sm:grid-cols-3">
        <Demo label="at rest">
          <Label htmlFor="textarea-notes">Notes</Label>
          <Textarea id="textarea-notes" placeholder="Context for the desk" />
        </Demo>
        <Demo label="disabled">
          <Label htmlFor="textarea-locked">Approval note</Label>
          <Textarea id="textarea-locked" defaultValue="Approved by the risk desk." disabled />
        </Demo>
        <Demo label="invalid">
          <Label htmlFor="textarea-reason">Reason for the amendment</Label>
          <Textarea id="textarea-reason" aria-invalid aria-describedby="textarea-reason-error" />
          <FieldError id="textarea-reason-error">Say why the trade is amended.</FieldError>
        </Demo>
      </div>
    </Section>
  );
}

/** Groups with an icon, text, and buttons at each size. */
function AddonGroups(): ReactElement {
  return (
    <>
      <Demo label="inline-start icon">
        <InputGroup>
          <InputGroupInput aria-label="Search bonds" placeholder="Search by CUSIP or issuer" />
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>
      </Demo>
      <Demo label="text at both ends">
        <InputGroup>
          <InputGroupAddon>
            <InputGroupText>$</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput aria-label="Notional" placeholder="5,000,000" />
          <InputGroupAddon align="inline-end">
            <InputGroupText>USD</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      </Demo>
      <Demo label="button sizes: xs, sm">
        <InputGroup>
          <InputGroupInput aria-label="Trade ID" defaultValue="TR-20261107-0042" readOnly />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="xs">Copy</InputGroupButton>
            <InputGroupButton size="sm" variant="secondary">
              Open
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Demo>
      <Demo label="button sizes: icon-xs, icon-sm">
        <InputGroup>
          <InputGroupInput aria-label="Account" defaultValue="ACCT-7731" />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" aria-label="Copy account">
              <CopyIcon />
            </InputGroupButton>
            <InputGroupButton size="icon-sm" aria-label="Clear account">
              <XIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Demo>
    </>
  );
}

/** A group around a textarea, with addons on the lines above and below it. */
function BlockGroup(): ReactElement {
  return (
    <Demo label="block-start and block-end, with a textarea">
      <InputGroup>
        <InputGroupAddon align="block-start">
          <InputGroupText>Desk chat</InputGroupText>
        </InputGroupAddon>
        <InputGroupTextarea aria-label="Message to the desk" placeholder="Message the desk" />
        <InputGroupAddon align="block-end">
          <InputGroupText>0 of 280</InputGroupText>
          <InputGroupButton size="sm" variant="default" className="ml-auto">
            Send
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </Demo>
  );
}

/** A group disabled, and one invalid with its error in words. */
function GroupStates(): ReactElement {
  return (
    <>
      <Demo label="disabled">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput aria-label="Search closed books" placeholder="Search" disabled />
        </InputGroup>
      </Demo>
      <Demo label="invalid">
        <InputGroup>
          <InputGroupAddon>
            <InputGroupText>$</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Price"
            defaultValue="-4"
            aria-invalid
            aria-describedby="input-group-price-error"
          />
        </InputGroup>
        <FieldError id="input-group-price-error">A price is above zero.</FieldError>
      </Demo>
    </>
  );
}

function InputGroupSection(): ReactElement {
  return (
    <Section
      title="InputGroup"
      description="An input with text, icons and buttons inside its outline, before or after it on its line, or on a line above or below it."
    >
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <AddonGroups />
        <BlockGroup />
        <GroupStates />
      </div>
    </Section>
  );
}

export { InputGroupSection, InputSection, TextareaSection };
