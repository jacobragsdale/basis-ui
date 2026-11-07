/* Typography: shadcn ships it as a docs page of classes to copy (its typography examples), which `shadcn/no-restyle`
 * would make every app restyle text by hand to use. Here each style is a component under shadcn's example names, so
 * text looks the same in every app. Each renders through Base UI's `useRender`, so `render` changes its element and
 * keeps its look, as `<TypographyH2 render={<h3 />}>` for a heading that sits lower in the page's outline.
 *
 * The sizes are a step or two below shadcn's, which suit a docs site, to fit the firm's dense dashboards: the page
 * title is `text-2xl`, and body text `text-sm`, as in a Card. They carry no margins either, unlike shadcn's prose
 * rhythm (`mt-6` between paragraphs), because a dashboard spaces its parts with a parent's `gap`; an app places them
 * with `className`, as it places any component. */

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import type { ReactElement } from "react";

/** A page's title, in an `<h1>`. */
function TypographyH1({
  className,
  render,
  ...props
}: useRender.ComponentProps<"h1">): ReactElement {
  return useRender({
    defaultTagName: "h1",
    props: mergeProps<"h1">(
      {
        className: cn("scroll-m-20 text-2xl font-semibold tracking-tight text-balance", className),
      },
      props,
    ),
    render,
    state: { slot: "typography-h1" },
  });
}

/** A section's title, in an `<h2>`, ruled off beneath. */
function TypographyH2({
  className,
  render,
  ...props
}: useRender.ComponentProps<"h2">): ReactElement {
  return useRender({
    defaultTagName: "h2",
    props: mergeProps<"h2">(
      {
        className: cn("scroll-m-20 border-b pb-2 text-xl font-semibold tracking-tight", className),
      },
      props,
    ),
    render,
    state: { slot: "typography-h2" },
  });
}

function TypographyH3({
  className,
  render,
  ...props
}: useRender.ComponentProps<"h3">): ReactElement {
  return useRender({
    defaultTagName: "h3",
    props: mergeProps<"h3">(
      { className: cn("scroll-m-20 text-lg font-semibold tracking-tight", className) },
      props,
    ),
    render,
    state: { slot: "typography-h3" },
  });
}

function TypographyH4({
  className,
  render,
  ...props
}: useRender.ComponentProps<"h4">): ReactElement {
  return useRender({
    defaultTagName: "h4",
    props: mergeProps<"h4">(
      { className: cn("scroll-m-20 text-base font-semibold tracking-tight", className) },
      props,
    ),
    render,
    state: { slot: "typography-h4" },
  });
}

/** Body text, in a `<p>`. */
function TypographyP({ className, render, ...props }: useRender.ComponentProps<"p">): ReactElement {
  return useRender({
    defaultTagName: "p",
    props: mergeProps<"p">({ className: cn("text-sm leading-6", className) }, props),
    render,
    state: { slot: "typography-p" },
  });
}

/** A larger, muted paragraph that introduces a page, under its title. */
function TypographyLead({
  className,
  render,
  ...props
}: useRender.ComponentProps<"p">): ReactElement {
  return useRender({
    defaultTagName: "p",
    props: mergeProps<"p">({ className: cn("text-base text-muted-foreground", className) }, props),
    render,
    state: { slot: "typography-lead" },
  });
}

/** Secondary text, such as a note under a figure or when its data was last current. */
function TypographyMuted({
  className,
  render,
  ...props
}: useRender.ComponentProps<"p">): ReactElement {
  return useRender({
    defaultTagName: "p",
    props: mergeProps<"p">({ className: cn("text-sm text-muted-foreground", className) }, props),
    render,
    state: { slot: "typography-muted" },
  });
}

/** Code within a sentence, such as an identifier or a command, in a `<code>`. */
function TypographyInlineCode({
  className,
  render,
  ...props
}: useRender.ComponentProps<"code">): ReactElement {
  return useRender({
    defaultTagName: "code",
    props: mergeProps<"code">(
      {
        className: cn(
          "relative rounded-sm bg-muted px-1 py-0.5 font-mono text-xs font-semibold",
          className,
        ),
      },
      props,
    ),
    render,
    state: { slot: "typography-inline-code" },
  });
}

/** A bulleted list, in a `<ul>` of `<li>` items. */
function TypographyList({
  className,
  render,
  ...props
}: useRender.ComponentProps<"ul">): ReactElement {
  return useRender({
    defaultTagName: "ul",
    props: mergeProps<"ul">(
      { className: cn("ml-6 list-disc text-sm leading-6 [&>li]:mt-1", className) },
      props,
    ),
    render,
    state: { slot: "typography-list" },
  });
}

export {
  TypographyH1,
  TypographyH2,
  TypographyH3,
  TypographyH4,
  TypographyInlineCode,
  TypographyLead,
  TypographyList,
  TypographyMuted,
  TypographyP,
};
