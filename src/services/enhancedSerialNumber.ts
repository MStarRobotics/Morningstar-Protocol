import { nanoid, customAlphabet } from 'nanoid';
import { createHash } from 'crypto';

export interface EnhancedCertificateSerial {
  serialNumber: string;
  credentialId: string;
  issuer: string;
  issuanceDate: string;
  checksum: string;
  nanoId: string;
}

class EnhancedSerialNumberService {
  private serials: Map<string, EnhancedCertificateSerial> = new Map();
  private readonly alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  private readonly nanoidGenerator = customAlphabet(this.alphabet, 12);

  generateSerialNumber(credentialId: string, issuer: string): string {
    const issuerCode = this.getIssuerCode(issuer);
    const nanoId = this.nanoidGenerator();
    return `${issuerCode}-${nanoId}`;
  }

  private getIssuerCode(issuer: string): string {
    const hash = createHash('sha256').update(issuer).digest('hex');
    return hash.substring(0, 6).toUpperCase();
  }

  registerSerial(credentialId: string, issuer: string): EnhancedCertificateSerial {
    const nanoId = nanoid();
    const serialNumber = this.generateSerialNumber(credentialId, issuer);
    const issuanceDate = new Date().toISOString();
    const checksum = this.generateChecksum(serialNumber, credentialId, nanoId);

    const serial: EnhancedCertificateSerial = {
      serialNumber,
      credentialId,
      issuer,
      issuanceDate,
      checksum,
      nanoId
    };

    this.serials.set(serialNumber, serial);
    return serial;
  }

  private generateChecksum(serialNumber: string, credentialId: string, nanoId: string): string {
    const data = `${serialNumber}:${credentialId}:${nanoId}`;
    return createHash('sha256').update(data).digest('hex').substring(0, 8);
  }

  verifySerial(serialNumber: string): EnhancedCertificateSerial | null {
    return this.serials.get(serialNumber) || null;
  }

  validateChecksum(serial: EnhancedCertificateSerial): boolean {
    const computed = this.generateChecksum(serial.serialNumber, serial.credentialId, serial.nanoId);
    return computed === serial.checksum;
  }

  generateShortId(): string {
    return this.nanoidGenerator();
  }
}

export const enhancedSerialNumberService = new EnhancedSerialNumberService();
