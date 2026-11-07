/* A fresh query client around a test's pickers, as BasisApp gives an app one. */

import { createQueryClient } from "@basis/ui";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";

function WithQueryClient({ children }: { readonly children: ReactNode }): ReactElement {
  return <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>;
}

export { WithQueryClient };
