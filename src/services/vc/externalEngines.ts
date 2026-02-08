/**
 * External VC Engine Bridge
 *
 * Provides optional verification hooks for external VC implementations.
 * These are best-effort checks that never block core verification.
 *
 * Note: External engines (@dsnp/verifiable-credentials, @verida/verifiable-credentials)
 * were removed to eliminate the elliptic vulnerability chain (GHSA-848j-6mx2-7j84).
 * Core verification is handled by @digitalcredentials/vc and the native verifier.
 */

import type { W3CVerifiableCredential } from './types';

export interface ExternalEngineCheck {
  engine: string;
  verified: boolean;
  detail: string;
}

export async function verifyWithExternalEngines(
  _credential: W3CVerifiableCredential
): Promise<ExternalEngineCheck[]> {
  return [];
}
