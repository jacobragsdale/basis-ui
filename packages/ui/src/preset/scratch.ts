/* Removing a task's scratch folder, outside the app: with retries, since on Windows a virus scanner, or a native
 * binding a dry run loaded, can hold a file a moment after the task is done with it; and never failing the task, whose
 * result the folder only served. One that cannot be removed is left in the system's temporary folder, which it
 * empties. */

import { rmSync } from "node:fs";
import { rm } from "node:fs/promises";

/** How often a removal is tried again, and how long it waits between, growing each time. */
const retries = { maxRetries: 5, retryDelay: 200 };

/** Removes `folder`, trying again while a file in it is held, and gives up quietly. */
function removeScratch(folder: string): void {
  try {
    rmSync(folder, { force: true, recursive: true, ...retries });
  } catch {
    // Left for the system to empty: the task's result never depends on it.
  }
}

/** `removeScratch`, without blocking. */
async function removeScratchLater(folder: string): Promise<void> {
  try {
    await rm(folder, { force: true, recursive: true, ...retries });
  } catch {
    // Left for the system to empty, as above.
  }
}

export { removeScratch, removeScratchLater };
