import { z } from 'zod';

// Credential Schema
export const credentialSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  data: z.record(z.string(), z.any()),
  hiddenData: z.record(z.string(), z.any()).optional()
});

// DID Schema
export const didSchema = z.string().regex(/^did:[a-z]+:[a-zA-Z0-9._-]+$/);

// Email Schema
export const emailSchema = z.string().email();

// Serial Number Schema
export const serialNumberSchema = z.string().regex(/^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+$/);

// JWT Payload Schema
export const jwtPayloadSchema = z.object({
  sub: z.string(),
  role: z.enum(['admin', 'issuer', 'verifier', 'student']),
  permissions: z.array(z.string())
});

// QR Code Data Schema
export const qrCodeDataSchema = z.object({
  credentialId: z.string(),
  issuer: didSchema,
  subject: didSchema,
  issuanceDate: z.string().datetime(),
  verificationUrl: z.string().url()
});

class ValidationService {
  validateCredential(data: unknown) {
    try {
      return credentialSchema.parse(data);
    } catch (error) {
      throw new Error(`Credential validation failed: ${error}`);
    }
  }

  validateDID(data: unknown) {
    return didSchema.parse(data);
  }

  validateEmail(data: unknown) {
    return emailSchema.parse(data);
  }

  validateSerialNumber(data: unknown) {
    return serialNumberSchema.parse(data);
  }

  validateJWTPayload(data: unknown) {
    return jwtPayloadSchema.parse(data);
  }

  validateQRCodeData(data: unknown) {
    return qrCodeDataSchema.parse(data);
  }

  isValidCredential(data: unknown): boolean {
    try {
      credentialSchema.parse(data);
      return true;
    } catch {
      return false;
    }
  }

  isValidDID(data: unknown): boolean {
    try {
      didSchema.parse(data);
      return true;
    } catch {
      return false;
    }
  }

  isValidEmail(data: unknown): boolean {
    try {
      emailSchema.parse(data);
      return true;
    } catch {
      return false;
    }
  }

  isValidSerialNumber(data: unknown): boolean {
    try {
      serialNumberSchema.parse(data);
      return true;
    } catch {
      return false;
    }
  }
}

export const validationService = new ValidationService();
