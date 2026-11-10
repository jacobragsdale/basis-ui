/* NativeSelect's classes, from shadcn's Base UI source in its nova style with its `dark:` classes and arbitrary radius
 * replaced by the theme's tokens and scales. They live apart from native-select.tsx because a component file exports
 * only components; the package never exports them. */

import { cva } from "#vendor/cva/cva.ts";

/** A native select, at Input's height (`default`) or a step smaller (`sm`), which keeps the 24 px target in the
 * compact density. */
const nativeSelectVariants = cva(
  "w-full min-w-0 appearance-none border border-input bg-transparent pr-8 pl-(--control-md-inset) text-sm transition-colors outline-none select-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-solid focus-visible:outline focus-visible:outline-offset-(--focus-offset) focus-visible:outline-ring disabled:pointer-events-none disabled:cursor-not-allowed aria-invalid:border-destructive aria-invalid:outline-destructive",
  {
    variants: {
      size: {
        default: "h-(--control-md-height) rounded-lg py-1",
        sm: "h-(--control-sm-height) min-h-target min-w-target rounded-md py-0",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export { nativeSelectVariants };
