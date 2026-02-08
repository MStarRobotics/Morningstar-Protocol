import { describe, it, expect, vi, beforeEach } from 'vitest';
import { securityFramework } from '../../src/services/securityFramework';

describe('Security Framework', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ---------------------------------------------------------------------------
  // sanitizeInput
  // ---------------------------------------------------------------------------

  describe('sanitizeInput', () => {
    it('should remove angle brackets', () => {
      const result = securityFramework.sanitizeInput('<div>hello</div>');
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).toContain('hello');
    });

    it('should remove javascript: protocol', () => {
      const result = securityFramework.sanitizeInput('javascript:alert(1)');
      expect(result).not.toContain('javascript:');
    });

    it('should remove javascript: regardless of case', () => {
      const result = securityFramework.sanitizeInput('JAVASCRIPT:alert(1)');
      expect(result.toLowerCase()).not.toContain('javascript:');
    });

    it('should trim whitespace', () => {
      const result = securityFramework.sanitizeInput('  hello world  ');
      expect(result).toBe('hello world');
    });

    it('should pass through clean input unchanged', () => {
      const input = 'Polygon University Degree 2025';
      expect(securityFramework.sanitizeInput(input)).toBe(input);
    });

    it('should strip XSS payloads embedded in strings', () => {
      const xssPayload = '<script>document.cookie</script>';
      const result = securityFramework.sanitizeInput(xssPayload);
      expect(result).not.toContain('<script');
      expect(result).not.toContain('</script');
    });

    it('should handle an empty string', () => {
      expect(securityFramework.sanitizeInput('')).toBe('');
    });
  });

  // ---------------------------------------------------------------------------
  // validateInput – DID
  // ---------------------------------------------------------------------------

  describe('validateInput (did)', () => {
    it('should accept a valid DID', () => {
      const result = securityFramework.validateInput(
        'did:polygon:0x1234567890abcdef',
        'did'
      );
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept a DID with dots and hyphens', () => {
      const result = securityFramework.validateInput(
        'did:web:example.com',
        'did'
      );
      expect(result.valid).toBe(true);
    });

    it('should reject a DID without the did: prefix', () => {
      const result = securityFramework.validateInput('polygon:0xabc', 'did');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid DID format');
    });

    it('should reject an empty string as DID', () => {
      const result = securityFramework.validateInput('', 'did');
      expect(result.valid).toBe(false);
    });

    it('should reject a DID with spaces', () => {
      const result = securityFramework.validateInput(
        'did:polygon:bad value',
        'did'
      );
      expect(result.valid).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // validateInput – email
  // ---------------------------------------------------------------------------

  describe('validateInput (email)', () => {
    it('should accept a standard email', () => {
      const result = securityFramework.validateInput(
        'admin@university.edu',
        'email'
      );
      expect(result.valid).toBe(true);
    });

    it('should accept an email with subdomains', () => {
      const result = securityFramework.validateInput(
        'user@mail.university.co.uk',
        'email'
      );
      expect(result.valid).toBe(true);
    });

    it('should reject an email without @ sign', () => {
      const result = securityFramework.validateInput(
        'not-an-email',
        'email'
      );
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid email format');
    });

    it('should reject an email with spaces', () => {
      const result = securityFramework.validateInput(
        'user @example.com',
        'email'
      );
      expect(result.valid).toBe(false);
    });

    it('should reject an empty string as email', () => {
      const result = securityFramework.validateInput('', 'email');
      expect(result.valid).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // validateInput – credentialId
  // ---------------------------------------------------------------------------

  describe('validateInput (credentialId)', () => {
    it('should accept alphanumeric credential IDs', () => {
      const result = securityFramework.validateInput(
        'cred_ABC-123',
        'credentialId'
      );
      expect(result.valid).toBe(true);
    });

    it('should reject credential IDs with special characters', () => {
      const result = securityFramework.validateInput(
        'cred!@#$',
        'credentialId'
      );
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid credential ID');
    });

    it('should reject credential IDs with spaces', () => {
      const result = securityFramework.validateInput(
        'cred 123',
        'credentialId'
      );
      expect(result.valid).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // validateInput – hash
  // ---------------------------------------------------------------------------

  describe('validateInput (hash)', () => {
    it('should accept a 0x-prefixed 64-char hex hash', () => {
      const hash = '0x' + 'a'.repeat(64);
      const result = securityFramework.validateInput(hash, 'hash');
      expect(result.valid).toBe(true);
    });

    it('should accept a bare 64-char hex hash', () => {
      const hash = 'abcdef0123456789'.repeat(4);
      const result = securityFramework.validateInput(hash, 'hash');
      expect(result.valid).toBe(true);
    });

    it('should reject a hash that is too short', () => {
      const result = securityFramework.validateInput('0xabc', 'hash');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid hash format');
    });

    it('should reject a hash with non-hex characters', () => {
      const hash = '0x' + 'g'.repeat(64);
      const result = securityFramework.validateInput(hash, 'hash');
      expect(result.valid).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // XSS Prevention (combined sanitize + validate)
  // ---------------------------------------------------------------------------

  describe('XSS prevention', () => {
    it('should neutralize script injection in DID input', () => {
      const malicious = 'did:polygon:<script>alert(1)</script>';
      const sanitized = securityFramework.sanitizeInput(malicious);
      expect(sanitized).not.toContain('<script>');
    });

    it('should neutralize event handler injection', () => {
      const malicious = '<img onerror=alert(1)>';
      const sanitized = securityFramework.sanitizeInput(malicious);
      expect(sanitized).not.toContain('<');
      expect(sanitized).not.toContain('>');
    });

    it('should neutralize javascript: in href-like strings', () => {
      const malicious = 'javascript:document.location="http://evil.com"';
      const sanitized = securityFramework.sanitizeInput(malicious);
      expect(sanitized).not.toContain('javascript:');
    });
  });

  // ---------------------------------------------------------------------------
  // checkRateLimit
  // ---------------------------------------------------------------------------

  describe('checkRateLimit', () => {
    it('should allow requests within the limit', () => {
      const result = securityFramework.checkRateLimit('user1', 'login', 5, 60000);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('should decrement remaining on each call', () => {
      const id = `ratelimit-user-${Date.now()}`;

      const first = securityFramework.checkRateLimit(id, 'login', 5, 60000);
      expect(first.remaining).toBe(4);

      const second = securityFramework.checkRateLimit(id, 'login', 5, 60000);
      expect(second.remaining).toBe(3);

      const third = securityFramework.checkRateLimit(id, 'login', 5, 60000);
      expect(third.remaining).toBe(2);
    });

    it('should block requests exceeding the limit', () => {
      const id = `blocked-user-${Date.now()}`;
      const limit = 3;

      for (let i = 0; i < limit; i++) {
        securityFramework.checkRateLimit(id, 'login', limit, 60000);
      }

      const result = securityFramework.checkRateLimit(id, 'login', limit, 60000);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should reset after the time window expires', () => {
      vi.useFakeTimers();
      const id = 'window-user';
      const windowMs = 1000;

      // Exhaust the limit
      for (let i = 0; i < 3; i++) {
        securityFramework.checkRateLimit(id, 'login', 3, windowMs);
      }

      const blocked = securityFramework.checkRateLimit(id, 'login', 3, windowMs);
      expect(blocked.allowed).toBe(false);

      // Advance time past the window
      vi.advanceTimersByTime(windowMs + 100);

      const afterReset = securityFramework.checkRateLimit(id, 'login', 3, windowMs);
      expect(afterReset.allowed).toBe(true);
      expect(afterReset.remaining).toBe(2);

      vi.useRealTimers();
    });

    it('should track different actions independently', () => {
      const id = `multi-action-${Date.now()}`;

      securityFramework.checkRateLimit(id, 'login', 2, 60000);
      securityFramework.checkRateLimit(id, 'login', 2, 60000);

      // login is at limit — but verify should still be allowed
      const verifyResult = securityFramework.checkRateLimit(id, 'verify', 2, 60000);
      expect(verifyResult.allowed).toBe(true);
      expect(verifyResult.remaining).toBe(1);
    });

    it('should persist counts in localStorage', () => {
      const id = `persist-${Date.now()}`;
      securityFramework.checkRateLimit(id, 'action', 10, 60000);

      const key = `ratelimit_${id}_action`;
      const stored = localStorage.getItem(key);
      expect(stored).not.toBeNull();

      const data = JSON.parse(stored!);
      expect(data.count).toBe(1);
      expect(data.resetAt).toBeGreaterThan(Date.now() - 1000);
    });
  });

  // ---------------------------------------------------------------------------
  // calculateDREAD
  // ---------------------------------------------------------------------------

  describe('calculateDREAD', () => {
    it('should calculate totalScore as average of all five scores', () => {
      const result = securityFramework.calculateDREAD(8, 6, 4, 2, 10);
      expect(result.totalScore).toBe(6);
    });

    it('should assign critical risk for totalScore >= 8', () => {
      const result = securityFramework.calculateDREAD(10, 10, 10, 10, 10);
      expect(result.riskLevel).toBe('critical');
      expect(result.totalScore).toBe(10);
    });

    it('should assign high risk for totalScore >= 6', () => {
      const result = securityFramework.calculateDREAD(6, 6, 6, 6, 6);
      expect(result.riskLevel).toBe('high');
    });

    it('should assign medium risk for totalScore >= 4', () => {
      const result = securityFramework.calculateDREAD(4, 4, 4, 4, 4);
      expect(result.riskLevel).toBe('medium');
    });

    it('should assign low risk for totalScore < 4', () => {
      const result = securityFramework.calculateDREAD(1, 1, 1, 1, 1);
      expect(result.riskLevel).toBe('low');
      expect(result.totalScore).toBe(1);
    });

    it('should include all individual scores in the result', () => {
      const result = securityFramework.calculateDREAD(3, 5, 7, 9, 1);
      expect(result.damage).toBe(3);
      expect(result.reproducibility).toBe(5);
      expect(result.exploitability).toBe(7);
      expect(result.affectedUsers).toBe(9);
      expect(result.discoverability).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // getAllThreats / getThreatsBySeverity
  // ---------------------------------------------------------------------------

  describe('getAllThreats', () => {
    it('should return all six STRIDE threat categories', () => {
      const threats = securityFramework.getAllThreats();
      expect(threats.length).toBe(6);

      const categories = threats.map(t => t.category);
      expect(categories).toContain('Spoofing');
      expect(categories).toContain('Tampering');
      expect(categories).toContain('Repudiation');
      expect(categories).toContain('Information Disclosure');
      expect(categories).toContain('Denial of Service');
      expect(categories).toContain('Elevation of Privilege');
    });

    it('should return a copy (not a reference to internal array)', () => {
      const threats1 = securityFramework.getAllThreats();
      const threats2 = securityFramework.getAllThreats();
      expect(threats1).not.toBe(threats2);
    });
  });

  describe('getThreatsBySeverity', () => {
    it('should return only critical threats', () => {
      const critical = securityFramework.getThreatsBySeverity('critical');
      expect(critical.length).toBeGreaterThan(0);
      for (const t of critical) {
        expect(t.severity).toBe('critical');
      }
    });

    it('should return only high threats', () => {
      const high = securityFramework.getThreatsBySeverity('high');
      expect(high.length).toBeGreaterThan(0);
      for (const t of high) {
        expect(t.severity).toBe('high');
      }
    });

    it('should return empty array for non-existent severity', () => {
      const low = securityFramework.getThreatsBySeverity('low');
      expect(low).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // getThreatActors
  // ---------------------------------------------------------------------------

  describe('getThreatActors', () => {
    it('should return all defined threat actors', () => {
      const actors = securityFramework.getThreatActors();
      expect(actors.length).toBe(4);

      const names = actors.map(a => a.name);
      expect(names).toContain('External Attacker');
      expect(names).toContain('Malicious Student');
      expect(names).toContain('Compromised Institution');
      expect(names).toContain('Nation-State Actor');
    });

    it('should return a copy (not a reference to internal array)', () => {
      const actors1 = securityFramework.getThreatActors();
      const actors2 = securityFramework.getThreatActors();
      expect(actors1).not.toBe(actors2);
    });
  });

  // ---------------------------------------------------------------------------
  // performSecurityAudit
  // ---------------------------------------------------------------------------

  describe('performSecurityAudit', () => {
    it('should return an audit for "all" with all threats', () => {
      const audit = securityFramework.performSecurityAudit('all');
      expect(audit.id).toContain('audit_');
      expect(audit.component).toBe('all');
      expect(audit.threats.length).toBe(6);
      expect(audit.auditor).toBe('System');
      expect(audit.recommendations.length).toBeGreaterThan(0);
    });

    it('should filter threats by component name', () => {
      const audit = securityFramework.performSecurityAudit('Authentication');
      expect(audit.threats.length).toBeGreaterThan(0);
      for (const t of audit.threats) {
        expect(t.affectedComponent.toLowerCase()).toContain('authentication');
      }
    });

    it('should accept a custom auditor name', () => {
      const audit = securityFramework.performSecurityAudit('all', 'SecurityTeam');
      expect(audit.auditor).toBe('SecurityTeam');
    });

    it('should include a DREAD assessment', () => {
      const audit = securityFramework.performSecurityAudit('all');
      expect(audit.dreadAssessment).toHaveProperty('totalScore');
      expect(audit.dreadAssessment).toHaveProperty('riskLevel');
    });

    it('should have a valid ISO timestamp', () => {
      const audit = securityFramework.performSecurityAudit('all');
      expect(new Date(audit.timestamp).toISOString()).toBe(audit.timestamp);
    });
  });

  // ---------------------------------------------------------------------------
  // getSecurityStats
  // ---------------------------------------------------------------------------

  describe('getSecurityStats', () => {
    it('should report correct total threat count', () => {
      const stats = securityFramework.getSecurityStats();
      expect(stats.totalThreats).toBe(6);
    });

    it('should report correct threat actor count', () => {
      const stats = securityFramework.getSecurityStats();
      expect(stats.threatActors).toBe(4);
    });

    it('should report an overall security score as a percentage', () => {
      const stats = securityFramework.getSecurityStats();
      expect(stats.overallSecurityScore).toBeGreaterThanOrEqual(0);
      expect(stats.overallSecurityScore).toBeLessThanOrEqual(100);
    });

    it('should include byStatus and bySeverity breakdowns', () => {
      const stats = securityFramework.getSecurityStats();
      expect(stats.byStatus).toHaveProperty('mitigated');
      expect(stats.byStatus).toHaveProperty('inProgress');
      expect(stats.byStatus).toHaveProperty('identified');
      expect(stats.bySeverity).toHaveProperty('critical');
      expect(stats.bySeverity).toHaveProperty('high');
      expect(stats.bySeverity).toHaveProperty('medium');
      expect(stats.bySeverity).toHaveProperty('low');
    });
  });

  // ---------------------------------------------------------------------------
  // getDREADAssessments
  // ---------------------------------------------------------------------------

  describe('getDREADAssessments', () => {
    it('should return assessments for seven common threats', () => {
      const assessments = securityFramework.getDREADAssessments();
      expect(Object.keys(assessments).length).toBe(7);
      expect(assessments).toHaveProperty('Identity Spoofing');
      expect(assessments).toHaveProperty('Credential Tampering');
      expect(assessments).toHaveProperty('DoS Attack (Public Chain)');
    });

    it('should have valid risk levels for each assessment', () => {
      const assessments = securityFramework.getDREADAssessments();
      const validLevels = ['low', 'medium', 'high', 'critical'];
      for (const score of Object.values(assessments)) {
        expect(validLevels).toContain(score.riskLevel);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // addThreat / updateThreatStatus
  // ---------------------------------------------------------------------------

  describe('addThreat', () => {
    it('should add a custom threat to the threat list', () => {
      const before = securityFramework.getAllThreats().length;

      securityFramework.addThreat({
        category: 'Spoofing',
        description: 'Custom spoofing threat for test',
        affectedComponent: 'Test Component',
        mitigation: ['Unit testing'],
        severity: 'low',
        status: 'identified',
      });

      const after = securityFramework.getAllThreats().length;
      expect(after).toBe(before + 1);
    });
  });

  describe('updateThreatStatus', () => {
    it('should update the status of an existing threat', () => {
      const updated = securityFramework.updateThreatStatus(
        'Spoofing',
        'Attacker impersonates a legitimate institution or student',
        'in-progress'
      );
      expect(updated).toBe(true);

      const threats = securityFramework.getAllThreats();
      const spoofing = threats.find(
        t => t.category === 'Spoofing' &&
          t.description === 'Attacker impersonates a legitimate institution or student'
      );
      expect(spoofing?.status).toBe('in-progress');

      // Restore original state
      securityFramework.updateThreatStatus(
        'Spoofing',
        'Attacker impersonates a legitimate institution or student',
        'mitigated'
      );
    });

    it('should return false when threat is not found', () => {
      const updated = securityFramework.updateThreatStatus(
        'Spoofing',
        'Non-existent description',
        'identified'
      );
      expect(updated).toBe(false);
    });
  });
});
