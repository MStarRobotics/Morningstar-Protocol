/**
 * WalletContext — React Context for wallet state and actions.
 *
 * Wraps walletService.ts and exposes a `useWallet()` hook to all components.
 * Handles event listeners, auto-detection, mock fallback, and network checks.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  detectWallets,
  connectWallet as rawConnect,
  getChainId,
  switchToPolygonAmoy,
  signMessage as rawSign,
  formatAddress,
  isMockMode,
  POLYGON_AMOY,
  type DetectedWallet,
} from './walletService';
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
  const [wallets, setWallets] = useState<DetectedWallet[]>([]);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeProviderRef = useRef<EthereumProvider | null>(null);
  const mockMode = isMockMode();

  // Detect wallets on mount
  useEffect(() => {
    const detected = detectWallets();
    setWallets(detected);
    logger.info(`[Wallet] Detected ${detected.length} wallet(s): ${detected.map(w => w.name).join(', ') || 'none'}`);
  }, []);

  // Event handlers (stable refs)
  const handleAccountsChanged = useCallback((accounts: string[]) => {
    if (accounts.length === 0) {
      setAddress(null);
      activeProviderRef.current = null;
      logger.info('[Wallet] Disconnected (accounts empty)');
    } else {
      setAddress(accounts[0]);
      logger.info(`[Wallet] Account changed: ${formatAddress(accounts[0])}`);
    }
  }, []);

  const handleChainChanged = useCallback((chainIdHex: string) => {
    const newChainId = parseInt(chainIdHex, 16);
    setChainId(newChainId);
    logger.info(`[Wallet] Chain changed: ${newChainId}`);
  }, []);

  const handleDisconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
    activeProviderRef.current = null;
    logger.info('[Wallet] Provider disconnected');
  }, []);

  // Subscribe / unsubscribe to wallet events
  useEffect(() => {
    const provider = activeProviderRef.current;
    if (!provider || mockMode) return;

    provider.on('accountsChanged', handleAccountsChanged);
    provider.on('chainChanged', handleChainChanged);
    provider.on('disconnect', handleDisconnect);

    return () => {
      provider.removeListener('accountsChanged', handleAccountsChanged);
      provider.removeListener('chainChanged', handleChainChanged);
      provider.removeListener('disconnect', handleDisconnect);
    };
  }, [address, mockMode, handleAccountsChanged, handleChainChanged, handleDisconnect]);

  // Connection
  const connect = useCallback(async (walletName?: string): Promise<string | null> => {
    setError(null);

    // Mock mode
    if (mockMode) {
      const mockAddr = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
      setAddress(mockAddr);
      setChainId(env.chainId);
      logger.info('[Wallet] Mock mode — connected with demo address');
      return mockAddr;
    }

    setIsConnecting(true);
    try {
      // Find the requested wallet, or use the first detected
      let wallet: DetectedWallet | undefined;
      if (walletName) {
        wallet = wallets.find(w => w.name === walletName);
      }
      if (!wallet && wallets.length > 0) {
        wallet = wallets[0];
      }
      if (!wallet) {
        throw new Error('No wallet detected. Please install MetaMask or another Web3 wallet.');
      }

      activeProviderRef.current = wallet.provider;
      const addr = await rawConnect(wallet.provider);
      setAddress(addr);

      // Read chain ID
      const currentChainId = await getChainId(wallet.provider);
      setChainId(currentChainId);

      // Auto-switch to correct network if needed
      if (currentChainId !== env.chainId) {
        try {
          await switchToPolygonAmoy(wallet.provider);
          const updatedChainId = await getChainId(wallet.provider);
          setChainId(updatedChainId);
        } catch (switchErr) {
          logger.warn('[Wallet] Network switch declined or failed', switchErr);
          // Don't fail the connection — just warn about wrong network
        }
      }

      logger.info(`[Wallet] Connected: ${formatAddress(addr)} via ${wallet.name}`);
      return addr;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Wallet connection failed';
      setError(message);
      logger.error('[Wallet] Connection error:', err);
      return null;
    } finally {
      setIsConnecting(false);
    }
  }, [wallets, mockMode]);

  const disconnect = useCallback(() => {
    const provider = activeProviderRef.current;
    if (provider) {
      provider.removeListener('accountsChanged', handleAccountsChanged);
      provider.removeListener('chainChanged', handleChainChanged);
      provider.removeListener('disconnect', handleDisconnect);
    }
    activeProviderRef.current = null;
    setAddress(null);
    setChainId(null);
    setError(null);
    logger.info('[Wallet] Disconnected');
  }, [handleAccountsChanged, handleChainChanged, handleDisconnect]);

  const switchNetwork = useCallback(async () => {
    const provider = activeProviderRef.current;
    if (!provider || mockMode) return;
    try {
      await switchToPolygonAmoy(provider);
      const newChainId = await getChainId(provider);
      setChainId(newChainId);
    } catch (err) {
      logger.error('[Wallet] Network switch failed:', err);
      setError('Failed to switch network');
    }
  }, [mockMode]);

  const signMessageFn = useCallback(async (message: string): Promise<string> => {
    if (mockMode || !activeProviderRef.current || !address) {
      // Return mock signature
      return '0x' + Array.from({ length: 130 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    }
    return rawSign(activeProviderRef.current, message, address);
  }, [address, mockMode]);

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
