// lucide-react 1.70.0's `chevron-left` icon, from Feather (MIT and ISC; see LICENSE beside this file).

import type { ReactElement } from "react";

import { Icon } from "./icon.tsx";
import type { IconProps } from "./icon.tsx";

/** lucide's `chevron-left`. */
function ChevronLeftIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  );
}

export { ChevronLeftIcon };
