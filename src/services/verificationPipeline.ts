/**
 * Verifiable Credential Verification Pipeline
 * Validates schema, issuer trust, status list revocation, and W3C VC proofs.
 *
 * Integrates:
 *  - @digitalcredentials/vc proof verification
 *  - StatusList2021 revocation checks
 *  - Governance registry trust lookups
 *  - JSON Schema validation
 */

import { credentialSchemaRegistry } from './credentialSchema';
import { governanceRegistry } from './governanceRegistry';
import { StatusListService } from './statusList';
import { ipfsServiceClient } from './ipfsService';
import { verifyW3CCredential } from './vc/verifierService';
import type { W3CVerifiableCredential } from './vc/types';
import { getErrorMessage } from './errorUtils';

export interface VerificationCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}

export interface VerificationResult {
  valid: boolean;
  checks: VerificationCheck[];
  issues: string[];
  subjectName?: string;
  issuerName?: string;
  credentialType?: string;
}

export interface VerifiableCredential {
  '@context': string[];
  type: string[];
  issuer: string;
  issuanceDate: string;
  credentialSubject: Record<string, unknown>;
  credentialSchema?: { id: string; type: string };
  credentialStatus?: {
    id: string;
    type: string;
    statusPurpose: 'revocation' | 'suspension';
    statusListIndex: string;
    statusListCredential: string;
  };
  statusListCredential?: {
    id: string;
    type: string[];
    statusPurpose: 'revocation' | 'suspension';
    encodedList: string;
    issuer: string;
    issuedAt: string;
    length: number;
  };
  proof?: Record<string, unknown>;
}

const isNonEmptyString = (value: unknown): boolean =>
  typeof value === 'string' && value.trim().length > 0;

const resolveStatusListCredential = async (
  statusListCredential: string | VerifiableCredential['statusListCredential'] | undefined
): Promise<VerifiableCredential['statusListCredential'] | null> => {
  if (!statusListCredential) return null;
  if (typeof statusListCredential === 'object') return statusListCredential;

  if (statusListCredential.startsWith('ipfs://')) {
    const cid = statusListCredential.replace('ipfs://', '');
    const resolved = await ipfsServiceClient.getJSON(cid);
    return resolved as VerifiableCredential['statusListCredential'] | null;
  }

  if (statusListCredential.startsWith('http')) {
    try {
      const response = await fetch(statusListCredential, { headers: { Accept: 'application/json' } });
      if (!response.ok) return null;
      return (await response.json()) as VerifiableCredential['statusListCredential'];
    } catch {
      return null;
    }
  }

  return null;
};

function toW3CCredential(payload: VerifiableCredential): W3CVerifiableCredential {
  return {
    '@context': payload['@context'],
    type: payload.type,
    issuer: payload.issuer,
    validFrom: payload.issuanceDate || new Date().toISOString(),
    issuanceDate: payload.issuanceDate,
    credentialSubject: payload.credentialSubject,
    credentialSchema: payload.credentialSchema,
    credentialStatus: payload.credentialStatus,
    proof: payload.proof as unknown as W3CVerifiableCredential['proof'],
  };
}

export const verifyCredentialPayload = async (payload: VerifiableCredential): Promise<VerificationResult> => {
  const checks: VerificationCheck[] = [];
  const issues: string[] = [];

  // 1. Context check
  if (!Array.isArray(payload['@context']) || payload['@context'].length === 0) {
    checks.push({ name: 'context', status: 'fail', detail: 'Missing or invalid @context' });
    issues.push('Missing @context');
  } else {
    checks.push({ name: 'context', status: 'pass', detail: 'Context present' });
  }

  // 2. Type check
  if (!Array.isArray(payload.type) || payload.type.length === 0) {
    checks.push({ name: 'type', status: 'fail', detail: 'Missing credential type' });
    issues.push('Missing type');
  } else {
    checks.push({ name: 'type', status: 'pass', detail: payload.type.join(', ') });
  }

  // 3. Issuer trust check
  if (!isNonEmptyString(payload.issuer)) {
    checks.push({ name: 'issuer', status: 'fail', detail: 'Missing issuer' });
    issues.push('Missing issuer');
  } else {
    const trusted = governanceRegistry.isTrustedIssuer(payload.issuer);
    checks.push({
      name: 'issuer-trust',
      status: trusted ? 'pass' : 'warn',
      detail: trusted ? 'Trusted issuer registry match' : 'Issuer not found in registry'
    });
    if (!trusted) issues.push('Issuer not in trusted registry');
  }

  // 4. Subject check
  if (!payload.credentialSubject || typeof payload.credentialSubject !== 'object') {
    checks.push({ name: 'subject', status: 'fail', detail: 'Missing credentialSubject' });
    issues.push('Missing credentialSubject');
  } else {
    checks.push({ name: 'subject', status: 'pass', detail: 'Subject present' });
  }

  // 5. Schema validation
  if (payload.credentialSchema?.id) {
    const schema = credentialSchemaRegistry.getSchema(payload.credentialSchema.id);
    if (!schema) {
      checks.push({ name: 'schema', status: 'warn', detail: 'Schema not available locally' });
    } else {
      const schemaCheck = credentialSchemaRegistry.validateSubject(
        payload.credentialSchema.id,
        payload.credentialSubject || {}
      );
      checks.push({
        name: 'schema',
        status: schemaCheck.valid ? 'pass' : 'fail',
        detail: schemaCheck.valid ? 'Schema validated' : schemaCheck.issues.join('; ')
      });
      if (!schemaCheck.valid) issues.push(...schemaCheck.issues);
    }
  } else {
    checks.push({ name: 'schema', status: 'warn', detail: 'No schema reference' });
  }

  // 6. Status list revocation
  if (payload.credentialStatus) {
    const statusList = payload.statusListCredential
      ? payload.statusListCredential
      : await resolveStatusListCredential(payload.credentialStatus.statusListCredential);

    if (statusList) {
      const index = Number(payload.credentialStatus.statusListIndex);
      const encodedList = statusList.encodedList;
      const length = statusList.length;
      const revoked = StatusListService.checkStatus(encodedList, length, index);

      checks.push({
        name: 'revocation',
        status: revoked ? 'fail' : 'pass',
        detail: revoked ? 'Credential revoked' : 'Credential active'
      });

      if (revoked) issues.push('Credential revoked');
    } else {
      checks.push({ name: 'revocation', status: 'warn', detail: 'Status list not resolvable' });
    }
  } else {
    checks.push({ name: 'revocation', status: 'warn', detail: 'No status list reference' });
  }

  // 7. Proof presence
  if (!payload.proof || Object.keys(payload.proof).length === 0) {
    checks.push({ name: 'proof', status: 'warn', detail: 'Missing proof data' });
  } else {
    checks.push({ name: 'proof', status: 'pass', detail: 'Proof present' });
  }

  const valid = checks.every(check => check.status !== 'fail');

  return {
    valid,
    checks,
    issues,
    subjectName: String(payload.credentialSubject?.name || ''),
    issuerName: governanceRegistry.getIssuer(payload.issuer)?.name,
    credentialType: payload.type?.find(t => t !== 'VerifiableCredential') || payload.type?.[0]
  };
};

/**
 * Extended verification that runs the W3C VC cryptographic proof check
 * via @digitalcredentials/vc in addition to the structural pipeline.
 */
export const verifyCredentialFull = async (
  payload: VerifiableCredential
): Promise<VerificationResult> => {
  try {
    // Full verification (structural + cryptographic + trust + schema)
    return await verifyW3CCredentialFull(toW3CCredential(payload));
  } catch (error) {
    const fallback = await verifyCredentialPayload(payload);
    const msg = getErrorMessage(error) || 'W3C verification failed';
    fallback.valid = false;
    fallback.issues.push(msg);
    fallback.checks.push({ name: 'w3c-verifier', status: 'fail', detail: msg });
    return fallback;
  }
};

/**
 * Full W3C VC verification using the new multi-layer verifier service.
 * Runs 5 verification layers: structural, cryptographic, status, trust, and schema.
 * Use this for comprehensive W3C VC Data Model v2.0 verification.
 */
export const verifyW3CCredentialFull = async (
  credential: W3CVerifiableCredential
): Promise<VerificationResult> => {
  try {
    const w3cResult = await verifyW3CCredential(credential);

    // Map the W3C verification result to the pipeline's VerificationResult format
    const checks: VerificationCheck[] = w3cResult.checks.map(c => ({
      name: c.name,
      status: c.status === 'info' ? ('pass' as const) : c.status,
      detail: c.detail,
    }));

    const issues = w3cResult.checks
      .filter(c => c.status === 'fail')
      .map(c => c.detail);

    const issuerStr = typeof credential.issuer === 'string'
      ? credential.issuer
      : credential.issuer?.id;

    return {
      valid: w3cResult.valid,
      checks,
      issues,
      subjectName: String(
        (Array.isArray(credential.credentialSubject)
          ? credential.credentialSubject[0]?.name
          : credential.credentialSubject?.name) || ''
      ),
      issuerName: issuerStr ? governanceRegistry.getIssuer(issuerStr)?.name : undefined,
      credentialType: credential.type?.find(t => t !== 'VerifiableCredential') || credential.type?.[0],
    };
  } catch (error) {
    const msg = getErrorMessage(error) || 'W3C verification failed';
    return {
      valid: false,
      checks: [{
        name: 'w3c-verification',
        status: 'fail',
        detail: msg,
      }],
      issues: [msg],
    };
  }
};
