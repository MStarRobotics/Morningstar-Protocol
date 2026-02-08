/**
 * Security Framework Service
 * Implements STRIDE and DREAD security models
 * Based on: ZKBAR-V Security and Privacy Requirements
 * 
 * References:
 * - MDPI Sensors 2025: Table 4 (Threat Actors), Table 5 (STRIDE), Table 7 (DREAD)
 */

export interface ThreatActor {
  name: string;
  capabilities: string[];
  motivation: string;
  accessLevel: 'external' | 'partial' | 'full';
}

export interface STRIDEThreat {
  category: 'Spoofing' | 'Tampering' | 'Repudiation' | 'Information Disclosure' | 'Denial of Service' | 'Elevation of Privilege';
  description: string;
  affectedComponent: string;
  mitigation: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'mitigated' | 'in-progress' | 'identified';
}

export interface DREADScore {
  damage: number;           // 1-10
  reproducibility: number;  // 1-10
  exploitability: number;   // 1-10
  affectedUsers: number;    // 1-10
  discoverability: number;  // 1-10
  totalScore: number;       // Average of above
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface SecurityAudit {
  id: string;
  timestamp: string;
  component: string;
  threats: STRIDEThreat[];
  dreadAssessment: DREADScore;
  recommendations: string[];
  auditor: string;
}

class SecurityFramework {
  private threatActors: ThreatActor[] = [
    {
      name: 'External Attacker',
      capabilities: ['Network sniffing', 'Phishing', 'Brute force attacks'],
      motivation: 'Data theft, credential forgery',
      accessLevel: 'external'
    },
    {
      name: 'Malicious Student',
      capabilities: ['Credential modification attempts', 'Social engineering'],
      motivation: 'Grade manipulation, fake credentials',
      accessLevel: 'partial'
    },
    {
      name: 'Compromised Institution',
      capabilities: ['Unauthorized credential issuance', 'Database access'],
      motivation: 'Credential fraud, data breach',
      accessLevel: 'full'
    },
    {
      name: 'Nation-State Actor',
      capabilities: ['Advanced persistent threats', '51% attack', 'Zero-day exploits'],
      motivation: 'Espionage, system disruption',
      accessLevel: 'external'
    }
  ];

  private strideThreats: STRIDEThreat[] = [
    {
      category: 'Spoofing',
      description: 'Attacker impersonates a legitimate institution or student',
      affectedComponent: 'Authentication System',
      mitigation: [
        'Multi-factor authentication (MFA)',
        'Decentralized Identifiers (DIDs)',
        'Digital signatures (ECDSA)',
        'KYC/KYB verification for institutions'
      ],
      severity: 'high',
      status: 'mitigated'
    },
    {
      category: 'Tampering',
      description: 'Unauthorized modification of credential data',
      affectedComponent: 'Blockchain / Data Storage',
      mitigation: [
        'Blockchain immutability',
        'Cryptographic hashing (SHA-256)',
        'Merkle trees for batch verification',
        'Smart contract access controls'
      ],
      severity: 'critical',
      status: 'mitigated'
    },
    {
      category: 'Repudiation',
      description: 'Issuer denies issuing a credential',
      affectedComponent: 'Audit System',
      mitigation: [
        'Cryptographic signatures on all transactions',
        'Immutable audit logs on blockchain',
        'Timestamp verification',
        'Non-repudiable smart contracts'
      ],
      severity: 'medium',
      status: 'mitigated'
    },
    {
      category: 'Information Disclosure',
      description: 'Unauthorized access to private academic data',
      affectedComponent: 'Data Privacy',
      mitigation: [
        'Zero-Knowledge Proofs (ZKP)',
        'Dual-blockchain architecture (public/private)',
        'End-to-end encryption (AES-256-GCM)',
        'Access control lists (ACL)',
        'GDPR compliance mechanisms'
      ],
      severity: 'high',
      status: 'mitigated'
    },
    {
      category: 'Denial of Service',
      description: 'Attackers flood system to prevent legitimate access',
      affectedComponent: 'Network Infrastructure',
      mitigation: [
        'Rate limiting',
        'DDoS protection (CDN)',
        'Proof of Stake consensus (energy efficient)',
        'Load balancing',
        'Transaction fee mechanisms'
      ],
      severity: 'medium',
      status: 'mitigated'
    },
    {
      category: 'Elevation of Privilege',
      description: 'Attacker gains unauthorized admin/issuer privileges',
      affectedComponent: 'Access Control',
      mitigation: [
        'Role-Based Access Control (RBAC)',
        'Smart contract multi-signature approvals',
        'Principle of least privilege',
        'Regular security audits',
        'Soulbound authority tokens'
      ],
      severity: 'critical',
      status: 'mitigated'
    }
  ];

  /**
   * Calculate DREAD Score
   */
  calculateDREAD(
    damage: number,
    reproducibility: number,
    exploitability: number,
    affectedUsers: number,
    discoverability: number
  ): DREADScore {
    const totalScore = (damage + reproducibility + exploitability + affectedUsers + discoverability) / 5;

    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (totalScore >= 8) riskLevel = 'critical';
    else if (totalScore >= 6) riskLevel = 'high';
    else if (totalScore >= 4) riskLevel = 'medium';
    else riskLevel = 'low';

    return {
      damage,
      reproducibility,
      exploitability,
      affectedUsers,
      discoverability,
      totalScore: parseFloat(totalScore.toFixed(2)),
      riskLevel
    };
  }

  /**
   * Get DREAD Assessment for common threats
   */
  getDREADAssessments(): Record<string, DREADScore> {
    return {
      'Identity Spoofing': this.calculateDREAD(8, 3, 4, 7, 5),
      'Credential Tampering': this.calculateDREAD(10, 1, 2, 9, 3),
      'Transaction Repudiation': this.calculateDREAD(6, 2, 3, 5, 4),
      'Information Disclosure': this.calculateDREAD(8, 4, 5, 8, 6),
      'DoS Attack (Public Chain)': this.calculateDREAD(6, 5, 6, 10, 7),
      'DoS Attack (Private Chain)': this.calculateDREAD(4, 2, 3, 3, 2),
      'Privilege Escalation': this.calculateDREAD(9, 3, 4, 6, 5)
    };
  }

  /**
   * Perform Security Audit
   */
  performSecurityAudit(
    component: string,
    auditor: string = 'System'
  ): SecurityAudit {
    const relevantThreats = this.strideThreats.filter(t => 
      t.affectedComponent.toLowerCase().includes(component.toLowerCase()) ||
      component.toLowerCase() === 'all'
    );

    // Calculate average DREAD score
    const dreadAssessments = this.getDREADAssessments();
    const scores = Object.values(dreadAssessments);
    const avgDread = this.calculateDREAD(
      scores.reduce((sum, s) => sum + s.damage, 0) / scores.length,
      scores.reduce((sum, s) => sum + s.reproducibility, 0) / scores.length,
      scores.reduce((sum, s) => sum + s.exploitability, 0) / scores.length,
      scores.reduce((sum, s) => sum + s.affectedUsers, 0) / scores.length,
      scores.reduce((sum, s) => sum + s.discoverability, 0) / scores.length
    );

    const recommendations = [
      'Continue regular security audits (monthly)',
      'Monitor for new vulnerability disclosures',
      'Keep cryptographic libraries up-to-date',
      'Conduct penetration testing (quarterly)',
      'Review access control policies',
      'Educate users on security best practices'
    ];

    return {
      id: `audit_${Date.now()}`,
      timestamp: new Date().toISOString(),
      component,
      threats: relevantThreats,
      dreadAssessment: avgDread,
      recommendations,
      auditor
    };
  }

  /**
   * Get all STRIDE threats
   */
  getAllThreats(): STRIDEThreat[] {
    return [...this.strideThreats];
  }

  /**
   * Get threats by severity
   */
  getThreatsBySeverity(severity: 'low' | 'medium' | 'high' | 'critical'): STRIDEThreat[] {
    return this.strideThreats.filter(t => t.severity === severity);
  }

  /**
   * Get threat actors
   */
  getThreatActors(): ThreatActor[] {
    return [...this.threatActors];
  }

  /**
   * Add custom threat
   */
  addThreat(threat: STRIDEThreat): void {
    this.strideThreats.push(threat);
  }

  /**
   * Update threat status
   */
  updateThreatStatus(
    category: string,
    description: string,
    newStatus: 'mitigated' | 'in-progress' | 'identified'
  ): boolean {
    const threat = this.strideThreats.find(
      t => t.category === category && t.description === description
    );

    if (threat) {
      threat.status = newStatus;
      return true;
    }

    return false;
  }

  /**
   * Get security statistics
   */
  getSecurityStats() {
    const byStatus = {
      mitigated: this.strideThreats.filter(t => t.status === 'mitigated').length,
      inProgress: this.strideThreats.filter(t => t.status === 'in-progress').length,
      identified: this.strideThreats.filter(t => t.status === 'identified').length
    };

    const bySeverity = {
      critical: this.strideThreats.filter(t => t.severity === 'critical').length,
      high: this.strideThreats.filter(t => t.severity === 'high').length,
      medium: this.strideThreats.filter(t => t.severity === 'medium').length,
      low: this.strideThreats.filter(t => t.severity === 'low').length
    };

    return {
      totalThreats: this.strideThreats.length,
      byStatus,
      bySeverity,
      threatActors: this.threatActors.length,
      overallSecurityScore: (byStatus.mitigated / this.strideThreats.length) * 100
    };
  }

  /**
   * Rate Limiting Check
   */
  checkRateLimit(
    identifier: string,
    action: string,
    limit: number = 10,
    windowMs: number = 60000
  ): { allowed: boolean; remaining: number } {
    const key = `ratelimit_${identifier}_${action}`;
    const now = Date.now();
    
    const stored = localStorage.getItem(key);
    let data = stored ? JSON.parse(stored) : { count: 0, resetAt: now + windowMs };

    // Reset if window expired
    if (now >= data.resetAt) {
      data = { count: 0, resetAt: now + windowMs };
    }

    data.count++;
    localStorage.setItem(key, JSON.stringify(data));

    return {
      allowed: data.count <= limit,
      remaining: Math.max(0, limit - data.count)
    };
  }

  /**
   * Input Validation
   */
  validateInput(input: string, type: 'did' | 'email' | 'credentialId' | 'hash'): { valid: boolean; error?: string } {
    switch (type) {
      case 'did':
        if (!/^did:[a-z]+:[a-zA-Z0-9._-]+$/.test(input)) {
          return { valid: false, error: 'Invalid DID format' };
        }
        break;
      case 'email':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) {
          return { valid: false, error: 'Invalid email format' };
        }
        break;
      case 'credentialId':
        if (!/^[a-zA-Z0-9_-]+$/.test(input)) {
          return { valid: false, error: 'Invalid credential ID' };
        }
        break;
      case 'hash':
        if (!/^0x[a-fA-F0-9]{64}$/.test(input) && !/^[a-fA-F0-9]{64}$/.test(input)) {
          return { valid: false, error: 'Invalid hash format' };
        }
        break;
    }

    return { valid: true };
  }

  /**
   * Sanitize user input
   */
  sanitizeInput(input: string): string {
    return input
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .trim();
  }
}

// Singleton instance
export const securityFramework = new SecurityFramework();
