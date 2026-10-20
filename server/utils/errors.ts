// Small helpers for reading a thrown value of type `unknown`.
//
// With `strict` on, a bare `catch (err)` binds `unknown`, which is the
// honest type: Express handlers see Error subclasses (pg, axios, zod),
// plain strings, and the occasional object literal. These helpers give
// catch blocks the two things they actually read without an `any` cast.

/**
 * Best-effort human-readable message for anything that was thrown.
 * Error → its message; string → itself; object with a string `message`
 * → that; anything else → String(value).
 */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return String(e);
}

/**
 * The `code` property when the thrown value carries a string one
 * (Node system errors, axios: 'ECONNABORTED', 'ECONNREFUSED', …).
 */
export function errorCode(e: unknown): string | undefined {
  if (e && typeof e === "object" && "code" in e) {
    const c = (e as { code?: unknown }).code;
    if (typeof c === "string") return c;
  }
  return undefined;
}
