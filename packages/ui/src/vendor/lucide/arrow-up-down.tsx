// lucide-react 1.70.0's `arrow-up-down` icon (ISC; see LICENSE beside this file).

import type { ReactElement } from "react";

import { Icon } from "./icon.tsx";
import type { IconProps } from "./icon.tsx";

/** lucide's `arrow-up-down`. */
function ArrowUpDownIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="m21 16-4 4-4-4" />
      <path d="M17 20V4" />
      <path d="m3 8 4-4 4 4" />
      <path d="M7 4v16" />
    </Icon>
  );
}

export { ArrowUpDownIcon };
