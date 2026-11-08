/* The signed-in session `BasisApp` gives the components inside it. */

import { createContext, use } from "react";

import type { User } from "./sign-in.ts";

/** Who is signed in, and how to sign them in and out. */
interface Session {
  /** The signed-in user, or `null` for an anonymous one. */
  readonly user: User | null;
  /** Signs the user in through the sign-in adapter, then drops every cached response, which was the anonymous
   * user's, and asks again for what the page shows, with the user's token. */
  readonly signIn: () => Promise<void>;
  /** Signs the user out through the sign-in adapter, then drops every cached response, which was theirs, and asks
   * again for what the page shows. */
  readonly signOut: () => Promise<void>;
  /** Whether the app offers a sign-in: `false` under `anonymousSignIn`, so nothing should show a "Sign in" button. */
  readonly offersSignIn: boolean;
}

const SessionContext = createContext<Session | null>(null);

/** The signed-in session: `const { user, signIn, signOut } = useSession();`. Only components inside `BasisApp` have
 * one. */
function useSession(): Session {
  const session = use(SessionContext);
  if (session === null) {
    throw new Error(
      "useSession found no session: render the component inside <BasisApp>, or, in a test, inside <BasisApp signIn={fakeSignIn()}>.",
    );
  }
  return session;
}

export { SessionContext, useSession };
export type { Session };
