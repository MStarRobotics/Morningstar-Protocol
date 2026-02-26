import React, { Suspense, lazy, useCallback, useState } from 'react';
import GuestLanding from './pages/GuestLanding';

const AppWithProviders = lazy(() => import('./AppWithProviders'));

const LoadingShell: React.FC = () => (
  <div className="min-h-screen bg-background-dark" />
);

const RootApp: React.FC = () => {
  const [shouldLoadWalletShell, setShouldLoadWalletShell] = useState(false);

  const preloadWalletShell = useCallback(() => {
    void import('./AppWithProviders');
  }, []);

  const handleConnectIntent = useCallback(() => {
    preloadWalletShell();
    setShouldLoadWalletShell(true);
  }, [preloadWalletShell]);

  if (!shouldLoadWalletShell) {
    return <GuestLanding onConnectIntent={handleConnectIntent} onWarmupIntent={preloadWalletShell} />;
  }

  return (
    <Suspense fallback={<LoadingShell />}>
      <AppWithProviders initialConnectionPanelOpen />
    </Suspense>
  );
};

export default RootApp;
