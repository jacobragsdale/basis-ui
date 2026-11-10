/* The conventions page's filters, by their search parameters: the text a convention's name holds, and the days it
 * counts in a year. The route validates them (routes.ts) and the page reads them (conventions.tsx). */

import { defineFilters } from "@basis/ui";

const conventionFilters = defineFilters({
  convention: { kind: "text", label: "Convention", placeholder: "Search conventions" },
  days: {
    kind: "choice",
    label: "Days in a year",
    options: [
      { label: "360 days", value: "360" },
      { label: "365 days", value: "365" },
    ],
  },
});

export { conventionFilters };
