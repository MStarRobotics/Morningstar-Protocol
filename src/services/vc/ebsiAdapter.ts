/**
 * EBSI (European Blockchain Services Infrastructure) Compliance Adapter
 *
 * Produces credentials conforming to the EBSI Verifiable Credentials specification
 * used for European academic credentials (Europass Digital Credentials).
 *
 * Since @cef-ebsi/verifiable-credential is not available on npm, this adapter
 * implements EBSI compliance natively using @digitalcredentials/vc as the core engine.
 *
 * References:
 * - EBSI Verifiable Credentials: https://ec.europa.eu/digital-building-blocks/wikis/display/EBSI
 * - Europass Digital Credentials: https://europa.eu/europass/digital-credentials
 */

import type {
  W3CVerifiableCredential,
  EBSICredential,
  EBSITrustedIssuer,
  CredentialSubject,
  Evidence,
} from './types';
import { governanceRegistry } from '../governanceRegistry';

// ---------------------------------------------------------------------------
// EBSI Context & Schema Constants
// ---------------------------------------------------------------------------

const EBSI_CONTEXT = 'https://ebsi.eu/credentials/v1';
const EBSI_TRUSTED_SCHEMAS_REGISTRY = 'https://api.ebsi.eu/trusted-schemas-registry/v1/schemas';

/** EBSI-recognized credential types for European academics. */
export const EBSI_CREDENTIAL_TYPES = {
  VERIFIABLE_DIPLOMA: 'VerifiableDiploma',
  EUROPASS_DIPLOMA_SUPPLEMENT: 'EuropassDiplomaSupplement',
  VERIFIABLE_ATTESTATION: 'VerifiableAttestation',
  VERIFIABLE_ACCREDITATION: 'VerifiableAccreditation',
  ECTS_CREDIT_TRANSFER: 'ECTSCreditTransfer',
  EUROPEAN_QUALIFICATION: 'EuropeanQualification',
} as const;

/** EBSI schema IDs for academic credential types. */
export const EBSI_SCHEMA_IDS = {
  VERIFIABLE_DIPLOMA: `${EBSI_TRUSTED_SCHEMAS_REGISTRY}/diploma-v1`,
  EUROPASS_SUPPLEMENT: `${EBSI_TRUSTED_SCHEMAS_REGISTRY}/europass-supplement-v1`,
  ECTS_CREDIT: `${EBSI_TRUSTED_SCHEMAS_REGISTRY}/ects-credit-v1`,
  GENERIC_ATTESTATION: `${EBSI_TRUSTED_SCHEMAS_REGISTRY}/attestation-v1`,
} as const;

// ---------------------------------------------------------------------------
// EBSI Credential Creation
// ---------------------------------------------------------------------------

/**
 * Convert a W3C Verifiable Credential to EBSI-compliant format.
 */
export function toEBSICredential(credential: W3CVerifiableCredential): EBSICredential {
  const issuerDID = typeof credential.issuer === 'string' ? credential.issuer : credential.issuer.id;

  // Determine the EBSI schema based on credential type
  const ebsiType = mapToEBSIType(credential.type);
  const schemaId = mapToEBSISchema(ebsiType);

  // Build EBSI-compliant credential
  const ebsiCredential: EBSICredential = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      EBSI_CONTEXT,
      ...(credential['@context'].filter(c =>
        c !== 'https://www.w3.org/2018/credentials/v1' && typeof c === 'string'
      ) as string[]),
    ],
    id: credential.id,
    type: [
      'VerifiableCredential',
      'VerifiableAttestation',
      ebsiType,
    ],
    issuer: credential.issuer,
    validFrom: credential.validFrom || credential.issuanceDate || new Date().toISOString(),
    issuanceDate: credential.issuanceDate || credential.validFrom,
    ...(credential.validUntil && { validUntil: credential.validUntil }),
    credentialSubject: enrichSubjectForEBSI(credential.credentialSubject, ebsiType),
    credentialSchema: {
      id: schemaId,
      type: 'FullJsonSchemaValidator2021' as const,
    },
    termsOfUse: [{
      id: `${issuerDID}/terms/issuance`,
      type: 'IssuanceCertificate' as const,
    }],
    ...(credential.evidence && { evidence: credential.evidence }),
    ...(credential.proof && { proof: credential.proof }),
  };

  return ebsiCredential;
}

/**
 * Create an EBSI-compliant Verifiable Diploma from academic data.
 */
export function createEBSIDiploma(params: {
  issuerDID: string;
  issuerName: string;
  subjectDID: string;
  studentName: string;
  diplomaTitle: string;
  dateOfBirth?: string;
  awardingDate: string;
  programme: string;
  eqfLevel: number;
  ectsCredits?: number;
  grade?: string;
  countryCode?: string;
}): EBSICredential {
  const {
    issuerDID, issuerName, subjectDID, studentName,
    diplomaTitle, dateOfBirth, awardingDate, programme,
    eqfLevel, ectsCredits, grade, countryCode = 'EU',
  } = params;

  return {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      EBSI_CONTEXT,
    ],
    type: [
      'VerifiableCredential',
      'VerifiableAttestation',
      'VerifiableDiploma',
    ],
    issuer: {
      id: issuerDID,
      name: issuerName,
    },
    validFrom: awardingDate,
    issuanceDate: awardingDate,
    credentialSubject: {
      id: subjectDID,
      currentFamilyName: studentName.split(' ').slice(-1)[0] || studentName,
      currentGivenName: studentName.split(' ').slice(0, -1).join(' ') || studentName,
      ...(dateOfBirth && { dateOfBirth }),
      awardingOpportunity: {
        awardingBody: {
          id: issuerDID,
          preferredName: issuerName,
          homepage: `https://${issuerName.toLowerCase().replace(/\s+/g, '')}.edu`,
        },
        location: countryCode,
        startedAtTime: awardingDate,
      },
      learningAchievement: {
        title: diplomaTitle,
        description: programme,
        eqfLevel: `http://data.europa.eu/snb/eqf/${eqfLevel}`,
        ...(ectsCredits && { ectsCredits }),
        ...(grade && { grade }),
      },
    },
    credentialSchema: {
      id: EBSI_SCHEMA_IDS.VERIFIABLE_DIPLOMA,
      type: 'FullJsonSchemaValidator2021',
    },
    termsOfUse: [{
      id: `${issuerDID}/terms/issuance`,
      type: 'IssuanceCertificate',
    }],
  };
}

/**
 * Create an ECTS Credit Transfer credential.
 */
export function createECTSTransfer(params: {
  issuerDID: string;
  issuerName: string;
  subjectDID: string;
  studentName: string;
  courseName: string;
  ectsCredits: number;
  grade: string;
  completionDate: string;
  sendingInstitution: string;
  receivingInstitution: string;
}): EBSICredential {
  const {
    issuerDID, issuerName, subjectDID, studentName,
    courseName, ectsCredits, grade, completionDate,
    sendingInstitution, receivingInstitution,
  } = params;

  return {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      EBSI_CONTEXT,
    ],
    type: [
      'VerifiableCredential',
      'VerifiableAttestation',
      'ECTSCreditTransfer',
    ],
    issuer: { id: issuerDID, name: issuerName },
    validFrom: completionDate,
    issuanceDate: completionDate,
    credentialSubject: {
      id: subjectDID,
      studentName,
      courseName,
      ectsCredits,
      grade,
      completionDate,
      sendingInstitution,
      receivingInstitution,
      transferStatus: 'recognized',
    },
    credentialSchema: {
      id: EBSI_SCHEMA_IDS.ECTS_CREDIT,
      type: 'FullJsonSchemaValidator2021',
    },
    termsOfUse: [{
      id: `${issuerDID}/terms/transfer`,
      type: 'IssuanceCertificate',
    }],
  };
}

// ---------------------------------------------------------------------------
// EBSI Validation
// ---------------------------------------------------------------------------

/**
 * Validate that a credential meets EBSI conformance requirements.
 */
export function validateEBSIConformance(credential: W3CVerifiableCredential): {
  conformant: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Must include EBSI context
  if (!credential['@context'].includes(EBSI_CONTEXT)) {
    issues.push('Missing EBSI context URL');
  }

  // Must include VerifiableAttestation type
  if (!credential.type.includes('VerifiableAttestation')) {
    issues.push('Missing VerifiableAttestation type (required by EBSI)');
  }

  // Must have credentialSchema with FullJsonSchemaValidator2021
  if (!credential.credentialSchema) {
    issues.push('Missing credentialSchema (required by EBSI)');
  } else {
    const schema = Array.isArray(credential.credentialSchema)
      ? credential.credentialSchema[0]
      : credential.credentialSchema;
    if (schema.type !== 'FullJsonSchemaValidator2021') {
      issues.push('credentialSchema.type must be FullJsonSchemaValidator2021');
    }
  }

  // Must have termsOfUse with IssuanceCertificate
  if (!credential.termsOfUse || credential.termsOfUse.length === 0) {
    issues.push('Missing termsOfUse (required by EBSI)');
  } else if (!credential.termsOfUse.some(t => t.type === 'IssuanceCertificate')) {
    issues.push('termsOfUse must include an IssuanceCertificate');
  }

  // Issuer must be a DID
  const issuerStr = typeof credential.issuer === 'string' ? credential.issuer : credential.issuer?.id;
  if (!issuerStr || !issuerStr.startsWith('did:')) {
    issues.push('Issuer must be a valid DID');
  }

  return {
    conformant: issues.length === 0,
    issues,
  };
}

// ---------------------------------------------------------------------------
// EBSI Trusted Issuer Registry Integration
// ---------------------------------------------------------------------------

/**
 * Register an institution as an EBSI Trusted Issuer.
 */
export function registerEBSITrustedIssuer(issuer: EBSITrustedIssuer): void {
  // Add to the governance registry as well
  governanceRegistry.addTrustedIssuer({
    did: issuer.did,
    name: issuer.organizationInfo.legalName,
    accreditedBy: 'ebsi:trusted-issuers-registry',
    createdAt: new Date().toISOString(),
    status: 'active',
  });
}

/**
 * Check if an issuer is EBSI-accredited.
 */
export function isEBSIAccredited(issuerDID: string): boolean {
  const issuer = governanceRegistry.getIssuer(issuerDID);
  return issuer !== null && issuer.accreditedBy.includes('ebsi');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapToEBSIType(types: string[]): string {
  for (const t of types) {
    if (t === 'VerifiableCredential') continue;
    if (Object.values(EBSI_CREDENTIAL_TYPES).includes(t as any)) {
      return t;
    }
    // Map common types to EBSI equivalents
    if (t.includes('Diploma') || t.includes('Degree') || t.includes('Bachelor') || t.includes('Master')) {
      return EBSI_CREDENTIAL_TYPES.VERIFIABLE_DIPLOMA;
    }
    if (t.includes('Certificate') || t.includes('Attestation')) {
      return EBSI_CREDENTIAL_TYPES.VERIFIABLE_ATTESTATION;
    }
    if (t.includes('ECTS') || t.includes('Credit')) {
      return EBSI_CREDENTIAL_TYPES.ECTS_CREDIT_TRANSFER;
    }
  }
  return EBSI_CREDENTIAL_TYPES.VERIFIABLE_ATTESTATION;
}

function mapToEBSISchema(ebsiType: string): string {
  switch (ebsiType) {
    case EBSI_CREDENTIAL_TYPES.VERIFIABLE_DIPLOMA:
    case EBSI_CREDENTIAL_TYPES.EUROPASS_DIPLOMA_SUPPLEMENT:
      return EBSI_SCHEMA_IDS.VERIFIABLE_DIPLOMA;
    case EBSI_CREDENTIAL_TYPES.ECTS_CREDIT_TRANSFER:
      return EBSI_SCHEMA_IDS.ECTS_CREDIT;
    default:
      return EBSI_SCHEMA_IDS.GENERIC_ATTESTATION;
  }
}

function enrichSubjectForEBSI(
  subject: CredentialSubject | CredentialSubject[],
  ebsiType: string
): CredentialSubject {
  const subj = Array.isArray(subject) ? subject[0] : subject;

  // Add EBSI-specific fields based on type
  const enriched: CredentialSubject = { ...subj };

  if (!enriched.currentFamilyName && enriched.name) {
    const name = String(enriched.name);
    enriched.currentFamilyName = name.split(' ').slice(-1)[0] || name;
    enriched.currentGivenName = name.split(' ').slice(0, -1).join(' ') || name;
  }

  return enriched;
}
