/**
 * Monitoring & Error Tracking Service
 *
 * Production-grade integration point for Sentry (or any APM provider).
 * - In development: errors are logged via the logger service.
 * - In production with VITE_SENTRY_DSN set: errors are forwarded to Sentry.
 *
 * The module is side-effect free until `initMonitoring()` is called from the
 * application entry point (`main.tsx`).
 */

import { env } from './env';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SentryLike {
  init: (options: Record<string, unknown>) => void;
  captureException: (error: unknown, context?: Record<string, unknown>) => void;
  captureMessage: (message: string, level?: string) => void;
  setUser: (user: { id: string; [key: string]: unknown } | null) => void;
  addBreadcrumb: (breadcrumb: Record<string, unknown>) => void;
  startTransaction?: (context: Record<string, unknown>) => { finish: () => void };
}

let sentry: SentryLike | null = null;

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

/**
 * Initialise monitoring.  Safe to call multiple times — subsequent calls are
 * no-ops.  Should be called once from main.tsx.
 *
 * When `@sentry/react` is installed and `VITE_SENTRY_DSN` is set, Sentry is
 * initialised with sensible defaults. Otherwise monitoring is a no-op (all
 * calls fall through to the logger).
 */
export async function initMonitoring(): Promise<void> {
  if (sentry) return; // already initialised

  if (!env.sentryDsn || !env.isProd) {
    logger.info('[Monitoring] Sentry DSN not set or dev mode — monitoring is a no-op');
    return;
  }

  try {
    // Use a variable so Rollup/Vite cannot statically resolve the import.
    // This prevents build failure when @sentry/react is not installed.
    const sentryModuleName = '@sentry/react';
    const Sentry: SentryLike = await import(/* @vite-ignore */ sentryModuleName);

    Sentry.init({
      dsn: env.sentryDsn,
      environment: env.mode,
      tracesSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      replaysSessionSampleRate: 0.1,
    });

    sentry = Sentry;
    logger.info('[Monitoring] Sentry initialised');
  } catch {
    logger.warn('[Monitoring] @sentry/react not installed — monitoring disabled');
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Capture an exception. Falls back to logger.error if Sentry is unavailable.
 */
export function captureException(
  error: unknown,
  context?: { tags?: Record<string, string>; extra?: Record<string, unknown> },
): void {
  logger.error('[Monitoring] Exception captured', error);

  if (sentry) {
    sentry.captureException(error, {
      tags: context?.tags,
      extra: context?.extra,
    });
  }
}

/**
 * Capture a message at a given severity level.
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
): void {
  logger.info(`[Monitoring] ${level}: ${message}`);
  sentry?.captureMessage(message, level);
}

/**
 * Identify the current user for error attribution.
 * Pass `null` to clear the user context (e.g. on logout).
 */
export function setUser(user: { id: string; role?: string } | null): void {
  sentry?.setUser(user);
}

/**
 * Add a breadcrumb for richer error context.
 */
export function addBreadcrumb(breadcrumb: {
  category: string;
  message: string;
  level?: 'debug' | 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
}): void {
  sentry?.addBreadcrumb(breadcrumb);
}

/**
 * Track a performance-sensitive operation.
 * Returns a finish callback to end the measurement.
 */
export function trackOperation(name: string): { finish: () => void } {
  if (sentry?.startTransaction) {
    const tx = sentry.startTransaction({ name, op: 'custom' });
    return { finish: () => tx.finish() };
  }
  // No-op when Sentry is unavailable
  return { finish: () => {} };
}
