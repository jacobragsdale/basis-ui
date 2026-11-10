/* What the page knows of the running worker's tables: the datasets it holds, the loads still waiting for answers, and
 * who hears each load's progress. A first load's dataset is held from its first rows on, so its views open on them;
 * a reload's views wait for it whole. */

import { loadLimits } from "./limits.ts";
import type { LoadCall, LoadOptions, LoadProgress, Loaded } from "./limits.ts";
import type { LoadProgressReply, LoadRequest } from "./messages.ts";

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
    return { dataset, hear, heldByShowing: () => holding, options, shown: shown.promise };
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

  /** Holds `dataset`, whose load succeeded. */
  public add(dataset: string): void {
    this.#held.add(dataset);
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

  /** Forgets every table and load, as when the worker ends. */
  public clear(): void {
    this.#held.clear();
    this.#loading.clear();
    this.#listeners.clear();
  }
}

export { Holdings, loadRequest };
export type { Job, LoadBody, Pending, ProgressListener };
