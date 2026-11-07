// lucide-react 1.70.0's `circle-exclamation-point` icon, from Feather (MIT and ISC; see LICENSE beside this file).

import type { ReactElement } from "react";

import { Icon } from "./icon.tsx";
import type { IconProps } from "./icon.tsx";

/** lucide's `circle-exclamation-point`, also exported as `AlertCircleIcon` and `CircleAlertIcon`. */
function CircleExclamationPointIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </Icon>
  );
}

export { CircleExclamationPointIcon };
