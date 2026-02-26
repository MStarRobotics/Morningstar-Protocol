export interface EmailNotification {
  to: string;
  subject: string;
  body: string;
  credentialId?: string;
  serialNumber?: string;
  qrCode?: string;
}

import { api, env } from './env';

class EmailService {
  private emailQueue: EmailNotification[] = [];

  private isOfflineFallbackError(error: unknown): boolean {
    if (env.isProd) {
      return false;
    }

    if (error instanceof TypeError) {
      return true;
    }

    if (!error || typeof error !== 'object') {
      return false;
    }

    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' && ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'EPERM'].includes(code);
  }

  async sendCredentialIssuedEmail(
    studentEmail: string,
    studentName: string,
    credentialId: string,
    serialNumber: string,
    qrCodeDataUrl: string,
  ): Promise<void> {
    const email: EmailNotification = {
      to: studentEmail,
      subject: 'Your Academic Credential Has Been Issued',
      body: this.generateCredentialEmail(studentName, credentialId, serialNumber),
      credentialId,
      serialNumber,
      qrCode: qrCodeDataUrl,
    };

    await this.sendEmail(email);
  }

  private generateCredentialEmail(
    name: string,
    credentialId: string,
    serialNumber: string,
  ): string {
    return `
Dear ${name},

Your academic credential has been successfully issued and recorded on the blockchain.

Credential Details:
- Credential ID: ${credentialId}
- Serial Number: ${serialNumber}
- Verification URL: ${import.meta.env.VITE_APP_URL || 'https://morningstar-credentials.io'}/verify/${credentialId}

You can share your credential with employers by:
1. Providing the Serial Number: ${serialNumber}
2. Sharing the QR code attached to this email
3. Directing them to the verification URL above

Your credential is tamper-proof and permanently stored on the blockchain.

Best regards,
Morningstar Credentials Team
    `.trim();
  }

  async sendVerificationRequestEmail(
    employerEmail: string,
    employerName: string,
    studentName: string,
    credentialId: string,
  ): Promise<void> {
    const email: EmailNotification = {
      to: employerEmail,
      subject: 'Credential Verification Request',
      body: `
Dear ${employerName},

A credential verification request has been initiated for ${studentName}.

Credential ID: ${credentialId}
Verification URL: ${import.meta.env.VITE_APP_URL || 'https://morningstar-credentials.io'}/verify/${credentialId}

You can verify the authenticity of this credential using the verification portal.

Best regards,
Morningstar Credentials Team
      `.trim(),
    };

    await this.sendEmail(email);
  }

  private async sendEmail(email: EmailNotification): Promise<void> {
    let response: Response;
    try {
      response = await fetch(api.url('/api/email/notify'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(email),
      });
    } catch (error) {
      if (!this.isOfflineFallbackError(error)) {
        throw error;
      }

      // Fallback for demo/dev only when backend is unreachable.
      console.warn('📧 (Fallback) Email sent locally:', {
        to: email.to,
        subject: email.subject,
        credentialId: email.credentialId,
      });
      this.emailQueue.push(email);
      return;
    }

    if (!response.ok) {
      let details = `status=${response.status}`;
      try {
        const payload = await response.json();
        const code = payload?.details?.code;
        const message = payload?.error;
        if (code || message) {
          details = [code, message].filter(Boolean).join(': ');
        }
      } catch {
        // Keep status-only details when response body is not JSON.
      }
      throw new Error(`Email API rejected request (${details})`);
    }

    console.log('📧 Email sent via backend:', email.to);
    this.emailQueue.push(email);
  }

  getEmailQueue(): EmailNotification[] {
    return [...this.emailQueue];
  }

  clearQueue(): void {
    this.emailQueue = [];
  }
}

export const emailService = new EmailService();
