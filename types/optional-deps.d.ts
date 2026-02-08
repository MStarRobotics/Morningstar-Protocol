/**
 * Type declarations for optional dependencies.
 * These modules may not be installed; the runtime code handles their absence
 * gracefully via dynamic import + try/catch.
 */

// @sentry/react is an optional APM dependency — only installed in production
// deployments that enable error tracking via VITE_SENTRY_DSN.
declare module '@sentry/react' {
  export function init(options: Record<string, unknown>): void;
  export function captureException(error: unknown, context?: Record<string, unknown>): void;
  export function captureMessage(message: string, level?: string): void;
  export function setUser(user: { id: string; [key: string]: unknown } | null): void;
  export function addBreadcrumb(breadcrumb: Record<string, unknown>): void;
  export function startTransaction(context: Record<string, unknown>): { finish: () => void };
}
