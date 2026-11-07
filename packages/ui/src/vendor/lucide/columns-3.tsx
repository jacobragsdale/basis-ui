// lucide-react 1.70.0's `columns-3` icon (ISC; see LICENSE beside this file).

import type { ReactElement } from "react";

import { Icon } from "./icon.tsx";
import type { IconProps } from "./icon.tsx";

/** lucide's `columns-3`, also exported as `PanelsLeftRightIcon`. */
function Columns3Icon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
      <path d="M15 3v18" />
    </Icon>
  );
}

export { Columns3Icon };
