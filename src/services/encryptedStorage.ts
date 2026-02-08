/**
 * Encrypted Storage Service
 *
 * AES-256-GCM encrypted wrapper around localStorage for sensitive data.
 * Uses PBKDF2 key derivation from a user-provided passphrase (or app secret).
 * Each value is encrypted with a unique IV to prevent ciphertext analysis.
 *
 * Storage format per key:
 *   base64( IV (12 bytes) || ciphertext || authTag (16 bytes) )
 *
 * References:
 *  - Web Crypto API: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto
 *  - AES-GCM: NIST SP 800-38D
 *  - PBKDF2: RFC 8018
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PBKDF2_ITERATIONS = 310_000; // OWASP 2023 recommendation for SHA-256
const KEY_LENGTH = 256; // AES-256
const IV_LENGTH = 12; // bytes, recommended for GCM
const SALT_KEY = '__enc_storage_salt__';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Get or create a persistent salt for PBKDF2 key derivation.
 * The salt is stored unencrypted in localStorage (this is safe —
 * salts prevent rainbow-table attacks and don't need secrecy).
 */
function getOrCreateSalt(): Uint8Array {
  const existing = localStorage.getItem(SALT_KEY);
  if (existing) {
    return fromBase64(existing);
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(SALT_KEY, toBase64(salt.buffer));
  return salt;
}

// ---------------------------------------------------------------------------
// EncryptedStorage Class
// ---------------------------------------------------------------------------

export class EncryptedStorage {
  private keyPromise: Promise<CryptoKey> | null = null;
  private passphrase: string;

  /**
   * @param passphrase - Used for PBKDF2 key derivation. In production this
   *   should come from user authentication (e.g. wallet signature, password).
   *   For app-level encryption, a static app secret can be used.
   */
  constructor(passphrase: string) {
    this.passphrase = passphrase;
  }

  // -----------------------------------------------------------------------
  // Key Derivation
  // -----------------------------------------------------------------------

  private async deriveKey(): Promise<CryptoKey> {
    if (this.keyPromise) return this.keyPromise;

    this.keyPromise = (async () => {
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(this.passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
      );

      const salt = getOrCreateSalt();

      return crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt,
          iterations: PBKDF2_ITERATIONS,
          hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: KEY_LENGTH },
        false,
        ['encrypt', 'decrypt']
      );
    })();

    return this.keyPromise;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Encrypt and store a value in localStorage.
   */
  async setItem(key: string, value: unknown): Promise<void> {
    const cryptoKey = await this.deriveKey();
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoder = new TextEncoder();
    const plaintext = encoder.encode(JSON.stringify(value));

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      plaintext
    );

    // Prepend IV to ciphertext: IV || encrypted
    const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.byteLength);

    localStorage.setItem(key, toBase64(combined.buffer));
  }

  /**
   * Retrieve and decrypt a value from localStorage.
   * Returns null if the key doesn't exist or decryption fails.
   */
  async getItem<T = unknown>(key: string): Promise<T | null> {
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    try {
      const cryptoKey = await this.deriveKey();
      const combined = fromBase64(stored);

      const iv = combined.slice(0, IV_LENGTH);
      const ciphertext = combined.slice(IV_LENGTH);

      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        ciphertext
      );

      const decoder = new TextDecoder();
      return JSON.parse(decoder.decode(plaintext)) as T;
    } catch {
      // Decryption failed — data may be corrupted or key changed
      // Remove the corrupt entry to avoid repeated failures
      localStorage.removeItem(key);
      return null;
    }
  }

  /**
   * Remove an item from localStorage.
   */
  removeItem(key: string): void {
    localStorage.removeItem(key);
  }

  /**
   * Check if a key exists in localStorage.
   */
  hasItem(key: string): boolean {
    return localStorage.getItem(key) !== null;
  }

  /**
   * Clear the derived key cache (e.g. on logout).
   */
  clearKeyCache(): void {
    this.keyPromise = null;
  }
}

// ---------------------------------------------------------------------------
// Default Instance
// ---------------------------------------------------------------------------

/**
 * App-level encrypted storage instance.
 * Uses a static passphrase for encrypting sensitive data at rest.
 * In production with user auth, create per-user instances with
 * user-derived passphrases.
 */
let _defaultInstance: EncryptedStorage | null = null;

export function getEncryptedStorage(): EncryptedStorage {
  if (!_defaultInstance) {
    // Derive passphrase from a combination of app identity + origin
    // This provides per-origin isolation. For stronger security,
    // use user credentials or wallet signatures as the passphrase.
    const passphrase = `morningstar-credentials::${location.origin}::v1`;
    _defaultInstance = new EncryptedStorage(passphrase);
  }
  return _defaultInstance;
}

/**
 * Create a user-scoped encrypted storage instance.
 * Use this when user credentials are available for stronger key derivation.
 */
export function createUserEncryptedStorage(userDid: string): EncryptedStorage {
  return new EncryptedStorage(`morningstar::${userDid}::${location.origin}`);
}
