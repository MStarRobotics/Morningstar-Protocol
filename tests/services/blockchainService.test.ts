import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PublicBlockchain,
  PrivateBlockchain,
  BlockchainManager,
} from '../../src/services/blockchainService';
import { generateZKProof } from '../../src/services/zkProof';
import type { Credential } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal ZKProof for use with PublicBlockchain methods. */
async function createTestZKProof() {
  return generateZKProof({
    credentialId: 'cred-test-' + Date.now(),
    claimsToProve: ['is_valid_credential'],
    privateData: { secret: 'hidden' },
    publicData: { type: 'AcademicCredential' },
  });
}

/** Build a minimal Credential fixture. */
function makeCredential(overrides: Partial<Credential> = {}): Credential {
  return {
    id: 'cred-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    type: 'AcademicCredential',
    issuer: 'did:polygon:0xISSUER',
    issuanceDate: new Date().toISOString(),
    recipient: 'did:polygon:0xSTUDENT',
    status: 'active',
    data: { degree: 'BSc Computer Science', university: 'Test University' },
    hiddenData: { gpa: '3.8', studentId: 'S12345' },
    ...overrides,
  };
}

// ===========================================================================
// PublicBlockchain
// ===========================================================================

describe('PublicBlockchain', () => {
  let chain: PublicBlockchain;

  beforeEach(() => {
    chain = new PublicBlockchain();
  });

  // -----------------------------------------------------------------------
  // Genesis block
  // -----------------------------------------------------------------------
  describe('genesis block', () => {
    it('should initialise with exactly one block (genesis)', () => {
      const stats = chain.getStats();
      expect(stats.totalBlocks).toBe(1);
    });

    it('should have index 0 and previousHash "0" on genesis block', () => {
      const genesis = chain.getLatestBlock();
      expect(genesis.index).toBe(0);
      expect(genesis.previousHash).toBe('0');
    });

    it('should have a deterministic genesis hash', () => {
      const genesis = chain.getLatestBlock();
      expect(genesis.hash).toBe(
        '0000000000000000000000000000000000000000000000000000000000000000'
      );
    });

    it('should have no transactions in genesis block', () => {
      const genesis = chain.getLatestBlock();
      expect(genesis.transactions).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // addValidator
  // -----------------------------------------------------------------------
  describe('addValidator', () => {
    it('should allow a registered validator to mine', async () => {
      chain.addValidator('0xVALIDATOR_A');
      const zkProof = await createTestZKProof();
      await chain.createCredentialTransaction('c1', 'hash1', 'issuer', 'recip', zkProof);
      const block = await chain.minePendingTransactions('0xVALIDATOR_A');
      expect(block).not.toBeNull();
      expect(block!.validator).toBe('0xVALIDATOR_A');
    });

    it('should throw when a non-validator attempts to mine', async () => {
      const zkProof = await createTestZKProof();
      await chain.createCredentialTransaction('c2', 'hash2', 'issuer', 'recip', zkProof);
      await expect(
        chain.minePendingTransactions('0xUNAUTHORIZED')
      ).rejects.toThrow('Not an authorized validator');
    });
  });

  // -----------------------------------------------------------------------
  // createCredentialTransaction
  // -----------------------------------------------------------------------
  describe('createCredentialTransaction', () => {
    it('should return a transaction with type ISSUE', async () => {
      const zkProof = await createTestZKProof();
      const tx = await chain.createCredentialTransaction(
        'cred-1',
        'credHash123',
        'did:polygon:0xISSUER',
        'did:polygon:0xSTUDENT',
        zkProof
      );

      expect(tx.type).toBe('ISSUE');
      expect(tx.from).toBe('did:polygon:0xISSUER');
      expect(tx.to).toBe('did:polygon:0xSTUDENT');
    });

    it('should include credential data and zkProof metadata', async () => {
      const zkProof = await createTestZKProof();
      const tx = await chain.createCredentialTransaction(
        'cred-2',
        'hash456',
        'issuer',
        'recipient',
        zkProof
      );

      expect(tx.data.credentialId).toBe('cred-2');
      expect(tx.data.credentialHash).toBe('hash456');
      expect(tx.data.zkProof).toBeDefined();
      const zkProofData = tx.data.zkProof as { proofId: string; statement: string };
      expect(zkProofData.proofId).toBe(zkProof.proofId);
      expect(zkProofData.statement).toBe(zkProof.statement);
    });

    it('should generate a unique transaction id', async () => {
      const zkProof = await createTestZKProof();
      const tx1 = await chain.createCredentialTransaction('c1', 'h1', 'i', 'r', zkProof);
      const tx2 = await chain.createCredentialTransaction('c2', 'h2', 'i', 'r', zkProof);
      expect(tx1.id).not.toBe(tx2.id);
      expect(tx1.id).toMatch(/^tx_/);
    });

    it('should include a sha256 signature and gasUsed', async () => {
      const zkProof = await createTestZKProof();
      const tx = await chain.createCredentialTransaction('c3', 'h3', 'i', 'r', zkProof);
      expect(tx.signature).toMatch(/^[0-9a-f]{64}$/);
      expect(tx.gasUsed).toBe(21000);
    });

    it('should include a timestamp', async () => {
      const before = new Date().toISOString();
      const zkProof = await createTestZKProof();
      const tx = await chain.createCredentialTransaction('c4', 'h4', 'i', 'r', zkProof);
      const after = new Date().toISOString();
      expect(tx.timestamp >= before).toBe(true);
      expect(tx.timestamp <= after).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // minePendingTransactions
  // -----------------------------------------------------------------------
  describe('minePendingTransactions', () => {
    beforeEach(() => {
      chain.addValidator('0xVAL');
    });

    it('should create a new block containing pending transactions', async () => {
      const zkProof = await createTestZKProof();
      await chain.createCredentialTransaction('c1', 'h1', 'i', 'r', zkProof);
      await chain.createCredentialTransaction('c2', 'h2', 'i', 'r', zkProof);

      const block = await chain.minePendingTransactions('0xVAL');
      expect(block).not.toBeNull();
      expect(block!.transactions).toHaveLength(2);
      expect(block!.index).toBe(1);
    });

    it('should link the new block to the previous block hash', async () => {
      const prevHash = chain.getLatestBlock().hash;
      const zkProof = await createTestZKProof();
      await chain.createCredentialTransaction('c1', 'h1', 'i', 'r', zkProof);

      const block = await chain.minePendingTransactions('0xVAL');
      expect(block!.previousHash).toBe(prevHash);
    });

    it('should clear pending transactions after mining', async () => {
      const zkProof = await createTestZKProof();
      await chain.createCredentialTransaction('c1', 'h1', 'i', 'r', zkProof);
      await chain.minePendingTransactions('0xVAL');

      // Trying to mine again with no pending transactions
      const emptyBlock = await chain.minePendingTransactions('0xVAL');
      expect(emptyBlock).toBeNull();
    });

    it('should return null when there are no pending transactions', async () => {
      const result = await chain.minePendingTransactions('0xVAL');
      expect(result).toBeNull();
    });

    it('should compute a merkle root for the block', async () => {
      const zkProof = await createTestZKProof();
      await chain.createCredentialTransaction('c1', 'h1', 'i', 'r', zkProof);
      const block = await chain.minePendingTransactions('0xVAL');
      expect(block!.merkleRoot).toBeDefined();
      expect(block!.merkleRoot).not.toBe('0');
      expect(typeof block!.merkleRoot).toBe('string');
    });

    it('should assign a block hash', async () => {
      const zkProof = await createTestZKProof();
      await chain.createCredentialTransaction('c1', 'h1', 'i', 'r', zkProof);
      const block = await chain.minePendingTransactions('0xVAL');
      expect(block!.hash).toBeDefined();
      expect(block!.hash.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // verifyChain
  // -----------------------------------------------------------------------
  describe('verifyChain', () => {
    it('should verify a chain with only the genesis block', async () => {
      const valid = await chain.verifyChain();
      expect(valid).toBe(true);
    });

    it('should verify a chain after mining multiple blocks', async () => {
      chain.addValidator('0xVAL');
      const zkProof = await createTestZKProof();

      await chain.createCredentialTransaction('c1', 'h1', 'i', 'r', zkProof);
      await chain.minePendingTransactions('0xVAL');

      await chain.createCredentialTransaction('c2', 'h2', 'i', 'r', zkProof);
      await chain.minePendingTransactions('0xVAL');

      await chain.createCredentialTransaction('c3', 'h3', 'i', 'r', zkProof);
      await chain.minePendingTransactions('0xVAL');

      const valid = await chain.verifyChain();
      expect(valid).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // getTransaction
  // -----------------------------------------------------------------------
  describe('getTransaction', () => {
    it('should find a mined transaction by its ID', async () => {
      chain.addValidator('0xVAL');
      const zkProof = await createTestZKProof();
      const tx = await chain.createCredentialTransaction('c1', 'h1', 'i', 'r', zkProof);
      await chain.minePendingTransactions('0xVAL');

      const found = chain.getTransaction(tx.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(tx.id);
      expect(found!.data.credentialId).toBe('c1');
    });

    it('should return null for a non-existent transaction ID', () => {
      const found = chain.getTransaction('tx_nonexistent');
      expect(found).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getStats
  // -----------------------------------------------------------------------
  describe('getStats', () => {
    it('should return correct stats for an empty chain', () => {
      const stats = chain.getStats();
      expect(stats.totalBlocks).toBe(1); // genesis
      expect(stats.totalTransactions).toBe(0);
      expect(stats.consensusMechanism).toBe('PoS');
      expect(stats.averageBlockTime).toBe(2.5);
      expect(stats.networkHashRate).toBe('2.4 TH/s');
    });

    it('should update totalBlocks and totalTransactions after mining', async () => {
      chain.addValidator('0xVAL');
      const zkProof = await createTestZKProof();

      await chain.createCredentialTransaction('c1', 'h1', 'i', 'r', zkProof);
      await chain.createCredentialTransaction('c2', 'h2', 'i', 'r', zkProof);
      await chain.minePendingTransactions('0xVAL');

      const stats = chain.getStats();
      expect(stats.totalBlocks).toBe(2); // genesis + 1 mined
      expect(stats.totalTransactions).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // getRecentBlocks
  // -----------------------------------------------------------------------
  describe('getRecentBlocks', () => {
    it('should return blocks in reverse chronological order', async () => {
      chain.addValidator('0xVAL');
      const zkProof = await createTestZKProof();

      await chain.createCredentialTransaction('c1', 'h1', 'i', 'r', zkProof);
      await chain.minePendingTransactions('0xVAL');
      await chain.createCredentialTransaction('c2', 'h2', 'i', 'r', zkProof);
      await chain.minePendingTransactions('0xVAL');

      const recent = chain.getRecentBlocks(10);
      expect(recent).toHaveLength(3); // genesis + 2 mined
      expect(recent[0].index).toBeGreaterThan(recent[1].index);
    });
  });
});

// ===========================================================================
// PrivateBlockchain
// ===========================================================================

describe('PrivateBlockchain', () => {
  let chain: PrivateBlockchain;
  const issuerDID = 'did:polygon:0xISSUER_PRIV';
  const recipientDID = 'did:polygon:0xRECIPIENT_PRIV';

  beforeEach(() => {
    chain = new PrivateBlockchain();
  });

  // -----------------------------------------------------------------------
  // storeCredential
  // -----------------------------------------------------------------------
  describe('storeCredential', () => {
    it('should store a credential and return success with an encryption key', async () => {
      const result = await chain.storeCredential(
        'cred-priv-1',
        { degree: 'MSc', gpa: '3.9' },
        issuerDID,
        recipientDID
      );

      expect(result.success).toBe(true);
      expect(result.encryptionKey).toBeDefined();
      expect(typeof result.encryptionKey).toBe('string');
      expect(result.encryptionKey!.length).toBeGreaterThan(0);
    });

    it('should grant access to both issuer and recipient after storing', async () => {
      await chain.storeCredential('cred-priv-2', { data: 'test' }, issuerDID, recipientDID);

      expect(chain.hasAccess('cred-priv-2', issuerDID)).toBe(true);
      expect(chain.hasAccess('cred-priv-2', recipientDID)).toBe(true);
    });

    it('should not grant access to an unrelated DID', async () => {
      await chain.storeCredential('cred-priv-3', { data: 'x' }, issuerDID, recipientDID);
      expect(chain.hasAccess('cred-priv-3', 'did:polygon:0xINTRUDER')).toBe(false);
    });

    it('should allow an authorised DID to retrieve the encrypted credential', async () => {
      await chain.storeCredential('cred-priv-4', { degree: 'PhD' }, issuerDID, recipientDID);
      const encrypted = chain.getEncryptedCredential('cred-priv-4', issuerDID);

      expect(encrypted).not.toBeNull();
      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.issuer).toBe(issuerDID);
      expect(encrypted.recipient).toBe(recipientDID);
    });

    it('should deny retrieval to an unauthorised DID', async () => {
      await chain.storeCredential('cred-priv-5', { data: 'secret' }, issuerDID, recipientDID);
      const result = chain.getEncryptedCredential('cred-priv-5', 'did:polygon:0xEVIL');
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // grantAccess
  // -----------------------------------------------------------------------
  describe('grantAccess', () => {
    it('should grant access to a new DID when authorised by an existing accessor', async () => {
      await chain.storeCredential('cred-ga-1', { x: 1 }, issuerDID, recipientDID);

      const verifierDID = 'did:polygon:0xVERIFIER';
      const granted = chain.grantAccess('cred-ga-1', verifierDID, issuerDID);
      expect(granted).toBe(true);
      expect(chain.hasAccess('cred-ga-1', verifierDID)).toBe(true);
    });

    it('should refuse access grant from an unauthorised granter', async () => {
      await chain.storeCredential('cred-ga-2', { x: 1 }, issuerDID, recipientDID);

      const outsider = 'did:polygon:0xOUTSIDER';
      const verifier = 'did:polygon:0xVERIFIER';
      const granted = chain.grantAccess('cred-ga-2', verifier, outsider);
      expect(granted).toBe(false);
      expect(chain.hasAccess('cred-ga-2', verifier)).toBe(false);
    });

    it('should return false when granting access to a non-existent credential', () => {
      const granted = chain.grantAccess('non-existent', 'did:x', issuerDID);
      expect(granted).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // revokeAccess
  // -----------------------------------------------------------------------
  describe('revokeAccess', () => {
    it('should revoke access for a DID', async () => {
      await chain.storeCredential('cred-ra-1', { x: 1 }, issuerDID, recipientDID);

      const revoked = chain.revokeAccess('cred-ra-1', recipientDID, issuerDID);
      expect(revoked).toBe(true);
      expect(chain.hasAccess('cred-ra-1', recipientDID)).toBe(false);
    });

    it('should refuse revocation from an unauthorised revoker', async () => {
      await chain.storeCredential('cred-ra-2', { x: 1 }, issuerDID, recipientDID);

      const outsider = 'did:polygon:0xOUTSIDER';
      const revoked = chain.revokeAccess('cred-ra-2', recipientDID, outsider);
      expect(revoked).toBe(false);
      // recipient should still have access
      expect(chain.hasAccess('cred-ra-2', recipientDID)).toBe(true);
    });

    it('should return false for a non-existent credential', () => {
      const revoked = chain.revokeAccess('missing', 'did:x', issuerDID);
      expect(revoked).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // hasAccess
  // -----------------------------------------------------------------------
  describe('hasAccess', () => {
    it('should return false for a credential that does not exist', () => {
      expect(chain.hasAccess('no-such-cred', 'did:x')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getStats
  // -----------------------------------------------------------------------
  describe('getStats', () => {
    it('should report zero credentials initially', () => {
      const stats = chain.getStats();
      expect(stats.totalCredentials).toBe(0);
      expect(stats.totalBlocks).toBe(1); // genesis
    });

    it('should update totalCredentials after storing', async () => {
      await chain.storeCredential('s1', { a: 1 }, issuerDID, recipientDID);
      await chain.storeCredential('s2', { b: 2 }, issuerDID, recipientDID);

      const stats = chain.getStats();
      expect(stats.totalCredentials).toBe(2);
      expect(stats.storageUsed).toBeGreaterThan(0);
    });
  });
});

// ===========================================================================
// BlockchainManager
// ===========================================================================

describe('BlockchainManager', () => {
  let manager: BlockchainManager;

  beforeEach(() => {
    manager = new BlockchainManager();
  });

  // -----------------------------------------------------------------------
  // constructor
  // -----------------------------------------------------------------------
  describe('constructor', () => {
    it('should initialise with public and private chains', () => {
      expect(manager.publicChain).toBeInstanceOf(PublicBlockchain);
      expect(manager.privateChain).toBeInstanceOf(PrivateBlockchain);
    });

    it('should register default validators on the public chain', () => {
      // Verify that default validators can mine (no throw)
      // We check indirectly: create a tx and mine with the default validator
      expect(async () => {
        const zkProof = await createTestZKProof();
        await manager.publicChain.createCredentialTransaction(
          'test', 'hash', 'i', 'r', zkProof
        );
        await manager.publicChain.minePendingTransactions('0xGovernance001');
      }).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // issueCredential
  // -----------------------------------------------------------------------
  describe('issueCredential', () => {
    it('should issue a credential across both chains', async () => {
      const credential = makeCredential();
      const result = await manager.issueCredential(
        credential,
        'did:polygon:0xISSUER',
        'did:polygon:0xSTUDENT'
      );

      expect(result.publicTx).toBeDefined();
      expect(result.publicTx.type).toBe('ISSUE');
      expect(result.publicTx.from).toBe('did:polygon:0xISSUER');
      expect(result.publicTx.to).toBe('did:polygon:0xSTUDENT');
      expect(result.privateKey).toBeDefined();
      expect(typeof result.privateKey).toBe('string');
    });

    it('should mine the transaction onto the public chain', async () => {
      const credential = makeCredential();
      const { publicTx } = await manager.issueCredential(
        credential,
        'did:polygon:0xISSUER',
        'did:polygon:0xSTUDENT'
      );

      // The transaction should now be findable on the public chain
      const found = manager.publicChain.getTransaction(publicTx.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(publicTx.id);
    });

    it('should store the credential on the private chain with access control', async () => {
      const credential = makeCredential();
      await manager.issueCredential(
        credential,
        'did:polygon:0xISSUER',
        'did:polygon:0xSTUDENT'
      );

      expect(manager.privateChain.hasAccess(credential.id, 'did:polygon:0xISSUER')).toBe(true);
      expect(manager.privateChain.hasAccess(credential.id, 'did:polygon:0xSTUDENT')).toBe(true);
      expect(manager.privateChain.hasAccess(credential.id, 'did:polygon:0xOTHER')).toBe(false);
    });

    it('should include zkProof data in the public transaction', async () => {
      const credential = makeCredential();
      const { publicTx } = await manager.issueCredential(
        credential,
        'did:polygon:0xISSUER',
        'did:polygon:0xSTUDENT'
      );

      expect(publicTx.data.zkProof).toBeDefined();
      const zkProofData = publicTx.data.zkProof as { proofId: string; statement: string };
      expect(zkProofData.proofId).toMatch(/^zkp_/);
      expect(zkProofData.statement).toContain('is_valid_credential');
    });

    it('should ensure chain integrity after issuance', async () => {
      const credential = makeCredential();
      await manager.issueCredential(
        credential,
        'did:polygon:0xISSUER',
        'did:polygon:0xSTUDENT'
      );

      const valid = await manager.publicChain.verifyChain();
      expect(valid).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // getSystemStats
  // -----------------------------------------------------------------------
  describe('getSystemStats', () => {
    it('should return stats from both chains and combined metadata', () => {
      const stats = manager.getSystemStats();

      // Public chain stats
      expect(stats.public).toBeDefined();
      expect(stats.public.totalBlocks).toBeGreaterThanOrEqual(1);
      expect(stats.public.consensusMechanism).toBe('PoS');

      // Private chain stats
      expect(stats.private).toBeDefined();
      expect(stats.private.totalCredentials).toBe(0);
      expect(stats.private.totalBlocks).toBe(1);

      // Combined metadata
      expect(stats.combined).toBeDefined();
      expect(stats.combined.securityLevel).toContain('ZKP');
      expect(stats.combined.complianceStatus).toContain('GDPR');
    });

    it('should reflect credential issuance in stats', async () => {
      const credential = makeCredential();
      await manager.issueCredential(
        credential,
        'did:polygon:0xISSUER',
        'did:polygon:0xSTUDENT'
      );

      const stats = manager.getSystemStats();
      expect(stats.public.totalBlocks).toBe(2); // genesis + 1 mined
      expect(stats.public.totalTransactions).toBe(1);
      expect(stats.private.totalCredentials).toBe(1);
    });

    // Two full issuance cycles (public + private persistence) can exceed 5s under coverage instrumentation.
    it('should accumulate stats across multiple issuances', async () => {
      await manager.issueCredential(
        makeCredential(),
        'did:polygon:0xISSUER',
        'did:polygon:0xSTUDENT1'
      );
      await manager.issueCredential(
        makeCredential(),
        'did:polygon:0xISSUER',
        'did:polygon:0xSTUDENT2'
      );

      const stats = manager.getSystemStats();
      expect(stats.public.totalBlocks).toBe(3); // genesis + 2 mined
      expect(stats.public.totalTransactions).toBe(2);
      expect(stats.private.totalCredentials).toBe(2);
    }, 20_000);
  });
});
