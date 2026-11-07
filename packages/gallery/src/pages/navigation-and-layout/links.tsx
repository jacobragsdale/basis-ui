/* Breadcrumb and Pagination on the navigation and layout page, with plain links and with a stand-in for a router's
 * link component, which renders an `<a>` of its own as TanStack Router's `Link` does. */

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@basis/ui";
import type { ComponentProps, ReactElement } from "react";

import { Section } from "#pages/section.tsx";

import { Demo } from "./demo.tsx";

/** A stand-in for a router's link component, which renders an `<a>` of its own. */
function RouterLink({
  to,
  children,
  ...props
}: ComponentProps<"a"> & { readonly to: string }): ReactElement {
  return (
    <a href={`#${to}`} data-router="true" {...props}>
      {children}
    </a>
  );
}

/** The trail from the desks to one bond's page, with the middle left out. */
function DeskBreadcrumb(): ReactElement {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#home">Home</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink render={<RouterLink to="desks" />}>Desks</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbEllipsis />
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="#rates">Rates</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator>/</BreadcrumbSeparator>
        <BreadcrumbItem>
          <BreadcrumbPage>10-year note</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** Page 2 of a ten-page blotter, the later pages left out. */
function BlotterPagination(): ReactElement {
  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="#page-1" />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#page-1">1</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#page-2" isActive>
            2
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink render={<RouterLink to="page-3" />}>3</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationEllipsis />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#page-10">10</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext href="#page-3" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

function BreadcrumbSection(): ReactElement {
  return (
    <Section
      title="Breadcrumb"
      description="The trail of links to the current page. A link takes render for the router's link."
    >
      <Demo label="links, an ellipsis, a custom separator and the current page">
        <DeskBreadcrumb />
      </Demo>
    </Section>
  );
}

function PaginationSection(): ReactElement {
  return (
    <Section
      title="Pagination"
      description="Links to the pages of a long list, drawn as ButtonLinks; the current page is outlined."
    >
      <Demo label="page 2 of 10">
        <BlotterPagination />
      </Demo>
    </Section>
  );
}

export { BlotterPagination, BreadcrumbSection, DeskBreadcrumb, PaginationSection };
