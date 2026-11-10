/* Progress and its parts, from shadcn's Base UI source (its base-nova style), on Base UI's Progress: a `progressbar`
 * with its value, named by its ProgressLabel. Progress draws its own track and indicator after its children, so a
 * label and a value go inside it: `<Progress value={40}><ProgressLabel>Upload</ProgressLabel><ProgressValue />
 * </Progress>`. */

import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import { cn } from "cn";
import type { ReactElement } from "react";

/** The progress bar's track. `Progress` includes it. */
function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props): ReactElement {
  return (
    <ProgressPrimitive.Track
      data-slot="progress-track"
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className,
      )}
      {...props}
    />
  );
}

/** The filled part of the progress bar's track. `Progress` includes it. */
function ProgressIndicator({
  className,
  ...props
}: ProgressPrimitive.Indicator.Props): ReactElement {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className={cn("h-full bg-primary transition-colors", className)}
      {...props}
    />
  );
}

/** A progress bar: its children, such as a label and the value, above a full-width track. `value` is out of `max`,
 * 100 by default, and `null` makes it indeterminate.
 *
 * @example
 * ```tsx
 * import { Progress, ProgressLabel, ProgressValue } from "@basis/ui";
 *
 * <Progress value={40}>
 *   <ProgressLabel>Allocating</ProgressLabel>
 *   <ProgressValue />
 * </Progress>;
 * ```
 */
function Progress({
  className,
  children,
  value,
  ...props
}: ProgressPrimitive.Root.Props): ReactElement {
  return (
    <ProgressPrimitive.Root
      value={value}
      data-slot="progress"
      className={cn("flex flex-wrap gap-3", className)}
      {...props}
    >
      {children}
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  );
}

/** The bar's name, which labels the `progressbar`. */
function ProgressLabel({ className, ...props }: ProgressPrimitive.Label.Props): ReactElement {
  return (
    <ProgressPrimitive.Label
      data-slot="progress-label"
      className={cn("text-sm font-medium", className)}
      {...props}
    />
  );
}

/** The value as text, such as "40%", at the end of the label's line, in tabular figures. */
function ProgressValue({ className, ...props }: ProgressPrimitive.Value.Props): ReactElement {
  return (
    <ProgressPrimitive.Value
      data-slot="progress-value"
      className={cn("ml-auto text-sm text-muted-foreground tabular-nums", className)}
      {...props}
    />
  );
}

export { Progress, ProgressIndicator, ProgressLabel, ProgressTrack, ProgressValue };
