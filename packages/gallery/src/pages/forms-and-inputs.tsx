/* The forms and inputs family, in the design's order: Button, every variant at every size and the states a page puts
 * it in, and ButtonLink, a link drawn as a Button, here; every other component, NumberField, MultiSelect, Tree,
 * TreeSelect and Toolbar among them, in its section's module under forms-and-inputs/, each in every variant, size and
 * state; and a form on TanStack Form. */

import { ArrowRightIcon, Button, ButtonLink, DownloadIcon, PlusIcon, Spinner } from "@basis/ui";
import type { ReactElement } from "react";

import { ButtonGroupSection } from "./forms-and-inputs/button-group.tsx";
import { CheckboxSection, RadioGroupSection, SwitchSection } from "./forms-and-inputs/choices.tsx";
import {
  MultiSelectSection,
  NumberFieldSection,
  ToolbarSection,
} from "./forms-and-inputs/choosing.tsx";
import { ComboboxSection } from "./forms-and-inputs/combobox.tsx";
import { TreeSection, TreeSelectSection } from "./forms-and-inputs/trees.tsx";
import { FieldSection, LabelSection } from "./forms-and-inputs/fields.tsx";
import { InputGroupSection, InputSection, TextareaSection } from "./forms-and-inputs/inputs.tsx";
import { OrderFormSection } from "./forms-and-inputs/order-form.tsx";
import { NativeSelectSection, SelectSection } from "./forms-and-inputs/selects.tsx";
import { SliderSection } from "./forms-and-inputs/slider.tsx";
import { ToggleGroupSection, ToggleSection } from "./forms-and-inputs/toggles.tsx";
import { Section } from "./section.tsx";
import { focused, hovered, pressed } from "./shot.ts";

const variants = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;
const textSizes = ["xs", "sm", "default", "lg"] as const;
const iconSizes = ["icon-xs", "icon-sm", "icon", "icon-lg"] as const;

/** Every variant at every size: a row per variant, a column per size. */
function ButtonMatrix(): ReactElement {
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-2 text-left text-sm">
        <thead>
          <tr>
            <th scope="col" className="font-medium text-muted-foreground">
              Variant
            </th>
            {[...textSizes, ...iconSizes].map((size) => (
              <th key={size} scope="col" className="font-medium text-muted-foreground">
                {size}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {variants.map((variant) => (
            <tr key={variant}>
              <th scope="row" className="pr-4 font-medium">
                {variant}
              </th>
              {textSizes.map((size) => (
                <td key={size}>
                  <Button variant={variant} size={size}>
                    Save
                  </Button>
                </td>
              ))}
              {iconSizes.map((size) => (
                <td key={size}>
                  <Button variant={variant} size={size} aria-label="Add">
                    <PlusIcon />
                  </Button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Icons at either end; hovered, focused and pressed, as the screenshots picture them; disabled, invalid and
 * loading. */
function ButtonStates(): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button>
        <DownloadIcon data-icon="inline-start" />
        Export
      </Button>
      <Button variant="outline">
        Next
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
      <Button {...hovered}>Hovered</Button>
      <Button variant="outline" {...hovered}>
        Hovered
      </Button>
      <Button {...focused}>Focused</Button>
      <Button variant="outline" {...focused}>
        Focused
      </Button>
      <Button {...pressed}>Pressed</Button>
      <Button disabled>Disabled</Button>
      <Button variant="outline" aria-invalid>
        Invalid
      </Button>
      <Button disabled aria-busy>
        <Spinner data-icon="inline-start" />
        Saving
      </Button>
    </div>
  );
}

/** Every variant, every size, and an icon at the end. Each link leads back to Button's section. */
function ButtonLinkSection(): ReactElement {
  return (
    <Section
      title="ButtonLink"
      description="A link drawn as a Button, with Button's variants and sizes, which stays a link. Base UI's Button gives whatever it renders the button role."
    >
      <div className="flex flex-wrap items-center gap-2">
        {variants.map((variant) => (
          <ButtonLink key={variant} href="#button" variant={variant}>
            {variant}
          </ButtonLink>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {textSizes.map((size) => (
          <ButtonLink key={size} href="#button" variant="outline" size={size}>
            {size}
          </ButtonLink>
        ))}
        {iconSizes.map((size) => (
          <ButtonLink key={size} href="#button" variant="outline" size={size} aria-label={size}>
            <ArrowRightIcon />
          </ButtonLink>
        ))}
        <ButtonLink href="#button" variant="outline">
          View trades
          <ArrowRightIcon data-icon="inline-end" />
        </ButtonLink>
        <ButtonLink href="#button" variant="outline" {...hovered}>
          Hovered
        </ButtonLink>
        <ButtonLink href="#button" variant="link" {...hovered}>
          Hovered link
        </ButtonLink>
        <ButtonLink href="#button" variant="outline" {...focused}>
          Focused
        </ButtonLink>
      </div>
    </Section>
  );
}

function FormsAndInputs(): ReactElement {
  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Button"
        description="An action. Its variant says how much it matters, and each size has a height of its own, at least a 24 px target, in either density."
      >
        <ButtonMatrix />
        <ButtonStates />
      </Section>
      <ButtonLinkSection />
      <ButtonGroupSection />
      <InputSection />
      <InputGroupSection />
      <TextareaSection />
      <FieldSection />
      <LabelSection />
      <CheckboxSection />
      <RadioGroupSection />
      <SwitchSection />
      <SliderSection />
      <NumberFieldSection />
      <SelectSection />
      <NativeSelectSection />
      <MultiSelectSection />
      <TreeSection />
      <TreeSelectSection />
      <ComboboxSection />
      <ToggleSection />
      <ToggleGroupSection />
      <ToolbarSection />
      <OrderFormSection />
    </div>
  );
}

export { FormsAndInputs };
