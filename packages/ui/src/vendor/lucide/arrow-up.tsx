// lucide-react 1.70.0's `arrow-up` icon, from Feather (MIT and ISC; see LICENSE beside this file).

import type { ReactElement } from "react";

import { Icon } from "./icon.tsx";
import type { IconProps } from "./icon.tsx";

/** lucide's `arrow-up`. */
function ArrowUpIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </Icon>
  );
}

export { ArrowUpIcon };
