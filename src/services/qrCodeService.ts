import QRCode from 'qrcode';

export interface QRCodeData {
  credentialId: string;
  issuer: string;
  subject: string;
  issuanceDate: string;
  verificationUrl: string;
}

class QRCodeService {
  async generateQRCode(data: QRCodeData): Promise<string> {
    const payload = JSON.stringify(data);
    return await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'H',
      width: 300,
      margin: 2
    });
  }

  async generateQRCodeBuffer(data: QRCodeData): Promise<Buffer> {
    const payload = JSON.stringify(data);
    return await QRCode.toBuffer(payload, {
      errorCorrectionLevel: 'H',
      width: 300
    });
  }

  parseQRCodeData(qrData: string): QRCodeData {
    return JSON.parse(qrData);
  }

  generateVerificationUrl(credentialId: string): string {
    const baseUrl = import.meta.env.VITE_APP_URL || 'https://morningstar-credentials.io';
    return `${baseUrl}/verify/${credentialId}`;
  }
}

export const qrCodeService = new QRCodeService();
