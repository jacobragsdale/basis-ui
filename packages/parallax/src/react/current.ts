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

export { applyWhenCurrent };
