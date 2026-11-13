/* How the app shell answers the sign-in problems basis's contract names (its docs/contract.md, Errors), once a query's
 * or a mutation's retries are spent:
 *
 * - `invalid-token`, a 401: the token did not verify, or has expired, so the session has ended. The shell signs the
 *   user out through the adapter, which drops their cached responses and asks again as the anonymous user, and says
 *   so in a toast that offers to sign in again.
 * - `sign-in-required`, a 401: an anonymous request reached a route that needs a user. The toast asks the user to sign
 *   in.
 *
 * `keys-unavailable`, a 503 while the sign-in system's keys cannot be fetched, is not one of them, since the token may
 * well be good: the query client retries it (query-client.ts), and the user stays signed in. */

import type { QueryClient } from "@tanstack/react-query";

import { isApiError, setRequestRunner } from "#api/fetch.ts";
import { toast } from "#components/toast-manager.ts";

import { requestRunner } from "./outside-queries.ts";
import { SessionEndedError } from "./session-ended.ts";
import type { Session } from "./session.ts";
import { noSignInMessage } from "./sign-in.ts";
import type { Telemetry } from "./telemetry.ts";

/** A problem type that ends a session or asks for one. */
type SignInProblem = "invalid-token" | "sign-in-required";

const unauthorized = 401;

/** The sign-in problem `error` holds: a 401 whose problem type is `invalid-token` or `sign-in-required`, a
 * `SessionEndedError` an adapter threw, which ends the session as `invalid-token` does, or `undefined` for any other
 * error. */
function signInProblem(error: unknown): SignInProblem | undefined {
  if (error instanceof SessionEndedError) {
    return "invalid-token";
  }
  if (!isApiError(error) || error.status !== unauthorized) {
    return undefined;
  }
  const { type } = error.problem;
  return type === "invalid-token" || type === "sign-in-required" ? type : undefined;
}

/** The one sign-in toast's id: a later prompt updates it in place rather than stacking another. */
const promptId = "basis-sign-in";

/** What the toast says for each problem. */
const prompts = {
  "invalid-token": { description: "Sign in again to carry on.", title: "Your session has expired" },
  "sign-in-required": {
    description: "What you asked for needs you to be signed in.",
    title: "Sign in to carry on",
  },
} as const;

/** What the sign-in answers remember between failures: the problem the toast shows while it shows, and whether the
 * sign-out for an ended session is under way, so that every request it failed signs out once. */
interface PromptState {
  shown: SignInProblem | null;
  ending: boolean;
}

/** Raises the sign-in toast for `problem`, whose "Sign in", or "Sign in again" for an ended session, calls `signIn`. */
function raisePrompt(problem: SignInProblem, state: PromptState, signIn: () => void): void {
  state.shown = problem;
  toast.add({
    ...prompts[problem],
    actionProps: {
      children: problem === "invalid-token" ? "Sign in again" : "Sign in",
      onClick: () => {
        toast.close(promptId);
        signIn();
      },
    },
    id: promptId,
    onRemove: () => {
      state.shown = null;
    },
    priority: "high",
    timeout: 0,
    type: "warning",
  });
}

/** Says, once, that the API asked for a user the app cannot sign in, in an app under `anonymousSignIn`. */
function raiseNoSignIn(state: PromptState, telemetry: Telemetry): void {
  if (state.shown !== null) {
    return;
  }
  state.shown = "sign-in-required";
  telemetry.error(new Error(noSignInMessage), { source: "sign-in" });
  toast.add({
    description: "The data behind this page needs a signed-in user, and this app has no sign-in.",
    id: promptId,
    onRemove: () => {
      state.shown = null;
    },
    priority: "high",
    timeout: 0,
    title: "This page can't load",
    type: "error",
  });
}

/** Signs `current` out, once however many requests the ended session fails. */
async function endSession(current: Session, state: PromptState): Promise<void> {
  state.ending = true;
  try {
    await current.signOut();
  } finally {
    state.ending = false;
  }
}

/** The answer to each failed request: nothing unless it failed with a sign-in problem. */
function signInAnswers(
  session: () => Session | null,
  telemetry: Telemetry,
): (failure: unknown) => void {
  const state: PromptState = { ending: false, shown: null };
  const report = (error: unknown): void => {
    telemetry.error(error, { source: "sign-in" });
  };
  const signIn = (): void => {
    session()?.signIn().catch(report);
  };
  return (failure) => {
    const problem = signInProblem(failure);
    if (problem !== undefined && session()?.offersSignIn === false) {
      raiseNoSignIn(state, telemetry);
    } else if (problem === "invalid-token") {
      const current = session();
      if (current !== null && current.user !== null && !state.ending) {
        endSession(current, state).catch(report);
      }
      raisePrompt(problem, state, signIn);
    } else if (problem === "sign-in-required" && state.shown === null) {
      // An ended session's toast stays, since it says why the user must sign in again.
      raisePrompt(problem, state, signIn);
    }
  };
}

/** Answers each sign-in problem a query or a mutation of `queryClient` meets, and each a request outside TanStack Query
 * meets, such as a dataset's, through `setRequestRunner`, with one answer, so that however many requests an ended
 * session fails it signs out once. `session` reads the session as it is now, or `null` until the user is known.
 * Returns the unsubscribe. */
function answerSignInProblems(
  queryClient: QueryClient,
  session: () => Session | null,
  telemetry: Telemetry,
): () => void {
  const answer = signInAnswers(session, telemetry);
  const stopRequests = setRequestRunner(requestRunner({ answer, telemetry }));
  const stopQueries = queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "error") {
      answer(event.action.error);
    }
  });
  const stopMutations = queryClient.getMutationCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "error") {
      answer(event.action.error);
    }
  });
  return () => {
    stopQueries();
    stopMutations();
    stopRequests();
  };
}

export { answerSignInProblems, signInProblem };
export type { SignInProblem };
