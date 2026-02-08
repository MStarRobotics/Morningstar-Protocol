/**
 * Shared error handling utilities.
 *
 * Consolidates the duplicated `error instanceof Error ? error.message : String(error)`
 * pattern found across services and pages into a single reusable helper.
 */

/**
 * Extract a human-readable message from an unknown caught value.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

/**
 * Generic Result type for operations that can fail.
 */
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Wrap an async operation with standardised error handling.
 *
 * @example
 * const result = await withErrorHandling(
 *   () => issueCredential(params),
 *   'Credential issuance failed'
 * );
 * if (!result.ok) logger.error(result.error);
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  fallbackMessage: string,
): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error) || fallbackMessage };
  }
}
