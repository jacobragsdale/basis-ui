/* Results that arrive after an effect started the work, applied only while that effect still holds. */

/** Applies a result once it arrives, unless the effect that waited for it has ended. */
async function applyWhenCurrent<TResult>(
  outcome: Promise<TResult>,
  isCurrent: () => boolean,
  apply: (result: TResult) => void,
): Promise<void> {
  const result = await outcome;
  if (isCurrent()) {
    apply(result);
  }
}

/** Reports an error that nothing awaits, as the browser reports an uncaught one; a DOM without `reportError`, as a
 * test's Node DOM, throws it on a later task, as the browser would have. */
function reportUncaught(error: unknown): void {
  if ("reportError" in globalThis) {
    globalThis.reportError(error);
    return;
  }
  setTimeout(() => {
    throw error;
  }, 0);
}

export { applyWhenCurrent, reportUncaught };
