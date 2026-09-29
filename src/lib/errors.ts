/**
 * An error whose message is written for the person who triggered it. Server actions
 * return these messages to the form; any other error is logged and replaced with a
 * generic message, because Next.js hides thrown error messages in production.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

/** The request has no signed-in user, an inactive user, or a user without the required role. */
export class AccessDeniedError extends UserFacingError {
  constructor(message: string) {
    super(message);
    this.name = "AccessDeniedError";
  }
}
