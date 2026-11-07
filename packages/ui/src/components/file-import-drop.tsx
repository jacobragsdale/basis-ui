/* FileImport's drop zone: a dashed area, drawn with Empty's outline, that takes a file dropped on it or chosen with its
 * button, and states the import's limits before a file is chosen. The file input itself is out of sight and out of the
 * tab order, since the button opens it; it is named, so a test or assistive technology can still reach it. */

import { cn } from "cn";
import { useRef, useState } from "react";
import type { DragEvent, ReactElement } from "react";

import { UploadIcon } from "#vendor/lucide/upload.tsx";

import { Button } from "./button.tsx";
import { EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./empty.tsx";
import { emptyVariants as fileImportDropVariants } from "./empty-variants.ts";

interface FileImportDropProps {
  readonly title: string;
  /** The import's limits, in words, such as "CSV with a header row, up to 5 MB and 10,000 rows." */
  readonly limits: string;
  readonly onFile: (file: File) => void;
  /** Called when more than one file is dropped at once. */
  readonly onFiles: (count: number) => void;
}

/** The first file a drop or a choice holds, or the count when there are several. */
function filesOf(list: FileList | null): File | number {
  const first = list?.[0];
  if (list === null || first === undefined) {
    return 0;
  }
  return list.length === 1 ? first : list.length;
}

/** The button that opens the browser's file chooser, and the input it opens. */
function FileChooser({
  onChoose,
}: {
  readonly onChoose: (list: FileList | null) => void;
}): ReactElement {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          input.current?.click();
        }}
      >
        Choose a file
      </Button>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        aria-label="CSV file"
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => {
          onChoose(event.currentTarget.files);
          if (input.current !== null) {
            input.current.value = "";
          }
        }}
      />
    </>
  );
}

function FileImportDrop({ title, limits, onFile, onFiles }: FileImportDropProps): ReactElement {
  const [dragging, setDragging] = useState(false);
  const take = (list: FileList | null): void => {
    const files = filesOf(list);
    if (typeof files === "number") {
      if (files > 1) {
        onFiles(files);
      }
      return;
    }
    onFile(files);
  };
  const hold = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragging(true);
  };
  return (
    <div
      data-slot="file-import-drop"
      data-dragging={dragging}
      className={cn(
        fileImportDropVariants({ variant: "outline" }),
        "transition-colors data-[dragging=true]:border-ring data-[dragging=true]:bg-muted/50",
      )}
      onDragEnter={hold}
      onDragOver={hold}
      onDragLeave={() => {
        setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        take(event.dataTransfer.files);
      }}
    >
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <UploadIcon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{limits}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <FileChooser onChoose={take} />
      </EmptyContent>
    </div>
  );
}

export { FileImportDrop };
