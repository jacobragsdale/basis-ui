/* An export as the page asks the worker for it, and the file its answer makes. */

import type { Answered } from "./answers.ts";
import { exportTypes, maxXlsxCells } from "./limits.ts";
import type { ExportFormat, ExportRequest } from "./messages.ts";

/** The request for a view's export, given its id. */
function exportRequest(
  layoutJson: string,
  format: ExportFormat,
  loadVersion: bigint | number | null,
): (id: number) => ExportRequest {
  return (id) => ({
    format,
    id,
    kind: "export",
    layout: layoutJson,
    loadVersion: loadVersion === null ? null : Number(loadVersion),
    maxCells: maxXlsxCells,
  });
}

/** The file an export's answer holds: an xlsx's bytes, or a CSV's chunks, joined. */
function exportedFile(answer: Answered, format: ExportFormat): Blob {
  if (answer.kind !== "exported") {
    throw new Error("The parallax worker answered an export with something else.");
  }
  const type = exportTypes[format];
  if (answer.bytes !== null) {
    return new Blob([answer.bytes], { type });
  }
  return new Blob(answer.parts === null ? [] : [answer.parts], { type });
}

export { exportRequest, exportedFile };
