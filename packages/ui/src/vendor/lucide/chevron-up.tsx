// lucide-react 1.70.0's `chevron-up` icon, from Feather (MIT and ISC; see LICENSE beside this file).

import type { ReactElement } from "react";

import { Icon } from "./icon.tsx";
import type { IconProps } from "./icon.tsx";

/** lucide's `chevron-up`. */
function ChevronUpIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="m18 15-6-6-6 6" />
    </Icon>
  );
}

export { ChevronUpIcon };
