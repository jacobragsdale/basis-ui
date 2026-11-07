// lucide-react 1.70.0's `arrow-up-narrow-wide` icon (ISC; see LICENSE beside this file).

import type { ReactElement } from "react";

import { Icon } from "./icon.tsx";
import type { IconProps } from "./icon.tsx";

/** lucide's `arrow-up-narrow-wide`, also exported as `SortAscIcon`. */
function ArrowUpNarrowWideIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="m3 8 4-4 4 4" />
      <path d="M7 4v16" />
      <path d="M11 12h4" />
      <path d="M11 16h7" />
      <path d="M11 20h10" />
    </Icon>
  );
}

export { ArrowUpNarrowWideIcon };
