/* The probe: what this desktop is, and how fast parallax runs on it. It reads the processors, the memory, the device
 * pixel ratio, reduced motion and WebGL's renderer, then times a load of 1,000,000 trades, a sort of them and a pivot,
 * each from its request to the engine's first answer, and copies the report for step 6.10. */

import { useDataset, useView } from "@basis/parallax";
import type { FrameData, LayoutFor } from "@basis/parallax";
import { Button, DescriptionList, Page, arrowResponse, numberText, toast } from "@basis/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";

import { getTradesUrl } from "#api/client.ts";
import type { Trade } from "#data/rows.ts";

type Phase = "load" | "sort" | "pivot" | "done";

const layouts: Readonly<Record<Phase, LayoutFor<Trade>>> = {
  done: {
    group_by: ["fund", "asset_class"],
    measures: [{ aggregate: "sum", column: "net_amount_local" }],
    split_by: ["side"],
  },
  load: { columns: ["trade_id", "ticker", "net_amount_local"] },
  pivot: {
    group_by: ["fund", "asset_class"],
    measures: [{ aggregate: "sum", column: "net_amount_local" }],
    split_by: ["side"],
  },
  sort: {
    columns: ["trade_id", "ticker", "net_amount_local"],
    sort: [{ column: "net_amount_local", descending: true }],
  },
};
const next: Readonly<Record<Phase, Phase>> = {
  done: "done",
  load: "sort",
  pivot: "done",
  sort: "pivot",
};

/** The trades, under a name of the probe's own, so their load is timed even after the blotter loaded them. */
async function trades(): Promise<Response> {
  return arrowResponse(getTradesUrl());
}

/** WebGL's renderer, which says whether the GPU or software draws, or why there is none. */
function webglRenderer(): string {
  const gl =
    document.createElement("canvas").getContext("webgl2") ??
    document.createElement("canvas").getContext("webgl");
  if (gl === null) {
    return "none";
  }
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  return String(
    info === null ? gl.getParameter(gl.RENDERER) : gl.getParameter(info.UNMASKED_RENDERER_WEBGL),
  );
}

function desktop(): Readonly<Record<string, string>> {
  const memory: unknown = Reflect.get(navigator, "deviceMemory");
  return {
    Browser: navigator.userAgent,
    "Device pixel ratio": String(globalThis.devicePixelRatio),
    Memory: typeof memory === "number" ? `${String(memory)} GB or more` : "not reported",
    Processors: String(navigator.hardwareConcurrency),
    "Reduced motion": globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "on"
      : "off",
    WebGL: webglRenderer(),
    Window: `${String(globalThis.innerWidth)} x ${String(globalThis.innerHeight)}`,
  };
}

/** The timings, in milliseconds, each from its request to the engine's first answer. */
function useTimings(): {
  readonly phase: Phase;
  readonly timings: Readonly<Partial<Record<Phase, number>>>;
} {
  const dataset = useDataset<Trade>("probe-trades", trades, { primaryKey: "trade_id" });
  const [phase, setPhase] = useState<Phase>("load");
  const [timings, setTimings] = useState<Readonly<Partial<Record<Phase, number>>>>({});
  const opened = useRef(0);
  useEffect(() => {
    opened.current = performance.now();
  }, []);
  // A frame that first answers a layout change carries when the change was asked for, so a sort or a pivot is timed
  // from its request to the engine's answer.
  const onFrame = (frame: FrameData): void => {
    const { changedAtMs } = frame;
    if ((phase === "sort" || phase === "pivot") && changedAtMs !== undefined) {
      setTimings((done) => ({ ...done, [phase]: performance.now() - changedAtMs }));
      setPhase(next[phase]);
    }
  };
  useView(dataset, layouts[phase], { onFrame });
  useEffect(() => {
    if (dataset.status === "loaded" && phase === "load") {
      setTimings({ load: performance.now() - opened.current });
      setPhase("sort");
    }
  }, [dataset.status, phase]);
  return { phase, timings };
}

/** A failure the page did not expect, as a toast. */
function reportFailure(error: unknown): void {
  toast.add({ description: String(error), title: "Something failed", type: "error" });
}

function milliseconds(value: number | undefined): string {
  return value === undefined ? "…" : `${numberText(value, { decimals: 0 })} ms`;
}

function ProbePage(): ReactElement {
  const facts = useMemo(() => desktop(), []);
  const { phase, timings } = useTimings();
  const measured = {
    "Load 1,000,000 trades": milliseconds(timings.load),
    "Pivot by fund and asset class, by side": milliseconds(timings.pivot),
    "Sort by net amount": milliseconds(timings.sort),
  };
  const report = Object.entries({ ...facts, ...measured })
    .map(([term, value]) => `${term}: ${value}`)
    .join("\n");
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(`${report}\nTaken: ${new Date().toISOString()}`);
      toast.add({ title: "Copied the probe's report", type: "success" });
    } catch (error) {
      toast.add({ description: String(error), title: "Could not copy", type: "error" });
    }
  };
  return (
    <Page
      title="Probe"
      description="What this desktop is, and how fast parallax loads, sorts and pivots 1,000,000 trades on it."
      actions={
        <Button
          disabled={phase !== "done"}
          onClick={() => {
            copy().catch(reportFailure);
          }}
        >
          Copy report
        </Button>
      }
    >
      <DescriptionList
        columns={2}
        items={Object.entries(facts).map(([term, description]) => ({ description, term }))}
      />
      <DescriptionList
        aria-label="Timings"
        columns={3}
        items={Object.entries(measured).map(([term, description]) => ({ description, term }))}
      />
      <pre
        className="rounded-md bg-muted p-3 text-xs"
        data-probe={phase === "done" ? "done" : "running"}
      >
        {report}
      </pre>
    </Page>
  );
}

export { ProbePage };
