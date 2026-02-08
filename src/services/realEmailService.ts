import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface EmailConfig {
  service?: string;
  host?: string;
  port?: number;
  secure?: boolean;
  auth?: {
    user: string;
    pass: string;
  };
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    encoding: string;
  }>;
}

class RealEmailService {
  private transporter: Transporter | null = null;
  private emailQueue: EmailMessage[] = [];
  private isConfigured = false;

  configure(config: EmailConfig): void {
    this.transporter = nodemailer.createTransporter(config);
    this.isConfigured = true;
  }

  async sendCredentialIssuedEmail(
    studentEmail: string,
    studentName: string,
    credentialId: string,
    serialNumber: string,
    qrCodeDataUrl: string
  ): Promise<void> {
    const html = this.generateCredentialEmailHTML(studentName, credentialId, serialNumber, qrCodeDataUrl);
    const text = this.generateCredentialEmailText(studentName, credentialId, serialNumber);

    const message: EmailMessage = {
      to: studentEmail,
      subject: '🎓 Your Academic Credential Has Been Issued',
      html,
      text,
      attachments: [{
        filename: 'credential-qr.png',
        content: qrCodeDataUrl.split('base64,')[1],
        encoding: 'base64'
      }]
    };

    await this.sendEmail(message);
  }

  private generateCredentialEmailHTML(
    name: string,
    credentialId: string,
    serialNumber: string,
    qrCode: string
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9fafb; }
    .credential-box { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; }
    .qr-code { text-align: center; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎓 Credential Issued Successfully</h1>
    </div>
    <div class="content">
      <p>Dear ${name},</p>
      <p>Your academic credential has been successfully issued and recorded on the blockchain.</p>
      
      <div class="credential-box">
        <h3>Credential Details</h3>
        <p><strong>Credential ID:</strong> ${credentialId}</p>
        <p><strong>Serial Number:</strong> ${serialNumber}</p>
        <p><strong>Verification URL:</strong> <a href="${import.meta.env.VITE_APP_URL || 'https://morningstar-credentials.io'}/verify/${credentialId}">Verify Now</a></p>
      </div>

      <div class="qr-code">
        <h3>Your QR Code</h3>
        <img src="${qrCode}" alt="Credential QR Code" width="300" height="300" />
        <p><small>Share this QR code with employers for instant verification</small></p>
      </div>

      <p>Your credential is tamper-proof and permanently stored on the blockchain.</p>
    </div>
    <div class="footer">
      <p>© 2026 Morningstar Credentials. All rights reserved.</p>
      <p>This is an automated message. Please do not reply.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  private generateCredentialEmailText(name: string, credentialId: string, serialNumber: string): string {
    return `
Dear ${name},

Your academic credential has been successfully issued and recorded on the blockchain.

Credential Details:
- Credential ID: ${credentialId}
- Serial Number: ${serialNumber}
- Verification URL: ${import.meta.env.VITE_APP_URL || 'https://morningstar-credentials.io'}/verify/${credentialId}

Your credential is tamper-proof and permanently stored on the blockchain.

Best regards,
Morningstar Credentials Team
    `.trim();
  }

  private async sendEmail(message: EmailMessage): Promise<void> {
    if (!this.isConfigured || !this.transporter) {
      console.log('📧 Email queued (transporter not configured):', {
        to: message.to,
        subject: message.subject
      });
      this.emailQueue.push(message);
      return;
    }

    try {
      const info = await this.transporter.sendMail({
        from: import.meta.env.VITE_EMAIL_FROM || 'noreply@morningstar-credentials.io',
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: message.attachments
      });

      console.log('✅ Email sent:', info.messageId);
    } catch (error) {
      console.error('❌ Email send failed:', error);
      this.emailQueue.push(message);
      throw error;
    }
  }

  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) return false;
    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }

  getQueuedEmails(): EmailMessage[] {
    return [...this.emailQueue];
  }

  clearQueue(): void {
    this.emailQueue = [];
  }
}

export const realEmailService = new RealEmailService();
