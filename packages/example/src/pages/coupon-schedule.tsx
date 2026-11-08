/* A bond's coupon schedule, from the API's dataset route: the Arrow it answers, its rows in a DataTable, and each
 * number column shown by the display format the API declares in the column's Arrow field metadata, so the page names
 * no decimals. The same format is in the generated client as `displayFormats.CouponRow.interest`. */

import { DataTable, displayFormatMetadata, readDisplayFormat } from "@basis/ui";
import type { DataTableColumn, DisplayFormat } from "@basis/ui";
import { useQuery } from "@tanstack/react-query";
import { tableFromIPC } from "apache-arrow";
import type { ReactElement } from "react";

import { coupons, getCouponsQueryKey } from "#api/client.ts";

interface CouponLine {
  readonly starts: string;
  readonly pays: string;
  readonly interest: number | null;
}

interface Schedule {
  readonly rows: readonly CouponLine[];
  readonly interestFormat: DisplayFormat | undefined;
}

/** A date32 value, as apache-arrow reads it, in milliseconds since 1970-01-01, as `YYYY-MM-DD`. */
function dateText(milliseconds: unknown): string {
  return typeof milliseconds === "number"
    ? Temporal.Instant.fromEpochMilliseconds(milliseconds)
        .toZonedDateTimeISO("UTC")
        .toPlainDate()
        .toString()
    : "";
}

/** The schedule an Arrow stream holds, with the interest column's display format from its field metadata. */
async function scheduleOf(stream: Blob): Promise<Schedule> {
  const table = tableFromIPC(await stream.arrayBuffer());
  const interest = table.schema.fields.find(({ name }) => name === "interest");
  const rows = table.toArray().map((row: Record<string, unknown>) => ({
    interest: typeof row["interest"] === "number" ? row["interest"] : null,
    pays: dateText(row["pays"]),
    starts: dateText(row["starts"]),
  }));
  return { interestFormat: readDisplayFormat(interest?.metadata.get(displayFormatMetadata)), rows };
}

function columnsFor(
  interestFormat: DisplayFormat | undefined,
): readonly DataTableColumn<CouponLine>[] {
  return [
    { header: "Starts", id: "starts", value: (row) => row.starts },
    { header: "Pays", id: "pays", value: (row) => row.pays },
    {
      format: interestFormat,
      header: "Interest per 100",
      id: "interest",
      value: (row) => row.interest,
      variant: "numeric",
    },
  ];
}

function CouponSchedule({ security }: { readonly security: string }): ReactElement {
  const schedule = useQuery({
    queryFn: async ({ signal }) => {
      const { data } = await coupons(security, { signal });
      return scheduleOf(data);
    },
    queryKey: [...getCouponsQueryKey(security), "schedule"],
  });
  return (
    <DataTable
      label="Coupons"
      columns={columnsFor(schedule.data?.interestFormat)}
      data={schedule.data?.rows}
      getRowId={(row) => row.pays}
      loading={schedule.isPending}
      error={schedule.error}
      pageSize={10}
    />
  );
}

export { CouponSchedule };
