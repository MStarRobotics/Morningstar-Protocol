/**
 * Production-Grade Cryptography Service
 * Implements SHA-256, ECC, and cryptographic operations as per ZKBAR-V standards
 * Based on: MDPI Sensors 2025 - Zero-Knowledge Proof-Enabled Blockchain Academic Verification
 */

import { logger } from './logger';

/**
 * Custom error class for cryptographic operations
 */
export class CryptoError extends Error {
  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
    this.name = 'CryptoError';
  }
}

/**
 * SHA-256 Hash Implementation (Browser-Compatible)
 */
export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate Cryptographic Keypair (ECC - Elliptic Curve Cryptography)
 * Uses P-256 curve for production-grade security
 */
export async function generateKeyPair(): Promise<{
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicKeyHex: string;
}> {
  try {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256'
      },
      true,
      ['sign', 'verify']
    );

    // Export public key for display
    const publicKeyBuffer = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    const publicKeyArray = Array.from(new Uint8Array(publicKeyBuffer));
    const publicKeyHex = publicKeyArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      publicKeyHex: '0x' + publicKeyHex.slice(0, 40) // Shortened for display
    };
  } catch (error) {
    throw new CryptoError('Key generation failed: Web Crypto API unavailable or unsupported', {
      cause: error as Error
    });
  }
}

/**
 * Digital Signature Creation using ECDSA
 */
export async function createSignature(
  data: string,
  privateKey: CryptoKey
): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    
    const signature = await crypto.subtle.sign(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' }
      },
      privateKey,
      dataBuffer
    );

    const signatureArray = Array.from(new Uint8Array(signature));
    return '0x' + signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    throw new CryptoError('Signature creation failed: Invalid private key or crypto operation failed', {
      cause: error as Error
    });
  }
}

/**
 * Verify Digital Signature
 */
export async function verifySignature(
  data: string,
  signature: string,
  publicKey: CryptoKey
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    
    // Remove '0x' prefix and convert hex to bytes
    const signatureHex = signature.replace('0x', '');
    const signatureArray = new Uint8Array(
      signatureHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
    );

    const isValid = await crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' }
      },
      publicKey,
      signatureArray,
      dataBuffer
    );

    return isValid;
  } catch (error) {
    throw new CryptoError('Signature verification failed: Malformed signature or invalid public key', {
      cause: error as Error
    });
  }
}

/**
 * Generate Merkle Root for batch credential verification
 * Implements efficient verification of multiple credentials
 */
export async function generateMerkleRoot(credentialHashes: string[]): Promise<string> {
  if (credentialHashes.length === 0) return await sha256('empty');
  if (credentialHashes.length === 1) return credentialHashes[0];

  const hashes = [...credentialHashes];
  
  while (hashes.length > 1) {
    const newLevel: string[] = [];
    
    for (let i = 0; i < hashes.length; i += 2) {
      if (i + 1 < hashes.length) {
        const combined = hashes[i] + hashes[i + 1];
        newLevel.push(await sha256(combined));
      } else {
        newLevel.push(hashes[i]);
      }
    }
    
    hashes.length = 0;
    hashes.push(...newLevel);
  }
  
  return hashes[0];
}

/**
 * Encrypt data using AES-GCM (for private blockchain)
 */
export async function encryptData(
  data: string,
  key: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  try {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      dataBuffer
    );

    const ciphertextArray = Array.from(new Uint8Array(encrypted));
    const ivArray = Array.from(iv);

    return {
      ciphertext: ciphertextArray.map(b => b.toString(16).padStart(2, '0')).join(''),
      iv: ivArray.map(b => b.toString(16).padStart(2, '0')).join('')
    };
  } catch (error) {
    logger.error('Encryption error:', error);
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt data using AES-GCM
 */
export async function decryptData(
  ciphertext: string,
  iv: string,
  key: CryptoKey
): Promise<string> {
  try {
    const ciphertextArray = new Uint8Array(
      ciphertext.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
    );
    const ivArray = new Uint8Array(
      iv.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
    );

    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivArray
      },
      key,
      ciphertextArray
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    logger.error('Decryption error:', error);
    throw new Error('Decryption failed');
  }
}

/**
 * Generate AES Key for encryption
 */
export async function generateAESKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256
    },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generate secure random nonce for transactions
 */
export function generateNonce(): string {
  const array = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate Credential Hash Integrity
 */
export async function validateCredentialHash(
  credentialData: unknown,
  storedHash: string
): Promise<boolean> {
  const computedHash = await sha256(JSON.stringify(credentialData));
  return computedHash === storedHash;
}

/**
 * Create Content Identifier (CID) for IPFS-style addressing
 */
export async function generateCID(content: string): Promise<string> {
  const hash = await sha256(content);
  return 'Qm' + hash.slice(0, 44); // Simulated CIDv0 format
}
