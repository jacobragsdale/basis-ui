/* A ref that holds a render's newest value, for effects and event handlers that run after it. */

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

/** A ref holding the newest value, set after each render. */
function useLatest<TValue>(value: TValue): RefObject<TValue> {
  const latestRef = useRef(value);
  useEffect(() => {
    latestRef.current = value;
  });
  return latestRef;
}

export { useLatest };
