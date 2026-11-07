// lucide-react 1.70.0's `panel-left` icon, from Feather (MIT and ISC; see LICENSE beside this file).

import type { ReactElement } from "react";

import { Icon } from "./icon.tsx";
import type { IconProps } from "./icon.tsx";

/** lucide's `panel-left`, also exported as `SidebarIcon`. */
function PanelLeftIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </Icon>
  );
}

export { PanelLeftIcon };
