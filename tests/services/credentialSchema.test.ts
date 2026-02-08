import { describe, it, expect, beforeEach } from 'vitest';
import { CredentialSchemaRegistry } from '../../src/services/credentialSchema';
import type { SchemaTemplate } from '../../src/types';
import type { CredentialSchema } from '../../src/services/credentialSchema';

describe('CredentialSchemaRegistry', () => {
  let registry: CredentialSchemaRegistry;

  const degreeSchema: CredentialSchema = {
    id: 'schema:did:polygon:0xabc:degree',
    name: 'Degree Credential',
    version: '1.0.0',
    issuer: 'did:polygon:0xabc',
    fields: [
      { name: 'studentName', type: 'string', required: true },
      { name: 'degreeTitle', type: 'string', required: true },
      { name: 'graduationDate', type: 'date', required: true },
      { name: 'gpa', type: 'number', required: false },
      { name: 'honors', type: 'boolean', required: false },
    ],
    createdAt: '2025-01-15T00:00:00.000Z',
  };

  beforeEach(() => {
    registry = new CredentialSchemaRegistry();
  });

  describe('registerSchema', () => {
    it('should register and retrieve a schema by id', () => {
      registry.registerSchema(degreeSchema);
      const retrieved = registry.getSchema(degreeSchema.id);
      expect(retrieved).toEqual(degreeSchema);
    });

    it('should return the registered schema', () => {
      const result = registry.registerSchema(degreeSchema);
      expect(result).toEqual(degreeSchema);
    });

    it('should overwrite a schema with the same id', () => {
      registry.registerSchema(degreeSchema);
      const updated = { ...degreeSchema, version: '2.0.0' };
      registry.registerSchema(updated);
      const retrieved = registry.getSchema(degreeSchema.id);
      expect(retrieved?.version).toBe('2.0.0');
    });
  });

  describe('registerFromTemplate', () => {
    const template: SchemaTemplate = {
      schemaName: 'Employment Certificate',
      fields: [
        { name: 'employeeName', type: 'string', required: true },
        { name: 'position', type: 'string', required: true },
        { name: 'startDate', type: 'date', required: true },
        { name: 'salary', type: 'number', required: false },
      ],
    };

    it('should create a schema from a template', () => {
      const issuer = 'did:polygon:0xdef';
      const schema = registry.registerFromTemplate(template, issuer);

      expect(schema.name).toBe('Employment Certificate');
      expect(schema.issuer).toBe(issuer);
      expect(schema.version).toBe('1.0.0');
      expect(schema.fields).toHaveLength(4);
    });

    it('should generate an id from the issuer and schema name', () => {
      const issuer = 'did:polygon:0xdef';
      const schema = registry.registerFromTemplate(template, issuer);

      expect(schema.id).toBe('schema:did:polygon:0xdef:employment-certificate');
    });

    it('should store the schema so it can be retrieved', () => {
      const issuer = 'did:polygon:0x999';
      const schema = registry.registerFromTemplate(template, issuer);

      const retrieved = registry.getSchema(schema.id);
      expect(retrieved).toEqual(schema);
    });

    it('should map template fields to schema fields correctly', () => {
      const schema = registry.registerFromTemplate(template, 'did:polygon:0x1');

      expect(schema.fields[0]).toEqual({ name: 'employeeName', type: 'string', required: true });
      expect(schema.fields[2]).toEqual({ name: 'startDate', type: 'date', required: true });
      expect(schema.fields[3]).toEqual({ name: 'salary', type: 'number', required: false });
    });

    it('should set a createdAt timestamp', () => {
      const schema = registry.registerFromTemplate(template, 'did:polygon:0x1');
      const parsed = Date.parse(schema.createdAt);
      expect(Number.isNaN(parsed)).toBe(false);
    });

    it('should normalize schema names with spaces', () => {
      const spaceyTemplate: SchemaTemplate = {
        schemaName: 'My  Custom   Schema',
        fields: [{ name: 'field1', type: 'string', required: true }],
      };
      const schema = registry.registerFromTemplate(spaceyTemplate, 'did:polygon:0x1');
      expect(schema.id).toBe('schema:did:polygon:0x1:my-custom-schema');
    });
  });

  describe('getSchema', () => {
    it('should return null for an unknown schema id', () => {
      const result = registry.getSchema('schema:unknown:does-not-exist');
      expect(result).toBeNull();
    });

    it('should return null for an empty string id', () => {
      const result = registry.getSchema('');
      expect(result).toBeNull();
    });
  });

  describe('validateSubject', () => {
    beforeEach(() => {
      registry.registerSchema(degreeSchema);
    });

    it('should validate a correct subject', () => {
      const subject = {
        studentName: 'Alice Johnson',
        degreeTitle: 'BSc Computer Science',
        graduationDate: '2025-06-15',
        gpa: 3.8,
        honors: true,
      };

      const result = registry.validateSubject(degreeSchema.id, subject);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should validate a subject with only required fields', () => {
      const subject = {
        studentName: 'Bob Smith',
        degreeTitle: 'BA Philosophy',
        graduationDate: '2024-12-01',
      };

      const result = registry.validateSubject(degreeSchema.id, subject);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should catch missing required fields', () => {
      const subject = {
        studentName: 'Charlie Brown',
        // degreeTitle is missing
        // graduationDate is missing
      };

      const result = registry.validateSubject(degreeSchema.id, subject);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Missing required field: degreeTitle');
      expect(result.issues).toContain('Missing required field: graduationDate');
    });

    it('should catch wrong type for string field', () => {
      const subject = {
        studentName: 12345,
        degreeTitle: 'BA English',
        graduationDate: '2025-01-01',
      };

      const result = registry.validateSubject(degreeSchema.id, subject);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Invalid type for studentName: expected string');
    });

    it('should catch wrong type for number field', () => {
      const subject = {
        studentName: 'Diana Prince',
        degreeTitle: 'BSc Physics',
        graduationDate: '2025-06-01',
        gpa: 'not-a-number',
      };

      const result = registry.validateSubject(degreeSchema.id, subject);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Invalid type for gpa: expected number');
    });

    it('should catch wrong type for date field', () => {
      const subject = {
        studentName: 'Eve Adams',
        degreeTitle: 'MSc Mathematics',
        graduationDate: 'not-a-valid-date-xyz',
      };

      const result = registry.validateSubject(degreeSchema.id, subject);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Invalid type for graduationDate: expected date');
    });

    it('should catch wrong type for boolean field', () => {
      const subject = {
        studentName: 'Frank Castle',
        degreeTitle: 'BA Law',
        graduationDate: '2025-05-20',
        honors: 'yes',
      };

      const result = registry.validateSubject(degreeSchema.id, subject);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Invalid type for honors: expected boolean');
    });

    it('should report schema not found for unknown schema id', () => {
      const result = registry.validateSubject('schema:nonexistent', { field: 'value' });
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Schema not found');
    });

    it('should allow null values for optional fields', () => {
      const subject = {
        studentName: 'Grace Hopper',
        degreeTitle: 'PhD Computer Science',
        graduationDate: '2025-09-01',
        gpa: null,
      };

      const result = registry.validateSubject(degreeSchema.id, subject);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should reject NaN for number fields', () => {
      const subject = {
        studentName: 'Hank Pym',
        degreeTitle: 'BSc Chemistry',
        graduationDate: '2025-03-15',
        gpa: NaN,
      };

      const result = registry.validateSubject(degreeSchema.id, subject);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Invalid type for gpa: expected number');
    });

    it('should reject Infinity for number fields', () => {
      const subject = {
        studentName: 'Iris West',
        degreeTitle: 'BA Journalism',
        graduationDate: '2025-07-01',
        gpa: Infinity,
      };

      const result = registry.validateSubject(degreeSchema.id, subject);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Invalid type for gpa: expected number');
    });

    it('should collect multiple issues at once', () => {
      const subject = {
        studentName: 999,
        // degreeTitle missing
        graduationDate: false,
      };

      const result = registry.validateSubject(degreeSchema.id, subject);
      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('loadFromPayload', () => {
    it('should load schemas from a payload object', () => {
      registry.loadFromPayload({ schemas: [degreeSchema] });
      expect(registry.getSchema(degreeSchema.id)).toEqual(degreeSchema);
    });

    it('should handle payload with no schemas key', () => {
      expect(() => registry.loadFromPayload({})).not.toThrow();
    });
  });
});
