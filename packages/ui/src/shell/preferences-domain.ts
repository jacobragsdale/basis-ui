/* The parent domain `BasisApp`'s `preferencesDomain` names, which the user menu stores the user's choice on. */

import { createContext, use } from "react";

const PreferencesDomainContext = createContext<string | undefined>(undefined);

/** The parent domain the firm's apps share, as the app names it, or `undefined`, when the choice is this app's alone. */
function usePreferencesDomain(): string | undefined {
  return use(PreferencesDomainContext);
}

export { PreferencesDomainContext, usePreferencesDomain };
