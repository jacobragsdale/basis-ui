// lucide-react 1.70.0's `circle-check-big` icon (ISC; see LICENSE beside this file).

import type { ReactElement } from "react";

import { Icon } from "./icon.tsx";
import type { IconProps } from "./icon.tsx";

/** lucide's `circle-check-big`, also exported as `CheckCircleIcon`. */
function CircleCheckBigIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M21.801 10A10 10 0 1 1 17 3.335" />
      <path d="m9 11 3 3L22 4" />
    </Icon>
  );
}

export { CircleCheckBigIcon };
