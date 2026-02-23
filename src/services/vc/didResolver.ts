/**
 * DID Resolution Bridge
 * Wraps the existing didService.ts into the W3C DID Resolution specification
 * format expected by VC libraries (@digitalcredentials/vc, did-jwt-vc, etc.).
 *
 * Reference: https://w3c-ccg.github.io/did-resolution/
 */

import { resolveDID, DIDDocument, getDIDMetadata, createDIDDocument } from '../didService';
import { sha256, generateKeyPair } from '../cryptography';

// ---------------------------------------------------------------------------
// DID Resolution Types (W3C DID Resolution spec)
// ---------------------------------------------------------------------------

export interface DIDResolutionResult {
  didDocument: DIDDocument | null;
  didDocumentMetadata: DIDDocumentMetadata;
  didResolutionMetadata: DIDResolutionMetadata;
}

export interface DIDDocumentMetadata {
  created?: string;
  updated?: string;
  deactivated?: boolean;
  versionId?: string;
}

export interface DIDResolutionMetadata {
  contentType?: string;
  error?: string;
  message?: string;
}

// ---------------------------------------------------------------------------
// DID Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a DID to its DID Document using the W3C DID Resolution format.
 * Delegates to the existing didService for did:polygon method resolution.
 */
export async function resolveW3CDID(did: string): Promise<DIDResolutionResult> {
  // Validate DID format
  if (!did || !did.startsWith('did:')) {
    return {
      didDocument: null,
      didDocumentMetadata: {},
      didResolutionMetadata: {
        error: 'invalidDid',
        message: 'DID must start with "did:"',
      },
    };
  }

  const method = did.split(':')[1];

  switch (method) {
    case 'polygon':
      return resolvePolygonDID(did);
    case 'key':
      return resolveKeyDID(did);
    case 'web':
      return resolveWebDID(did);
    default:
      return resolvePolygonDID(did);
  }
}

/**
 * Resolve did:polygon using existing localStorage-based registry.
 */
async function resolvePolygonDID(did: string): Promise<DIDResolutionResult> {
  const didDocument = await resolveDID(did);

  if (!didDocument) {
    // Check if we have metadata (DID exists but doc is missing)
    const metadata = await getDIDMetadata(did);

    if (metadata) {
      return {
        didDocument: null,
        didDocumentMetadata: {
          created: metadata.createdAt,
          updated: metadata.lastUpdated,
        },
        didResolutionMetadata: {
          error: 'notFound',
          message: 'DID document not found but metadata exists',
        },
      };
    }

    return {
      didDocument: null,
      didDocumentMetadata: {},
      didResolutionMetadata: {
        error: 'notFound',
        message: `DID not found: ${did}`,
      },
    };
  }

  return {
    didDocument,
    didDocumentMetadata: {
      created: didDocument.created,
      updated: didDocument.updated,
      deactivated: (didDocument as any).deactivated || false,
    },
    didResolutionMetadata: {
      contentType: 'application/did+ld+json',
    },
  };
}

/**
 * Generate an ephemeral DID Document for did:key method.
 * did:key encodes the public key directly in the DID string.
 */
async function resolveKeyDID(did: string): Promise<DIDResolutionResult> {
  // Extract the multibase-encoded key from the DID
  const keyId = did.split(':').slice(2).join(':');

  if (!keyId) {
    return {
      didDocument: null,
      didDocumentMetadata: {},
      didResolutionMetadata: {
        error: 'invalidDid',
        message: 'did:key requires a key identifier',
      },
    };
  }

  // Create a synthetic DID document for the key
  const verificationMethodId = `${did}#${keyId}`;

  const didDocument: DIDDocument = {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1',
    ],
    id: did,
    controller: did,
    verificationMethod: [
      {
        id: verificationMethodId,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase: keyId,
      },
    ],
    authentication: [verificationMethodId],
    assertionMethod: [verificationMethodId],
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  return {
    didDocument,
    didDocumentMetadata: {},
    didResolutionMetadata: {
      contentType: 'application/did+ld+json',
    },
  };
}

/**
 * Resolve did:web by constructing a DID document from a web domain.
 * In production, this would fetch /.well-known/did.json from the domain.
 * Here we simulate it for demo purposes.
 */
async function resolveWebDID(did: string): Promise<DIDResolutionResult> {
  const domain = did.replace('did:web:', '').replace(/:/g, '/');

  // Check existing registry first
  const existingDoc = await resolveDID(did);
  if (existingDoc) {
    return {
      didDocument: existingDoc,
      didDocumentMetadata: {
        created: existingDoc.created,
        updated: existingDoc.updated,
      },
      didResolutionMetadata: {
        contentType: 'application/did+ld+json',
      },
    };
  }

  // Simulate did:web resolution with a generated document
  const keyPair = await generateKeyPair();
  const verificationMethodId = `${did}#key-1`;

  const didDocument: DIDDocument = {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1',
    ],
    id: did,
    controller: did,
    verificationMethod: [
      {
        id: verificationMethodId,
        type: 'EcdsaSecp256k1VerificationKey2019',
        controller: did,
        publicKeyMultibase: keyPair.publicKeyHex,
      },
    ],
    authentication: [verificationMethodId],
    assertionMethod: [verificationMethodId],
    service: [
      {
        id: `${did}#credential-service`,
        type: 'CredentialIssuerService',
        serviceEndpoint: `https://${domain}/.well-known/did.json`,
      },
    ],
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };

  return {
    didDocument,
    didDocumentMetadata: {
      created: didDocument.created,
      updated: didDocument.updated,
    },
    didResolutionMetadata: {
      contentType: 'application/did+ld+json',
    },
  };
}

// ---------------------------------------------------------------------------
// Resolver Interface (for @digitalcredentials/vc integration)
// ---------------------------------------------------------------------------

/**
 * Create a DID resolver compatible with the interface expected by
 * @digitalcredentials/vc and jsonld-signatures.
 *
 * Returns a function that matches:
 *   (did: string) => Promise<{ id: string, ... }>
 */
export function createDIDResolver() {
  return {
    get: async ({ did }: { did: string }): Promise<DIDDocument | null> => {
      const result = await resolveW3CDID(did);
      return result.didDocument;
    },
  };
}

/**
 * Get a verification method from a DID Document by its ID.
 * Used for resolving `proof.verificationMethod` references.
 */
export async function resolveVerificationMethod(
  verificationMethodId: string,
): Promise<{ id: string; type: string; controller: string; publicKeyMultibase?: string } | null> {
  // Extract the DID from the verification method ID (e.g., "did:polygon:0x123#key-1" -> "did:polygon:0x123")
  const did = verificationMethodId.split('#')[0];

  const result = await resolveW3CDID(did);

  if (!result.didDocument) {
    return null;
  }

  const method = result.didDocument.verificationMethod.find((vm) => vm.id === verificationMethodId);

  return method || null;
}
