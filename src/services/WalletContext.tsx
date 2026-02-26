/**
 * WalletContext — React Context for wallet state and actions.
 *
 * Wraps walletService.ts and exposes a `useWallet()` hook to all components.
 * Handles event listeners, auto-detection, mock fallback, and network checks.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { detectWallets, formatAddress, isMockMode, type DetectedWallet } from './walletService';
import {
  useAppKit,
  useAppKitAccount,
  useAppKitNetwork,
  useDisconnect,
} from '@reown/appkit/react';
import { polygonAmoy } from '@reown/appkit/networks';
import { env } from './env';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WalletState {
  /** Detected wallets in the browser */
  wallets: DetectedWallet[];
  /** Connected address (null if disconnected) */
  address: string | null;
  /** Formatted address for display */
  displayAddress: string;
  /** Current chain ID (decimal) */
  chainId: number | null;
  /** Whether the connected chain matches Polygon Amoy */
  isCorrectNetwork: boolean;
  /** Whether a connection is in progress */
  isConnecting: boolean;
  /** Whether we're in mock mode */
  isMock: boolean;
  /** Last error message */
  error: string | null;
  /** Connect to a specific wallet (by name) or the first available */
  connect: (walletName?: string) => Promise<string | null>;
  /** Disconnect (clears local state; wallet remains authorized) */
  disconnect: () => void;
  /** Switch to Polygon Amoy */
  switchNetwork: () => Promise<void>;
  /** Sign a message with the connected wallet */
  signMessage: (message: string) => Promise<string>;
}

const WalletContext = createContext<WalletState | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Reown AppKit Hooks
  const { open } = useAppKit();
  const { address: appKitAddress, isConnected, status } = useAppKitAccount();
  const { chainId: appKitChainId, switchNetwork: appKitSwitchNetwork } = useAppKitNetwork();
  const { disconnect: appKitDisconnect } = useDisconnect();

  // Local state to maintain compatibility with existing context interface
  const [wallets, setWallets] = useState<DetectedWallet[]>([]);
  const [error, setError] = useState<string | null>(null);

  const mockMode = isMockMode();

  // Sync AppKit state to local state
  const isConnecting = status === 'connecting' || status === 'reconnecting';
  const address = isConnected && appKitAddress ? appKitAddress : null;
  const chainId = isConnected && appKitChainId ? Number(appKitChainId) : null;

  // Detect wallets on mount (keep existing detection for "Browser Wallet" listing if needed,
  // though AppKit handles the main connection)
  useEffect(() => {
    const detected = detectWallets();
    setWallets(detected);
  }, []);

  // Connection
  const connect = useCallback(
    async (_walletName?: string): Promise<string | null> => {
      setError(null);

      // Mock mode
      if (mockMode) {
        // ... keep mock logic ...
        const mockAddr = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
        logger.info('[Wallet] Mock mode — connected with demo address');
        return mockAddr;
      }

      try {
        // Trigger Reown Modal
        await open();

        // We can't easily return the address immediately here because open()
        // is void and connection is async via events.
        // The calling code should rely on the `address` state, not this return value.
        return null;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Wallet connection failed';
        setError(message);
        logger.error('[Wallet] Connection error:', err);
        return null;
      }
    },
    [mockMode, open],
  );

  const disconnect = useCallback(async () => {
    if (mockMode) {
      // reset local mock state if any
      return;
    }
    try {
      await appKitDisconnect();
    } catch (e) {
      logger.warn('Disconnect failed', e);
    }
  }, [appKitDisconnect, mockMode]);

  const switchNetwork = useCallback(async () => {
    if (mockMode) return;
    try {
      await appKitSwitchNetwork(polygonAmoy);
    } catch (err) {
      logger.error('[Wallet] Network switch failed:', err);
      setError('Failed to switch network');
    }
  }, [appKitSwitchNetwork, mockMode]);

  const signMessageFn = useCallback(
    async (message: string): Promise<string> => {
      if (mockMode || !address) {
        return (
          '0x' +
          Array.from({ length: 130 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
        );
      }

      const provider = window.ethereum;
      if (!provider || typeof provider.request !== 'function') {
        throw new Error('No injected wallet provider available for message signing');
      }

      const signature = await provider.request<string>({
        method: 'personal_sign',
        params: [message, address],
      });

      if (typeof signature !== 'string' || !signature.startsWith('0x')) {
        throw new Error('Wallet returned an invalid signature');
      }

      return signature;
    },
    [address, mockMode],
  );

  const isCorrectNetwork = chainId === env.chainId;
  const displayAddress = address ? formatAddress(address) : '';

  const value = useMemo<WalletState>(
    () => ({
      wallets,
      address,
      displayAddress,
      chainId,
      isCorrectNetwork,
      isConnecting,
      isMock: mockMode,
      error,
      connect,
      disconnect,
      switchNetwork,
      signMessage: signMessageFn,
    }),
    [
      wallets,
      address,
      displayAddress,
      chainId,
      isCorrectNetwork,
      isConnecting,
      mockMode,
      error,
      connect,
      disconnect,
      switchNetwork,
      signMessageFn,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error('useWallet must be used within a <WalletProvider>');
  }
  return ctx;
}
