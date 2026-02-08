/**
 * Credential Status Registry
 * Based on Pistis and Hyperledger papers
 * Implements StatusList2021 for credential revocation
 */

import { sha256 } from './cryptography';
import { logger } from './logger';

// Status List Entry
export interface CredentialStatusEntry {
  credentialId: string;
  status: 'active' | 'revoked' | 'suspended';
  statusReason?: string;
  revokedAt?: string;
  revokedBy?: string;
  statusListIndex: number;
}

// Status List 2021 (W3C Standard)
export interface StatusList2021 {
  '@context': string[];
  id: string;
  type: 'StatusList2021Credential';
  issuer: string;
  issuanceDate: string;
  credentialSubject: {
    id: string;
    type: 'StatusList2021';
    statusPurpose: 'revocation' | 'suspension';
    encodedList: string; // Compressed bitstring
  };
}

// Credential Status Registry
export class CredentialStatusRegistry {
  private static statusMap: Map<string, CredentialStatusEntry> = new Map();
  private static statusListIndex = 0;

  /**
   * Register credential status
   */
  static async registerCredential(credentialId: string): Promise<number> {
    const statusIndex = this.statusListIndex++;
    
    const entry: CredentialStatusEntry = {
      credentialId,
      status: 'active',
      statusListIndex: statusIndex
    };

    this.statusMap.set(credentialId, entry);
    logger.info('Credential registered in status registry', { credentialId, statusIndex });

    return statusIndex;
  }

  /**
   * Revoke credential
   */
  static async revokeCredential(
    credentialId: string,
    revokedBy: string,
    reason?: string
  ): Promise<boolean> {
    const entry = this.statusMap.get(credentialId);
    if (!entry) {
      logger.error('Credential not found in registry', { credentialId });
      return false;
    }

    entry.status = 'revoked';
    entry.revokedAt = new Date().toISOString();
    entry.revokedBy = revokedBy;
    entry.statusReason = reason;

    this.statusMap.set(credentialId, entry);
    logger.info('Credential revoked', { credentialId, revokedBy, reason });

    return true;
  }

  /**
   * Suspend credential
   */
  static async suspendCredential(
    credentialId: string,
    reason?: string
  ): Promise<boolean> {
    const entry = this.statusMap.get(credentialId);
    if (!entry) {
      return false;
    }

    entry.status = 'suspended';
    entry.statusReason = reason;

    this.statusMap.set(credentialId, entry);
    logger.info('Credential suspended', { credentialId, reason });

    return true;
  }

  /**
   * Reactivate suspended credential
   */
  static async reactivateCredential(credentialId: string): Promise<boolean> {
    const entry = this.statusMap.get(credentialId);
    if (!entry || entry.status !== 'suspended') {
      return false;
    }

    entry.status = 'active';
    entry.statusReason = undefined;

    this.statusMap.set(credentialId, entry);
    logger.info('Credential reactivated', { credentialId });

    return true;
  }

  /**
   * Check credential status
   */
  static async checkStatus(credentialId: string): Promise<CredentialStatusEntry | null> {
    return this.statusMap.get(credentialId) || null;
  }

  /**
   * Verify credential is active
   */
  static async isActive(credentialId: string): Promise<boolean> {
    const entry = this.statusMap.get(credentialId);
    return entry?.status === 'active';
  }

  /**
   * Generate StatusList2021 credential
   */
  static async generateStatusList(issuerDID: string): Promise<StatusList2021> {
    // Create bitstring for status list
    const bitArray = new Array(this.statusListIndex).fill(0);
    
    this.statusMap.forEach((entry) => {
      if (entry.status === 'revoked') {
        bitArray[entry.statusListIndex] = 1;
      }
    });

    // Compress bitstring (simplified - in production use GZIP)
    const encodedList = Buffer.from(bitArray.join('')).toString('base64');

    const statusList: StatusList2021 = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://w3id.org/vc/status-list/2021/v1'
      ],
      id: `${issuerDID}/status-list/1`,
      type: 'StatusList2021Credential',
      issuer: issuerDID,
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: `${issuerDID}/status-list/1#list`,
        type: 'StatusList2021',
        statusPurpose: 'revocation',
        encodedList
      }
    };

    return statusList;
  }

  /**
   * Get revocation statistics
   */
  static getStatistics(): {
    total: number;
    active: number;
    revoked: number;
    suspended: number;
  } {
    let active = 0, revoked = 0, suspended = 0;

    this.statusMap.forEach((entry) => {
      if (entry.status === 'active') active++;
      else if (entry.status === 'revoked') revoked++;
      else if (entry.status === 'suspended') suspended++;
    });

    return {
      total: this.statusMap.size,
      active,
      revoked,
      suspended
    };
  }

  /**
   * Get all revoked credentials
   */
  static getRevokedCredentials(): CredentialStatusEntry[] {
    return Array.from(this.statusMap.values()).filter(
      entry => entry.status === 'revoked'
    );
  }

  /**
   * Batch revoke credentials
   */
  static async batchRevoke(
    credentialIds: string[],
    revokedBy: string,
    reason?: string
  ): Promise<{ success: string[]; failed: string[] }> {
    const success: string[] = [];
    const failed: string[] = [];

    for (const id of credentialIds) {
      const result = await this.revokeCredential(id, revokedBy, reason);
      if (result) {
        success.push(id);
      } else {
        failed.push(id);
      }
    }

    logger.info('Batch revocation completed', { 
      total: credentialIds.length, 
      success: success.length, 
      failed: failed.length 
    });

    return { success, failed };
  }
}
