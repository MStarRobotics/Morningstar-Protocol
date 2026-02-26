import { api } from './env';
import { logger } from './logger';
import { authService } from './authService';
import type { Institution } from '../types';

export interface CreateInstitutionInput {
  name: string;
  address: string;
  role: Institution['role'];
  kycStatus: Institution['kycStatus'];
}

export interface UpdateInstitutionInput {
  role?: Institution['role'];
  kycStatus?: Institution['kycStatus'];
}

export interface GovernanceRoleAccessRequest {
  requestId: string;
  sessionId: string;
  requestedRole: 'student' | 'issuer' | 'verifier' | 'governance';
  reason: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  walletAddress: string | null;
  verifiedEmail: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedBy: string | null;
  reviewNote: string | null;
}

interface GovernanceListResponse {
  institutions?: unknown;
}

interface GovernanceMutationResponse {
  institution?: unknown;
}

interface RoleAccessListResponse {
  requests?: unknown;
}

interface RoleAccessMutationResponse {
  status?: unknown;
  requestId?: unknown;
}

const ALLOWED_ROLES = new Set<Institution['role']>(['ISSUER_ROLE', 'NONE']);
const ALLOWED_KYC_STATUSES = new Set<Institution['kycStatus']>(['verified', 'pending', 'rejected']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isInstitution(value: unknown): value is Institution {
  if (!isPlainObject(value)) return false;
  const role = value.role;
  const kycStatus = value.kycStatus;

  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.address === 'string' &&
    typeof value.addedDate === 'string' &&
    typeof role === 'string' &&
    typeof kycStatus === 'string' &&
    ALLOWED_ROLES.has(role as Institution['role']) &&
    ALLOWED_KYC_STATUSES.has(kycStatus as Institution['kycStatus'])
  );
}

function isGovernanceRoleAccessRequest(value: unknown): value is GovernanceRoleAccessRequest {
  if (!isPlainObject(value)) return false;

  const status = value.status;
  const role = value.requestedRole;
  const reviewedBy = value.reviewedBy;
  const reviewNote = value.reviewNote;
  const walletAddress = value.walletAddress;
  const verifiedEmail = value.verifiedEmail;

  const validStatus = status === 'pending' || status === 'approved' || status === 'denied' || status === 'expired';
  const validRole = role === 'student' || role === 'issuer' || role === 'verifier' || role === 'governance';
  const validReviewedBy = reviewedBy === null || typeof reviewedBy === 'string';
  const validReviewNote = reviewNote === null || typeof reviewNote === 'string';
  const validWalletAddress = walletAddress === null || typeof walletAddress === 'string';
  const validVerifiedEmail = verifiedEmail === null || typeof verifiedEmail === 'string';

  return (
    typeof value.requestId === 'string' &&
    typeof value.sessionId === 'string' &&
    validRole &&
    typeof value.reason === 'string' &&
    validStatus &&
    validWalletAddress &&
    validVerifiedEmail &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    validReviewedBy &&
    validReviewNote
  );
}

async function parseApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json();
    if (isPlainObject(payload) && typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error;
    }
  } catch (error) {
    logger.warn('[GovernanceApi] Failed to parse error response payload', error);
  }

  return `${fallback} (HTTP ${response.status})`;
}

function getWriteHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
  };
}

function normalizeInstitutionPayload(payload: unknown): Institution {
  if (!isInstitution(payload)) {
    throw new Error('Governance API returned an invalid institution payload.');
  }

  return payload;
}

export async function fetchGovernanceInstitutions(): Promise<Institution[]> {
  const response = await fetch(api.url('/api/governance/institutions'));
  if (!response.ok) {
    throw new Error(await parseApiError(response, 'Failed to fetch institutions'));
  }

  const payload = (await response.json()) as GovernanceListResponse;
  if (!Array.isArray(payload.institutions)) {
    throw new Error('Governance API returned an invalid institutions list payload.');
  }

  return payload.institutions
    .filter(isInstitution)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createGovernanceInstitution(
  input: CreateInstitutionInput,
): Promise<Institution> {
  const response = await authService.fetchWithSessionAuth('/api/governance/institutions', {
    method: 'POST',
    headers: getWriteHeaders(),
    body: JSON.stringify({
      name: input.name.trim(),
      address: input.address.trim(),
      role: input.role,
      kycStatus: input.kycStatus,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, 'Failed to add institution'));
  }

  const payload = (await response.json()) as GovernanceMutationResponse;
  return normalizeInstitutionPayload(payload.institution);
}

export async function updateGovernanceInstitution(
  institutionId: string,
  updates: UpdateInstitutionInput,
): Promise<Institution> {
  const response = await authService.fetchWithSessionAuth(
    `/api/governance/institutions/${encodeURIComponent(institutionId)}`,
    {
      method: 'PATCH',
      headers: getWriteHeaders(),
      body: JSON.stringify(updates),
    },
  );

  if (!response.ok) {
    throw new Error(await parseApiError(response, 'Failed to update institution'));
  }

  const payload = (await response.json()) as GovernanceMutationResponse;
  return normalizeInstitutionPayload(payload.institution);
}

export async function fetchRoleAccessRequests(): Promise<GovernanceRoleAccessRequest[]> {
  const response = await authService.fetchWithSessionAuth('/api/auth/role/requests', {
    headers: getWriteHeaders(),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, 'Failed to fetch role access requests'));
  }

  const payload = (await response.json()) as RoleAccessListResponse;
  if (!Array.isArray(payload.requests)) {
    throw new Error('Role access request payload is invalid.');
  }

  return payload.requests
    .filter(isGovernanceRoleAccessRequest)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function reviewRoleAccessRequest(
  requestId: string,
  approve: boolean,
  reviewNote?: string,
): Promise<{ requestId: string; status: GovernanceRoleAccessRequest['status'] }> {
  const response = await authService.fetchWithSessionAuth('/api/auth/role/approve', {
    method: 'POST',
    headers: getWriteHeaders(),
    body: JSON.stringify({
      requestId: requestId.trim(),
      approve,
      ...(reviewNote ? { reviewNote: reviewNote.trim() } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, 'Failed to review role access request'));
  }

  const payload = (await response.json()) as RoleAccessMutationResponse;
  if (
    typeof payload.requestId !== 'string' ||
    (payload.status !== 'approved' && payload.status !== 'denied' && payload.status !== 'pending' && payload.status !== 'expired')
  ) {
    throw new Error('Role access mutation payload is invalid.');
  }

  return {
    requestId: payload.requestId,
    status: payload.status,
  };
}
