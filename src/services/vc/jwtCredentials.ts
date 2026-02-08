/**
 * JWT-VC Credential Support
 *
 * Provides encoding/decoding of W3C Verifiable Credentials in JWT format.
 * Uses did-jwt-vc for standards-compliant JWT-VC operations.
 * Replaces the need for @verida/verifiable-credentials.
 *
 * Reference: https://www.w3.org/TR/vc-data-model/#jwt-encoding
 */

import type { W3CVerifiableCredential, W3CVerifiablePresentation, VCKeyPair, CredentialSchemaRef, CredentialStatusRef } from './types';
import { getDidJwtVc } from './packageBridge';
import { sha256 } from '../cryptography';
import { signEd25519, bytesToHex, bytesToBase58 } from './cryptoSuites';
import { logger } from '../logger';

// ---------------------------------------------------------------------------
// JWT-VC Encoding
// ---------------------------------------------------------------------------

/**
 * Encode a W3C Verifiable Credential as a JWT string.
 */
export async function credentialToJWT(
  credential: W3CVerifiableCredential,
  issuerKeyPair: VCKeyPair
): Promise<string> {
  const didJwtVc = getDidJwtVc();

  if (didJwtVc && didJwtVc.createVerifiableCredentialJwt) {
    try {
      // Build the signer function from the key pair
      const signer = createSigner(issuerKeyPair);
      const issuerDID = typeof credential.issuer === 'string' ? credential.issuer : credential.issuer.id;

      const vcPayload = {
        sub: getSubjectDID(credential),
        vc: {
          '@context': credential['@context'],
          type: credential.type,
          credentialSubject: credential.credentialSubject,
          ...(credential.credentialSchema && { credentialSchema: credential.credentialSchema }),
          ...(credential.credentialStatus && { credentialStatus: credential.credentialStatus }),
          ...(credential.evidence && { evidence: credential.evidence }),
        },
      };

      const jwt = await didJwtVc.createVerifiableCredentialJwt(
        vcPayload,
        { did: issuerDID, signer, alg: issuerKeyPair.type === 'Ed25519' ? 'EdDSA' : 'ES256' },
      );

      return jwt;
    } catch (error) {
      logger.warn('[JWTCredentials] did-jwt-vc encoding failed, using native:', error);
    }
  }

  // Native JWT encoding fallback
  return nativeEncodeJWT(credential, issuerKeyPair);
}

/**
 * Decode a JWT string back to a W3C Verifiable Credential.
 */
export async function jwtToCredential(jwt: string): Promise<W3CVerifiableCredential | null> {
  const didJwtVc = getDidJwtVc();

  if (didJwtVc && didJwtVc.verifyCredential) {
    try {
      const decoded = didJwtVc.decodeJWT ? didJwtVc.decodeJWT(jwt) : decodeJWTNative(jwt);
      if (decoded && decoded.payload) {
        return reconstructCredentialFromJWT(decoded.payload);
      }
    } catch (error) {
      logger.warn('[JWTCredentials] did-jwt-vc decoding failed, using native:', error);
    }
  }

  // Native JWT decoding fallback
  return nativeDecodeJWT(jwt);
}

/**
 * Encode a W3C Verifiable Presentation as a JWT string.
 */
export async function presentationToJWT(
  presentation: W3CVerifiablePresentation,
  holderKeyPair: VCKeyPair,
  challenge?: string,
  domain?: string
): Promise<string> {
  const didJwtVc = getDidJwtVc();

  if (didJwtVc && didJwtVc.createVerifiablePresentationJwt) {
    try {
      const signer = createSigner(holderKeyPair);

      const vpPayload: Record<string, unknown> = {
        vp: {
          '@context': presentation['@context'],
          type: presentation.type,
          verifiableCredential: presentation.verifiableCredential,
        },
      };

      if (challenge) vpPayload.nonce = challenge;
      if (domain) vpPayload.aud = domain;

      const jwt = await didJwtVc.createVerifiablePresentationJwt(
        vpPayload,
        { did: presentation.holder, signer, alg: holderKeyPair.type === 'Ed25519' ? 'EdDSA' : 'ES256' },
      );

      return jwt;
    } catch (error) {
      logger.warn('[JWTCredentials] JWT presentation encoding failed, using native:', error);
    }
  }

  return nativeEncodeJWT(presentation as unknown as W3CVerifiableCredential, holderKeyPair);
}

/**
 * Decode a JWT string back to a Verifiable Presentation.
 */
export async function jwtToPresentation(jwt: string): Promise<W3CVerifiablePresentation | null> {
  const decoded = nativeDecodeJWT(jwt);
  if (!decoded) return null;

  // Extract VP from JWT payload
  const subject = Array.isArray(decoded.credentialSubject)
    ? decoded.credentialSubject[0]
    : decoded.credentialSubject;

  if ((decoded as unknown as Record<string, unknown>).holder || (decoded as unknown as Record<string, unknown>).vp) {
    return decoded as unknown as W3CVerifiablePresentation;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Signer Factory
// ---------------------------------------------------------------------------

/**
 * Create a signer function from a VCKeyPair, compatible with did-jwt.
 */
function createSigner(keyPair: VCKeyPair): (data: string | Uint8Array) => Promise<string> {
  return async (data: string | Uint8Array): Promise<string> => {
    const message = typeof data === 'string' ? new TextEncoder().encode(data) : data;

    if (keyPair.type === 'Ed25519' && keyPair.privateKey instanceof Uint8Array) {
      const sig = await signEd25519(message, keyPair.privateKey);
      return bytesToBase64Url(sig);
    }

    if (keyPair.privateKey instanceof CryptoKey) {
      const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        keyPair.privateKey,
        message
      );
      return bytesToBase64Url(new Uint8Array(signature));
    }

    // Fallback: hash-based "signature"
    const hash = await sha256(typeof data === 'string' ? data : bytesToHex(data));
    return hash;
  };
}

// ---------------------------------------------------------------------------
// Native JWT Implementation (fallback)
// ---------------------------------------------------------------------------

async function nativeEncodeJWT(
  credential: W3CVerifiableCredential,
  keyPair: VCKeyPair
): Promise<string> {
  const issuerDID = typeof credential.issuer === 'string' ? credential.issuer : credential.issuer.id;

  const header = {
    alg: keyPair.type === 'Ed25519' ? 'EdDSA' : 'ES256',
    typ: 'JWT',
  };

  const payload = {
    iss: issuerDID,
    sub: getSubjectDID(credential),
    iat: Math.floor(Date.now() / 1000),
    nbf: credential.validFrom ? Math.floor(new Date(credential.validFrom).getTime() / 1000) : undefined,
    exp: credential.validUntil ? Math.floor(new Date(credential.validUntil).getTime() / 1000) : undefined,
    vc: {
      '@context': credential['@context'],
      type: credential.type,
      credentialSubject: credential.credentialSubject,
    },
    jti: credential.id,
  };

  const headerB64 = stringToBase64Url(JSON.stringify(header));
  const payloadB64 = stringToBase64Url(JSON.stringify(payload));
  const dataToSign = `${headerB64}.${payloadB64}`;

  const signer = createSigner(keyPair);
  const signature = await signer(dataToSign);

  return `${dataToSign}.${signature}`;
}

function nativeDecodeJWT(jwt: string): W3CVerifiableCredential | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(base64UrlToString(parts[1]));

    if (payload.vc) {
      return reconstructCredentialFromJWT(payload);
    }

    return null;
  } catch {
    return null;
  }
}

function decodeJWTNative(jwt: string): { header: Record<string, unknown>; payload: Record<string, unknown>; signature: string } | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;

    return {
      header: JSON.parse(base64UrlToString(parts[0])),
      payload: JSON.parse(base64UrlToString(parts[1])),
      signature: parts[2],
    };
  } catch {
    return null;
  }
}

function reconstructCredentialFromJWT(payload: Record<string, unknown>): W3CVerifiableCredential {
  const vc = (payload.vc || {}) as Record<string, unknown>;
  const nbf = payload.nbf as number | undefined;
  const exp = payload.exp as number | undefined;
  const iss = payload.iss as string | undefined;
  const sub = payload.sub as string | undefined;
  const jti = payload.jti as string | undefined;

  return {
    '@context': (vc['@context'] as string[]) || ['https://www.w3.org/2018/credentials/v1'],
    type: (vc.type as string[]) || ['VerifiableCredential'],
    issuer: iss || '',
    validFrom: nbf ? new Date(nbf * 1000).toISOString() : new Date().toISOString(),
    issuanceDate: nbf ? new Date(nbf * 1000).toISOString() : new Date().toISOString(),
    ...(exp && { validUntil: new Date(exp * 1000).toISOString() }),
    credentialSubject: {
      ...((vc.credentialSubject || {}) as Record<string, unknown>),
      ...(sub && { id: sub }),
    },
    ...(jti && { id: jti }),
    ...(vc.credentialSchema && { credentialSchema: vc.credentialSchema as CredentialSchemaRef | CredentialSchemaRef[] }),
    ...(vc.credentialStatus && { credentialStatus: vc.credentialStatus as CredentialStatusRef }),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSubjectDID(credential: W3CVerifiableCredential): string {
  const subject = Array.isArray(credential.credentialSubject)
    ? credential.credentialSubject[0]
    : credential.credentialSubject;
  return subject.id || '';
}

function stringToBase64Url(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToString(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
