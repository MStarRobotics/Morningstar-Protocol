/**
 * Runtime Package Detection & Graceful Degradation
 *
 * Detects which W3C VC packages are available at runtime and provides
 * fallback implementations when packages fail to load.
 * Ensures the application never breaks due to package incompatibilities.
 */

import type { EngineStatus } from './types';
import { logger } from '../logger';

// ---------------------------------------------------------------------------
// Package availability cache
// ---------------------------------------------------------------------------

let _engineStatus: EngineStatus | null = null;

// Package module references (populated by detectEngines)
let _dcVc: any = null;
let _dcJsonld: any = null;
let _dcJsonldSignatures: any = null;
let _dcEd25519Signature2020: any = null;
let _nobleEd25519: any = null;
let _didJwtVc: any = null;

// ---------------------------------------------------------------------------
// Engine Detection
// ---------------------------------------------------------------------------

/**
 * Detect which VC engines / packages are available in the current runtime.
 * Uses dynamic imports so missing packages do not cause build errors.
 */
export async function detectEngines(): Promise<EngineStatus> {
  if (_engineStatus) return _engineStatus;

  const status: EngineStatus = {
    digitalCredentialsVC: false,
    digitalCredentialsVerifier: false,
    nobleEd25519: false,
    didJwtVc: false,
    nativeWebCrypto: typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined',
  };

  // @digitalcredentials/vc
  try {
    _dcVc = await import('@digitalcredentials/vc');
    status.digitalCredentialsVC = true;
  } catch {
    logger.warn('[PackageBridge] @digitalcredentials/vc not available, using native implementation');
  }

  // @digitalcredentials/jsonld
  try {
    _dcJsonld = await import('@digitalcredentials/jsonld');
  } catch {
    // Not critical - documentLoader handles context resolution
  }

  // @digitalcredentials/jsonld-signatures
  try {
    _dcJsonldSignatures = await import('@digitalcredentials/jsonld-signatures');
  } catch {
    // Fallback to native signing
  }

  // @digitalcredentials/ed25519-signature-2020
  try {
    _dcEd25519Signature2020 = await import('@digitalcredentials/ed25519-signature-2020');
  } catch {
    // Fallback to @noble/ed25519
  }

  // @noble/ed25519
  try {
    _nobleEd25519 = await import('@noble/ed25519');
    status.nobleEd25519 = true;
  } catch {
    logger.warn('[PackageBridge] @noble/ed25519 not available');
  }

  // did-jwt-vc
  try {
    _didJwtVc = await import('did-jwt-vc');
    status.didJwtVc = true;
  } catch {
    logger.warn('[PackageBridge] did-jwt-vc not available, JWT-VC format disabled');
  }

  _engineStatus = status;
  return status;
}

// ---------------------------------------------------------------------------
// Package Accessors
// ---------------------------------------------------------------------------

/** Get the @digitalcredentials/vc module (or null if unavailable). */
export function getDigitalCredentialsVC(): any | null {
  return _dcVc;
}

/** Get the @digitalcredentials/jsonld module (or null). */
export function getDigitalCredentialsJsonld(): any | null {
  return _dcJsonld;
}

/** Get the @digitalcredentials/jsonld-signatures module (or null). */
export function getJsonldSignatures(): any | null {
  return _dcJsonldSignatures;
}

/** Get the @digitalcredentials/ed25519-signature-2020 module (or null). */
export function getEd25519Signature2020(): any | null {
  return _dcEd25519Signature2020;
}

/** Get the did-jwt-vc module (or null). */
export function getDidJwtVc(): any | null {
  return _didJwtVc;
}

/** Get the @noble/ed25519 module (or null). */
export function getNobleEd25519(): any | null {
  return _nobleEd25519;
}

// ---------------------------------------------------------------------------
// Engine Status
// ---------------------------------------------------------------------------

/**
 * Get the current engine availability status.
 * Calls detectEngines() on first invocation.
 */
export async function getEngineStatus(): Promise<EngineStatus> {
  if (!_engineStatus) {
    await detectEngines();
  }
  return _engineStatus!;
}

/**
 * Get a human-readable summary of available engines.
 */
export async function getEngineReport(): Promise<string[]> {
  const status = await getEngineStatus();
  const report: string[] = [];

  if (status.digitalCredentialsVC) {
    report.push('[OK] @digitalcredentials/vc - W3C VC issuance & verification');
  } else {
    report.push('[FALLBACK] @digitalcredentials/vc - using native implementation');
  }

  if (status.nobleEd25519) {
    report.push('[OK] @noble/ed25519 - Ed25519 cryptography');
  } else {
    report.push('[MISSING] @noble/ed25519 - Ed25519 signing unavailable');
  }

  if (status.didJwtVc) {
    report.push('[OK] did-jwt-vc - JWT-VC format support');
  } else {
    report.push('[DISABLED] did-jwt-vc - JWT credential format unavailable');
  }

  if (status.nativeWebCrypto) {
    report.push('[OK] Web Crypto API - ECDSA P-256 available');
  } else {
    report.push('[MISSING] Web Crypto API - limited crypto support');
  }

  return report;
}

/**
 * Reset cached engine status (useful for testing).
 */
export function resetEngineCache(): void {
  _engineStatus = null;
  _dcVc = null;
  _dcJsonld = null;
  _dcJsonldSignatures = null;
  _dcEd25519Signature2020 = null;
  _nobleEd25519 = null;
  _didJwtVc = null;
}
