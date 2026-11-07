// lucide-react 1.70.0's `chevrons-right` icon, from Feather (MIT and ISC; see LICENSE beside this file).

import type { ReactElement } from "react";

import { Icon } from "./icon.tsx";
import type { IconProps } from "./icon.tsx";

/** lucide's `chevrons-right`. */
function ChevronsRightIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="m6 17 5-5-5-5" />
      <path d="m13 17 5-5-5-5" />
    </Icon>
  );
}

export { ChevronsRightIcon };
