/* tslint:disable */
/* eslint-disable */

/**
 * Tables and a protocol session, for one page.
 */
export class Worker {
    free(): void;
    [Symbol.dispose](): void;
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
     * Handles one encoded client message and returns the encoded replies.
     */
    handle(message: Uint8Array | number[]): Array<any>;
    /**
     * Loads or reloads dataset `name` from an app's Arrow IPC stream, as
     * [`Worker::load`] does. Returns the table's rows. The stream stays in the
     * page's memory: the load copies its headers to count its rows, then one
     * message at a time into WebAssembly's.
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
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_worker_free: (a: number, b: number) => void;
    readonly worker_exportCsv: (a: number, b: number, c: number, d: number, e: number, f: any) => [number, number, number];
    readonly worker_exportXlsx: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly worker_handle: (a: number, b: number, c: number) => any;
    readonly worker_loadTable: (a: number, b: number, c: number, d: any, e: number, f: number, g: number, h: number, i: number, j: number) => [bigint, number, number];
    readonly worker_new: () => number;
    readonly worker_refresh: (a: number) => any;
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
