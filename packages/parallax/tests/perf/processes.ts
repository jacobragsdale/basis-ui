/* The browser's resident memory, read from Linux's /proc: the sum over every process the bench started, which is the
 * browser's tree, as the review measured it. RSS counts a page shared between processes once for each, so the
 * proportional set size, which divides it between them, is kept beside it. */

import { readdirSync, readFileSync, readlinkSync } from "node:fs";

const kilobyte = 1024;
const megabyte = 1_000_000;

/** A file's text, or null when the process has gone. */
function readOrNull(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** Every process's parent, by pid. */
function parents(): ReadonlyMap<number, number> {
  const found = new Map<number, number>();
  for (const entry of readdirSync("/proc")) {
    if (/^\d+$/u.test(entry)) {
      const stat = readOrNull(`/proc/${entry}/stat`);
      // The name, in parentheses, may hold spaces: the parent's pid is the second field after it.
      const parent = stat?.slice(stat.lastIndexOf(")") + 2).split(" ")[1];
      if (parent !== undefined) {
        found.set(Number(entry), Number(parent));
      }
    }
  }
  return found;
}

/** The processes descended from `root`, not counting it. */
function descendants(root: number): readonly number[] {
  const all = parents();
  const children = new Map<number, number[]>();
  for (const [pid, parent] of all) {
    children.set(parent, [...(children.get(parent) ?? []), pid]);
  }
  const found: number[] = [];
  const queue = [...(children.get(root) ?? [])];
  for (let pid = queue.shift(); pid !== undefined; pid = queue.shift()) {
    found.push(pid);
    queue.push(...(children.get(pid) ?? []));
  }
  return found;
}

/** A `/proc` file's figure in kB, such as `VmRSS:`, in bytes, or 0 when the process has gone. */
function kilobytes(file: string, field: string): number {
  const text = readOrNull(file) ?? "";
  const line = text.split("\n").find((each) => each.startsWith(field));
  const value = Number(line?.slice(field.length).trim().split(/\s+/u)[0] ?? 0);
  return Number.isFinite(value) ? value * kilobyte : 0;
}

/** The resident memory of the processes this one started, in MB: RSS summed, and the proportional set size. */
interface Resident {
  readonly rssMB: number;
  readonly pssMB: number;
}

/** What the browser started by this process holds now. */
function resident(): Resident {
  let rss = 0;
  let pss = 0;
  for (const pid of descendants(process.pid)) {
    rss += kilobytes(`/proc/${String(pid)}/status`, "VmRSS:");
    pss += kilobytes(`/proc/${String(pid)}/smaps_rollup`, "Pss:");
  }
  return { pssMB: pss / megabyte, rssMB: rss / megabyte };
}

/** Samples {@link resident} every `everyMs` until stopped, and returns the largest. */
function samplePeak(everyMs: number): () => Resident {
  let peak: Resident = { pssMB: 0, rssMB: 0 };
  const sample = (): void => {
    const now = resident();
    peak = { pssMB: Math.max(peak.pssMB, now.pssMB), rssMB: Math.max(peak.rssMB, now.rssMB) };
  };
  sample();
  const timer = setInterval(sample, everyMs);
  return () => {
    clearInterval(timer);
    sample();
    return peak;
  };
}

/** The executable of the browser this process started, the first descendant that is not a shell or systemd-run, and
 * its control group, which says whether it runs under a CPU quota. */
function browserProcess(): { readonly executable: string; readonly cgroup: string } | null {
  for (const pid of descendants(process.pid)) {
    try {
      const executable = readlinkSync(`/proc/${String(pid)}/exe`);
      if (!/\/(?:ba|da)?sh$|systemd-run$/u.test(executable)) {
        const cgroup = readOrNull(`/proc/${String(pid)}/cgroup`)?.trim() ?? "";
        return { cgroup, executable };
      }
    } catch {
      // The process has gone; look at the next.
    }
  }
  return null;
}

export { browserProcess, resident, samplePeak };
export type { Resident };
