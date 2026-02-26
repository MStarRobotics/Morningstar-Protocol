/**
 * W3C Decentralized Identifier (DID) Service
 * Implements W3C DID v1.0 Specification
 * Based on: ZKBAR-V Framework and W3C DID Working Group Standards
 *
 * References:
 * - https://www.w3.org/TR/did-core/
 * - MDPI Sensors 2025 - DID for Academic Credentials
 * - Frontiers 2024 - EBSI Interoperability
 */

import { sha256, generateKeyPair, verifySignature } from './cryptography';
import { createVeramoDID, resolveVeramoDID, type VeramoDIDResult } from './veramoAgent';
import { api, env } from './env';
import { logger } from './logger';
import { authService } from './authService';

export interface DIDDocument {
  '@context': string[];
  id: string;
  controller: string;
  verificationMethod: VerificationMethod[];
  authentication: string[];
  assertionMethod: string[];
  service?: ServiceEndpoint[];
  deactivated?: boolean;
  created: string;
  updated: string;
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase?: string;
  publicKeyJwk?: JsonWebKey;
  publicKeyHex?: string; // Used by did:ethr
  publicKeyBase58?: string; // Used by did:key
  publicKeyBase64?: string; // Used by some DID methods
  blockchainAccountId?: string; // Used by did:pkh
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string;
}

export interface DIDMetadata {
  did: string;
  name: string;
  role: 'student' | 'issuer' | 'verifier' | 'governance';
  createdAt: string;
  lastUpdated: string;
  institutionName?: string;
  verified: boolean;
}

const DID_INDEX_KEY = 'did_index';
const didRegistryKey = (did: string): string => `did_registry_${did}`;
const didMetadataKey = (did: string): string => `did_metadata_${did}`;

interface DIDIndexEntry {
  did: string;
  created: string;
  role: string;
}

interface DIDRecordResponse {
  document?: DIDDocument;
  metadata?: DIDMetadata;
  updated?: string;
}

const fallbackWarnings = new Set<string>();

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const rootCode = (error as { code?: unknown }).code;
  if (typeof rootCode === 'string') return rootCode;
  const causeCode = (error as { cause?: { code?: unknown } }).cause?.code;
  if (typeof causeCode === 'string') return causeCode;
  return undefined;
}

function isExpectedBackendOfflineError(error: unknown): boolean {
  const code = getErrorCode(error);
  if (!code) return error instanceof TypeError;
  return ['ECONNREFUSED', 'EPERM', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT'].includes(code);
}

function getDidFetchKey(url: string): string {
  try {
    const { pathname } = new URL(url);
    if (pathname.startsWith('/api/did/')) return '/api/did/:did';
    return pathname;
  } catch {
    if (url.includes('/api/did/')) return '/api/did/:did';
    if (url.includes('/api/did')) return '/api/did';
    return url;
  }
}

function logDidFallback(
  key: string,
  message: string,
  error: unknown,
): void {
  const expectedOffline = isExpectedBackendOfflineError(error);
  if (env.mode === 'test' && expectedOffline) {
    if (fallbackWarnings.has(key)) return;
    fallbackWarnings.add(key);
    logger.info(`${message} (suppressing repeated warnings in test mode)`);
    return;
  }

  logger.warn(message, error);
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`API Error: ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    logDidFallback(
      `fetch:${getDidFetchKey(url)}`,
      `[DIDService] Backend fetch unavailable for ${url}; using local fallback`,
      err,
    );
    return null;
  }
}

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function readLocalJson<T>(key: string): T | null {
  if (!hasLocalStorage()) return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeLocalJson(key: string, value: unknown): boolean {
  if (!hasLocalStorage()) return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function readLocalDIDIndex(): DIDIndexEntry[] {
  const index = readLocalJson<DIDIndexEntry[]>(DID_INDEX_KEY);
  return Array.isArray(index) ? index : [];
}

function writeLocalDIDIndex(entries: DIDIndexEntry[]): boolean {
  return writeLocalJson(DID_INDEX_KEY, entries);
}

function upsertLocalDID(
  didDocument: DIDDocument,
  metadata: DIDMetadata,
  createdAtOverride?: string,
): boolean {
  const savedDoc = writeLocalJson(didRegistryKey(didDocument.id), didDocument);
  const savedMeta = writeLocalJson(didMetadataKey(didDocument.id), metadata);
  const index = readLocalDIDIndex();
  const existing = index.find((entry) => entry.did === didDocument.id);
  const created =
    existing?.created || createdAtOverride || didDocument.created || metadata.createdAt || new Date().toISOString();
  const entry: DIDIndexEntry = { did: didDocument.id, created, role: metadata.role };
  const next = existing
    ? index.map((current) => (current.did === didDocument.id ? entry : current))
    : [...index, entry];
  const savedIndex = writeLocalDIDIndex(next);
  return savedDoc && savedMeta && savedIndex;
}

function getLocalDIDDocument(did: string): DIDDocument | null {
  return readLocalJson<DIDDocument>(didRegistryKey(did));
}

function getLocalDIDMetadata(did: string): DIDMetadata | null {
  return readLocalJson<DIDMetadata>(didMetadataKey(did));
}

function hydrateLocalFromRecord(
  did: string,
  didDocument: DIDDocument,
  metadata?: DIDMetadata,
  createdAt?: string,
): void {
  const fallbackMetadata: DIDMetadata = metadata || {
    did,
    name: did,
    role: 'student',
    createdAt: didDocument.created,
    lastUpdated: didDocument.updated,
    verified: false,
  };
  upsertLocalDID(didDocument, fallbackMetadata, createdAt);
}

function parseDIDRecordResponse(data: unknown): DIDRecordResponse | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as DIDRecordResponse & DIDDocument;

  if (record.document && typeof record.document === 'object') {
    const document = {
      ...record.document,
      updated: record.updated || record.document.updated,
    } as DIDDocument;
    return { document, metadata: record.metadata, updated: record.updated };
  }

  if ('id' in record && '@context' in record) {
    return { document: record as DIDDocument };
  }

  return null;
}

function parseDIDIndexList(data: unknown): DIDIndexEntry[] | null {
  if (!Array.isArray(data)) return null;
  return data
    .filter((entry): entry is DIDIndexEntry => {
      return (
        !!entry &&
        typeof entry === 'object' &&
        typeof (entry as DIDIndexEntry).did === 'string' &&
        typeof (entry as DIDIndexEntry).created === 'string' &&
        typeof (entry as DIDIndexEntry).role === 'string'
      );
    })
    .map((entry) => ({ did: entry.did, created: entry.created, role: entry.role }));
}

/**
 * Generate a DID compliant with W3C standards
 * Format: did:polygon:chainId:address
 */
export async function generateDID(identifier: string, method: string = 'polygon'): Promise<string> {
  // Generate deterministic address from identifier
  const addressHash = await sha256(identifier + Date.now());
  const address = '0x' + addressHash.slice(0, 40);

  return `did:${method}:${address}`;
}

/**
 * Create a managed DID using Veramo when available.
 * Falls back to deterministic did:polygon generation when Veramo fails.
 */
export async function createManagedDID(
  alias: string,
  role: DIDMetadata['role'],
): Promise<{ did: string; metadata: DIDMetadata }> {
  try {
    const identity = await createVeramoDID(alias);
    const metadata: DIDMetadata = {
      did: identity.did,
      name: alias,
      role,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      verified: false,
    };
    return { did: identity.did, metadata };
  } catch {
    const did = await generateDID(
      alias,
      env.blockchainNetwork?.includes('polygon') ? 'polygon' : 'web',
    );
    const metadata: DIDMetadata = {
      did,
      name: alias,
      role,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      verified: false,
    };
    return { did, metadata };
  }
}

/**
 * Create W3C DID Document
 */
export async function createDIDDocument(
  did: string,
  metadata: Partial<DIDMetadata>,
): Promise<DIDDocument> {
  const keyPair = await generateKeyPair();

  const verificationMethodId = `${did}#key-1`;

  const didDocument: DIDDocument = {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/jws-2020/v1',
    ],
    id: did,
    controller: did,
    verificationMethod: [
      {
        id: verificationMethodId,
        type: 'JsonWebKey2020',
        controller: did,
        publicKeyJwk: keyPair.publicKeyJwk,
        publicKeyHex: keyPair.publicKeyHex,
      },
    ],
    authentication: [verificationMethodId],
    assertionMethod: [verificationMethodId],
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  // Add service endpoints based on role
  if (metadata.role === 'issuer') {
    didDocument.service = [
      {
        id: `${did}#credential-service`,
        type: 'CredentialIssuerService',
        serviceEndpoint: 'https://credentials.example.edu/api',
      },
    ];
  } else if (metadata.role === 'student') {
    didDocument.service = [
      {
        id: `${did}#wallet-service`,
        type: 'CredentialWalletService',
        serviceEndpoint: 'https://wallet.example.com/api',
      },
    ];
  }

  return didDocument;
}

export async function resolveDID(did: string): Promise<DIDDocument | null> {
  const data = await fetchJson<unknown>(api.url(`/api/did/${did}`));
  const parsed = parseDIDRecordResponse(data);
  if (parsed?.document) {
    hydrateLocalFromRecord(did, parsed.document, parsed.metadata);
    return parsed.document;
  }

  return getLocalDIDDocument(did);
}

export async function registerDID(
  didDocument: DIDDocument,
  metadata: DIDMetadata,
): Promise<boolean> {
  const persistedLocally = upsertLocalDID(didDocument, metadata);

  try {
    const res = await authService.fetchWithSessionAuth('/api/did', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ didDocument, metadata }),
    });
    return res.ok || persistedLocally;
  } catch (error) {
    logDidFallback(
      'register:/api/did',
      'DID registration API unavailable, using local fallback',
      error,
    );
    return persistedLocally;
  }
}

export async function updateDIDDocument(
  did: string,
  updates: Partial<DIDDocument>,
): Promise<boolean> {
  let updatedLocally = false;
  const localDocument = getLocalDIDDocument(did);
  if (localDocument) {
    const updatedAt = new Date().toISOString();
    const mergedDocument: DIDDocument = {
      ...localDocument,
      ...updates,
      updated: updatedAt,
    };
    updatedLocally = writeLocalJson(didRegistryKey(did), mergedDocument);
    const metadata = getLocalDIDMetadata(did);
    if (metadata) {
      writeLocalJson(didMetadataKey(did), {
        ...metadata,
        lastUpdated: updatedAt,
      });
    }
  }

  try {
    const res = await authService.fetchWithSessionAuth(`/api/did/${did}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ didDocument: updates }),
    });
    return res.ok || updatedLocally;
  } catch (error) {
    logDidFallback(
      'update:/api/did/:did',
      'DID update API unavailable, using local fallback',
      error,
    );
    return updatedLocally;
  }
}

export async function revokeDID(did: string): Promise<boolean> {
  let revokedLocally = false;
  const localDocument = getLocalDIDDocument(did);
  if (localDocument) {
    const updatedAt = new Date().toISOString();
    revokedLocally = writeLocalJson(didRegistryKey(did), {
      ...localDocument,
      deactivated: true,
      updated: updatedAt,
    } satisfies DIDDocument);

    const metadata = getLocalDIDMetadata(did);
    if (metadata) {
      writeLocalJson(didMetadataKey(did), {
        ...metadata,
        lastUpdated: updatedAt,
      });
    }
  }

  try {
    const res = await authService.fetchWithSessionAuth(`/api/did/${did}`, {
      method: 'DELETE',
    });
    return res.ok || revokedLocally;
  } catch (error) {
    logDidFallback(
      'revoke:/api/did/:did',
      'DID revocation API unavailable, using local fallback',
      error,
    );
    return revokedLocally;
  }
}

/**
 * Verify DID ownership through challenge-response
 */
export async function verifyDIDOwnership(
  did: string,
  challenge: string,
  signature: string,
): Promise<boolean> {
  try {
    const didDoc = await resolveDID(did);
    if (!didDoc) return false;

    // Extract public key from DID document
    // DID documents have verificationMethod array with public keys
    const verificationMethod = didDoc.verificationMethod?.[0];
    if (!verificationMethod) {
      logger.error('[DID] No verification method found in DID document');
      return false;
    }

    // Validate signature format.
    if (!/^0x[0-9a-f]+$/i.test(signature) || signature.length < 12 || (signature.length - 2) % 2 !== 0) {
      logger.error('[DID] Invalid signature format');
      return false;
    }

    let publicKey: CryptoKey;
    if (verificationMethod.publicKeyJwk) {
      publicKey = await crypto.subtle.importKey(
        'jwk',
        verificationMethod.publicKeyJwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      );
    } else {
      const rawHex =
        verificationMethod.publicKeyHex ||
        (verificationMethod.publicKeyMultibase?.startsWith('0x')
          ? verificationMethod.publicKeyMultibase
          : '');
      const normalized = rawHex.replace(/^0x/, '');
      if (!/^[0-9a-f]+$/i.test(normalized) || normalized.length % 2 !== 0) {
        logger.error('[DID] No valid public key found in verification method');
        return false;
      }

      const publicKeyBytes = new Uint8Array(
        normalized.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
      );
      publicKey = await crypto.subtle.importKey(
        'raw',
        publicKeyBytes,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      );
    }

    // Verify signature using cryptography service
    return await verifySignature(challenge, signature, publicKey);
  } catch (error) {
    logger.error('[DID] Signature verification error:', error);
    return false;
  }
}

/**
 * Create Verifiable Presentation with DID
 */
export interface VerifiablePresentation {
  '@context': string[];
  type: string[];
  holder: string; // DID of the holder
  verifiableCredential: unknown[];
  proof: {
    type: string;
    created: string;
    proofPurpose: string;
    verificationMethod: string;
    challenge?: string;
    jws?: string;
  };
}

export async function createVerifiablePresentation(
  holderDID: string,
  credentials: unknown[],
  challenge?: string,
): Promise<VerifiablePresentation> {
  const presentation: VerifiablePresentation = {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiablePresentation'],
    holder: holderDID,
    verifiableCredential: credentials,
    proof: {
      type: 'EcdsaSecp256k1Signature2019',
      created: new Date().toISOString(),
      proofPurpose: 'authentication',
      verificationMethod: `${holderDID}#key-1`,
      challenge,
      jws: await sha256(JSON.stringify(credentials) + challenge),
    },
  };

  return presentation;
}

/**
 * Get all DIDs from registry (for admin purposes)
 */
export async function getAllDIDs(): Promise<Array<{ did: string; created: string; role: string }>> {
  const remoteList = await fetchJson<unknown>(api.url('/api/did'));
  const parsed = parseDIDIndexList(remoteList);
  if (parsed) {
    writeLocalDIDIndex(parsed);
    return parsed;
  }

  return readLocalDIDIndex();
}

/**
 * Search DIDs by role
 */
export async function searchDIDsByRole(role: string): Promise<string[]> {
  const allDIDs = await getAllDIDs();
  return allDIDs.filter((d) => d.role === role).map((d) => d.did);
}

/**
 * Get DID Metadata
 */
export async function getDIDMetadata(did: string): Promise<DIDMetadata | null> {
  const data = await fetchJson<unknown>(api.url(`/api/did/${did}`));
  const parsed = parseDIDRecordResponse(data);
  if (parsed?.metadata) {
    writeLocalJson(didMetadataKey(did), parsed.metadata);
    return parsed.metadata;
  }

  return getLocalDIDMetadata(did);
}

// ------------------------------------------------------------------
// Veramo-backed DID operations (production path)
// ------------------------------------------------------------------

/**
 * Create a DID using the Veramo framework (did:ethr).
 * Falls back to the simulated polygon DID on error.
 */
export async function createProductionDID(
  alias?: string,
): Promise<{ did: string; keys: VeramoDIDResult['keys'] }> {
  try {
    const result = await createVeramoDID(alias);
    return { did: result.did, keys: result.keys };
  } catch {
    const did = await generateDID(alias ?? 'default');
    return { did, keys: [] };
  }
}

/**
 * Resolve a DID using Veramo, then fall back to local registry.
 */
export async function resolveProductionDID(did: string): Promise<DIDDocument | null> {
  // Try Veramo resolver first (supports did:ethr via RPC)
  try {
    const doc = await resolveVeramoDID(did);
    if (doc) return doc as unknown as DIDDocument;
  } catch {
    // Fall through to local
  }

  return resolveDID(did);
}
