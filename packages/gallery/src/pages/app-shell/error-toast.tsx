/* The error toast on the app shell page: what BasisApp raises for a failed mutation, here raised by hand. */

import { Button, Toaster, toastError } from "@basis/ui";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

import { invalidOrder, unreachable } from "./failures.ts";

function ErrorToastSection(): ReactElement {
  return (
    <Section
      title="Error toast"
      description="What BasisApp raises for every failed mutation, unless its meta says errorToast: false: the problem in a toast that stays until it is closed, announced at once."
    >
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            toastError(invalidOrder);
          }}
        >
          Refused order
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            toastError(unreachable);
          }}
        >
          Lost connection
        </Button>
      </div>
      <Toaster />
    </Section>
  );
}

export { ErrorToastSection };
