/* What a maximizing view renders besides its element: the frame that holds its state for the parts inside it, the
 * Maximize button its toolbar or head holds, and, while it fills the window, the dimmed page behind it and the
 * placeholder that keeps its place. */

import {
  Button,
  Kbd,
  KbdGroup,
  Maximize2Icon,
  Minimize2Icon,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@basis/ui";
import { use, useRef } from "react";
import type { ReactNode, RefObject } from "react";

import { MaximizeContext, backdropSlot, buttonSlot, useMaximize } from "./maximize.ts";
import type { Maximizing } from "./maximize.ts";

/** While a view fills the window, the dimmed page behind it, which a click restores the view from and which fades in
 * over the theme's short transition, and a placeholder of the size the view had, so the page around it neither moves
 * nor scrolls. Rendered just before the view's element; nothing while the view is in its place. */
function MaximizeBefore({ maximizing }: { readonly maximizing: Maximizing }): ReactNode {
  const { size, state } = maximizing;
  if (size === null) {
    return null;
  }
  return (
    <>
      <div
        data-slot={backdropSlot}
        aria-hidden="true"
        className="fixed inset-0 z-50 bg-background/70 transition-opacity duration-150 starting:opacity-0"
        onClick={() => {
          state.setMaximized(false);
        }}
      />
      <div
        data-slot="maximize-placeholder"
        aria-hidden="true"
        style={{
          "--maximize-height": `${String(size.height)}px`,
          "--maximize-width": `${String(size.width)}px`,
        }}
        className="h-(--maximize-height) w-(--maximize-width) max-w-full shrink-0"
      />
    </>
  );
}

interface MaximizeButtonProps {
  /** `outline` in a toolbar of outlined buttons; `ghost`, the default, elsewhere. */
  readonly variant?: "ghost" | "outline";
}

/** The button that makes the view it is in fill the window, and puts it back: Maximize, or Restore while maximized,
 * with its key in its tooltip. Nothing outside a view that can maximize. */
function MaximizeButton({ variant = "ghost" }: MaximizeButtonProps): ReactNode {
  const state = use(MaximizeContext);
  if (state === null) {
    return null;
  }
  const { maximized, setMaximized } = state;
  const label = maximized ? "Restore" : "Maximize";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            data-slot={buttonSlot}
            variant={variant}
            size="icon-sm"
            aria-label={label}
            onClick={() => {
              setMaximized(!maximized);
            }}
          />
        }
      >
        {maximized ? <Minimize2Icon /> : <Maximize2Icon />}
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        <KbdGroup>
          {(maximized ? ["Esc"] : ["Alt", "Enter"]).map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
        </KbdGroup>
      </TooltipContent>
    </Tooltip>
  );
}

/** What a maximizing frame gives the view inside it: the ref its element takes, and what makes that element fill
 * the window. */
interface MaximizeFrame {
  readonly root: RefObject<HTMLDivElement | null>;
  readonly maximizing: Maximizing;
}

/** Holds a view that can fill the window: its state, for the Maximize buttons inside it, and what goes before its
 * element. `children` renders the view, whose element takes `root` and `maximizing.props`. */
function Maximizable({
  label,
  children,
}: {
  /** The view's name, which its dialog takes while it fills the window. */
  readonly label: string;
  readonly children: (frame: MaximizeFrame) => ReactNode;
}): ReactNode {
  const root = useRef<HTMLDivElement>(null);
  const maximizing = useMaximize(() => root.current, label);
  return (
    <MaximizeContext value={maximizing.state}>
      <MaximizeBefore maximizing={maximizing} />
      {children({ maximizing, root })}
    </MaximizeContext>
  );
}

export { Maximizable, MaximizeBefore, MaximizeButton };
export type { MaximizeFrame };
