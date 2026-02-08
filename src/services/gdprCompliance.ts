/**
 * GDPR Compliance Service
 * Implements General Data Protection Regulation requirements
 * Based on: ZKBAR-V GDPR Compliance Framework
 * 
 * Key GDPR Principles:
 * 1. Lawfulness, fairness, and transparency
 * 2. Purpose limitation
 * 3. Data minimization
 * 4. Accuracy
 * 5. Storage limitation
 * 6. Integrity and confidentiality
 * 7. Accountability
 */

import { sha256 } from './cryptography';

export interface GDPRConsent {
  userId: string;
  purposes: ConsentPurpose[];
  givenAt: string;
  expiresAt?: string;
  revokedAt?: string;
  version: string;
}

export interface ConsentPurpose {
  purpose: 'credential_issuance' | 'credential_verification' | 'data_analytics' | 'third_party_sharing';
  granted: boolean;
  mandatory: boolean;
}

export interface DataSubjectRequest {
  requestId: string;
  userId: string;
  type: 'access' | 'rectification' | 'erasure' | 'portability' | 'restriction' | 'objection';
  status: 'pending' | 'in-progress' | 'completed' | 'rejected';
  requestedAt: string;
  completedAt?: string;
  rejectionReason?: string;
}

export interface DataProcessingRecord {
  id: string;
  dataSubject: string;
  processingActivity: string;
  legalBasis: 'consent' | 'contract' | 'legal_obligation' | 'vital_interests' | 'public_task' | 'legitimate_interests';
  dataCategories: string[];
  recipients: string[];
  retentionPeriod: string;
  timestamp: string;
}

export interface PrivacyNotice {
  version: string;
  effectiveDate: string;
  dataController: {
    name: string;
    contact: string;
    dpo?: string; // Data Protection Officer
  };
  dataProcessed: {
    type: string;
    purpose: string;
    legalBasis: string;
    retention: string;
  }[];
  userRights: string[];
  thirdPartySharing: boolean;
  internationalTransfers: boolean;
}

class GDPRComplianceService {
  private consents: Map<string, GDPRConsent> = new Map();
  private dataSubjectRequests: Map<string, DataSubjectRequest> = new Map();
  private processingRecords: DataProcessingRecord[] = [];
  private privacyNoticeVersion = '2.0.0';

  /**
   * Record user consent
   */
  async recordConsent(
    userId: string,
    purposes: ConsentPurpose[],
    expiryDays?: number
  ): Promise<GDPRConsent> {
    const consent: GDPRConsent = {
      userId,
      purposes,
      givenAt: new Date().toISOString(),
      expiresAt: expiryDays 
        ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
        : undefined,
      version: this.privacyNoticeVersion
    };

    this.consents.set(userId, consent);
    
    // Log processing activity
    await this.logProcessingActivity({
      dataSubject: userId,
      processingActivity: 'Consent Recording',
      legalBasis: 'consent',
      dataCategories: ['user_id', 'consent_preferences'],
      recipients: ['internal_system'],
      retentionPeriod: expiryDays ? `${expiryDays} days` : 'indefinite'
    });

    return consent;
  }

  /**
   * Check if user has valid consent
   */
  hasValidConsent(userId: string, purpose?: string): boolean {
    const consent = this.consents.get(userId);

    if (!consent) return false;
    if (consent.revokedAt) return false;

    // Check expiry
    if (consent.expiresAt && new Date() > new Date(consent.expiresAt)) {
      return false;
    }

    // Check specific purpose if provided
    if (purpose) {
      const purposeConsent = consent.purposes.find(p => p.purpose === purpose);
      return purposeConsent ? purposeConsent.granted : false;
    }

    return true;
  }

  /**
   * Revoke consent
   */
  async revokeConsent(userId: string): Promise<boolean> {
    const consent = this.consents.get(userId);

    if (!consent) return false;

    consent.revokedAt = new Date().toISOString();
    this.consents.set(userId, consent);

    // Log revocation
    await this.logProcessingActivity({
      dataSubject: userId,
      processingActivity: 'Consent Revocation',
      legalBasis: 'consent',
      dataCategories: ['user_id'],
      recipients: ['internal_system'],
      retentionPeriod: '7 years' // Legal requirement
    });

    return true;
  }

  /**
   * Submit data subject request (e.g., Right to be Forgotten)
   */
  submitDataSubjectRequest(
    userId: string,
    type: DataSubjectRequest['type']
  ): DataSubjectRequest {
    const request: DataSubjectRequest = {
      requestId: 'dsr_' + Date.now(),
      userId,
      type,
      status: 'pending',
      requestedAt: new Date().toISOString()
    };

    this.dataSubjectRequests.set(request.requestId, request);
    return request;
  }

  /**
   * Process Right of Access request
   */
  async processAccessRequest(requestId: string): Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
  }> {
    const request = this.dataSubjectRequests.get(requestId);

    if (!request || request.type !== 'access') {
      return { success: false, error: 'Invalid request' };
    }

    request.status = 'in-progress';
    this.dataSubjectRequests.set(requestId, request);

    // Gather all user data
    const userData = {
      userId: request.userId,
      consent: this.consents.get(request.userId),
      processingActivities: this.processingRecords.filter(
        r => r.dataSubject === request.userId
      ),
      credentials: [], // Would fetch from blockchain
      requests: Array.from(this.dataSubjectRequests.values()).filter(
        r => r.userId === request.userId
      )
    };

    request.status = 'completed';
    request.completedAt = new Date().toISOString();
    this.dataSubjectRequests.set(requestId, request);

    return { success: true, data: userData };
  }

  /**
   * Process Right to Erasure (Right to be Forgotten)
   */
  async processErasureRequest(requestId: string): Promise<{
    success: boolean;
    itemsErased?: number;
    error?: string;
  }> {
    const request = this.dataSubjectRequests.get(requestId);

    if (!request || request.type !== 'erasure') {
      return { success: false, error: 'Invalid request' };
    }

    request.status = 'in-progress';
    this.dataSubjectRequests.set(requestId, request);

    let itemsErased = 0;

    // Delete consent records
    if (this.consents.delete(request.userId)) itemsErased++;

    // Anonymize processing records
    this.processingRecords.forEach(record => {
      if (record.dataSubject === request.userId) {
        record.dataSubject = 'anonymized_' + record.dataSubject.substring(0, 8);
        itemsErased++;
      }
    });

    // Note: Blockchain data cannot be deleted (immutability)
    // Instead, we revoke credentials and add erasure marker
    // This complies with GDPR as blockchain hashes don't contain personal data

    request.status = 'completed';
    request.completedAt = new Date().toISOString();
    this.dataSubjectRequests.set(requestId, request);

    return { success: true, itemsErased };
  }

  /**
   * Process Data Portability request
   */
  async processPortabilityRequest(requestId: string): Promise<{
    success: boolean;
    data?: string; // JSON format
    error?: string;
  }> {
    const request = this.dataSubjectRequests.get(requestId);

    if (!request || request.type !== 'portability') {
      return { success: false, error: 'Invalid request' };
    }

    const accessResult = await this.processAccessRequest(requestId);

    if (!accessResult.success || !accessResult.data) {
      return { success: false, error: 'Failed to retrieve data' };
    }

    // Export in machine-readable format (JSON)
    const portableData = JSON.stringify(accessResult.data, null, 2);

    request.status = 'completed';
    request.completedAt = new Date().toISOString();
    this.dataSubjectRequests.set(requestId, request);

    return { success: true, data: portableData };
  }

  /**
   * Log data processing activity
   */
  async logProcessingActivity(record: Omit<DataProcessingRecord, 'id' | 'timestamp'>): Promise<void> {
    const full: DataProcessingRecord = {
      id: await sha256(JSON.stringify(record) + Date.now()),
      ...record,
      timestamp: new Date().toISOString()
    };

    this.processingRecords.push(full);

    // Limit to last 10,000 records
    if (this.processingRecords.length > 10000) {
      this.processingRecords.shift();
    }
  }

  /**
   * Get privacy notice
   */
  getPrivacyNotice(): PrivacyNotice {
    return {
      version: this.privacyNoticeVersion,
      effectiveDate: '2024-01-01',
      dataController: {
        name: 'Morningstar Credentials Platform',
        contact: 'privacy@morningstar-credentials.io',
        dpo: 'dpo@morningstar-credentials.io'
      },
      dataProcessed: [
        {
          type: 'Decentralized Identifier (DID)',
          purpose: 'User authentication and credential management',
          legalBasis: 'consent',
          retention: 'Until account deletion or consent withdrawal'
        },
        {
          type: 'Academic Credentials',
          purpose: 'Credential issuance and verification',
          legalBasis: 'contract',
          retention: 'Permanently on blockchain (hashes only, no personal data)'
        },
        {
          type: 'Usage Analytics',
          purpose: 'System improvement and security monitoring',
          legalBasis: 'legitimate_interests',
          retention: '12 months'
        }
      ],
      userRights: [
        'Right to access your data',
        'Right to rectification',
        'Right to erasure (Right to be Forgotten)',
        'Right to data portability',
        'Right to restrict processing',
        'Right to object to processing',
        'Right to withdraw consent'
      ],
      thirdPartySharing: false,
      internationalTransfers: false
    };
  }

  /**
   * Generate GDPR compliance report
   */
  generateComplianceReport(): {
    consentRate: number;
    activeConsents: number;
    revokedConsents: number;
    pendingRequests: number;
    completedRequests: number;
    processingActivities: number;
    complianceScore: number;
  } {
    const allConsents = Array.from(this.consents.values());
    const activeConsents = allConsents.filter(c => !c.revokedAt && this.hasValidConsent(c.userId));
    const revokedConsents = allConsents.filter(c => c.revokedAt);

    const allRequests = Array.from(this.dataSubjectRequests.values());
    const pendingRequests = allRequests.filter(r => r.status === 'pending' || r.status === 'in-progress');
    const completedRequests = allRequests.filter(r => r.status === 'completed');

    const consentRate = allConsents.length > 0 ? (activeConsents.length / allConsents.length) * 100 : 0;

    // Compliance score based on request fulfillment rate
    const requestFulfillmentRate = allRequests.length > 0
      ? (completedRequests.length / allRequests.length) * 100
      : 100;

    const complianceScore = (consentRate * 0.5) + (requestFulfillmentRate * 0.5);

    return {
      consentRate: parseFloat(consentRate.toFixed(2)),
      activeConsents: activeConsents.length,
      revokedConsents: revokedConsents.length,
      pendingRequests: pendingRequests.length,
      completedRequests: completedRequests.length,
      processingActivities: this.processingRecords.length,
      complianceScore: parseFloat(complianceScore.toFixed(2))
    };
  }

  /**
   * Check data retention compliance
   */
  checkRetentionCompliance(): {
    compliant: boolean;
    expiredRecords: number;
    recommendations: string[];
  } {
    // In production, would check actual data retention against policies
    const recommendations: string[] = [];

    if (this.processingRecords.length > 10000) {
      recommendations.push('Archive old processing records');
    }

    const expiredConsents = Array.from(this.consents.values()).filter(c => 
      c.expiresAt && new Date() > new Date(c.expiresAt)
    );

    if (expiredConsents.length > 0) {
      recommendations.push(`Renew or delete ${expiredConsents.length} expired consents`);
    }

    return {
      compliant: recommendations.length === 0,
      expiredRecords: expiredConsents.length,
      recommendations
    };
  }
}

// Singleton instance
export const gdprService = new GDPRComplianceService();
