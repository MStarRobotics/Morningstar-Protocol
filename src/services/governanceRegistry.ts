/**
 * Governance Registry
 * Tracks trusted accreditation organizations, issuers, and schema authorities.
 */

import { env } from './env';
import { logger } from './logger';

export interface TrustedAccreditationOrg {
  id: string;
  name: string;
  jurisdiction: string;
  createdAt: string;
}

export interface TrustedIssuer {
  did: string;
  name: string;
  accreditedBy: string;
  createdAt: string;
  status: 'active' | 'suspended' | 'revoked';
}

class GovernanceRegistry {
  private accreditationOrgs: Map<string, TrustedAccreditationOrg> = new Map();
  private issuers: Map<string, TrustedIssuer> = new Map();

  addAccreditationOrg(org: TrustedAccreditationOrg): void {
    this.accreditationOrgs.set(org.id, org);
  }

  addTrustedIssuer(issuer: TrustedIssuer): void {
    this.issuers.set(issuer.did, issuer);
  }

  isTrustedIssuer(did: string): boolean {
    const issuer = this.issuers.get(did);
    return Boolean(issuer && issuer.status === 'active');
  }

  getIssuer(did: string): TrustedIssuer | null {
    return this.issuers.get(did) || null;
  }

  getAccreditationOrg(id: string): TrustedAccreditationOrg | null {
    return this.accreditationOrgs.get(id) || null;
  }

  listIssuers(): TrustedIssuer[] {
    return Array.from(this.issuers.values());
  }

  listAccreditors(): TrustedAccreditationOrg[] {
    return Array.from(this.accreditationOrgs.values());
  }

  async loadFromUrl(url: string): Promise<void> {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`Governance registry fetch failed: ${response.status}`);
    }
    const payload = await response.json();
    this.loadFromPayload(payload);
  }

  loadFromPayload(payload: { accreditors?: TrustedAccreditationOrg[]; issuers?: TrustedIssuer[] }): void {
    payload.accreditors?.forEach(org => this.addAccreditationOrg(org));
    payload.issuers?.forEach(issuer => this.addTrustedIssuer(issuer));
  }
}

export const governanceRegistry = new GovernanceRegistry();

// Bootstrap defaults for demo
const defaultAccreditor: TrustedAccreditationOrg = {
  id: 'tao:global-edu',
  name: 'Global Accreditation Authority',
  jurisdiction: 'Global',
  createdAt: new Date().toISOString()
};

governanceRegistry.addAccreditationOrg(defaultAccreditor);

governanceRegistry.addTrustedIssuer({
  did: 'did:web:polygon.university',
  name: 'Polygon University',
  accreditedBy: defaultAccreditor.id,
  createdAt: new Date().toISOString(),
  status: 'active'
});

export async function initializeGovernanceRegistry(): Promise<void> {
  if (!env.governanceRegistryUrl) return;
  try {
    await governanceRegistry.loadFromUrl(env.governanceRegistryUrl);
  } catch (error) {
    logger.warn('[GovernanceRegistry] Failed to load remote registry:', error);
  }
}
