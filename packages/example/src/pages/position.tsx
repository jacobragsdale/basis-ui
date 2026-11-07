/* One position: its fields, and "Book again", which books a copy of it. A failed booking raises BasisApp's error
 * toast; a successful one raises a toast of its own and opens the new position. */

import {
  ArrowLeftIcon,
  Button,
  ButtonLink,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorAlert,
  Skeleton,
  TypographyH1,
  createFormatter,
  toast,
  useTelemetry,
} from "@basis/ui";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { useCreatePosition, useGetPosition } from "#api/client.ts";
import type { Position } from "#api/client.ts";

const formatter = createFormatter();

/** "Book again": books a copy of `position`, says so, and opens the new one. */
function BookAgain({ position }: { readonly position: Position }): ReactElement {
  const navigate = useNavigate();
  const telemetry = useTelemetry();
  const booking = useCreatePosition({
    mutation: {
      onSuccess: async ({ data: booked }) => {
        toast.add({ title: `Booked position ${String(booked.position_id)}`, type: "success" });
        telemetry.event("position.booked", { book: booked.book });
        await navigate({
          params: { positionId: String(booked.position_id) },
          to: "/positions/$positionId",
        });
      },
    },
  });
  return (
    <Button
      disabled={booking.isPending}
      onClick={() => {
        booking.mutate({
          data: {
            as_of: position.as_of,
            book: position.book,
            note: position.note,
            price: position.price,
            quantity: position.quantity,
            symbol: position.symbol,
          },
        });
      }}
      size="sm"
      variant="outline"
    >
      Book again
    </Button>
  );
}

function PositionCard({ position }: { readonly position: Position }): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{position.symbol}</CardTitle>
        <CardDescription>
          {position.book}, as of {position.as_of}
        </CardDescription>
        <CardAction>
          <BookAgain position={position} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <dt className="text-muted-foreground">Quantity</dt>
          <dd className="tabular-nums">{formatter.integer(position.quantity)}</dd>
          <dt className="text-muted-foreground">Price</dt>
          <dd className="tabular-nums">{position.price}</dd>
          <dt className="text-muted-foreground">Note</dt>
          <dd className="sm:col-span-3">{position.note ?? "None"}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}

function PositionPage(): ReactElement {
  const { positionId } = useParams({ from: "/positions/$positionId" });
  const position = useGetPosition(Number(positionId));
  const telemetry = useTelemetry();
  const report = (error: unknown): void => {
    telemetry.error(error, { source: "position" });
  };
  return (
    <>
      <ButtonLink render={<Link to="/" />} size="sm" variant="ghost" className="self-start">
        <ArrowLeftIcon data-icon="inline-start" />
        All positions
      </ButtonLink>
      <TypographyH1>Position {positionId}</TypographyH1>
      <ErrorAlert
        error={position.error}
        onRetry={() => {
          position.refetch().catch(report);
        }}
      />
      {position.isPending ? <Skeleton className="h-32 w-full" /> : null}
      {position.data === undefined ? null : <PositionCard position={position.data.data} />}
    </>
  );
}

export { PositionPage };
