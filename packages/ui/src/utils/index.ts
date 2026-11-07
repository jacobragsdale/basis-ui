/* `@basis/ui/utils`: only what modern JavaScript lacks, so that no app adds lodash. Each helper is modelled on
 * es-toolkit's signature (MIT), so what agents know of lodash and es-toolkit carries over. The language already has
 * the rest: `Object.groupBy` and `Map.groupBy`, `structuredClone`, `Array.prototype.toSorted`, `flat` and `at`, the
 * Set methods, `Promise.withResolvers`, `AbortSignal.timeout`, and Temporal for dates. */

export {
  chunk,
  countBy,
  keyBy,
  maxBy,
  minBy,
  partition,
  range,
  uniqBy,
  zip,
  type Visit,
} from "./collections.ts";
export { entries, fromEntries, keys, mapValues, omit, pick, type Entry } from "./objects.ts";
export {
  sortBy,
  type SortBy,
  type SortCriterion,
  type SortKey,
  type SortOrder,
  type SortValue,
} from "./sort.ts";
export { deepEqual } from "./equal.ts";
export { stableStringify } from "./stringify.ts";
export {
  debounce,
  rafThrottle,
  sleep,
  throttle,
  type ControlledFunction,
  type DebouncedFunction,
  type Edge,
  type ThrottledFunction,
  type TimingOptions,
} from "./timing.ts";
export { assertNever, invariant, isPresent } from "./guards.ts";
export { downloadBlob, toCsv, toTsv, type Cell, type Column } from "./export.ts";
export { parseCsv, type CsvReading, type CsvRecord } from "./parse-csv.ts";
