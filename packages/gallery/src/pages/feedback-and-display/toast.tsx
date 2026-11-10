/* Toast on the feedback and display page: a button for each variant, raising it through the app's `toast` manager
 * into the page's Toaster, then one with an action and one that follows a promise. The page renders the Toaster
 * itself, so the gallery's other pages carry none. */

import { Button, Toaster, toast } from "@basis/ui";
import { useEffect } from "react";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";
import { usePictured } from "#pages/shot.ts";

type ToastOptions = Parameters<typeof toast.add>[0];

const examples: readonly (readonly [string, ToastOptions])[] = [
  [
    "Default",
    {
      title: "Report queued",
      description: "The risk report will be ready in a few minutes.",
    },
  ],
  [
    "Success",
    {
      type: "success",
      title: "Trade booked",
      description: "Bought 5,000 par of UST 4.25% 2034 at 99-16.",
    },
  ],
  [
    "Warning",
    {
      type: "warning",
      title: "Prices are stale",
      description: "The pricing feed has not updated for 15 minutes.",
    },
  ],
  [
    "Info",
    {
      type: "info",
      title: "Market closes early",
      description: "SIFMA recommends a 2:00 p.m. close tomorrow.",
    },
  ],
  [
    "Destructive",
    {
      type: "destructive",
      title: "Order rejected",
      description: "The order exceeds the desk's DV01 limit.",
    },
  ],
  [
    "With an action",
    {
      title: "Order cancelled",
      description: "Sell 2,000 par of UST 4.25% 2034.",
      actionProps: { children: "Undo" },
    },
  ],
];

/** How long the promise example takes to settle, so its loading state shows. */
const pricingMilliseconds = 1500;

async function pricePortfolio(): Promise<string> {
  const { promise, resolve } = Promise.withResolvers<undefined>();
  setTimeout(resolve, pricingMilliseconds);
  await promise;
  return "1,204 positions";
}

function raisePromiseToast(): void {
  toast
    .promise(pricePortfolio(), {
      loading: { title: "Pricing the portfolio" },
      success: (count) => ({ title: "Portfolio priced", description: count }),
      error: { title: "Pricing failed" },
    })
    .catch(() => {
      // The error toast has already said so.
    });
}

/** Raises every example, kept until closed, while the section is shown alone, so its screenshot pictures the stack;
 * closes them when it unmounts. */
function usePicturedToasts(): void {
  const pictured = usePictured();
  useEffect(() => {
    const ids = pictured
      ? examples.map(([, options]) => toast.add({ ...options, timeout: 0 }))
      : [];
    return (): void => {
      for (const id of ids) {
        toast.close(id);
      }
    };
  }, [pictured]);
}

function ToastSection(): ReactElement {
  usePicturedToasts();
  return (
    <Section
      title="Toast"
      description="A brief notice of something that happened, in the corner, which closes itself. Raise one from anywhere with toast.add()."
    >
      <div className="flex flex-wrap gap-2">
        {examples.map(([label, options]) => (
          <Button
            key={label}
            variant="outline"
            onClick={() => {
              toast.add(options);
            }}
          >
            {label}
          </Button>
        ))}
        <Button variant="outline" onClick={raisePromiseToast}>
          Promise
        </Button>
      </div>
      <Toaster />
    </Section>
  );
}

export { ToastSection };
