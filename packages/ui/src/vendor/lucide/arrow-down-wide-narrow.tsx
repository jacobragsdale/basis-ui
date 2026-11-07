// lucide-react 1.70.0's `arrow-down-wide-narrow` icon (ISC; see LICENSE beside this file).

import type { ReactElement } from "react";

import { Icon } from "./icon.tsx";
import type { IconProps } from "./icon.tsx";

/** lucide's `arrow-down-wide-narrow`, also exported as `SortDescIcon`. */
function ArrowDownWideNarrowIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="m3 16 4 4 4-4" />
      <path d="M7 20V4" />
      <path d="M11 4h10" />
      <path d="M11 8h7" />
      <path d="M11 12h4" />
    </Icon>
  );
}

export { ArrowDownWideNarrowIcon };
