/* Export: a click writes an Excel workbook of what the grid shows, and its menu offers CSV with every digit. */

import {
  Button,
  ButtonGroup,
  ChevronDownIcon,
  DownloadIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@basis/ui";
import type { ReactNode } from "react";

import type { ExportFormat } from "#engine/messages.ts";

interface ExportButtonProps {
  /** Asks for an export in a format. */
  readonly onExport: (format: ExportFormat) => void;
}

/** The toolbar's Export, and its menu of formats. */
function ExportButton({ onExport }: ExportButtonProps): ReactNode {
  return (
    <ButtonGroup>
      <Button
        variant="outline"
        size="sm"
        title="Export the rows shown to Excel"
        aria-label="Export"
        onClick={() => {
          onExport("xlsx");
        }}
      >
        <DownloadIcon />
        <span className="@max-xl:sr-only">Export</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="icon-sm" aria-label="More export formats" />}
        >
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onClick={() => {
              onExport("xlsx");
            }}
          >
            Excel workbook
            <DropdownMenuShortcut>.xlsx</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              onExport("csv");
            }}
          >
            CSV, every digit
            <DropdownMenuShortcut>.csv</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}

export { ExportButton };
