import { describe, it, expect } from 'vitest';
import { sanitizeHTML, validateDID, validateEmail, validateEntityName } from '../../src/services/validation';

describe('Validation Service', () => {
  describe('sanitizeHTML', () => {
    it('should strip script tags', () => {
      const input = 'hello<script>alert("xss")</script>world';
      const output = sanitizeHTML(input);
      expect(output).not.toContain('<script>');
    });

    it('should preserve normal text', () => {
      expect(sanitizeHTML('Hello World')).toBe('Hello World');
    });
  });

  describe('validateDID', () => {
    it('should accept valid DID', () => {
      const result = validateDID('did:polygon:0x1234567890abcdef');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid DID', () => {
      const result = validateDID('not-a-did');
      expect(result.valid).toBe(false);
    });

    it('should reject empty string', () => {
      const result = validateDID('');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateEmail', () => {
    it('should accept valid email', () => {
      const result = validateEmail('user@example.com');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = validateEmail('not-email');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateEntityName', () => {
    it('should accept valid entity names', () => {
      const result = validateEntityName('Polygon University');
      expect(result.valid).toBe(true);
    });

    it('should reject empty names', () => {
      const result = validateEntityName('');
      expect(result.valid).toBe(false);
    });
  });
});
