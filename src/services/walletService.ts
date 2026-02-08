/**
 * Wallet Service — Pure EIP-1193 wallet detection and interaction.
 *
 * No React, no singletons. Every function takes an explicit provider
 * parameter so the caller (WalletContext) controls which wallet is used.
 */

import { env } from './env';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DetectedWallet {
  name: string;
  icon: string;            // emoji or Material Symbols icon name
  provider: EthereumProvider;
}

export const POLYGON_AMOY = {
  chainId: '0x13882',                         // 80002
  chainName: 'Polygon Amoy Testnet',
  nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
  rpcUrls: [env.rpcUrl || 'https://rpc-amoy.polygon.technology'],
  blockExplorerUrls: ['https://amoy.polygonscan.com/'],
} as const;

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Returns all injected EIP-1193 wallets found in the browser. */
export function detectWallets(): DetectedWallet[] {
  if (typeof window === 'undefined' || !window.ethereum) return [];

  const wallets: DetectedWallet[] = [];
  const providers = window.ethereum.providers ?? [window.ethereum];

  for (const provider of providers) {
    const wallet = identifyProvider(provider);
    if (wallet) wallets.push(wallet);
  }

  // Deduplicate by name (some browsers inject duplicate providers)
  const seen = new Set<string>();
  return wallets.filter(w => {
    if (seen.has(w.name)) return false;
    seen.add(w.name);
    return true;
  });
}

/** Identify a single EIP-1193 provider by its feature flags. */
function identifyProvider(provider: EthereumProvider): DetectedWallet | null {
  if (provider.isPhantom) {
    return { name: 'Phantom', icon: 'account_balance_wallet', provider };
  }
  if (provider.isRabby) {
    return { name: 'Rabby', icon: 'account_balance_wallet', provider };
  }
  if (provider.isCoinbaseWallet) {
    return { name: 'Coinbase Wallet', icon: 'account_balance_wallet', provider };
  }
  if (provider.isBraveWallet) {
    return { name: 'Brave Wallet', icon: 'shield', provider };
  }
  if (provider.isTrust) {
    return { name: 'Trust Wallet', icon: 'verified_user', provider };
  }
  if (provider.isOkxWallet) {
    return { name: 'OKX Wallet', icon: 'account_balance_wallet', provider };
  }
  if (provider.isMetaMask) {
    return { name: 'MetaMask', icon: 'account_balance_wallet', provider };
  }
  // Generic fallback — still an EIP-1193 provider
  if (typeof provider.request === 'function') {
    return { name: 'Browser Wallet', icon: 'account_balance_wallet', provider };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/**
 * Request account access from the provider (triggers wallet popup).
 * Returns the first connected address (checksummed).
 */
export async function connectWallet(provider: EthereumProvider): Promise<string> {
  const accounts = await provider.request<string[]>({ method: 'eth_requestAccounts' });
  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts returned by wallet');
  }
  return accounts[0];
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

/** Get the current chain ID as a decimal number. */
export async function getChainId(provider: EthereumProvider): Promise<number> {
  const hex = await provider.request<string>({ method: 'eth_chainId' });
  return parseInt(hex, 16);
}

/**
 * Switch to Polygon Amoy. If the chain is unknown to the wallet,
 * attempt to add it first via `wallet_addEthereumChain`.
 */
export async function switchToPolygonAmoy(provider: EthereumProvider): Promise<void> {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: POLYGON_AMOY.chainId }],
    });
  } catch (err: unknown) {
    const error = err as { code?: number };
    // 4902 = chain not added to wallet
    if (error.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: POLYGON_AMOY.chainId,
          chainName: POLYGON_AMOY.chainName,
          nativeCurrency: POLYGON_AMOY.nativeCurrency,
          rpcUrls: [...POLYGON_AMOY.rpcUrls],
          blockExplorerUrls: [...POLYGON_AMOY.blockExplorerUrls],
        }],
      });
    } else {
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

/**
 * Request a personal_sign from the connected wallet.
 * Returns the hex signature string.
 */
export async function signMessage(provider: EthereumProvider, message: string, address: string): Promise<string> {
  const signature = await provider.request<string>({
    method: 'personal_sign',
    params: [message, address],
  });
  return signature;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Format a full address to `0x71C...9A23` style. */
export function formatAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 5)}...${address.slice(-4)}`;
}

/** Check whether we should use mock mode. */
export function isMockMode(): boolean {
  if (env.walletMockMode === 'always') return true;
  if (env.walletMockMode === 'never') return false;
  // 'auto' — mock only when no wallet is injected
  return typeof window === 'undefined' || !window.ethereum;
}
