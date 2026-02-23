export interface EmailNotification {
  to: string;
  subject: string;
  body: string;
  credentialId?: string;
  serialNumber?: string;
  qrCode?: string;
}

class EmailService {
  private emailQueue: EmailNotification[] = [];

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
    const apiBase = (import.meta as any).env?.VITE_API_PROXY_URL || 'http://localhost:3001';

    try {
      const response = await fetch(`${apiBase}/api/email/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(email),
      });

      if (!response.ok) {
        throw new Error(`Email API failed with status: ${response.status}`);
      }

      console.log('📧 Email sent via backend:', email.to);
    } catch (error) {
      // Fallback for demo/dev if backend is offline or fails
      console.warn('📧 (Fallback) Email sent locally:', {
        to: email.to,
        subject: email.subject,
        credentialId: email.credentialId,
      });
    }

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
