/**
 * Backend API Proxy Server
 *
 * Keeps API keys server-side so they are never bundled into the client.
 * The frontend calls these proxy endpoints instead of external APIs directly.
 *
 * Endpoints:
 *   POST /api/gemini/schema    – Generate credential schema via Gemini
 *   POST /api/gemini/trust     – Trust analysis via Gemini
 *   POST /api/ipfs/upload      – Upload JSON to IPFS via Pinata
 *   POST /api/ipfs/pin         – Pin a CID on Pinata
 *   POST /api/mfa/send-otp     – Dispatch OTP via SMS (Twilio) or email (SMTP)
 *   GET  /api/health           – Health check
 *
 * Environment (set in backend/.env — never committed):
 *   GEMINI_API_KEY, PINATA_API_KEY, PINATA_SECRET_KEY,
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER,
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM,
 *   ALLOWED_ORIGIN, PORT
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createTransport } from 'nodemailer';
import { basename } from 'path';

const app = express();
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

// Global rate limiter: 100 req/min per IP
const globalLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW) || 60_000,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(globalLimiter);

// Stricter limiter for credential-related operations
const credentialLimiter = rateLimit({
  windowMs: 3600_000, // 1 hour
  max: Number(process.env.RATE_LIMIT_MAX_CREDENTIAL_ISSUANCE) || 10,
  message: { error: 'Credential operation rate limit exceeded.' },
});

// MFA limiter: 5 attempts per 15 minutes
const mfaLimiter = rateLimit({
  windowMs: 900_000,
  max: 5,
  message: { error: 'Too many MFA attempts.' },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lazily create a nodemailer transport. Returns null if SMTP is not configured. */
function getMailTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) return null;

  return createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user, pass },
  });
}

/** Send SMS via Twilio. Returns true on success, false if not configured. */
async function sendSms(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) return false;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });

  return response.ok;
}

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ---------------------------------------------------------------------------
// Gemini Proxy
// ---------------------------------------------------------------------------

app.post('/api/gemini/schema', credentialLimiter, async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Gemini API not configured' });
  }

  const { description } = req.body;
  if (!description || typeof description !== 'string' || description.length > 2000) {
    return res.status(400).json({ error: 'Invalid description' });
  }

  try {
    const { GoogleGenAI, Type } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `Generate a JSON structure for an academic credential schema based on this description: "${description}".
      The output should be a list of fields appropriate for a Verifiable Credential.
      Each field should have a 'name', 'type' (string, number, date), and 'required' (boolean).
      Return ONLY valid JSON.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            schemaName: { type: Type.STRING },
            fields: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ['string', 'number', 'date', 'boolean'] },
                  required: { type: Type.BOOLEAN },
                },
                required: ['name', 'type', 'required'],
              },
            },
          },
          required: ['schemaName', 'fields'],
        },
      },
    });

    const parsed = response.text ? JSON.parse(response.text) : null;
    res.json(parsed);
  } catch (error) {
    console.error('[proxy] Gemini schema error:', error.message || error);
    res.status(502).json({ error: 'Gemini API request failed' });
  }
});

app.post('/api/gemini/trust', credentialLimiter, async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Gemini API not configured' });
  }

  const { credentialData } = req.body;
  if (!credentialData) {
    return res.status(400).json({ error: 'Missing credentialData' });
  }

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `Analyze this credential data for a "Trust Report".
      Data: ${JSON.stringify(credentialData)}
      Provide a short, professional summary (max 2 sentences) confirming its validity and mentioning the issuer's reputation context (simulated).`,
    });

    res.json({ summary: response.text });
  } catch (error) {
    console.error('[proxy] Gemini trust error:', error.message || error);
    res.status(502).json({ error: 'Gemini API request failed' });
  }
});

// ---------------------------------------------------------------------------
// IPFS / Pinata Proxy
// ---------------------------------------------------------------------------

app.post('/api/ipfs/upload', credentialLimiter, async (req, res) => {
  const apiKey = process.env.PINATA_API_KEY;
  const secretKey = process.env.PINATA_SECRET_KEY;
  if (!apiKey || !secretKey) {
    return res.status(503).json({ error: 'Pinata not configured' });
  }

  const { data, metadata } = req.body;
  if (!data || !metadata) {
    return res.status(400).json({ error: 'Missing data or metadata' });
  }

  try {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });

    const formData = new FormData();
    const safeFileName = basename(metadata.originalFileName || 'data.json');
    formData.append('file', blob, safeFileName);
    formData.append('pinataMetadata', JSON.stringify({ name: safeFileName }));
    formData.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        pinata_api_key: apiKey,
        pinata_secret_api_key: secretKey,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Pinata returned ${response.status}`);
    }

    const payload = await response.json();
    res.json({
      cid: payload.IpfsHash || payload.cid,
      size: payload.PinSize,
      pinnedNodes: ['pinata'],
    });
  } catch (error) {
    console.error('[proxy] IPFS upload error:', error.message || error);
    res.status(502).json({ error: 'IPFS upload failed' });
  }
});

app.post('/api/ipfs/pin', credentialLimiter, async (req, res) => {
  const apiKey = process.env.PINATA_API_KEY;
  const secretKey = process.env.PINATA_SECRET_KEY;
  if (!apiKey || !secretKey) {
    return res.status(503).json({ error: 'Pinata not configured' });
  }

  const { cid } = req.body;
  if (!cid || typeof cid !== 'string') {
    return res.status(400).json({ error: 'Invalid CID' });
  }

  try {
    const response = await fetch('https://api.pinata.cloud/pinning/pinByHash', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        pinata_api_key: apiKey,
        pinata_secret_api_key: secretKey,
      },
      body: JSON.stringify({ hashToPin: cid }),
    });

    res.json({ success: response.ok });
  } catch (error) {
    console.error('[proxy] IPFS pin error:', error.message || error);
    res.status(502).json({ error: 'Pin request failed' });
  }
});

// ---------------------------------------------------------------------------
// MFA OTP Delivery (SMS via Twilio, Email via SMTP)
// ---------------------------------------------------------------------------

app.post('/api/mfa/send-otp', mfaLimiter, async (req, res) => {
  const { method, contact, otp } = req.body;
  if (!method || !contact || !otp) {
    return res.status(400).json({ error: 'Missing method, contact, or otp' });
  }

  // Validate OTP format (6 digits)
  if (!/^\d{6}$/.test(otp)) {
    return res.status(400).json({ error: 'Invalid OTP format' });
  }

  // Validate contact format based on delivery method
  if (method === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  if (method === 'sms' && !/^\+?[\d\s\-()]{10,15}$/.test(contact)) {
    return res.status(400).json({ error: 'Invalid phone number format' });
  }

  const message = `Your Morningstar Credentials verification code is: ${otp}. It expires in 5 minutes.`;

  try {
    if (method === 'sms') {
      const sent = await sendSms(contact, message);
      if (!sent) {
        return res.status(503).json({ error: 'SMS service not configured' });
      }
      return res.json({ success: true, method: 'sms' });
    }

    if (method === 'email') {
      const transport = getMailTransport();
      if (!transport) {
        return res.status(503).json({ error: 'Email service not configured' });
      }

      await transport.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: contact,
        subject: 'Morningstar Credentials — Verification Code',
        text: message,
        html: `<p>${message}</p>`,
      });

      return res.json({ success: true, method: 'email' });
    }

    return res.status(400).json({ error: `Unsupported method: ${method}` });
  } catch (error) {
    console.error('[proxy] OTP delivery error:', error.message || error);
    res.status(502).json({ error: 'OTP delivery failed' });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`[morningstar-api] Proxy server running on port ${PORT}`);
  console.log(`[morningstar-api] Allowed origin: ${ALLOWED_ORIGIN}`);

  // Verify required env vars
  const required = ['GEMINI_API_KEY', 'PINATA_API_KEY', 'PINATA_SECRET_KEY'];
  const optional = [
    'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER',
    'SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD',
    'DATABASE_URL', 'REDIS_URL',
    'JWT_SECRET', 'SESSION_SECRET', 'SENTRY_DSN',
  ];

  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.warn(`[morningstar-api] Missing REQUIRED env vars: ${missing.join(', ')}`);
  }

  const missingOptional = optional.filter(k => !process.env[k]);
  if (missingOptional.length > 0) {
    console.info(`[morningstar-api] Unconfigured optional services: ${missingOptional.join(', ')}`);
  }
});

export default app;
