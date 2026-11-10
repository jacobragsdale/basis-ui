/* Positions, as an app's agent first writes a table page: rows filtered by text and status, sorted by a heading and
 * paged, every amount shown by Money. tests/preset-errors.test.ts holds it to the app's lint as it stands: under
 * basis-ui's own limits it failed six rules, none for a fault in the page. No route draws it, so the budget still
 * weighs the summary alone. */

import {
  Badge,
  Button,
  Input,
  Money,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@basis/ui";
import type { ReactElement } from "react";
import { useState } from "react";

interface Position {
  readonly id: string;
  readonly cusip: string;
  readonly issuer?: string;
  readonly par: number;
  readonly status: "open" | "pending" | "closed";
}

const positions: readonly Position[] = [
  { cusip: "912828ZX1", id: "1", issuer: "US Treasury", par: 5_000_000, status: "open" },
  { cusip: "38141GXZ2", id: "2", par: 1_250_000, status: "closed" },
];

/** Whether a row shows under the filter's text, the status chosen and the smallest par. */
function matches(row: Position, text: string, status: string, minPar: number): boolean {
  return (
    (row.cusip.includes(text) || (row.issuer?.includes(text) ?? false)) &&
    (status === "all" || row.status === status) &&
    row.par >= minPar
  );
}

function PositionsPage(): ReactElement {
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("all");
  const [sortKey, setSortKey] = useState<"cusip" | "par">("cusip");
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState(0);
  const rows = positions
    .filter((row) => matches(row, filter, status, 0))
    .toSorted((a, b) => (a[sortKey] < b[sortKey] === descending ? 1 : -1));
  const sortBy = (key: "cusip" | "par") => {
    setDescending(key === sortKey && !descending);
    setSortKey(key);
    setPage(0);
  };
  return (
    <>
      <Input
        aria-label="Filter"
        aria-invalid={filter !== "" && rows.length === 0}
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
        }}
      />
      <Button
        variant={status === "all" ? "default" : "outline"}
        onClick={() => {
          setStatus("all");
        }}
      >
        All
      </Button>
      <Button
        variant={status === "open" ? "default" : "outline"}
        onClick={() => {
          setStatus("open");
        }}
      >
        Open
      </Button>
      <Button
        variant={status === "pending" ? "default" : "outline"}
        onClick={() => {
          setStatus("pending");
        }}
      >
        Pending
      </Button>
      <Button
        variant={status === "closed" ? "default" : "outline"}
        onClick={() => {
          setStatus("closed");
        }}
      >
        Closed
      </Button>
      {(filter !== "" || status !== "all") && (
        <Button
          variant="ghost"
          onClick={() => {
            setFilter("");
            setStatus("all");
          }}
        >
          Clear
        </Button>
      )}
      {filter !== "" && <Badge variant="secondary">Filtered by {filter}</Badge>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead
              aria-sort={sortKey === "cusip" ? "ascending" : "none"}
              onClick={() => {
                sortBy("cusip");
              }}
            >
              CUSIP{sortKey === "cusip" && (descending ? " ▼" : " ▲")}
            </TableHead>
            <TableHead>Issuer</TableHead>
            <TableHead
              variant="numeric"
              aria-sort={sortKey === "par" ? "ascending" : "none"}
              onClick={() => {
                sortBy("par");
              }}
            >
              Par{sortKey === "par" && (descending ? " ▼" : " ▲")}
            </TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={4}>
                {filter === "" && status === "all" ? "No positions." : "No positions match."}
              </TableCell>
            </TableRow>
          )}
          {rows.slice(page * 25, (page + 1) * 25).map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.cusip}</TableCell>
              <TableCell>{row.issuer ?? "Unknown"}</TableCell>
              <TableCell variant="numeric">
                <Money value={row.par} />
              </TableCell>
              <TableCell>
                <Badge variant={row.status === "open" ? "success" : "secondary"}>
                  {row.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > 25 && (
        <>
          <Button
            variant="outline"
            disabled={page === 0}
            onClick={() => {
              setPage(page - 1);
            }}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={(page + 1) * 25 >= rows.length}
            onClick={() => {
              setPage(page + 1);
            }}
          >
            Next
          </Button>
        </>
      )}
      {rows.length} {rows.length === 1 ? "position" : "positions"}
      {rows.length === positions.length ? "" : ` of ${positions.length}`}
    </>
  );
}

export { PositionsPage };
