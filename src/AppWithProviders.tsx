import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import App from './App';
import { queryClient, wagmiAdapter } from './config/reown';

interface AppWithProvidersProps {
  initialConnectionPanelOpen?: boolean;
}

const AppWithProviders: React.FC<AppWithProvidersProps> = ({
  initialConnectionPanelOpen = false,
}) => (
  <WagmiProvider config={wagmiAdapter.wagmiConfig}>
    <QueryClientProvider client={queryClient}>
      <App initialConnectionPanelOpen={initialConnectionPanelOpen} />
    </QueryClientProvider>
  </WagmiProvider>
);

export default AppWithProviders;
