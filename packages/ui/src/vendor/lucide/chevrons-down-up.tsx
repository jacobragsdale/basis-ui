// lucide-react 1.70.0's `chevrons-down-up` icon (ISC; see LICENSE beside this file).

import type { ReactElement } from "react";

import { Icon } from "./icon.tsx";
import type { IconProps } from "./icon.tsx";

/** lucide's `chevrons-down-up`. */
function ChevronsDownUpIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="m7 20 5-5 5 5" />
      <path d="m7 4 5 5 5-5" />
    </Icon>
  );
}

export { ChevronsDownUpIcon };
