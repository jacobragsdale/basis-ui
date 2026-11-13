/* Who signs in: the firm's Windows sign-in in production, and the fake, whose tokens a basis API on a developer's
 * desktop accepts, in `vp dev`, in tests and in a fixture build, which have no endpoint to sign in at. The bundler
 * drops the fake from a production build, and `vp run verify` fails one that still holds it. */

import { fakeSignIn, windowsSignIn } from "@basis/ui";
import type { SignIn } from "@basis/ui";

/** The firm's token endpoint, which signs the browser in with the user's Windows account: the one place it is named.
 * The README's "Porting to the firm's sign-in" says what else to set. */
const tokenUrl = "https://sign-in.example.com/token";

const signIn: SignIn =
  import.meta.env.DEV || import.meta.env.MODE === "fixtures"
    ? fakeSignIn()
    : windowsSignIn({ tokenUrl });

export { signIn };
