/* A resize observer whose work waits for the next animation frame. */

/** Calls `resized` in the next animation frame after `element` resizes, and returns a function that stops. Not in the
 * observer's callback: a draw there resizes the canvas inside the box observed, which the browser reports as an error,
 * a loop of undelivered notifications. */
function observeNextFrame(element: Element, resized: () => void): () => void {
  let pending = 0;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(resized);
  });
  observer.observe(element);
  return () => {
    cancelAnimationFrame(pending);
    observer.disconnect();
  };
}

export { observeNextFrame };
