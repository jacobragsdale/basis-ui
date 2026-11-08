/* The banner that names the environment an app runs in, so no one mistakes a test system for production. Its colours
 * are the theme's env tokens (docs/design.md, The theme). */

import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

const environmentClasses = {
  dev: "bg-env-dev text-env-dev-foreground",
  prod: "bg-env-prod text-env-prod-foreground",
  qa: "bg-env-qa text-env-qa-foreground",
} as const;

const environmentNames = { dev: "Development", prod: "Production", qa: "QA" } as const;

interface EnvironmentBannerProps extends Omit<ComponentProps<"output">, "children"> {
  /** The environment: `dev`, `qa` or `prod`. */
  readonly environment: keyof typeof environmentClasses;
  /** What it says after the environment's name, such as the API it calls. */
  readonly detail?: string | undefined;
}

/** A thin bar across the top of the page naming the environment, in its own colour: development, QA or production.
 *
 * @example
 * ```tsx
 * import { EnvironmentBanner } from "@basis/ui";
 *
 * <EnvironmentBanner environment="qa" detail="positions-api, QA cluster" />;
 * ```
 */
function EnvironmentBanner({
  environment,
  detail,
  className,
  ...props
}: EnvironmentBannerProps): ReactElement {
  const name = environmentNames[environment];
  return (
    <output
      aria-label={`${name} environment`}
      data-slot="environment-banner"
      className={cn(
        "block w-full px-3 py-0.5 text-center text-xs font-medium",
        environmentClasses[environment],
        className,
      )}
      {...props}
    >
      {detail === undefined ? name : `${name}: ${detail}`}
    </output>
  );
}

export { EnvironmentBanner };
