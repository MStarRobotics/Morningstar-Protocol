/**
 * Browser-Safe JSON-LD Document Loader
 * Provides cached context resolution for W3C Verifiable Credentials.
 *
 * Strategy:
 * 1. Serve bundled W3C contexts from local cache (zero network latency)
 * 2. Fall back to fetch() for unknown context URLs
 * 3. Cache fetched contexts in memory for session lifetime
 *
 * This avoids CORS issues and latency from fetching remote JSON-LD contexts.
 */

import credentialsV1 from './contexts/credentials-v1.json';
import credentialsV2 from './contexts/credentials-v2.json';
import didV1 from './contexts/did-v1.json';
import ed25519_2020 from './contexts/ed25519-2020.json';
import dataIntegrityV2 from './contexts/data-integrity-v2.json';
import {
  VC_CONTEXT_V1,
  VC_CONTEXT_V2,
  DID_CONTEXT_V1,
  ED25519_CONTEXT,
  DATA_INTEGRITY_CONTEXT,
  SECURITY_CONTEXT,
} from './types';
import { logger } from '../logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocumentLoaderResult {
  contextUrl: string | null;
  document: Record<string, unknown>;
  documentUrl: string;
}

export type DocumentLoaderFunction = (url: string) => Promise<DocumentLoaderResult>;

// ---------------------------------------------------------------------------
// Static context cache (bundled at build time)
// ---------------------------------------------------------------------------

const STATIC_CONTEXTS = new Map<string, Record<string, unknown>>([
  [VC_CONTEXT_V1, credentialsV1 as Record<string, unknown>],
  [VC_CONTEXT_V2, credentialsV2 as Record<string, unknown>],
  [DID_CONTEXT_V1, didV1 as Record<string, unknown>],
  [ED25519_CONTEXT, ed25519_2020 as Record<string, unknown>],
  [DATA_INTEGRITY_CONTEXT, dataIntegrityV2 as Record<string, unknown>],
  // Security v2 is often requested as a dependency
  [SECURITY_CONTEXT, dataIntegrityV2 as Record<string, unknown>],
]);

// Runtime cache for contexts fetched from the network
const RUNTIME_CACHE = new Map<string, Record<string, unknown>>();

// ---------------------------------------------------------------------------
// Document Loader
// ---------------------------------------------------------------------------

/**
 * Create a JSON-LD document loader that resolves contexts from local cache
 * first, then falls back to network fetch.
 *
 * Compatible with the loader interface expected by `jsonld` and
 * `@digitalcredentials/jsonld`.
 */
export function createDocumentLoader(): DocumentLoaderFunction {
  return async function documentLoader(url: string): Promise<DocumentLoaderResult> {
    // 1. Check static (bundled) contexts
    const staticDoc = STATIC_CONTEXTS.get(url);
    if (staticDoc) {
      return {
        contextUrl: null,
        document: staticDoc,
        documentUrl: url,
      };
    }

    // 2. Check runtime (previously fetched) cache
    const cachedDoc = RUNTIME_CACHE.get(url);
    if (cachedDoc) {
      return {
        contextUrl: null,
        document: cachedDoc,
        documentUrl: url,
      };
    }

    // 3. Attempt network fetch for unknown contexts
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/ld+json, application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching context: ${url}`);
      }

      const document = await response.json();
      RUNTIME_CACHE.set(url, document);

      return {
        contextUrl: null,
        document,
        documentUrl: url,
      };
    } catch (error) {
      // 4. Return a minimal empty context to avoid hard failures
      logger.warn(`[DocumentLoader] Failed to load context: ${url}`, error);
      const fallback = { '@context': {} };
      return {
        contextUrl: null,
        document: fallback,
        documentUrl: url,
      };
    }
  };
}

/**
 * Register a custom context URL with a local document.
 * Useful for application-specific contexts (e.g., academic credential schemas).
 */
export function registerContext(url: string, document: Record<string, unknown>): void {
  RUNTIME_CACHE.set(url, document);
}

/**
 * Check if a context URL is available in the cache (static or runtime).
 */
export function hasContext(url: string): boolean {
  return STATIC_CONTEXTS.has(url) || RUNTIME_CACHE.has(url);
}

/**
 * Get the list of all pre-cached context URLs.
 */
export function getAvailableContexts(): string[] {
  return [
    ...Array.from(STATIC_CONTEXTS.keys()),
    ...Array.from(RUNTIME_CACHE.keys()),
  ];
}

/** Singleton document loader instance for the application. */
export const documentLoader = createDocumentLoader();
