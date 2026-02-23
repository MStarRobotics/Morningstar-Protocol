import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateDID,
  createDIDDocument,
  resolveDID,
  registerDID,
  updateDIDDocument,
  revokeDID,
  getAllDIDs,
  searchDIDsByRole,
  getDIDMetadata,
  createVerifiablePresentation,
  type DIDDocument,
  type DIDMetadata,
  type VerificationMethod,
  type ServiceEndpoint,
} from '../../src/services/didService';

describe('DID Service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ----------------------------------------------------------------
  // generateDID
  // ----------------------------------------------------------------
  describe('generateDID', () => {
    it('should return a DID with the default polygon method', async () => {
      const did = await generateDID('alice');
      expect(did).toMatch(/^did:polygon:0x[0-9a-f]{40}$/);
    });

    it('should use a custom method when specified', async () => {
      const did = await generateDID('bob', 'web');
      expect(did).toMatch(/^did:web:0x[0-9a-f]{40}$/);
    });

    it('should produce unique DIDs for the same identifier across calls', async () => {
      const did1 = await generateDID('same-id');
      // A tiny delay ensures Date.now() differs
      await new Promise((r) => setTimeout(r, 5));
      const did2 = await generateDID('same-id');
      expect(did1).not.toBe(did2);
    });

    it('should produce different DIDs for different identifiers', async () => {
      const did1 = await generateDID('user-a');
      const did2 = await generateDID('user-b');
      expect(did1).not.toBe(did2);
    });
  });

  // ----------------------------------------------------------------
  // createDIDDocument
  // ----------------------------------------------------------------
  describe('createDIDDocument', () => {
    it('should create a document with W3C DID context', async () => {
      const did = await generateDID('ctx-test');
      const doc = await createDIDDocument(did, { role: 'student' });

      expect(doc['@context']).toContain('https://www.w3.org/ns/did/v1');
      expect(doc['@context']).toContain('https://w3id.org/security/suites/ed25519-2020/v1');
    });

    it('should set the document id and controller to the given DID', async () => {
      const did = await generateDID('id-test');
      const doc = await createDIDDocument(did, {});

      expect(doc.id).toBe(did);
      expect(doc.controller).toBe(did);
    });

    it('should include a verificationMethod with correct structure', async () => {
      const did = await generateDID('vm-test');
      const doc = await createDIDDocument(did, {});

      expect(doc.verificationMethod).toHaveLength(1);
      const vm: VerificationMethod = doc.verificationMethod[0];
      expect(vm.id).toBe(`${did}#key-1`);
      expect(vm.type).toBe('EcdsaSecp256k1VerificationKey2019');
      expect(vm.controller).toBe(did);
      expect(vm.publicKeyMultibase).toBeDefined();
      expect(typeof vm.publicKeyMultibase).toBe('string');
    });

    it('should populate authentication and assertionMethod', async () => {
      const did = await generateDID('auth-test');
      const doc = await createDIDDocument(did, {});

      expect(doc.authentication).toContain(`${did}#key-1`);
      expect(doc.assertionMethod).toContain(`${did}#key-1`);
    });

    it('should include created and updated timestamps', async () => {
      const before = new Date().toISOString();
      const did = await generateDID('ts-test');
      const doc = await createDIDDocument(did, {});
      const after = new Date().toISOString();

      expect(doc.created).toBeDefined();
      expect(doc.updated).toBeDefined();
      expect(doc.created >= before).toBe(true);
      expect(doc.updated <= after).toBe(true);
    });

    it('should add CredentialIssuerService for issuer role', async () => {
      const did = await generateDID('issuer-svc');
      const doc = await createDIDDocument(did, { role: 'issuer' });

      expect(doc.service).toBeDefined();
      expect(doc.service).toHaveLength(1);
      const svc: ServiceEndpoint = doc.service![0];
      expect(svc.id).toBe(`${did}#credential-service`);
      expect(svc.type).toBe('CredentialIssuerService');
      expect(svc.serviceEndpoint).toMatch(/^https:\/\//);
    });

    it('should add CredentialWalletService for student role', async () => {
      const did = await generateDID('student-svc');
      const doc = await createDIDDocument(did, { role: 'student' });

      expect(doc.service).toBeDefined();
      expect(doc.service).toHaveLength(1);
      const svc: ServiceEndpoint = doc.service![0];
      expect(svc.id).toBe(`${did}#wallet-service`);
      expect(svc.type).toBe('CredentialWalletService');
    });

    it('should not add service endpoints for verifier role', async () => {
      const did = await generateDID('verifier-svc');
      const doc = await createDIDDocument(did, { role: 'verifier' });

      expect(doc.service).toBeUndefined();
    });
  });

  // ----------------------------------------------------------------
  // registerDID + resolveDID
  // ----------------------------------------------------------------
  describe('registerDID / resolveDID', () => {
    async function createAndRegister(
      identifier: string,
      role: DIDMetadata['role'] = 'student'
    ): Promise<{ did: string; doc: DIDDocument; meta: DIDMetadata }> {
      const did = await generateDID(identifier);
      const doc = await createDIDDocument(did, { role });
      const meta: DIDMetadata = {
        did,
        name: identifier,
        role,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        verified: false,
      };
      await registerDID(doc, meta);
      return { did, doc, meta };
    }

    it('should register and resolve a DID document', async () => {
      const { did, doc } = await createAndRegister('resolve-test');
      const resolved = await resolveDID(did);

      expect(resolved).not.toBeNull();
      expect(resolved!.id).toBe(doc.id);
      expect(resolved!.verificationMethod).toEqual(doc.verificationMethod);
    });

    it('should return null for an unregistered DID', async () => {
      const result = await resolveDID('did:polygon:0xNONEXISTENT');
      expect(result).toBeNull();
    });

    it('should store metadata retrievable via getDIDMetadata', async () => {
      const { did, meta } = await createAndRegister('meta-test', 'issuer');
      const retrieved = await getDIDMetadata(did);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.did).toBe(did);
      expect(retrieved!.role).toBe('issuer');
      expect(retrieved!.name).toBe(meta.name);
    });

    it('should add DID to the global index', async () => {
      await createAndRegister('index-a', 'student');
      await createAndRegister('index-b', 'issuer');
      const allDIDs = await getAllDIDs();

      expect(allDIDs).toHaveLength(2);
      expect(allDIDs.map((d) => d.role)).toContain('student');
      expect(allDIDs.map((d) => d.role)).toContain('issuer');
    });
  });

  // ----------------------------------------------------------------
  // updateDIDDocument
  // ----------------------------------------------------------------
  describe('updateDIDDocument', () => {
    it('should update an existing DID document', async () => {
      const did = await generateDID('update-test');
      const doc = await createDIDDocument(did, { role: 'student' });
      const meta: DIDMetadata = {
        did,
        name: 'update-test',
        role: 'student',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        verified: false,
      };
      await registerDID(doc, meta);

      const newService: ServiceEndpoint = {
        id: `${did}#new-service`,
        type: 'NewService',
        serviceEndpoint: 'https://new.example.com',
      };
      const success = await updateDIDDocument(did, { service: [newService] });
      expect(success).toBe(true);

      const updated = await resolveDID(did);
      expect(updated).not.toBeNull();
      expect(updated!.service).toHaveLength(1);
      expect(updated!.service![0].type).toBe('NewService');
      // The updated field should be a valid ISO timestamp
      expect(updated!.updated).toBeDefined();
      expect(new Date(updated!.updated).toISOString()).toBe(updated!.updated);
    });

    it('should return false when updating a non-existent DID', async () => {
      const success = await updateDIDDocument('did:polygon:0xMISSING', {
        controller: 'did:polygon:0xSOMEONE',
      });
      expect(success).toBe(false);
    });

    it('should preserve fields not included in the update', async () => {
      const did = await generateDID('preserve-test');
      const doc = await createDIDDocument(did, { role: 'issuer' });
      const meta: DIDMetadata = {
        did,
        name: 'preserve-test',
        role: 'issuer',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        verified: false,
      };
      await registerDID(doc, meta);

      await updateDIDDocument(did, { controller: 'did:polygon:0xNEWCONTROLLER' });
      const updated = await resolveDID(did);

      expect(updated!.controller).toBe('did:polygon:0xNEWCONTROLLER');
      // Original verificationMethod should still be intact
      expect(updated!.verificationMethod).toEqual(doc.verificationMethod);
      expect(updated!['@context']).toEqual(doc['@context']);
    });
  });

  // ----------------------------------------------------------------
  // revokeDID
  // ----------------------------------------------------------------
  describe('revokeDID', () => {
    it('should mark an existing DID as deactivated', async () => {
      const did = await generateDID('revoke-test');
      const doc = await createDIDDocument(did, { role: 'student' });
      const meta: DIDMetadata = {
        did,
        name: 'revoke-test',
        role: 'student',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        verified: false,
      };
      await registerDID(doc, meta);

      const success = await revokeDID(did);
      expect(success).toBe(true);

      const resolved = await resolveDID(did);
      expect(resolved).not.toBeNull();
      expect((resolved as any).deactivated).toBe(true);
    });

    it('should update the timestamp when revoking', async () => {
      const did = await generateDID('revoke-ts');
      const doc = await createDIDDocument(did, { role: 'student' });
      const meta: DIDMetadata = {
        did,
        name: 'revoke-ts',
        role: 'student',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        verified: false,
      };
      await registerDID(doc, meta);

      const beforeRevoke = doc.updated;
      // Small delay to ensure timestamp differs
      await new Promise((r) => setTimeout(r, 5));
      await revokeDID(did);

      const resolved = await resolveDID(did);
      expect(resolved!.updated).not.toBe(beforeRevoke);
    });

    it('should return false when revoking a non-existent DID', async () => {
      const success = await revokeDID('did:polygon:0xDOESNOTEXIST');
      expect(success).toBe(false);
    });
  });

  // ----------------------------------------------------------------
  // searchDIDsByRole
  // ----------------------------------------------------------------
  describe('searchDIDsByRole', () => {
    it('should return only DIDs matching the given role', async () => {
      // Register multiple DIDs with different roles
      for (const role of ['student', 'issuer', 'student'] as DIDMetadata['role'][]) {
        const did = await generateDID(`role-${role}-${Math.random()}`);
        const doc = await createDIDDocument(did, { role });
        const meta: DIDMetadata = {
          did,
          name: `test-${role}`,
          role,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          verified: false,
        };
        await registerDID(doc, meta);
      }

      const students = await searchDIDsByRole('student');
      const issuers = await searchDIDsByRole('issuer');
      const verifiers = await searchDIDsByRole('verifier');

      expect(students).toHaveLength(2);
      expect(issuers).toHaveLength(1);
      expect(verifiers).toHaveLength(0);
    });
  });

  // ----------------------------------------------------------------
  // createVerifiablePresentation
  // ----------------------------------------------------------------
  describe('createVerifiablePresentation', () => {
    it('should create a presentation with correct structure', async () => {
      const holderDID = 'did:polygon:0xHOLDER123456789012345678901234567890';
      const credentials = [{ type: 'DegreeCredential', data: { degree: 'BSc' } }];
      const challenge = 'random-challenge-123';

      const vp = await createVerifiablePresentation(holderDID, credentials, challenge);

      expect(vp['@context']).toContain('https://www.w3.org/2018/credentials/v1');
      expect(vp.type).toContain('VerifiablePresentation');
      expect(vp.holder).toBe(holderDID);
      expect(vp.verifiableCredential).toEqual(credentials);
    });

    it('should include proof with correct verification method', async () => {
      const holderDID = 'did:polygon:0xHOLDER_PROOF_TEST';
      const vp = await createVerifiablePresentation(holderDID, [], 'test-challenge');

      expect(vp.proof).toBeDefined();
      expect(vp.proof.type).toBe('EcdsaSecp256k1Signature2019');
      expect(vp.proof.proofPurpose).toBe('authentication');
      expect(vp.proof.verificationMethod).toBe(`${holderDID}#key-1`);
      expect(vp.proof.challenge).toBe('test-challenge');
    });

    it('should include a jws in the proof', async () => {
      const holderDID = 'did:polygon:0xHOLDER_JWS';
      const vp = await createVerifiablePresentation(holderDID, [{ id: 1 }]);

      expect(vp.proof.jws).toBeDefined();
      expect(typeof vp.proof.jws).toBe('string');
      expect(vp.proof.jws!.length).toBeGreaterThan(0);
    });
  });

  // ----------------------------------------------------------------
  // VerificationMethod interface usage
  // ----------------------------------------------------------------
  describe('VerificationMethod interface', () => {
    it('should allow various public key formats', () => {
      const vmMultibase: VerificationMethod = {
        id: 'did:example:123#key-1',
        type: 'EcdsaSecp256k1VerificationKey2019',
        controller: 'did:example:123',
        publicKeyMultibase: 'z6Mk...',
      };
      expect(vmMultibase.publicKeyMultibase).toBeDefined();

      const vmHex: VerificationMethod = {
        id: 'did:example:456#key-1',
        type: 'EcdsaSecp256k1VerificationKey2019',
        controller: 'did:example:456',
        publicKeyHex: '0x04abc...',
      };
      expect(vmHex.publicKeyHex).toBeDefined();

      const vmBlockchain: VerificationMethod = {
        id: 'did:pkh:eip155:1:0xabc',
        type: 'EcdsaSecp256k1RecoveryMethod2020',
        controller: 'did:pkh:eip155:1:0xabc',
        blockchainAccountId: 'eip155:1:0xabc',
      };
      expect(vmBlockchain.blockchainAccountId).toBeDefined();
    });
  });

  // ----------------------------------------------------------------
  // DID storage (localStorage integration)
  // ----------------------------------------------------------------
  describe('DID storage via localStorage', () => {
    it('should persist DID document in localStorage', async () => {
      const did = await generateDID('storage-test');
      const doc = await createDIDDocument(did, { role: 'student' });
      const meta: DIDMetadata = {
        did,
        name: 'storage-test',
        role: 'student',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        verified: false,
      };
      await registerDID(doc, meta);

      // Directly check localStorage
      const storedRaw = localStorage.getItem(`did_registry_${did}`);
      expect(storedRaw).not.toBeNull();
      const stored = JSON.parse(storedRaw!);
      expect(stored.id).toBe(did);
    });

    it('should persist DID metadata in localStorage', async () => {
      const did = await generateDID('meta-storage');
      const doc = await createDIDDocument(did, { role: 'issuer' });
      const meta: DIDMetadata = {
        did,
        name: 'meta-storage',
        role: 'issuer',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        verified: false,
      };
      await registerDID(doc, meta);

      const metaRaw = localStorage.getItem(`did_metadata_${did}`);
      expect(metaRaw).not.toBeNull();
      const parsedMeta = JSON.parse(metaRaw!);
      expect(parsedMeta.role).toBe('issuer');
    });

    it('should persist DID index in localStorage', async () => {
      const did = await generateDID('index-storage');
      const doc = await createDIDDocument(did, { role: 'governance' });
      const meta: DIDMetadata = {
        did,
        name: 'index-storage',
        role: 'governance',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        verified: false,
      };
      await registerDID(doc, meta);

      const indexRaw = localStorage.getItem('did_index');
      expect(indexRaw).not.toBeNull();
      const index = JSON.parse(indexRaw!);
      expect(Array.isArray(index)).toBe(true);
      expect(index.some((entry: any) => entry.did === did)).toBe(true);
    });

    it('should isolate data after localStorage.clear()', async () => {
      const did = await generateDID('isolation-test');
      const doc = await createDIDDocument(did, { role: 'student' });
      const meta: DIDMetadata = {
        did,
        name: 'isolation-test',
        role: 'student',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        verified: false,
      };
      await registerDID(doc, meta);

      localStorage.clear();

      const resolved = await resolveDID(did);
      expect(resolved).toBeNull();
      expect(await getAllDIDs()).toHaveLength(0);
    });
  });
});
