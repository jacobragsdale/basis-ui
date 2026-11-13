/* tslint:disable */
/* eslint-disable */

/**
 * Tables and a protocol session, for one page.
 */
export class Worker {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Gives up a load, as [`Worker::abandon`] does.
     */
    abandonLoad(name: string): void;
    /**
     * Adds the next piece of a load's stream, which stays in the page's memory
     * until a step reads past it.
     *
     * # Errors
     *
     * Returns an error if no load of `name` is under way, or its stream has
     * ended.
     */
    addLoadBytes(name: string, piece: Uint8Array): void;
    /**
     * Starts loading or reloading dataset `name` from a stream whose bytes
     * follow with [`Worker::add_load_bytes`], as [`Worker::begin`] does.
     * `expected_bytes` is the stream's length, if the page knows it.
     *
     * # Errors
     *
     * Returns the reason the load cannot start.
     */
    beginLoad(name: string, primary_key: string | null | undefined, now_micros: number, source_as_of_micros: number | null | undefined, max_rows: number, expected_bytes?: number | null): void;
    /**
     * Says that every piece of a load's stream has come.
     *
     * # Errors
     *
     * Returns an error if no load of `name` is under way.
     */
    endLoadBytes(name: string): void;
    /**
     * Writes the layout's view as CSV, handing `sink` the bytes in chunks of about
     * [`CSV_CHUNK_BYTES`] as a `Uint8Array` each, and returns how many bytes it
     * wrote. The layout and `load_version` work as in [`Worker::export_xlsx`].
     *
     * # Errors
     *
     * Returns the reason the export cannot be made, or the error `sink` threw.
     */
    exportCsv(layout_json: string, load_version: number | null | undefined, sink: Function): number;
    /**
     * Writes the layout's view as an Excel workbook, held in memory, and returns
     * its bytes. The layout names its dataset and parameters; `load_version` is
     * the load the screen shows, and an export of any other load is refused. A
     * view of more than `max_cells` cells is refused before anything is written,
     * since each costs about 190 bytes of memory that WebAssembly never returns.
     *
     * # Errors
     *
     * Returns the reason the export cannot be made.
     */
    exportXlsx(layout_json: string, load_version: number | null | undefined, max_cells: number): Uint8Array;
    /**
     * Ends a load whose stream has ended, as [`Worker::finish`] does, and
     * returns the table's rows.
     *
     * # Errors
     *
     * Returns the reason the load is refused; it is then over.
     */
    finishLoad(name: string): bigint;
    /**
     * Handles one encoded client message and returns the encoded replies.
     */
    handle(message: Uint8Array | number[]): Array<any>;
    /**
     * About how many bytes the tables held take, as
     * [`MemoryCatalog::held_bytes`] counts them.
     */
    heldBytes(): number;
    /**
     * Loads or reloads dataset `name` from an app's Arrow IPC stream, all of it
     * at once, as [`Worker::load`] does. Returns the table's rows. The stream
     * stays in the page's memory: the load copies its headers to count its rows,
     * then one message at a time into WebAssembly's.
     *
     * # Errors
     *
     * Returns the reason the load is refused.
     */
    loadTable(name: string, arrow_ipc: Uint8Array, primary_key: string | null | undefined, now_micros: number, source_as_of_micros: number | null | undefined, max_rows: number): bigint;
    /**
     * Creates a worker with no tables.
     */
    constructor();
    /**
     * Brings open views up to date with reloaded tables and returns the pushed
     * messages.
     */
    refresh(): Array<any>;
    /**
     * Reads the next record batch of a load, as [`Worker::step`] does, and
     * returns where the load stands, as an object of [`Progress`]'s fields.
     *
     * # Errors
     *
     * Returns the reason the load is refused; it is then over.
     */
    stepLoad(name: string): any;
    /**
     * Drops dataset `name`, as [`Worker::unload`] does, and returns whether
     * it was held.
     */
    unloadTable(name: string): boolean;
}

/**
 * What the engine's last panic said and where, once: after a trap, the page
 * asks it to tell a fault in the engine from running out of memory, which
 * aborts without one. It reads no worker, so it answers after a trap has
 * left the worker borrowed.
 */
export function takePanic(): string | undefined;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_worker_free: (a: number, b: number) => void;
    readonly takePanic: () => [number, number];
    readonly worker_abandonLoad: (a: number, b: number, c: number) => void;
    readonly worker_addLoadBytes: (a: number, b: number, c: number, d: any) => [number, number];
    readonly worker_beginLoad: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number];
    readonly worker_endLoadBytes: (a: number, b: number, c: number) => [number, number];
    readonly worker_exportCsv: (a: number, b: number, c: number, d: number, e: number, f: any) => [number, number, number];
    readonly worker_exportXlsx: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly worker_finishLoad: (a: number, b: number, c: number) => [bigint, number, number];
    readonly worker_handle: (a: number, b: number, c: number) => any;
    readonly worker_heldBytes: (a: number) => number;
    readonly worker_loadTable: (a: number, b: number, c: number, d: any, e: number, f: number, g: number, h: number, i: number, j: number) => [bigint, number, number];
    readonly worker_new: () => number;
    readonly worker_refresh: (a: number) => any;
    readonly worker_stepLoad: (a: number, b: number, c: number) => [number, number, number];
    readonly worker_unloadTable: (a: number, b: number, c: number) => number;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
