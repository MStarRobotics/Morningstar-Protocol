/**
 * EIP-1193 Ethereum Provider type declarations.
 * Augments the global Window interface with `window.ethereum`.
 */

interface EthereumProvider {
  /** EIP-1193 JSON-RPC request */
  request<T = unknown>(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<T>;

  /** Subscribe to provider events */
  on(event: 'accountsChanged', handler: (accounts: string[]) => void): void;
  on(event: 'chainChanged', handler: (chainId: string) => void): void;
  on(event: 'disconnect', handler: (error: { code: number; message: string }) => void): void;
  on(event: 'connect', handler: (info: { chainId: string }) => void): void;
  on(event: string, handler: (...args: unknown[]) => void): void;

  /** Unsubscribe from provider events */
  removeListener(event: string, handler: (...args: unknown[]) => void): void;

  /** Multi-wallet support (EIP-6963 compat) */
  providers?: EthereumProvider[];

  /** Wallet identification flags */
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isBraveWallet?: boolean;
  isTrust?: boolean;
  isRabby?: boolean;
  isPhantom?: boolean;
  isOkxWallet?: boolean;

  /** Some wallets expose selectedAddress */
  selectedAddress?: string | null;
}

interface Window {
  ethereum?: EthereumProvider;
}
