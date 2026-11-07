/* The forms and inputs family: Button so far, every variant at every size, and the states a page puts it in. */

import { Button, buttonVariants } from "@basis/ui";
import { ArrowRight, Download, Plus } from "lucide-react";
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
                    <Plus />
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

/** Icons at either end, disabled, invalid, and a link drawn as a button, which is an `<a>` with `buttonVariants`, since
 * Base UI's Button gives whatever it renders the button role. */
function ButtonStates(): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button>
        <Download data-icon="inline-start" />
        Export
      </Button>
      <Button variant="outline">
        Next
        <ArrowRight data-icon="inline-end" />
      </Button>
      <Button disabled>Disabled</Button>
      <Button variant="outline" aria-invalid>
        Invalid
      </Button>
      <a href="#button" className={buttonVariants({ variant: "outline" })}>
        Back to Button
      </a>
    </div>
  );
}

function FormsAndInputs(): ReactElement {
  return (
    <Section
      title="Button"
      description="An action. Its variant says how much it matters, and sizes below h-8 keep a 24 px target in the compact density."
    >
      <ButtonMatrix />
      <ButtonStates />
    </Section>
  );
}

export { FormsAndInputs };
