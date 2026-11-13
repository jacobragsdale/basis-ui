/* What a sign-in adapter throws when the sign-in system itself refuses to sign the user in again. */

/** The sign-in system refused to sign the user in again, so their session has ended. A sign-in adapter's `token()` or
 * `currentUser()` throws it, as `windowsSignIn`'s does when its endpoint refuses; the shell answers it as it answers an
 * API's `invalid-token`: it signs the user out and offers to sign in again. */
class SessionEndedError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SessionEndedError";
  }
}

export { SessionEndedError };
