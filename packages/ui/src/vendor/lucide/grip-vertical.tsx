// lucide-react 1.70.0's `grip-vertical` icon (ISC; see LICENSE beside this file).

import type { ReactElement } from "react";

import { Icon } from "./icon.tsx";
import type { IconProps } from "./icon.tsx";

/** lucide's `grip-vertical`. */
function GripVerticalIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="5" r="1" />
      <circle cx="9" cy="19" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="5" r="1" />
      <circle cx="15" cy="19" r="1" />
    </Icon>
  );
}

export { GripVerticalIcon };
