// lucide-react 1.70.0's `minus` icon, from Feather (MIT and ISC; see LICENSE beside this file).

import type { ReactElement } from "react";

import { Icon } from "./icon.tsx";
import type { IconProps } from "./icon.tsx";

/** lucide's `minus`. */
function MinusIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
    </Icon>
  );
}

export { MinusIcon };
