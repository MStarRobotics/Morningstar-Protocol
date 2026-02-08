/**
 * Smart Contract Registry
 * Based on Hyperledger Fabric and Pistis papers
 * Simulates on-chain operations for credential management
 */

import { sha256 } from './cryptography';
import { logger } from './logger';

// Smart Contract Operation Types
export enum OperationType {
  ISSUE_CREDENTIAL = 'ISSUE_CREDENTIAL',
  REVOKE_CREDENTIAL = 'REVOKE_CREDENTIAL',
  UPDATE_DID = 'UPDATE_DID',
  ADD_TRUSTED_CONTACT = 'ADD_TRUSTED_CONTACT',
  REMOVE_TRUSTED_CONTACT = 'REMOVE_TRUSTED_CONTACT'
}

// Smart Contract Transaction
export interface SmartContractTransaction {
  txId: string;
  operation: OperationType;
  from: string;
  timestamp: string;
  data: Record<string, unknown>;
  signatures: string[];
  status: 'pending' | 'confirmed' | 'failed';
  gasUsed: number;
}

// Endorsement Policy
export interface EndorsementPolicy {
  requiredSignatures: number;
  authorizedSigners: string[];
}

// Permission Registry Entry
export interface PermissionEntry {
  entity: string;
  role: 'admin' | 'issuer' | 'verifier' | 'student';
  permissions: string[];
  grantedBy: string;
  grantedAt: string;
}

// Smart Contract Registry
export class SmartContractRegistry {
  private static transactions: Map<string, SmartContractTransaction> = new Map();
  private static permissions: Map<string, PermissionEntry> = new Map();
  private static trustedContacts: Map<string, Set<string>> = new Map();
  private static endorsementPolicies: Map<OperationType, EndorsementPolicy> = new Map();

  /**
   * Initialize default endorsement policies
   */
  static initialize(): void {
    // Issue credential requires 1 signature from issuer
    this.endorsementPolicies.set(OperationType.ISSUE_CREDENTIAL, {
      requiredSignatures: 1,
      authorizedSigners: []
    });

    // Revoke credential requires 2 signatures (multi-sig)
    this.endorsementPolicies.set(OperationType.REVOKE_CREDENTIAL, {
      requiredSignatures: 2,
      authorizedSigners: []
    });

    logger.info('Smart Contract Registry initialized');
  }

  /**
   * Submit transaction to smart contract
   */
  static async submitTransaction(
    operation: OperationType,
    from: string,
    data: Record<string, unknown>,
    signatures: string[]
  ): Promise<string> {
    const txId = `tx_${await sha256(`${operation}:${from}:${Date.now()}`)}`;

    // Verify endorsement policy
    const policy = this.endorsementPolicies.get(operation);
    if (policy && signatures.length < policy.requiredSignatures) {
      throw new Error(`Insufficient signatures. Required: ${policy.requiredSignatures}, Got: ${signatures.length}`);
    }

    const transaction: SmartContractTransaction = {
      txId,
      operation,
      from,
      timestamp: new Date().toISOString(),
      data,
      signatures,
      status: 'pending',
      gasUsed: this.calculateGas(operation)
    };

    this.transactions.set(txId, transaction);

    // Simulate consensus and confirmation
    setTimeout(() => {
      transaction.status = 'confirmed';
      this.transactions.set(txId, transaction);
      logger.info('Transaction confirmed', { txId, operation });
    }, 100);

    logger.info('Transaction submitted', { txId, operation, from });
    return txId;
  }

  /**
   * Get transaction status
   */
  static getTransaction(txId: string): SmartContractTransaction | null {
    return this.transactions.get(txId) || null;
  }

  /**
   * Grant permission to entity
   */
  static async grantPermission(
    entity: string,
    role: 'admin' | 'issuer' | 'verifier' | 'student',
    permissions: string[],
    grantedBy: string
  ): Promise<boolean> {
    const entry: PermissionEntry = {
      entity,
      role,
      permissions,
      grantedBy,
      grantedAt: new Date().toISOString()
    };

    this.permissions.set(entity, entry);
    logger.info('Permission granted', { entity, role, permissions });

    return true;
  }

  /**
   * Check if entity has permission
   */
  static hasPermission(entity: string, permission: string): boolean {
    const entry = this.permissions.get(entity);
    return entry?.permissions.includes(permission) || false;
  }

  /**
   * Add trusted contact
   */
  static async addTrustedContact(entity: string, contact: string): Promise<boolean> {
    if (!this.trustedContacts.has(entity)) {
      this.trustedContacts.set(entity, new Set());
    }

    this.trustedContacts.get(entity)!.add(contact);
    logger.info('Trusted contact added', { entity, contact });

    return true;
  }

  /**
   * Remove trusted contact
   */
  static async removeTrustedContact(entity: string, contact: string): Promise<boolean> {
    const contacts = this.trustedContacts.get(entity);
    if (!contacts) {
      return false;
    }

    const removed = contacts.delete(contact);
    if (removed) {
      logger.info('Trusted contact removed', { entity, contact });
    }

    return removed;
  }

  /**
   * Get trusted contacts
   */
  static getTrustedContacts(entity: string): string[] {
    return Array.from(this.trustedContacts.get(entity) || []);
  }

  /**
   * Verify if contact is trusted
   */
  static isTrustedContact(entity: string, contact: string): boolean {
    return this.trustedContacts.get(entity)?.has(contact) || false;
  }

  /**
   * Calculate gas cost for operation
   */
  private static calculateGas(operation: OperationType): number {
    const gasCosts: Record<OperationType, number> = {
      [OperationType.ISSUE_CREDENTIAL]: 50000,
      [OperationType.REVOKE_CREDENTIAL]: 30000,
      [OperationType.UPDATE_DID]: 40000,
      [OperationType.ADD_TRUSTED_CONTACT]: 20000,
      [OperationType.REMOVE_TRUSTED_CONTACT]: 15000
    };

    return gasCosts[operation] || 10000;
  }

  /**
   * Get transaction history for entity
   */
  static getTransactionHistory(entity: string): SmartContractTransaction[] {
    return Array.from(this.transactions.values()).filter(
      tx => tx.from === entity
    );
  }

  /**
   * Get all confirmed transactions
   */
  static getConfirmedTransactions(): SmartContractTransaction[] {
    return Array.from(this.transactions.values()).filter(
      tx => tx.status === 'confirmed'
    );
  }

  /**
   * Get total gas used by entity
   */
  static getTotalGasUsed(entity: string): number {
    return this.getTransactionHistory(entity).reduce(
      (total, tx) => total + tx.gasUsed,
      0
    );
  }

  /**
   * Get registry statistics
   */
  static getStatistics(): {
    totalTransactions: number;
    confirmedTransactions: number;
    pendingTransactions: number;
    totalGasUsed: number;
    totalPermissions: number;
    totalTrustedContacts: number;
  } {
    const transactions = Array.from(this.transactions.values());
    
    return {
      totalTransactions: transactions.length,
      confirmedTransactions: transactions.filter(tx => tx.status === 'confirmed').length,
      pendingTransactions: transactions.filter(tx => tx.status === 'pending').length,
      totalGasUsed: transactions.reduce((sum, tx) => sum + tx.gasUsed, 0),
      totalPermissions: this.permissions.size,
      totalTrustedContacts: Array.from(this.trustedContacts.values()).reduce(
        (sum, contacts) => sum + contacts.size,
        0
      )
    };
  }
}

// Initialize on module load
SmartContractRegistry.initialize();
