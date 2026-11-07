/* The forms and inputs family: Button, every variant at every size and the states a page puts it in, and ButtonLink,
 * a link drawn as a Button. */

import { ArrowRightIcon, Button, ButtonLink, DownloadIcon, PlusIcon } from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "./section.tsx";

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

/** Icons at either end, disabled and invalid. */
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
      <Button disabled>Disabled</Button>
      <Button variant="outline" aria-invalid>
        Invalid
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
      </div>
    </Section>
  );
}

function FormsAndInputs(): ReactElement {
  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Button"
        description="An action. Its variant says how much it matters, and sizes below h-8 keep a 24 px target in the compact density."
      >
        <ButtonMatrix />
        <ButtonStates />
      </Section>
      <ButtonLinkSection />
    </div>
  );
}

export { FormsAndInputs };
