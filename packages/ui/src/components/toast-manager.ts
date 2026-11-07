/* The toast manager, as shadcn's Toast for Base UI makes it: Base UI's `createToastManager()`, made once, so that a
 * toast can be raised from anywhere, inside React or out, such as in a query's error handler. `<Toaster />` subscribes
 * to it and draws its toasts. It lives apart from toast.tsx because a component file exports only components. */

import { Toast as ToastPrimitive } from "@base-ui/react/toast";

/** The app's toasts: `toast.add({ title, description, type })` raises one and returns its id, which `toast.update`
 * and `toast.close` take; `toast.promise` shows one for a promise, loading until it settles.
 *
 * `type` picks the look: `success`, `warning`, `info` or `destructive` (or `error`, which `toast.promise` sets on a
 * rejection), each with its icon; `loading`, with a spinner; anything else, or none, is the plain toast. A toast
 * closes itself after five seconds unless `timeout` says otherwise, and `0` keeps it until it is closed.
 * `priority: "high"` announces it at once, for what the user must act on now. */
const toast = ToastPrimitive.createToastManager();

/** Base UI's own: `createToastManager()` makes a manager apart from the app's, for a `<Toaster toastManager={...}>` of
 * its own, as in a test, and `useToastManager()` reads the toasts and the same methods inside a provider. */
const { createToastManager, useToastManager } = ToastPrimitive;

export { createToastManager, toast, useToastManager };
