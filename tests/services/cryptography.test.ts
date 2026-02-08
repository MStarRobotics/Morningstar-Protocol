import { describe, it, expect } from 'vitest';
import { sha256, generateKeyPair, createSignature, verifySignature, generateMerkleRoot, generateNonce, generateCID } from '../../src/services/cryptography';

describe('Cryptography Service', () => {
  describe('sha256', () => {
    it('should return consistent hash for same input', async () => {
      const hash1 = await sha256('test');
      const hash2 = await sha256('test');
      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different inputs', async () => {
      const hash1 = await sha256('test1');
      const hash2 = await sha256('test2');
      expect(hash1).not.toBe(hash2);
    });

    it('should return 64 character hex string', async () => {
      const hash = await sha256('hello');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('generateKeyPair', () => {
    it('should generate a key pair with public key hex', async () => {
      const keyPair = await generateKeyPair();
      expect(keyPair).toHaveProperty('publicKey');
      expect(keyPair).toHaveProperty('privateKey');
      expect(keyPair).toHaveProperty('publicKeyHex');
      expect(keyPair.publicKeyHex).toMatch(/^0x[0-9a-f]+$/);
    });
  });

  describe('generateNonce', () => {
    it('should generate unique nonces', () => {
      const nonce1 = generateNonce();
      const nonce2 = generateNonce();
      expect(nonce1).not.toBe(nonce2);
      expect(nonce1).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('generateMerkleRoot', () => {
    it('should handle single hash', async () => {
      const root = await generateMerkleRoot(['abc123']);
      expect(root).toBe('abc123');
    });

    it('should compute root for multiple hashes', async () => {
      const hashes = [
        await sha256('credential1'),
        await sha256('credential2'),
        await sha256('credential3'),
      ];
      const root = await generateMerkleRoot(hashes);
      expect(root).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should handle empty array', async () => {
      const root = await generateMerkleRoot([]);
      expect(root).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('generateCID', () => {
    it('should generate CID starting with Qm', async () => {
      const cid = await generateCID('some content');
      expect(cid).toMatch(/^Qm[0-9a-f]{44}$/);
    });
  });
});
