/**
 * Tests for DID Registry
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DIDRegistry } from '../../src/services/didRegistry';

describe('DID Registry', () => {
  describe('DID Creation', () => {
    it('should create DID for student', async () => {
      const { did, document } = await DIDRegistry.createDID(
        'student',
        'publicKey123',
        { name: 'John Doe' }
      );

      expect(did).toMatch(/^did:pistis:[a-f0-9]{32}$/);
      expect(document.id).toBe(did);
      expect(document.verificationMethod).toHaveLength(1);
      expect(document.authentication).toContain(`${did}#keys-1`);
    });

    it('should create DID for university', async () => {
      const { did, document } = await DIDRegistry.createDID(
        'university',
        'publicKey456'
      );

      expect(did).toMatch(/^did:pistis:/);
      expect(document['@context']).toContain('https://www.w3.org/ns/did/v1');
      expect(document.service).toBeDefined();
    });

    it('should create unique DIDs for same entity type', async () => {
      const { did: did1 } = await DIDRegistry.createDID('student', 'key1');
      const { did: did2 } = await DIDRegistry.createDID('student', 'key2');

      expect(did1).not.toBe(did2);
    });
  });

  describe('DID Resolution', () => {
    it('should resolve existing DID', async () => {
      const { did } = await DIDRegistry.createDID('student', 'key1');
      const resolved = await DIDRegistry.resolveDID(did);

      expect(resolved).not.toBeNull();
      expect(resolved?.id).toBe(did);
    });

    it('should return null for non-existent DID', async () => {
      const resolved = await DIDRegistry.resolveDID('did:pistis:nonexistent');
      expect(resolved).toBeNull();
    });

    it('should return null for invalid DID format', async () => {
      const resolved = await DIDRegistry.resolveDID('invalid-did');
      expect(resolved).toBeNull();
    });

    it('should return null for deactivated DID', async () => {
      const { did } = await DIDRegistry.createDID('student', 'key1');
      await DIDRegistry.deactivateDID(did);
      
      const resolved = await DIDRegistry.resolveDID(did);
      expect(resolved).toBeNull();
    });
  });

  describe('DID Document Updates', () => {
    it('should update DID document', async () => {
      const { did } = await DIDRegistry.createDID('student', 'key1');
      
      const updated = await DIDRegistry.updateDIDDocument(did, {
        controller: 'did:pistis:controller123'
      });

      expect(updated).toBe(true);
      
      const resolved = await DIDRegistry.resolveDID(did);
      expect(resolved?.controller).toBe('did:pistis:controller123');
    });

    it('should not update non-existent DID', async () => {
      const updated = await DIDRegistry.updateDIDDocument(
        'did:pistis:nonexistent',
        { controller: 'did:pistis:controller' }
      );

      expect(updated).toBe(false);
    });

    it('should update timestamp on update', async () => {
      const { did, document } = await DIDRegistry.createDID('student', 'key1');
      const originalUpdated = document.updated;

      await new Promise(resolve => setTimeout(resolve, 10));
      
      await DIDRegistry.updateDIDDocument(did, {
        controller: 'did:pistis:controller'
      });

      const resolved = await DIDRegistry.resolveDID(did);
      expect(resolved?.updated).not.toBe(originalUpdated);
    });
  });

  describe('DID Deactivation', () => {
    it('should deactivate existing DID', async () => {
      const { did } = await DIDRegistry.createDID('student', 'key1');
      const deactivated = await DIDRegistry.deactivateDID(did);

      expect(deactivated).toBe(true);
    });

    it('should not deactivate non-existent DID', async () => {
      const deactivated = await DIDRegistry.deactivateDID('did:pistis:nonexistent');
      expect(deactivated).toBe(false);
    });
  });

  describe('Service Endpoints', () => {
    it('should add service endpoint to DID', async () => {
      const { did } = await DIDRegistry.createDID('university', 'key1');
      
      const added = await DIDRegistry.addServiceEndpoint(did, {
        id: `${did}#verification-service`,
        type: 'VerificationService',
        serviceEndpoint: 'https://verify.example.com'
      });

      expect(added).toBe(true);
      
      const resolved = await DIDRegistry.resolveDID(did);
      expect(resolved?.service).toHaveLength(2); // Original + new
    });

    it('should not add service to non-existent DID', async () => {
      const added = await DIDRegistry.addServiceEndpoint(
        'did:pistis:nonexistent',
        {
          id: 'did:pistis:nonexistent#service',
          type: 'Service',
          serviceEndpoint: 'https://example.com'
        }
      );

      expect(added).toBe(false);
    });
  });

  describe('Verification Methods', () => {
    it('should add verification method', async () => {
      const { did } = await DIDRegistry.createDID('student', 'key1');
      
      const added = await DIDRegistry.addVerificationMethod(did, {
        id: `${did}#keys-2`,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase: 'newPublicKey'
      });

      expect(added).toBe(true);
      
      const resolved = await DIDRegistry.resolveDID(did);
      expect(resolved?.verificationMethod).toHaveLength(2);
    });
  });

  describe('DID Listing', () => {
    it('should list all DIDs', async () => {
      const initialCount = DIDRegistry.listDIDs().length;
      
      await DIDRegistry.createDID('student', 'key1');
      await DIDRegistry.createDID('university', 'key2');
      
      const dids = DIDRegistry.listDIDs();
      expect(dids.length).toBe(initialCount + 2);
    });
  });

  describe('DID Ownership Verification', () => {
    it('should verify DID ownership with valid signature', async () => {
      const { did } = await DIDRegistry.createDID('student', 'key1');
      const message = 'test message';
      
      // In real implementation, this would use actual cryptographic signing
      const signature = await import('../../src/services/cryptography').then(
        crypto => crypto.sha256(message)
      );

      const verified = await DIDRegistry.verifyDIDOwnership(did, signature, message);
      expect(verified).toBe(true);
    });

    it('should reject invalid signature', async () => {
      const { did } = await DIDRegistry.createDID('student', 'key1');
      
      const verified = await DIDRegistry.verifyDIDOwnership(
        did,
        'invalid-signature',
        'test message'
      );
      
      expect(verified).toBe(false);
    });

    it('should reject verification for non-existent DID', async () => {
      const verified = await DIDRegistry.verifyDIDOwnership(
        'did:pistis:nonexistent',
        'signature',
        'message'
      );
      
      expect(verified).toBe(false);
    });
  });
});
