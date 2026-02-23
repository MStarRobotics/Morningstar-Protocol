import React from 'react';
import ReactDOM from 'react-dom/client';
import { Buffer } from 'buffer';
import { TextDecoder, TextEncoder } from 'util';
import App from './App';
import { initMonitoring } from './services/monitoring';

if (!globalThis.Buffer) {
  globalThis.Buffer = Buffer;
}

if (!globalThis.TextEncoder) {
  globalThis.TextEncoder = TextEncoder;
}

if (!globalThis.TextDecoder) {
  globalThis.TextDecoder = TextDecoder;
}

// Initialise error tracking / APM before rendering
initMonitoring();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

import { WagmiProvider } from 'wagmi';
import { QueryClientProvider } from '@tanstack/react-query';
import { wagmiAdapter, queryClient } from './config/reown';

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
