// lucide-react 1.70.0's `chevrons-left` icon, from Feather (MIT and ISC; see LICENSE beside this file).

import type { ReactElement } from "react";

import { Icon } from "./icon.tsx";
import type { IconProps } from "./icon.tsx";

/** lucide's `chevrons-left`. */
function ChevronsLeftIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="m11 17-5-5 5-5" />
      <path d="m18 17-5-5 5-5" />
    </Icon>
  );
}

export { ChevronsLeftIcon };
