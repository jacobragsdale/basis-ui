/* The data family, the firm's own components: DataTable, for small data whose cells hold links and buttons, at its
 * row cap and in its states; FilterBar, a page's filters kept in its address; EntityPicker and SecurityPicker, which
 * search as the user types; and FileImport, which reads a CSV file and checks it before anything is sent. The pickers
 * search through a query client, as they do inside BasisApp. Each section's module is under data/, with its tests
 * beside it. */

import { createQueryClient } from "@basis/ui";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

import {
  DataTableAtItsCapSection,
  DataTableSection,
  DataTableStatesSection,
} from "./data/data-table.tsx";
import { EntityPickerSection, SecurityPickerSection } from "./data/entity-picker.tsx";
import { FileImportSection } from "./data/file-import.tsx";
import { FilterBarSection } from "./data/filter-bar.tsx";

/** The page's query client, which BasisApp would give an app. */
const queryClient = createQueryClient();

function Data(): ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex flex-col gap-8">
        <DataTableSection />
        <DataTableAtItsCapSection />
        <DataTableStatesSection />
        <FilterBarSection />
        <EntityPickerSection />
        <SecurityPickerSection />
        <FileImportSection />
      </div>
    </QueryClientProvider>
  );
}

export { Data };
