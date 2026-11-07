// lucide-react 1.70.0's `circle-check` icon (ISC; see LICENSE beside this file).

import type { ReactElement } from "react";

import { Icon } from "./icon.tsx";
import type { IconProps } from "./icon.tsx";

/** lucide's `circle-check`, also exported as `CheckCircle2Icon`. */
function CircleCheckIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m16 9-5.5 5.5L8 12" />
    </Icon>
  );
}

export { CircleCheckIcon };
