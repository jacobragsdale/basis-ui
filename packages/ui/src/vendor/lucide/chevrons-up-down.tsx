// lucide-react 1.70.0's `chevrons-up-down` icon (ISC; see LICENSE beside this file).

import type { ReactElement } from "react";

import { Icon } from "./icon.tsx";
import type { IconProps } from "./icon.tsx";

/** lucide's `chevrons-up-down`. */
function ChevronsUpDownIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="m7 15 5 5 5-5" />
      <path d="m7 9 5-5 5 5" />
    </Icon>
  );
}

export { ChevronsUpDownIcon };
