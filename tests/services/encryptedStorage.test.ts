import { describe, it, expect, beforeEach } from 'vitest';
import { EncryptedStorage } from '../../src/services/encryptedStorage';

describe('EncryptedStorage', () => {
  let storage: EncryptedStorage;

  beforeEach(() => {
    localStorage.clear();
    storage = new EncryptedStorage('test-passphrase');
  });

  describe('constructor', () => {
    it('should create an instance without errors', () => {
      const instance = new EncryptedStorage('my-secret');
      expect(instance).toBeInstanceOf(EncryptedStorage);
    });

    it('should accept any string as passphrase', () => {
      const short = new EncryptedStorage('a');
      const long = new EncryptedStorage('a'.repeat(1000));
      expect(short).toBeInstanceOf(EncryptedStorage);
      expect(long).toBeInstanceOf(EncryptedStorage);
    });
  });

  describe('setItem + getItem round-trip', () => {
    it('should encrypt and decrypt a string', async () => {
      await storage.setItem('greeting', 'hello world');
      const result = await storage.getItem<string>('greeting');
      expect(result).toBe('hello world');
    });

    it('should encrypt and decrypt an object', async () => {
      const obj = { name: 'Alice', age: 30, active: true };
      await storage.setItem('user', obj);
      const result = await storage.getItem<typeof obj>('user');
      expect(result).toEqual(obj);
    });

    it('should encrypt and decrypt an array', async () => {
      const arr = [1, 'two', { three: 3 }, [4, 5]];
      await storage.setItem('list', arr);
      const result = await storage.getItem<typeof arr>('list');
      expect(result).toEqual(arr);
    });

    it('should encrypt and decrypt a number', async () => {
      await storage.setItem('count', 42);
      const result = await storage.getItem<number>('count');
      expect(result).toBe(42);
    });

    it('should encrypt and decrypt a boolean', async () => {
      await storage.setItem('flag', true);
      const result = await storage.getItem<boolean>('flag');
      expect(result).toBe(true);
    });

    it('should encrypt and decrypt null', async () => {
      await storage.setItem('empty', null);
      const result = await storage.getItem('empty');
      expect(result).toBeNull();
    });

    it('should handle nested objects', async () => {
      const nested = {
        credentials: [
          { id: 'vc-1', issuer: 'did:example:123', claims: { degree: 'BSc' } },
        ],
        meta: { version: 2 },
      };
      await storage.setItem('nested', nested);
      const result = await storage.getItem<typeof nested>('nested');
      expect(result).toEqual(nested);
    });
  });

  describe('getItem', () => {
    it('should return null for a non-existent key', async () => {
      const result = await storage.getItem('does-not-exist');
      expect(result).toBeNull();
    });

    it('should return null and remove key when decryption fails with wrong passphrase', async () => {
      await storage.setItem('secret', 'sensitive-data');

      const wrongStorage = new EncryptedStorage('wrong-passphrase');
      const result = await wrongStorage.getItem('secret');
      expect(result).toBeNull();

      // The corrupt entry should have been removed
      expect(localStorage.getItem('secret')).toBeNull();
    });
  });

  describe('removeItem', () => {
    it('should delete a stored key', async () => {
      await storage.setItem('to-delete', 'temporary');
      expect(storage.hasItem('to-delete')).toBe(true);

      storage.removeItem('to-delete');
      expect(storage.hasItem('to-delete')).toBe(false);

      const result = await storage.getItem('to-delete');
      expect(result).toBeNull();
    });

    it('should not throw when removing a non-existent key', () => {
      expect(() => storage.removeItem('ghost')).not.toThrow();
    });
  });

  describe('hasItem', () => {
    it('should return true for an existing key', async () => {
      await storage.setItem('exists', 'yes');
      expect(storage.hasItem('exists')).toBe(true);
    });

    it('should return false for a non-existent key', () => {
      expect(storage.hasItem('nope')).toBe(false);
    });

    it('should return false after removeItem', async () => {
      await storage.setItem('temp', 'data');
      storage.removeItem('temp');
      expect(storage.hasItem('temp')).toBe(false);
    });
  });

  describe('data stored in localStorage is encrypted', () => {
    it('should not store plaintext value in localStorage', async () => {
      const secret = 'super-secret-credential-data';
      await storage.setItem('encrypted-key', secret);

      const raw = localStorage.getItem('encrypted-key');
      expect(raw).not.toBeNull();
      expect(raw).not.toContain(secret);
      expect(raw).not.toBe(JSON.stringify(secret));
    });

    it('should store base64-encoded data in localStorage', async () => {
      await storage.setItem('b64-test', { foo: 'bar' });
      const raw = localStorage.getItem('b64-test');
      expect(raw).not.toBeNull();
      // Base64 only contains [A-Za-z0-9+/=]
      expect(raw).toMatch(/^[A-Za-z0-9+/=]+$/);
    });
  });

  describe('different passphrases produce different ciphertext', () => {
    it('should produce different stored values for different passphrases', async () => {
      const storageA = new EncryptedStorage('passphrase-alpha');
      const storageB = new EncryptedStorage('passphrase-beta');
      const value = 'identical-plaintext';

      await storageA.setItem('key-a', value);
      await storageB.setItem('key-b', value);

      const rawA = localStorage.getItem('key-a');
      const rawB = localStorage.getItem('key-b');

      expect(rawA).not.toBeNull();
      expect(rawB).not.toBeNull();
      expect(rawA).not.toBe(rawB);
    });
  });

  describe('clearKeyCache', () => {
    it('should clear the cached key without affecting stored data', async () => {
      await storage.setItem('cached', 'value');
      storage.clearKeyCache();

      // After clearing cache, getItem should re-derive the key and still work
      const result = await storage.getItem<string>('cached');
      expect(result).toBe('value');
    });

    it('should not throw when called on a fresh instance', () => {
      const fresh = new EncryptedStorage('fresh');
      expect(() => fresh.clearKeyCache()).not.toThrow();
    });
  });
});
