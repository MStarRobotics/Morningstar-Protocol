import React, { useEffect, useState, Suspense, lazy } from 'react';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import { WalletProvider } from './services/WalletContext';
import { Role } from './types';
import { authService } from './services/authService';

// ---------------------------------------------------------------------------
// Lazy-loaded page components – each page is code-split into its own chunk
// ---------------------------------------------------------------------------

const LandingPage = lazy(() => import('./pages/LandingPage'));
const StudentWallet = lazy(() => import('./pages/StudentWallet'));
const UniversityDashboard = lazy(() => import('./pages/UniversityDashboard'));
const VerifierPortal = lazy(() => import('./pages/VerifierPortal'));
const GovernancePanel = lazy(() => import('./pages/GovernancePanel'));

// ---------------------------------------------------------------------------
// Loading Fallback – cyberpunk / neon themed skeleton
// ---------------------------------------------------------------------------

const LoadingFallback: React.FC = () => (
  <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16 relative z-10">
    <div className="glass-panel cyber-corner p-10 flex flex-col items-center gap-6 border border-primary/20">
      {/* Animated hex spinner */}
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
        <svg
          className="relative w-16 h-16 text-primary animate-spin"
          style={{ animationDuration: '3s' }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
        </svg>
        <svg
          className="absolute inset-0 w-16 h-16 text-highlight animate-spin"
          style={{ animationDuration: '5s', animationDirection: 'reverse' }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
        </svg>
      </div>

      {/* Loading text */}
      <div className="flex flex-col items-center gap-2">
        <p
          className="glitch text-lg font-display font-bold tracking-widest uppercase text-white"
          data-text="LOADING MODULE"
        >
          LOADING MODULE
        </p>
        <p className="text-text-muted text-xs font-mono tracking-wider">
          Initializing secure connection&hellip;
        </p>
      </div>

      {/* Animated progress bar */}
      <div className="w-48 h-0.5 bg-white/5 rounded overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary via-highlight to-data rounded"
          style={{
            animation: 'loading-sweep 1.5s ease-in-out infinite',
          }}
        />
      </div>
    </div>

    {/* Inline keyframes for the progress bar animation */}
    <style>{`
      @keyframes loading-sweep {
        0%   { width: 0%; margin-left: 0; }
        50%  { width: 70%; margin-left: 10%; }
        100% { width: 0%; margin-left: 100%; }
      }
    `}</style>
  </div>
);

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

interface AppProps {
  initialConnectionPanelOpen?: boolean;
}

const App: React.FC<AppProps> = ({ initialConnectionPanelOpen = false }) => {
  const [currentRole, setCurrentRole] = useState<Role>('guest');
  const [isSystemPaused, setSystemPaused] = useState(false);
  const [shouldOpenConnectionPanelOnGuestView, setShouldOpenConnectionPanelOnGuestView] = useState(
    initialConnectionPanelOpen,
  );

  useEffect(() => {
    let cancelled = false;
    const restoreSessionRole = async () => {
      try {
        const session = await authService.getSessionMe();
        if (!cancelled && session?.role && session.role !== 'guest') {
          setCurrentRole(session.role);
        }
      } catch {
        // Treat as guest when auth session cannot be restored.
      }
    };

    void restoreSessionRole();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (currentRole === 'guest') return;

    let cancelled = false;
    const verifyAuthorizedRole = async () => {
      try {
        const session = await authService.getSessionMe();
        if (!cancelled && (!session || session.role !== currentRole)) {
          setCurrentRole('guest');
        }
      } catch {
        if (!cancelled) {
          setCurrentRole('guest');
        }
      }
    };

    void verifyAuthorizedRole();
    return () => {
      cancelled = true;
    };
  }, [currentRole]);

  useEffect(() => {
    const nav = navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    };
    const constrainedConnection = Boolean(
      nav.connection?.saveData ||
      (typeof nav.connection?.effectiveType === 'string' && nav.connection.effectiveType.includes('2g'))
    );
    const reducedEffects = document.documentElement.classList.contains('reduced-effects');
    if (constrainedConnection || reducedEffects) {
      return undefined;
    }

    const preloadPages = () => {
      void import('./pages/StudentWallet');
      void import('./pages/UniversityDashboard');
      void import('./pages/VerifierPortal');
      void import('./pages/GovernancePanel');
    };

    const maybeWindow = window as Window & {
      requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (
      typeof maybeWindow.requestIdleCallback === 'function' &&
      typeof maybeWindow.cancelIdleCallback === 'function'
    ) {
      const idleId = maybeWindow.requestIdleCallback(preloadPages, { timeout: 2_000 });
      return () => maybeWindow.cancelIdleCallback?.(idleId);
    }

    const timeoutId = globalThis.setTimeout(preloadPages, 800);
    return () => globalThis.clearTimeout(timeoutId);
  }, []);

  const handleLogin = (role: Role) => {
    setCurrentRole(role);
  };

  const handleLogout = () => {
    authService.clearSession();
    setCurrentRole('guest');
  };

  const renderPage = () => {
    switch (currentRole) {
      case 'student':
        return <StudentWallet />;
      case 'issuer':
        return <UniversityDashboard isSystemPaused={isSystemPaused} />;
      case 'verifier':
        return <VerifierPortal />;
      case 'governance':
        return (
          <GovernancePanel
            isPaused={isSystemPaused}
            setPaused={setSystemPaused}
          />
        );
      default:
        return (
          <LandingPage
            onLogin={handleLogin}
            openConnectionPanelOnMount={shouldOpenConnectionPanelOnGuestView}
            onInitialConnectionPanelHandled={() => setShouldOpenConnectionPanelOnGuestView(false)}
          />
        );
    }
  };

  return (
    <ErrorBoundary>
      <WalletProvider>
        <Layout role={currentRole} onLogout={handleLogout}>
          <Suspense fallback={<LoadingFallback />}>
            <ErrorBoundary>
              {renderPage()}
            </ErrorBoundary>
          </Suspense>
        </Layout>
      </WalletProvider>
    </ErrorBoundary>
  );
};

export default App;
