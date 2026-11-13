/* What the components of one page share of each dataset: the data each gives its name, so that two that give one name
 * different data both fail rather than show each other's rows; one load for the same data, cancelled once no
 * component waits for it; the reloads one of them asks for, which all of them see; and the count of those that show
 * it, so that the last to unmount unloads it. */

import type { ParallaxClient } from "#engine/client.ts";
import type { LoadProgress } from "#engine/limits.ts";

import type { DatasetData, LoadRequest, LoadState } from "./dataset-load.ts";

/** What every component that shows a dataset sees of it alike: how many times one asked it to load again, and why
 * none can load it, when two give its name different data. */
interface DatasetShared {
  readonly reloads: number;
  readonly conflict: string | null;
}

/** Hears where a load stands. */
type Progress = (progress: LoadProgress) => void;

/** Runs a load, telling `progress` where it stands, until `signal` says nobody waits for it any more. */
type Run = (progress: Progress, signal: AbortSignal) => Promise<LoadState>;

/** A load that several components wait on, who hears its progress, and how to cancel it. */
class SharedLoad {
  public readonly request: LoadRequest;
  /** The client's engine the load ran on: a closed engine's loads are gone with it. */
  public readonly generation: number;
  public readonly outcome: Promise<LoadState>;
  public readonly listeners = new Set<Progress>();
  public readonly controller = new AbortController();
  /** The components waiting for its outcome. */
  public waiters = 0;
  public settled = false;

  public constructor(client: ParallaxClient, request: LoadRequest, run: Run) {
    this.request = request;
    const progress = (state: LoadProgress): void => {
      for (const listener of this.listeners) {
        listener(state);
      }
    };
    this.outcome = run(progress, this.controller.signal).finally(() => {
      this.settled = true;
    });
    // The load has started the engine by now, if none ran.
    this.generation = client.generation;
  }
}

/** A component that shows a dataset, and the data it gives the name, or null while it has none. */
interface Claim {
  readonly owner: string;
  readonly data: DatasetData | null;
}

/** One dataset of a client's: the components that show it, those that gave it the data it last loaded, those that
 * watch what they share of it, that, and its latest load. */
interface Named {
  readonly name: string;
  readonly claims: Set<Claim>;
  readonly owners: Set<string>;
  readonly listeners: Set<() => void>;
  shared: DatasetShared;
  load: SharedLoad | null;
}

const unshared: DatasetShared = { conflict: null, reloads: 0 };

const shares = new WeakMap<ParallaxClient, Map<string, Named>>();

function namesOf(client: ParallaxClient): Map<string, Named> {
  let names = shares.get(client);
  if (names === undefined) {
    names = new Map();
    shares.set(client, names);
  }
  return names;
}

function namedOf(client: ParallaxClient, name: string): Named {
  const names = namesOf(client);
  let named = names.get(name);
  if (named === undefined) {
    named = {
      claims: new Set(),
      listeners: new Set(),
      load: null,
      name,
      owners: new Set(),
      shared: unshared,
    };
    names.set(name, named);
  }
  return named;
}

/** Whether two components give a dataset the same data. */
function sameData(first: DatasetData, second: DatasetData): boolean {
  return (
    first.source === second.source &&
    first.primaryKey === second.primaryKey &&
    first.receivedAtMicros === second.receivedAtMicros &&
    first.sourceAsOfMicros === second.sourceAsOfMicros
  );
}

/** Whether two requests load the same data. */
function sameLoad(first: LoadRequest, second: LoadRequest): boolean {
  return first.name === second.name && first.reloads === second.reloads && sameData(first, second);
}

/** Why no component can show dataset `name`, when the ones that show it give it different data. */
function conflictOf(name: string, claims: ReadonlySet<Claim>): string | null {
  const given = [...claims].flatMap(({ data }) => (data === null ? [] : [data]));
  const [first] = given;
  if (first === undefined || given.every((data) => sameData(first, data))) {
    return null;
  }
  return `Two parts of this page load different data as the dataset "${name}", so neither shows it: a dataset's name is the page's key for its rows. Give each its own name, with what tells them apart in it, such as useDataset(\`${name}-\${fund}\`, …).`;
}

/** Tells the components that watch `named` when what they share of it changes. */
function share(named: Named, shared: DatasetShared): void {
  if (shared.conflict === named.shared.conflict && shared.reloads === named.shared.reloads) {
    return;
  }
  named.shared = shared;
  for (const listener of named.listeners) {
    listener();
  }
}

/** Unloads a dataset, and forgets what was loaded of it. */
function unload(client: ParallaxClient, named: Named): void {
  named.load = null;
  named.owners.clear();
  client.unload(named.name).catch(() => null);
}

/** Unloads a dataset that no component shows once the commit that let it go is over, so a page that hands it to
 * another component, or StrictMode's second run of an effect, keeps it. */
function unloadUnheld(client: ParallaxClient, named: Named): void {
  if (named.claims.size > 0 || namesOf(client).get(named.name) !== named) {
    return;
  }
  unload(client, named);
  if (named.listeners.size === 0) {
    namesOf(client).delete(named.name);
  }
}

/** Whether a dataset is loaded with data that no component shows any more, and that the component claiming it, new
 * to it, does not give it. */
function orphaned({ claims, load, owners }: Named, { data, owner }: Claim): boolean {
  return (
    data !== null &&
    claims.size === 0 &&
    load !== null &&
    !owners.has(owner) &&
    !sameData(load.request, data)
  );
}

/** Stops counting a component that showed dataset `name`, unloading it once none is left. */
function release(client: ParallaxClient, named: Named, claim: Claim): void {
  named.claims.delete(claim);
  share(named, { ...named.shared, conflict: conflictOf(named.name, named.claims) });
  if (named.claims.size === 0) {
    setTimeout(() => {
      unloadUnheld(client, named);
    }, 0);
  }
}

/**
 * Counts a component, `owner`, that shows dataset `name`, with the data it gives it, and returns the function that
 * stops counting it. When none is left, the dataset is unloaded after the rest of the commit. A dataset that no
 * component shows any more, and that a component new to it gives other data, as the next page does on a route change,
 * is unloaded at once, so it loads afresh, with its own key, rather than as a reload of the page before.
 */
function claimDataset(client: ParallaxClient, name: string, { data, owner }: Claim): () => void {
  const named = namedOf(client, name);
  const claim = { data, owner };
  if (orphaned(named, claim)) {
    unload(client, named);
  }
  named.claims.add(claim);
  if (data !== null) {
    named.owners.add(owner);
  }
  share(named, { ...named.shared, conflict: conflictOf(name, named.claims) });
  let released = false;
  return () => {
    if (!released) {
      released = true;
      release(client, named, claim);
    }
  };
}

/** What the components that show dataset `name` share of it, the same object until it changes. */
function sharedOf(client: ParallaxClient, name: string): DatasetShared {
  return namesOf(client).get(name)?.shared ?? unshared;
}

/** Calls `listener` whenever what the components that show dataset `name` share of it changes, until the returned
 * function is called. */
function watchDataset(client: ParallaxClient, name: string, listener: () => void): () => void {
  const named = namedOf(client, name);
  named.listeners.add(listener);
  return () => {
    named.listeners.delete(listener);
  };
}

/** Asks every component that shows dataset `name` to load it again, from its source. */
function reloadDataset(client: ParallaxClient, name: string): void {
  const named = namedOf(client, name);
  share(named, { ...named.shared, reloads: named.shared.reloads + 1 });
}

/** A shared load's outcome for one component, and how it stops waiting for it. */
interface Joined {
  readonly outcome: Promise<LoadState>;
  readonly leave: () => void;
}

/**
 * The outcome of `request`'s load, run once by `run` for every component that asks for the same data on the same
 * engine, whichever asks first; each hears its progress through `progress`. A load already settled answers at once,
 * as long as some component still shows its dataset. Once every component has left it, after the rest of the commit,
 * a load still under way is cancelled: the signal `run` was given aborts.
 */
function sharedLoad(
  client: ParallaxClient,
  request: LoadRequest,
  { progress, run }: { readonly progress: Progress; readonly run: Run },
): Joined {
  const named = namedOf(client, request.name);
  const existing = named.load;
  const current =
    existing !== null &&
    client.running &&
    existing.generation === client.generation &&
    !existing.controller.signal.aborted &&
    sameLoad(existing.request, request);
  const shared = current ? existing : new SharedLoad(client, request, run);
  named.load = shared;
  shared.waiters += 1;
  shared.listeners.add(progress);
  let left = false;
  const leave = (): void => {
    if (left) {
      return;
    }
    left = true;
    shared.listeners.delete(progress);
    shared.waiters -= 1;
    setTimeout(() => {
      if (shared.waiters === 0 && !shared.settled) {
        shared.controller.abort();
      }
    }, 0);
  };
  return { leave, outcome: shared.outcome };
}

export { claimDataset, reloadDataset, sharedLoad, sharedOf, watchDataset };
export type { DatasetShared };
