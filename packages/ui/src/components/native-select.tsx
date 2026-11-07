/* NativeSelect and its parts, from shadcn's Base UI source in its nova style: the browser's own `<select>`, in Input's
 * look with a chevron, for long or simple lists where the platform's picker serves best.
 *
 * Changed from shadcn: the size is `nativeSelectVariants`, and the small size keeps the 24 px target; the chevron
 * takes its colour from the wrapper, since `shadcn/no-restyle` keeps colours off an icon; options and groups take the
 * popover's tokens where shadcn used the system colours `Canvas` and `CanvasText` as arbitrary values, and the page's
 * `color-scheme` already follows the mode. */

import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

import type { VariantProps } from "#vendor/cva/cva.ts";
import { ChevronDownIcon } from "#vendor/lucide/chevron-down.tsx";

import { nativeSelectVariants } from "./native-select-variants.ts";

type NativeSelectProps = Omit<ComponentProps<"select">, "size"> &
  VariantProps<typeof nativeSelectVariants>;

/** A native `<select>`. `className` places its wrapper; name it with a `Label` whose `htmlFor` is its `id`. */
function NativeSelect({ className, size = "default", ...props }: NativeSelectProps): ReactElement {
  return (
    <div
      className={cn(
        "group/native-select relative w-fit has-[select:disabled]:opacity-50 [&>svg]:text-muted-foreground",
        className,
      )}
      data-slot="native-select-wrapper"
      data-size={size}
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={nativeSelectVariants({ size })}
        {...props}
      />
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 select-none"
        data-slot="native-select-icon"
      />
    </div>
  );
}

/** One `<option>`. */
function NativeSelectOption({ className, ...props }: ComponentProps<"option">): ReactElement {
  return (
    <option
      data-slot="native-select-option"
      className={cn("bg-popover text-popover-foreground", className)}
      {...props}
    />
  );
}

/** An `<optgroup>` of options under a label. */
function NativeSelectOptGroup({ className, ...props }: ComponentProps<"optgroup">): ReactElement {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn("bg-popover text-popover-foreground", className)}
      {...props}
    />
  );
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
