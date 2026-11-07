/* How stale a time is: "4 min. ago", through `Intl.RelativeTimeFormat`, and whether it has passed a threshold, for
 * the state that shows when a query's data was current. */

interface AgeOptions {
  /** The instant to measure from; now by default. */
  readonly now?: Temporal.Instant;
}

interface RelativeTimeOptions extends AgeOptions {
  /** The locale to write in; US English by default. */
  readonly locale?: string;
  /** `Intl.RelativeTimeFormat`'s style; `"short"` by default, which writes "4 min. ago". */
  readonly style?: Intl.RelativeTimeFormatStyle;
}

interface StaleOptions extends AgeOptions {
  /** How old a time may be before it is stale. */
  readonly threshold: Temporal.Duration | Temporal.DurationLike;
}

const secondsPerMinute = 60;
const secondsPerHour = 3600;
const secondsPerDay = 86_400;

/** Whole seconds from `then` to `now`, and none for a time in the future, such as one a skewed clock wrote. */
function ageSeconds(then: Temporal.Instant, now: Temporal.Instant): number {
  return Math.max(0, Math.trunc(now.since(then).total("seconds")));
}

/** How long ago `then` was, in the largest whole unit up to days: "now", "45 sec. ago", "4 min. ago", "2 hr. ago",
 * "yesterday", "3 days ago". Units are cut, never rounded, so 4 minutes 59 seconds is "4 min. ago". */
function relativeTime(
  then: Temporal.Instant,
  { locale = "en-US", now = Temporal.Now.instant(), style = "short" }: RelativeTimeOptions = {},
): string {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style });
  const seconds = ageSeconds(then, now);
  if (seconds < secondsPerMinute) {
    return format.format(-seconds, "second");
  }
  if (seconds < secondsPerHour) {
    return format.format(-Math.trunc(seconds / secondsPerMinute), "minute");
  }
  if (seconds < secondsPerDay) {
    return format.format(-Math.trunc(seconds / secondsPerHour), "hour");
  }
  return format.format(-Math.trunc(seconds / secondsPerDay), "day");
}

/** Whether `then` is older than `threshold`. A time exactly at the threshold is not yet stale. */
function isStale(
  then: Temporal.Instant,
  { now = Temporal.Now.instant(), threshold }: StaleOptions,
): boolean {
  return Temporal.Duration.compare(now.since(then), Temporal.Duration.from(threshold)) > 0;
}

export { isStale, relativeTime };
export type { AgeOptions, RelativeTimeOptions, StaleOptions };
