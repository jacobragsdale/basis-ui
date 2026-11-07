// lucide-react 1.70.0's `loader-circle` icon (ISC; see LICENSE beside this file).

import type { ReactElement } from "react";

import { Icon } from "./icon.tsx";
import type { IconProps } from "./icon.tsx";

/** lucide's `loader-circle`, also exported as `Loader2Icon`. */
function LoaderCircleIcon(props: IconProps): ReactElement {
  return (
    <Icon {...props}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </Icon>
  );
}

export { LoaderCircleIcon };
