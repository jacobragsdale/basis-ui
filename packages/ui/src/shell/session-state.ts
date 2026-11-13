/* The sign-in state BasisApp keeps: whether the adapter has said who is signed in, the session it gives the components
 * inside it, and the answers to the sign-in problems the API names. */

import type { QueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { setTokenSource } from "#api/fetch.ts";

import type { Session } from "./session.ts";
import { answerSignInProblems } from "./sign-in-problems.ts";
import type { SignIn, User } from "./sign-in.ts";
import type { Telemetry } from "./telemetry.ts";

/** Where signing in stands: under way, failed, or settled on a user or the anonymous one. */
type SignInState =
  | { readonly status: "pending" }
  | { readonly status: "failed"; readonly error: unknown }
  | { readonly status: "ready"; readonly user: User | null };

/** The event raised on `window` when the signed-in user becomes another user or nobody, its detail the user's id, or
 * `null` for nobody, beside `basis:themechange`. Whatever holds one user's data outside the query cache, such as
 * `@basis/parallax`'s datasets, drops it. It is not raised for the first user, who is signed in before anything has
 * loaded. */
const sessionChangeEvent = "basis:sessionchange";

/** `sessionChangeEvent`'s detail. */
interface SessionChangeDetail {
  readonly userId: string | null;
}

/** Raises `sessionChangeEvent` each time a settled sign-in names another user than the one before, from the one place
 * the shell records who is signed in. */
function useSessionChanges(state: SignInState): void {
  const recorded = useRef<{ readonly id: string | null } | null>(null);
  useEffect(() => {
    if (state.status !== "ready") {
      return;
    }
    const id = state.user?.id ?? null;
    if (recorded.current !== null && recorded.current.id !== id) {
      const detail: SessionChangeDetail = { userId: id };
      globalThis.dispatchEvent(new CustomEvent(sessionChangeEvent, { detail }));
    }
    recorded.current = { id };
  }, [state]);
}

/** Signs the user in through `signIn` once, and again after `retry`; `settle` records who is signed in after a sign-in
 * or a sign-out. It gives `apiFetch` the adapter's token first. */
function useSignIn(
  signIn: SignIn,
  telemetry: Telemetry,
): {
  readonly state: SignInState;
  readonly retry: () => void;
  readonly settle: (user: User | null) => void;
} {
  const [state, setState] = useState<SignInState>({ status: "pending" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    // Called through the adapter, so an adapter written as a class keeps its `this`.
    setTokenSource(
      async () => signIn.token(),
      async (refused) => (signIn.renew === undefined ? false : signIn.renew(refused)),
    );
    let live = true;
    const start = async (): Promise<void> => {
      try {
        const user = await signIn.currentUser();
        if (live) {
          setState({ status: "ready", user });
        }
      } catch (error) {
        if (live) {
          telemetry.error(error, { attempt, source: "sign-in" });
          setState({ error, status: "failed" });
        }
      }
    };
    const unexpected = (error: unknown): void => {
      telemetry.error(error, { source: "sign-in" });
    };
    start().catch(unexpected);
    return (): void => {
      live = false;
    };
  }, [signIn, telemetry, attempt]);
  return {
    retry: (): void => {
      setState({ status: "pending" });
      setAttempt((previous) => previous + 1);
    },
    settle: (user: User | null): void => {
      setState({ status: "ready", user });
    },
    state,
  };
}

/** The sign-in state, and the session once the user is known: `signIn` and `signOut` go through the adapter, then drop
 * every cached response, which was the last user's, and ask again for what the page shows. While it is mounted, the
 * API's sign-in problems are answered (sign-in-problems.ts). */
function useSessionState(
  signIn: SignIn,
  queryClient: QueryClient,
  telemetry: Telemetry,
): {
  readonly state: SignInState;
  readonly retry: () => void;
  readonly session: Session | null;
} {
  const { state, retry, settle } = useSignIn(signIn, telemetry);
  useSessionChanges(state);
  const forgetResponses = async (): Promise<void> => {
    queryClient.getMutationCache().clear();
    await queryClient.resetQueries();
  };
  const session: Session | null =
    state.status === "ready"
      ? {
          signIn: async () => {
            await signIn.signIn();
            settle(await signIn.currentUser());
            await forgetResponses();
          },
          signOut: async () => {
            await signIn.signOut();
            settle(null);
            await forgetResponses();
          },
          offersSignIn: signIn.offersSignIn ?? true,
          offersSignOut: signIn.offersSignOut ?? true,
          user: state.user,
        }
      : null;
  // The answers outlive a render, so they read the session as it is when a request fails.
  const current = useRef(session);
  useEffect(() => {
    current.current = session;
  });
  useEffect(
    () => answerSignInProblems(queryClient, () => current.current, telemetry),
    [queryClient, telemetry],
  );
  return { retry, session, state };
}

export { sessionChangeEvent, useSessionState };
export type { SessionChangeDetail, SignInState };
