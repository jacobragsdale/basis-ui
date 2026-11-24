/* Board on the data page: a kanban board of a desk's tickets by state, whose cards move by dragging or by their
 * "Move to" menu, and the same tickets with a lane for each person, the blocked ones in an on-hold strip at the foot of
 * Doing. The moves are kept in the page's state, as an app keeps them until its API answers. */

import { Badge, Board } from "@basis/ui";
import type { BoardColumn, BoardLane, BoardMove } from "@basis/ui";
import { useState } from "react";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";

interface Ticket {
  readonly id: string;
  readonly column: string;
  readonly lane: string;
  readonly title: string;
  readonly section?: string;
}

const columns: readonly BoardColumn[] = [
  { id: "todo", title: "To do" },
  { id: "doing", title: "Doing" },
  { id: "review", title: "In review" },
  { id: "done", title: "Done" },
];

const lanes: readonly BoardLane[] = [
  { id: "avery", title: "Avery" },
  { id: "blake", title: "Blake" },
];

const tickets: readonly Ticket[] = [
  { column: "todo", id: "101", lane: "avery", title: "Index the settlement batch" },
  { column: "doing", id: "102", lane: "avery", title: "Retry the vendor feed" },
  { column: "doing", id: "103", lane: "blake", title: "Rework the position loader" },
  {
    column: "doing",
    id: "104",
    lane: "blake",
    section: "On hold",
    title: "Vendor feed schema change",
  },
  { column: "review", id: "105", lane: "blake", title: "Curve export" },
  { column: "done", id: "106", lane: "avery", title: "Fix duplicate imports" },
];

function moved(list: readonly Ticket[], item: Ticket, to: BoardMove): readonly Ticket[] {
  return list.map((ticket) =>
    ticket.id === item.id ? { ...ticket, column: to.column, lane: to.lane ?? ticket.lane } : ticket,
  );
}

function Card({ ticket }: { readonly ticket: Ticket }): ReactElement {
  return (
    <span className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground tabular-nums">{ticket.id}</span>{" "}
      <span>{ticket.title}</span>
    </span>
  );
}

/** The lanes, each headed by its person and how many cards they have in Doing. */
function laneHeaders(items: readonly Ticket[]): readonly BoardLane[] {
  return lanes.map((lane) => {
    const doing = items.filter(
      (ticket) => ticket.lane === lane.id && ticket.column === "doing",
    ).length;
    return {
      header: (
        <span className="flex flex-col gap-1">
          {lane.title}
          <Badge variant="outline">{doing} doing</Badge>
        </span>
      ),
      id: lane.id,
      title: lane.title,
    };
  });
}

function BoardSection(): ReactElement {
  const [items, setItems] = useState(tickets);
  const [selected, setSelected] = useState<string | undefined>();
  return (
    <Section
      title="Board"
      description="Cards in columns, and in a lane per person: drag a card, or move it with its menu."
    >
      <Board
        aria-label="Tickets"
        columns={columns}
        items={items}
        cardLabel={(ticket) => `${ticket.id} ${ticket.title}`}
        renderCard={(ticket) => <Card ticket={ticket} />}
        selected={selected}
        onSelect={(ticket) => {
          setSelected(ticket.id);
        }}
        onMove={(ticket, to) => {
          setItems((before) => moved(before, ticket, to));
        }}
        empty={() => "Nothing here"}
      />
      <Board
        aria-label="Tickets by person"
        columns={columns}
        lanes={laneHeaders(items)}
        items={items}
        cardLabel={(ticket) => `${ticket.id} ${ticket.title}`}
        renderCard={(ticket) => <Card ticket={ticket} />}
        onMove={(ticket, to) => {
          setItems((before) => moved(before, ticket, to));
        }}
      />
    </Section>
  );
}

export { BoardSection };
