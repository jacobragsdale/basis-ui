/* The error toast on the app shell page: what BasisApp raises for a failed mutation, here raised by hand. */

import { Button, Toaster, toast, toastError } from "@basis/ui";
import { useEffect } from "react";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";
import { usePictured } from "#pages/shot.ts";

import { invalidOrder, unreachable } from "./failures.ts";

/** Raises the refused order's toast twice while the section is shown alone, so its screenshot pictures it with its
 * count; closes it when it unmounts. */
function usePicturedToast(): void {
  const pictured = usePictured();
  useEffect(() => {
    const ids = pictured ? [toastError(invalidOrder), toastError(invalidOrder)] : [];
    return (): void => {
      for (const id of ids) {
        toast.close(id);
      }
    };
  }, [pictured]);
}

function ErrorToastSection(): ReactElement {
  usePicturedToast();
  return (
    <Section
      title="Error toast"
      description="What BasisApp raises for every failed mutation, unless its meta says errorToast: false: the problem in a toast that stays until it is closed, announced at once. The same error again within 10 seconds counts on the open toast rather than raising another."
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
