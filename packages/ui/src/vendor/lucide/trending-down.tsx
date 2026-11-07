// lucide-react 1.70.0's `trending-down` icon (ISC; see LICENSE beside this file).

import type { ReactElement } from "react";

import { Icon } from "./icon.tsx";
import type { IconProps } from "./icon.tsx";

/** lucide's `trending-down`. */
function TrendingDownIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M16 17h6v-6" />
      <path d="m22 17-8.5-8.5-5 5L2 7" />
    </Icon>
  );
}

export { TrendingDownIcon };
