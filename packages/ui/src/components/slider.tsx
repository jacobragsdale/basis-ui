/* Slider, from @jacobragsdale/ui 1.5.1 (shadcn's Base UI source): Base UI's slider, a track with one thumb per value,
 * which the arrow keys, Page Up and Page Down, Home and End move.
 *
 * Changed from shadcn: @jacobragsdale/ui's two edits stay (a single number draws one thumb, and `aria-label` names each
 * thumb's input), and each thumb is a 24 px target, `min-h-target` by `min-w-target`, with shadcn's 12 px dot drawn
 * inside it, so the target holds in the compact density, where shadcn's `::after` fell short of it. The dot's ring
 * follows the thumb's input, which is what takes focus. shadcn's `data-horizontal` and `data-vertical` are shadcn's own
 * variants, which the theme lacks, so its classes read `data-orientation`; the dot is the background's colour rather
 * than white, so it suits the dark mode too. */

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "cn";
import type { ReactElement } from "react";

type SliderValue = SliderPrimitive.Root.Props["value"];

/** How many thumbs the slider draws: one per value, and two, for a range, when it has no value yet. A single number
 * is one thumb, where shadcn drew two. */
function thumbCount(value: SliderValue, defaultValue: SliderValue): number {
  const shown = value ?? defaultValue;
  if (shown === undefined) {
    return 2;
  }
  return typeof shown === "number" ? 1 : shown.length;
}

/** A slider. Give it `value` and `onValueChange`, or `defaultValue`; an array of two values draws a range. Name it
 * with `aria-label`, which names each thumb. */
function Slider({
  className,
  "aria-label": ariaLabel,
  ...props
}: SliderPrimitive.Root.Props & { readonly className?: string }): ReactElement {
  const thumbs = Array.from(
    { length: thumbCount(props.value, props.defaultValue) },
    (_value, index) => index,
  );
  return (
    <SliderPrimitive.Root
      className={cn(
        "data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full",
        className,
      )}
      data-slot="slider"
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-40 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-muted select-none data-[orientation=horizontal]:h-1 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-primary select-none data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
          />
        </SliderPrimitive.Track>
        {thumbs.map((thumb) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={thumb}
            aria-label={ariaLabel}
            className="group/slider-thumb relative flex min-h-target min-w-target shrink-0 items-center justify-center outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50"
          >
            <span
              data-slot="slider-thumb-dot"
              className="block size-3 shrink-0 rounded-full border border-ring bg-background ring-ring/50 transition-shadow group-hover/slider-thumb:ring-3 group-active/slider-thumb:ring-3 group-has-focus-visible/slider-thumb:ring-3"
            />
          </SliderPrimitive.Thumb>
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
