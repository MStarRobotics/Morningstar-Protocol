/**
 * Credential Schema Registry
 * Provides JSON-schema-like validation for verifiable credential subjects.
 */

import { SchemaTemplate } from '../types';
import { env } from './env';
import { logger } from './logger';

export type SchemaFieldType = 'string' | 'number' | 'date' | 'boolean';

export interface CredentialSchemaField {
  name: string;
  type: SchemaFieldType;
  required: boolean;
}

export interface CredentialSchema {
  id: string;
  name: string;
  version: string;
  issuer: string;
  fields: CredentialSchemaField[];
  createdAt: string;
}

const isValidDate = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed);
};

const checkType = (value: unknown, type: SchemaFieldType): boolean => {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'date':
      return isValidDate(value);
    default:
      return false;
  }
};

export class CredentialSchemaRegistry {
  private schemas: Map<string, CredentialSchema> = new Map();

  registerSchema(schema: CredentialSchema): CredentialSchema {
    this.schemas.set(schema.id, schema);
    return schema;
  }

  registerFromTemplate(template: SchemaTemplate, issuer: string): CredentialSchema {
    const id = `schema:${issuer}:${template.schemaName.replace(/\s+/g, '-').toLowerCase()}`;
    const schema: CredentialSchema = {
      id,
      name: template.schemaName,
      version: '1.0.0',
      issuer,
      fields: template.fields.map(field => ({
        name: field.name,
        type: field.type as SchemaFieldType,
        required: field.required
      })),
      createdAt: new Date().toISOString()
    };

    return this.registerSchema(schema);
  }

  getSchema(id: string): CredentialSchema | null {
    return this.schemas.get(id) || null;
  }

  loadFromPayload(payload: { schemas?: CredentialSchema[] }): void {
    payload.schemas?.forEach(schema => this.registerSchema(schema));
  }

  async loadFromUrl(url: string): Promise<void> {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`Schema registry fetch failed: ${response.status}`);
    }
    const payload = await response.json();
    this.loadFromPayload(payload);
  }

  validateSubject(schemaId: string, subject: Record<string, unknown>): { valid: boolean; issues: string[] } {
    const schema = this.schemas.get(schemaId);
    if (!schema) {
      return { valid: false, issues: ['Schema not found'] };
    }

    const issues: string[] = [];

    for (const field of schema.fields) {
      const value = subject[field.name];
      if (value === undefined || value === null) {
        if (field.required) {
          issues.push(`Missing required field: ${field.name}`);
        }
        continue;
      }

      if (!checkType(value, field.type)) {
        issues.push(`Invalid type for ${field.name}: expected ${field.type}`);
      }
    }

    return { valid: issues.length === 0, issues };
  }
}

export const credentialSchemaRegistry = new CredentialSchemaRegistry();

export async function initializeSchemaRegistry(): Promise<void> {
  if (!env.schemaRegistryUrl) return;
  try {
    await credentialSchemaRegistry.loadFromUrl(env.schemaRegistryUrl);
  } catch (error) {
    logger.warn('[SchemaRegistry] Failed to load remote schemas:', error);
  }
}
