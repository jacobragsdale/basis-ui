// lucide-react 1.70.0's `triangle-exclamation-point` icon, from Feather (MIT and ISC; see LICENSE beside this file).

import type { ReactElement } from "react";

import { Icon } from "./icon.tsx";
import type { IconProps } from "./icon.tsx";

/** lucide's `triangle-exclamation-point`, also exported as `AlertTriangleIcon` and `TriangleAlertIcon`. */
function TriangleExclamationPointIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Icon>
  );
}

export { TriangleExclamationPointIcon };
