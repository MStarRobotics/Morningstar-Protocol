/**
 * Cryptographic Suite Adapters for W3C Verifiable Credentials
 *
 * Bridges the existing cryptography.ts (Web Crypto API / ECDSA P-256) to the
 * key pair formats expected by the @digitalcredentials ecosystem, and adds
 * Ed25519 support via @noble/ed25519 (pure JS, browser-safe).
 *
 * Supports:
 * - Ed25519 key generation, signing, verification
 * - ECDSA P-256 (via existing cryptography.ts)
 * - Key serialization: multibase, hex, JWK
 */

import * as ed from '@noble/ed25519';
import {
  sha256,
  generateKeyPair as generateP256KeyPair,
  createSignature,
  verifySignature,
} from '../cryptography';
import type { VCKeyPair, ProofType } from './types';
import { logger } from '../logger';

// @noble/ed25519 v3 uses async-only APIs and includes its own SHA-512.
// No additional sha512 configuration is needed.

// ---------------------------------------------------------------------------
// Ed25519 Key Operations
// ---------------------------------------------------------------------------

/**
 * Generate an Ed25519 key pair for signing W3C Verifiable Credentials.
 */
export async function generateEd25519KeyPair(controller: string): Promise<VCKeyPair> {
  const privateKeyBytes = ed.utils.randomSecretKey();
  const publicKeyBytes = await ed.getPublicKeyAsync(privateKeyBytes);

  const publicKeyHex = bytesToHex(publicKeyBytes);
  const publicKeyMultibase = 'z' + bytesToBase58(publicKeyBytes);

  return {
    id: `${controller}#key-ed25519-1`,
    type: 'Ed25519',
    controller,
    publicKeyMultibase,
    publicKeyHex: '0x' + publicKeyHex,
    privateKey: privateKeyBytes,
    publicKey: publicKeyBytes,
  };
}

/**
 * Sign data with an Ed25519 private key.
 */
export async function signEd25519(
  data: string | Uint8Array,
  privateKey: Uint8Array,
): Promise<Uint8Array> {
  const message = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return await ed.signAsync(message, privateKey);
}

/**
 * Verify an Ed25519 signature.
 */
export async function verifyEd25519(
  data: string | Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array,
): Promise<boolean> {
  const message = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return await ed.verifyAsync(signature, message, publicKey);
}

// ---------------------------------------------------------------------------
// ECDSA P-256 Key Operations (delegates to existing cryptography.ts)
// ---------------------------------------------------------------------------

/**
 * Generate an ECDSA P-256 key pair (wraps existing cryptography.ts).
 */
export async function generateP256VCKeyPair(controller: string): Promise<VCKeyPair> {
  const keyPair = await generateP256KeyPair();

  return {
    id: `${controller}#key-p256-1`,
    type: 'P-256',
    controller,
    publicKeyHex: keyPair.publicKeyHex,
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
  };
}

/**
 * Sign data with ECDSA P-256 (wraps existing cryptography.ts).
 */
export async function signP256(data: string, privateKey: CryptoKey): Promise<string> {
  return await createSignature(data, privateKey);
}

/**
 * Verify an ECDSA P-256 signature (wraps existing cryptography.ts).
 */
export async function verifyP256(
  data: string,
  signature: string,
  publicKey: CryptoKey,
): Promise<boolean> {
  return await verifySignature(data, signature, publicKey);
}

// ---------------------------------------------------------------------------
// Unified Key Factory
// ---------------------------------------------------------------------------

/**
 * Generate a key pair based on the desired proof type.
 */
export async function generateKeyPairForProof(
  controller: string,
  proofType: ProofType = 'Ed25519Signature2020',
): Promise<VCKeyPair> {
  switch (proofType) {
    case 'Ed25519Signature2020':
    case 'DataIntegrityProof':
      return generateEd25519KeyPair(controller);
    case 'EcdsaSecp256k1Signature2019':
    case 'JsonWebSignature2020':
      return generateP256VCKeyPair(controller);
    default:
      return generateEd25519KeyPair(controller);
  }
}

/**
 * Create a cryptographic proof for a verifiable credential.
 * Returns the proof object to be attached to the credential.
 */
export async function createProof(
  data: string,
  keyPair: VCKeyPair,
  proofPurpose: string = 'assertionMethod',
  challenge?: string,
  domain?: string,
): Promise<{
  type: string;
  created: string;
  verificationMethod: string;
  proofPurpose: string;
  proofValue: string;
  challenge?: string;
  domain?: string;
}> {
  let proofValue: string;
  let proofType: string;

  const dataToSign = challenge ? data + challenge : data;

  if (keyPair.type === 'Ed25519' && keyPair.privateKey instanceof Uint8Array) {
    const signatureBytes = await signEd25519(dataToSign, keyPair.privateKey);
    proofValue = 'z' + bytesToBase58(signatureBytes);
    proofType = 'Ed25519Signature2020';
  } else if (keyPair.privateKey instanceof CryptoKey) {
    const signatureHex = await signP256(dataToSign, keyPair.privateKey);
    proofValue = signatureHex;
    proofType = 'EcdsaSecp256k1Signature2019';
  } else {
    // Fallback: hash-based proof for demo
    proofValue = await sha256(dataToSign + keyPair.id);
    proofType = 'DataIntegrityProof';
  }

  return {
    type: proofType,
    created: new Date().toISOString(),
    verificationMethod: keyPair.id,
    proofPurpose,
    proofValue,
    ...(challenge && { challenge }),
    ...(domain && { domain }),
  };
}

/**
 * Verify a cryptographic proof attached to a credential.
 */
export async function verifyProof(
  data: string,
  proof: {
    type: string;
    proofValue: string;
    verificationMethod: string;
    challenge?: string;
  },
  publicKey: Uint8Array | CryptoKey,
): Promise<boolean> {
  const dataToVerify = proof.challenge ? data + proof.challenge : data;

  try {
    if (proof.type === 'Ed25519Signature2020' && publicKey instanceof Uint8Array) {
      const signatureBytes = base58ToBytes(proof.proofValue.replace(/^z/, ''));
      return await verifyEd25519(dataToVerify, signatureBytes, publicKey);
    } else if (publicKey instanceof CryptoKey) {
      return await verifyP256(dataToVerify, proof.proofValue, publicKey);
    }
  } catch (error) {
    logger.error('[CryptoSuites] Proof verification error:', error);
  }

  return false;
}

// ---------------------------------------------------------------------------
// Key Serialization Helpers
// ---------------------------------------------------------------------------

/** Convert bytes to hex string. */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Convert hex string to bytes. */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.replace(/^0x/, '');
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Base58 alphabet (Bitcoin)
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Convert bytes to base58 string using BigInt. */
export function bytesToBase58(bytes: Uint8Array): string {
  let x = BigInt(0);
  for (const byte of bytes) {
    x = x * 256n + BigInt(byte);
  }

  let output = '';
  while (x > 0n) {
    const mod = Number(x % 58n);
    x = x / 58n;
    output = BASE58_ALPHABET[mod] + output;
  }

  // Leading zeros
  for (const byte of bytes) {
    if (byte === 0) output = BASE58_ALPHABET[0] + output;
    else break;
  }

  return output;
}

/** Convert base58 string to bytes using BigInt. */
export function base58ToBytes(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array(0);

  let x = BigInt(0);
  for (const char of str) {
    const value = BASE58_ALPHABET.indexOf(char);
    if (value < 0) throw new Error(`Invalid base58 character: ${char}`);
    x = x * 58n + BigInt(value);
  }

  const bytes: number[] = [];
  while (x > 0n) {
    bytes.unshift(Number(x % 256n));
    x = x / 256n;
  }

  // Leading ones (which map to zero bytes)
  for (const char of str) {
    if (char === BASE58_ALPHABET[0]) bytes.unshift(0);
    else break;
  }

  return new Uint8Array(bytes);
}

/**
 * Export a key pair to JWK format (for interoperability).
 */
export async function keyPairToJWK(keyPair: VCKeyPair): Promise<JsonWebKey | null> {
  if (keyPair.publicKey instanceof CryptoKey) {
    try {
      return await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    } catch {
      return null;
    }
  }

  if (keyPair.type === 'Ed25519' && keyPair.publicKey instanceof Uint8Array) {
    // Ed25519 JWK format (OKP curve)
    return {
      kty: 'OKP',
      crv: 'Ed25519',
      x: uint8ArrayToBase64Url(keyPair.publicKey),
    };
  }

  return null;
}

/** Convert Uint8Array to base64url string (for JWK). */
function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
