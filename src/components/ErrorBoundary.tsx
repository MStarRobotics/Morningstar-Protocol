import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureException } from '../services/monitoring';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback UI. Receives the error and a reset callback. */
  fallback?: (props: { error: Error; resetError: () => void }) => ReactNode;
  /** Called whenever an error is caught – useful for external logging (Sentry, etc.) */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const IS_DEV =
  typeof process !== 'undefined'
    ? process.env.NODE_ENV === 'development'
    : import.meta?.env?.DEV ?? false;

/**
 * Log the error. In a real production app this would forward to Sentry /
 * Datadog / etc.  For now it writes to the console so local development is
 * straightforward.
 */
function logError(error: Error, errorInfo: ErrorInfo): void {
  if (IS_DEV) {
    console.group(
      '%c[ErrorBoundary] Caught a rendering error',
      'color:#ff0055;font-weight:bold',
    );
    console.error(error);
    console.info('Component stack:', errorInfo.componentStack);
    console.groupEnd();
  }

  // Forward to Sentry / monitoring in production
  captureException(error, {
    extra: { componentStack: errorInfo.componentStack },
  });
}

// ---------------------------------------------------------------------------
// Default Fallback UI  –  cyberpunk / neon themed
// ---------------------------------------------------------------------------

const DefaultFallbackUI: React.FC<{
  error: Error;
  errorInfo: ErrorInfo | null;
  onRetry: () => void;
}> = ({ error, errorInfo, onRetry }) => {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16 relative z-10">
      <div className="glass-panel cyber-corner w-full max-w-xl p-8 text-center border border-red-500/30 shadow-[0_0_40px_rgba(255,0,85,0.15)]">
        {/* Decorative hex icon */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="absolute inset-0 bg-red-500 blur-lg opacity-40 rounded-full" />
            <svg
              className="relative w-16 h-16 text-red-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
        </div>

        {/* Heading with glitch data‑attribute for the project's CSS glitch effect */}
        <h2
          className="glitch text-2xl md:text-3xl font-display font-bold tracking-widest uppercase text-white mb-3"
          data-text="SYSTEM ERROR"
        >
          SYSTEM ERROR
        </h2>

        <p className="text-text-muted text-sm mb-6 font-mono leading-relaxed">
          {IS_DEV
            ? 'A rendering error was caught by the Error Boundary.'
            : 'Something went wrong. Our systems have been notified and we are looking into it.'}
        </p>

        {/* ── Development-only error details ─────────────────────────── */}
        {IS_DEV && (
          <div className="mb-6 text-left">
            {/* Error message */}
            <div className="bg-red-950/40 border border-red-500/20 rounded p-4 mb-3 overflow-x-auto">
              <p className="text-red-400 font-mono text-xs whitespace-pre-wrap break-words">
                <span className="text-red-500 font-bold">Error:&nbsp;</span>
                {error.message}
              </p>
            </div>

            {/* Stack trace */}
            {error.stack && (
              <details className="group">
                <summary className="cursor-pointer text-text-muted hover:text-highlight text-xs font-mono mb-2 transition-colors select-none">
                  <span className="group-open:hidden">&#9654; Show stack trace</span>
                  <span className="hidden group-open:inline">&#9660; Hide stack trace</span>
                </summary>
                <pre className="bg-black/60 border border-white/5 rounded p-3 text-[11px] text-text-muted font-mono overflow-x-auto max-h-48 leading-relaxed">
                  {error.stack}
                </pre>
              </details>
            )}

            {/* Component stack */}
            {errorInfo?.componentStack && (
              <details className="group mt-2">
                <summary className="cursor-pointer text-text-muted hover:text-data text-xs font-mono mb-2 transition-colors select-none">
                  <span className="group-open:hidden">&#9654; Show component stack</span>
                  <span className="hidden group-open:inline">&#9660; Hide component stack</span>
                </summary>
                <pre className="bg-black/60 border border-white/5 rounded p-3 text-[11px] text-data/80 font-mono overflow-x-auto max-h-48 leading-relaxed">
                  {errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* ── Actions ─────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={onRetry}
            className="relative group px-6 py-3 font-display font-bold tracking-wide transition-all duration-300 overflow-hidden bg-primary text-white border border-primary/50 hover:bg-primary-hover shadow-neon clip-path-polygon"
          >
            {/* Sweep effect matching the UI Button component */}
            <div className="absolute inset-0 bg-white/10 skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />
            {/* Corner accents */}
            <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-white/50 opacity-50 group-hover:opacity-100 transition-opacity" />
            <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-white/50 opacity-50 group-hover:opacity-100 transition-opacity" />
            <span className="relative z-10 flex items-center gap-2">
              {/* Refresh icon */}
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              RETRY
            </span>
          </button>

          <button
            onClick={() => {
              window.location.reload();
            }}
            className="relative group px-6 py-3 font-display font-bold tracking-wide transition-all duration-300 overflow-hidden bg-transparent text-text-muted border border-white/20 hover:border-highlight hover:text-highlight hover:bg-highlight/5"
          >
            <span className="relative z-10">RELOAD PAGE</span>
          </button>
        </div>

        {/* Decorative bottom bar */}
        <div className="mt-8 flex items-center justify-center gap-1">
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className="h-0.5 w-1.5 bg-red-500/30"
              style={{ opacity: Math.random() * 0.6 + 0.2 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ErrorBoundary – Class Component (React requires a class for getDerivedState)
// ---------------------------------------------------------------------------

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  // ── Lifecycle Methods ────────────────────────────────────────────────────

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Log to console (and Sentry in production)
    logError(error, errorInfo);

    // Notify parent if callback was supplied
    this.props.onError?.(error, errorInfo);
  }

  // ── Reset ────────────────────────────────────────────────────────────────

  resetError = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  // ── Render ───────────────────────────────────────────────────────────────

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback } = this.props;

    if (hasError && error) {
      // Custom fallback takes priority
      if (fallback) {
        return fallback({ error, resetError: this.resetError });
      }

      return (
        <DefaultFallbackUI
          error={error}
          errorInfo={errorInfo}
          onRetry={this.resetError}
        />
      );
    }

    return children;
  }
}

// ---------------------------------------------------------------------------
// Functional Wrapper – provides a hook-friendly API
// ---------------------------------------------------------------------------

interface WithErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback renderer */
  fallback?: (props: { error: Error; resetError: () => void }) => ReactNode;
  /** Called whenever an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

/**
 * `<SafeBoundary>` is a thin functional wrapper around the class-based
 * `ErrorBoundary`.  Use it when you prefer a more composable / JSX-centric
 * API and don't need direct access to the class instance.
 *
 * @example
 * ```tsx
 * <SafeBoundary>
 *   <SomeRiskyComponent />
 * </SafeBoundary>
 * ```
 */
const SafeBoundary: React.FC<WithErrorBoundaryProps> = ({
  children,
  fallback,
  onError,
}) => {
  return (
    <ErrorBoundary fallback={fallback} onError={onError}>
      {children}
    </ErrorBoundary>
  );
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { ErrorBoundary, SafeBoundary, DefaultFallbackUI };
export type { ErrorBoundaryProps, ErrorBoundaryState, WithErrorBoundaryProps };
export default ErrorBoundary;
