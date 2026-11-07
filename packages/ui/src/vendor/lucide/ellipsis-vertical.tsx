// lucide-react 1.70.0's `ellipsis-vertical` icon, from Feather (MIT and ISC; see LICENSE beside this file).

import type { ReactElement } from "react";

import { Icon } from "./icon.tsx";
import type { IconProps } from "./icon.tsx";

/** lucide's `ellipsis-vertical`, also exported as `MoreVerticalIcon`. */
function EllipsisVerticalIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </Icon>
  );
}

export { EllipsisVerticalIcon };
