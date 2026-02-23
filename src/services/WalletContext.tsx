/**
 * WalletContext — React Context for wallet state and actions.
 *
 * Wraps walletService.ts and exposes a `useWallet()` hook to all components.
 * Handles event listeners, auto-detection, mock fallback, and network checks.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { detectWallets, formatAddress, isMockMode, type DetectedWallet } from './walletService';
import {
  useAppKit,
  useAppKitAccount,
  useAppKitNetwork,
  useWalletInfo,
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
  const { open, close } = useAppKit();
  const { address: appKitAddress, isConnected, status } = useAppKitAccount();
  const { chainId: appKitChainId } = useAppKitNetwork();
  const { walletInfo } = useWalletInfo();

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
    async (walletName?: string): Promise<string | null> => {
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
      await useDisconnect().disconnect();
    } catch (e) {
      logger.warn('Disconnect failed', e);
    }
  }, [mockMode]);

  const switchNetwork = useCallback(async () => {
    if (mockMode) return;
    try {
      await useAppKitNetwork().switchNetwork(polygonAmoy);
    } catch (err) {
      logger.error('[Wallet] Network switch failed:', err);
      setError('Failed to switch network');
    }
  }, [mockMode]);

  const signMessageFn = useCallback(
    async (message: string): Promise<string> => {
      if (mockMode || !address) {
        return (
          '0x' +
          Array.from({ length: 130 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
        );
      }
      // Use Wagmi's signMessage or similar. For now, we might need to use the wagmi adapter's signer
      // or just use the hook in the component.
      // Since this is a context method, we need a way to invoke signing.
      // simpler to throw an error "Use useSignMessage hook directly" or implement via wagmi config
      throw new Error(
        "Please use simple 'useSignMessage' hook from wagmi directly in components for now, or updating this context to wrap it.",
      );
    },
    [address, mockMode],
  );

  const isCorrectNetwork = chainId === env.chainId;
  const displayAddress = address ? formatAddress(address) : '';

  const value: WalletState = {
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
  };

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
