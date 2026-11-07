// lucide-react 1.70.0's `chevron-right` icon, from Feather (MIT and ISC; see LICENSE beside this file).

import type { ReactElement } from "react";

import { Icon } from "./icon.tsx";
import type { IconProps } from "./icon.tsx";

/** lucide's `chevron-right`. */
function ChevronRightIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="m9 18 6-6-6-6" />
    </Icon>
  );
}

export { ChevronRightIcon };
