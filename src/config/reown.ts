import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { polygonAmoy } from '@reown/appkit/networks';
import { QueryClient } from '@tanstack/react-query';
import { env } from '../services/env';

// 1. Get projectId from env
const projectId = env.reownProjectId || 'b56e18d47c72ab683b10814fe9495694'; // Fallback to provided ID or placeholder

// 2. Create a metadata object - optional
const metadata = {
  name: 'Morningstar Credentials',
  description: 'Verifiable Credentials Ecosystem',
  url: 'https://morningstar.app', // origin must match your domain & subdomain
  icons: ['https://avatars.githubusercontent.com/u/179229932'],
};

// 3. Set the networks
export const networks = [polygonAmoy] as [typeof polygonAmoy];

// 4. Create Wagmi Adapter
export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true,
});

// 5. Create Query Client
export const queryClient = new QueryClient();

// 6. Create the AppKit instance
createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata,
  features: {
    analytics: true,
    socials: ['google', 'x', 'github', 'discord', 'apple'],
    email: false, // Student verification now uses server-side institutional email flow
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#00ff41', // Matrix/Cyberpunk Green
    '--w3m-border-radius-master': '1px',
    '--w3m-font-family': 'JetBrains Mono, monospace',
  },
});
