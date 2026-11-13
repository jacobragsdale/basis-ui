/* What the page knows of the running worker's tables: the datasets it holds, the loads still waiting for answers, and
 * who hears each load's progress. A first load's dataset is held from its first rows on, so its views open on them;
 * a reload's views wait for it whole. */

import { loadLimits } from "./limits.ts";
import type { LoadCall, LoadOptions, LoadProgress, Loaded } from "./limits.ts";
import type { LoadProgressReply, LoadRequest } from "./messages.ts";
import { unloadedFirst } from "./running.ts";

const microsPerMilli = 1000;

/** What a load reads: Arrow IPC stream bytes the app holds, or a response whose body streams them. */
type LoadBody = ArrayBuffer | Response;

/** Hears where a load stands as the engine reads its rows. */
type ProgressListener = (progress: LoadProgress) => void;

/** One load: its dataset, its options, who hears its progress, when its first rows show, for a first load, and
 * whether showing them is what made the dataset held. */
interface Job {
  readonly dataset: string;
  readonly options: LoadOptions;
  readonly hear: ProgressListener;
  readonly shown: Promise<null>;
  readonly heldByShowing: () => boolean;
}

/** A load waiting for its answer: when it is done, and when its first rows show. */
interface Pending {
  readonly done: Promise<Loaded>;
  readonly shown: Promise<null>;
}

/** The load request for a job, as the worker reads it. */
function loadRequest(
  { dataset, options }: Job,
  fields: Pick<LoadRequest, "bytes" | "expectedBytes" | "id">,
): LoadRequest {
  return {
    ...fields,
    dataset,
    kind: "load",
    maxRows: loadLimits().maxRows,
    nowMicros: options.receivedAtMicros ?? Date.now() * microsPerMilli,
    primaryKey: options.primaryKey ?? null,
    sourceAsOfMicros: options.sourceAsOfMicros ?? null,
  };
}

/** The running worker's tables, as the page knows them. */
class Holdings {
  /** Datasets the app has loaded into the running worker, or whose first load shows. */
  readonly #held = new Set<string>();
  /** The latest load of each dataset still waiting for its answer. */
  readonly #loading = new Map<string, Pending>();
  /** Who hears each load's progress, by the load's id. */
  readonly #listeners = new Map<number, ProgressListener>();
  /** Each dataset's loads not yet answered, which an unload of it drops. */
  readonly #jobs = new Map<string, Set<Job>>();
  /** Loads whose dataset was unloaded before they were answered. */
  readonly #dropped = new WeakSet<Job>();
  /** Loads asked for and not yet answered, their bytes on their way or in the worker. */
  #underWay = 0;

  /** A load of `dataset`, whose progress `onProgress` hears; it holds the dataset once its first rows show. */
  public job(dataset: string, { onProgress, ...options }: LoadCall): Job {
    const shown = Promise.withResolvers<null>();
    let holding = false;
    const hear = (progress: LoadProgress): void => {
      if (progress.shown) {
        holding ||= !this.#held.has(dataset);
        this.#held.add(dataset);
        shown.resolve(null);
      }
      onProgress?.(progress);
    };
    const job: Job = {
      dataset,
      hear,
      heldByShowing: (): boolean => holding,
      options,
      shown: shown.promise,
    };
    const jobs = this.#jobs.get(dataset) ?? new Set<Job>();
    jobs.add(job);
    this.#jobs.set(dataset, jobs);
    return job;
  }

  /** Whether `job`'s dataset was unloaded before the load was answered, which leaves nothing for it to load. */
  public dropped(job: Job): boolean {
    return this.#dropped.has(job);
  }

  /** Whether no load is under way: every load asked for has been answered, or failed, whether or not its bytes have
   * reached the worker. */
  public get idle(): boolean {
    return this.#underWay === 0;
  }

  /** Counts `job` as under way until `done` settles, then forgets it and calls `ended`, after the load's own
   * continuations, which may ask for more. */
  public underWay(job: Job, done: Promise<Loaded>, ended: () => void): void {
    this.#underWay += 1;
    const end = (): void => {
      this.#underWay -= 1;
      const jobs = this.#jobs.get(job.dataset);
      jobs?.delete(job);
      if (jobs?.size === 0) {
        this.#jobs.delete(job.dataset);
      }
      queueMicrotask(ended);
    };
    done.finally(end).catch(() => null);
  }

  /** Keeps a job's load as its dataset's latest until it is answered. A first load that showed rows and then failed
   * leaves nothing held. */
  public async track(job: Job, done: Promise<Loaded>): Promise<Loaded> {
    const { dataset } = job;
    const pending: Pending = { done, shown: job.shown };
    this.#loading.set(dataset, pending);
    try {
      return await done;
    } catch (error: unknown) {
      if (job.heldByShowing()) {
        this.#held.delete(dataset);
      }
      throw error;
    } finally {
      if (this.#loading.get(dataset) === pending) {
        this.#loading.delete(dataset);
      }
    }
  }

  /** Whether `dataset` is held, waiting for a load of it still in flight until its first rows show, or, `whole`, until
   * it is answered; a load that fails with nothing held before it throws its reason. */
  public async holds(dataset: string, whole: boolean): Promise<boolean> {
    const loading = this.#loading.get(dataset);
    if (loading !== undefined) {
      try {
        await (whole ? loading.done : Promise.race([loading.done, loading.shown]));
      } catch (error: unknown) {
        if (!this.#held.has(dataset)) {
          throw error;
        }
      }
    }
    return this.#held.has(dataset);
  }

  /** Holds the dataset of `job`, whose load succeeded, unless it was unloaded before the load was answered. */
  public add(job: Job): void {
    if (this.#dropped.has(job)) {
      throw unloadedFirst(job.dataset);
    }
    this.#held.add(job.dataset);
  }

  /** Lets `hear` hear the progress of load `id`. */
  public listen(id: number, hear: ProgressListener): void {
    this.#listeners.set(id, hear);
  }

  /** Hands a load's progress to whoever hears it. */
  public heard({ id, estimated, expectedRows, rows, shown }: LoadProgressReply): void {
    this.#listeners.get(id)?.({ estimated, expectedRows, rows, shown });
  }

  /** Forgets who hears load `id`, which has been answered. */
  public answered(id: number): void {
    this.#listeners.delete(id);
  }

  /** Forgets `dataset`, which the page unloads, and drops its loads not yet answered. */
  public drop(dataset: string): void {
    this.#held.delete(dataset);
    this.#loading.delete(dataset);
    for (const job of this.#jobs.get(dataset) ?? []) {
      this.#dropped.add(job);
    }
    this.#jobs.delete(dataset);
  }

  /** Forgets every table and load, as when the worker ends. */
  public clear(): void {
    this.#held.clear();
    this.#loading.clear();
    this.#listeners.clear();
    this.#jobs.clear();
  }
}

export { Holdings, loadRequest };
export type { Job, LoadBody, Pending, ProgressListener };
