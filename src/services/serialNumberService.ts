import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

export interface CertificateSerial {
  serialNumber: string;
  credentialId: string;
  issuer: string;
  issuanceDate: string;
  checksum: string;
}

class SerialNumberService {
  private serials: Map<string, CertificateSerial> = new Map();

  generateSerialNumber(credentialId: string, issuer: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const issuerCode = this.getIssuerCode(issuer);
    return `${issuerCode}-${timestamp}-${random}`.toUpperCase();
  }

  private getIssuerCode(issuer: string): string {
    const hash = createHash('sha256').update(issuer).digest('hex');
    return hash.substring(0, 6).toUpperCase();
  }

  registerSerial(credentialId: string, issuer: string): CertificateSerial {
    const serialNumber = this.generateSerialNumber(credentialId, issuer);
    const issuanceDate = new Date().toISOString();
    const checksum = this.generateChecksum(serialNumber, credentialId);

    const serial: CertificateSerial = {
      serialNumber,
      credentialId,
      issuer,
      issuanceDate,
      checksum
    };

    this.serials.set(serialNumber, serial);
    return serial;
  }

  private generateChecksum(serialNumber: string, credentialId: string): string {
    const data = `${serialNumber}:${credentialId}`;
    return createHash('sha256').update(data).digest('hex').substring(0, 8);
  }

  verifySerial(serialNumber: string): CertificateSerial | null {
    return this.serials.get(serialNumber) || null;
  }

  validateChecksum(serial: CertificateSerial): boolean {
    const computed = this.generateChecksum(serial.serialNumber, serial.credentialId);
    return computed === serial.checksum;
  }
}

export const serialNumberService = new SerialNumberService();
