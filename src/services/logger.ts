/**
 * Application Logger Service
 *
 * Structured logging that:
 * - Outputs to console only in development
 * - Can be wired to Sentry / remote monitoring in production
 * - Maintains a structured format for log aggregation
 *
 * Usage:
 *   import { logger } from './logger';
 *   logger.info('[Module] message', { extra: 'data' });
 *   logger.error('[Module] operation failed', error);
 */

import { env } from './env';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: unknown;
}

// Ring buffer for recent logs (useful for error reports)
const LOG_BUFFER_SIZE = 100;
const recentLogs: LogEntry[] = [];

function pushLog(entry: LogEntry): void {
  recentLogs.push(entry);
  if (recentLogs.length > LOG_BUFFER_SIZE) {
    recentLogs.shift();
  }
}

function createEntry(level: LogLevel, message: string, data?: unknown): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    data,
  };
}

export const logger = {
  debug(message: string, data?: unknown): void {
    const entry = createEntry('debug', message, data);
    pushLog(entry);
    if (env.isDev) {
      // eslint-disable-next-line no-console
      console.debug(`[DEBUG] ${message}`, data ?? '');
    }
  },

  info(message: string, data?: unknown): void {
    const entry = createEntry('info', message, data);
    pushLog(entry);
    if (env.isDev) {
      // eslint-disable-next-line no-console
      console.log(`[INFO] ${message}`, data ?? '');
    }
  },

  warn(message: string, data?: unknown): void {
    const entry = createEntry('warn', message, data);
    pushLog(entry);
    if (env.isDev) {
      // eslint-disable-next-line no-console
      console.warn(`[WARN] ${message}`, data ?? '');
    }
    // Production: could forward to Sentry breadcrumbs
  },

  error(message: string, error?: unknown): void {
    const entry = createEntry('error', message, error);
    pushLog(entry);
    if (env.isDev) {
      // eslint-disable-next-line no-console
      console.error(`[ERROR] ${message}`, error ?? '');
    }
    // Production: forward to Sentry
    // Sentry?.captureException(error, { extra: { message } });
  },

  /** Get the last N log entries (useful for attaching to error reports). */
  getRecentLogs(count: number = LOG_BUFFER_SIZE): ReadonlyArray<LogEntry> {
    return recentLogs.slice(-count);
  },

  /** Clear the log buffer. */
  clear(): void {
    recentLogs.length = 0;
  },
};
