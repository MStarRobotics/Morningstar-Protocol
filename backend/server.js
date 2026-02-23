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
import { basename, join, dirname } from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
// DID Registry (File-based Persistence)
// ---------------------------------------------------------------------------

const DATA_DIR = join(__dirname, 'data');
const DID_FILE = join(DATA_DIR, 'dids.json');

// Ensure data directory exists
(async () => {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        try {
            await fs.access(DID_FILE);
        } catch {
            await fs.writeFile(DID_FILE, JSON.stringify([], null, 2));
        }
    } catch (err) {
        console.error('[server] Failed to initialize data directory:', err);
    }
})();

async function readDIDs() {
    try {
        const data = await fs.readFile(DID_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

async function writeDIDs(dids) {
    await fs.writeFile(DID_FILE, JSON.stringify(dids, null, 2));
}

// GET /api/did - List all DIDs (for admin/search)
app.get('/api/did', async (req, res) => {
    try {
        const dids = await readDIDs();
        // Return simplified list or full objects? 
        // usage in didService: getAllDIDs returns { did, created, role }
        // The storage format is { id, document, metadata, ... }
        const result = dids.map(d => ({
            did: d.id,
            created: d.created,
            role: d.metadata?.role || 'unknown'
        }));
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to list DIDs' });
    }
});

// GET /api/did/:did - Retrieve DID Document
app.get('/api/did/:did', async (req, res) => {
    const { did } = req.params;
    const dids = await readDIDs();
    const doc = dids.find(d => d.id === did || d.did === did); // Support both formats
    
    if (doc) {
        // If stored as full object with metadata wrapper, return just the doc part or normalized
        // Based on didService, we might be storing the document and metadata separately.
        // For simplicity in this file-based backend, let's assume we store an array of { document, metadata }.
        res.json(doc);
    } else {
        res.status(404).json({ error: 'DID not found' });
    }
});

// POST /api/did - Register new DID
app.post('/api/did', credentialLimiter, async (req, res) => {
    const { didDocument, metadata } = req.body;
    if (!didDocument || !didDocument.id) {
        return res.status(400).json({ error: 'Invalid DID Document' });
    }

    const dids = await readDIDs();
    if (dids.some(d => d.id === didDocument.id)) {
        return res.status(409).json({ error: 'DID already exists' });
    }

    const newEntry = {
        id: didDocument.id,
        document: didDocument,
        metadata: metadata || {},
        created: new Date().toISOString(),
        updated: new Date().toISOString()
    };

    dids.push(newEntry);
    await writeDIDs(dids);

    console.log(`[DID] Registered ${didDocument.id}`);
    res.status(201).json({ success: true, did: didDocument.id });
});

// PUT /api/did/:did - Update DID Document
app.put('/api/did/:did', credentialLimiter, async (req, res) => {
    const { did } = req.params;
    const { didDocument, metadata } = req.body;

    const dids = await readDIDs();
    const index = dids.findIndex(d => d.id === did);
    
    if (index === -1) {
        return res.status(404).json({ error: 'DID not found' });
    }

    const entry = dids[index];
    
    // Update fields
    if (didDocument) entry.document = { ...entry.document, ...didDocument };
    if (metadata) entry.metadata = { ...entry.metadata, ...metadata };
    entry.updated = new Date().toISOString();

    dids[index] = entry;
    await writeDIDs(dids);

    console.log(`[DID] Updated ${did}`);
    res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Blockchain Persistence (File-based Simulation)
// ---------------------------------------------------------------------------

const BLOCKCHAIN_FILE = join(DATA_DIR, 'blockchain.json');
const PRIVATE_CHAIN_FILE = join(DATA_DIR, 'private_chain.json');

async function readJSON(file) {
    try {
        const data = await fs.readFile(file, 'utf-8');
        return JSON.parse(data);
    } catch {
        return null;
    }
}

async function writeJSON(file, data) {
    await fs.writeFile(file, JSON.stringify(data, null, 2));
}

// POST /api/blockchain/transaction - Submit transaction to public chain
app.post('/api/blockchain/transaction', credentialLimiter, async (req, res) => {
    const { transaction } = req.body;
    if (!transaction || !transaction.id) return res.status(400).json({ error: 'Invalid transaction' });

    let chainData = await readJSON(BLOCKCHAIN_FILE) || { chain: [], pending: [] };
    chainData.pending.push(transaction);
    await writeJSON(BLOCKCHAIN_FILE, chainData);
    
    res.json({ success: true, txId: transaction.id });
});

// POST /api/blockchain/block - Mine block (Simulation)
app.post('/api/blockchain/block', credentialLimiter, async (req, res) => {
    const { validator } = req.body;
    let chainData = await readJSON(BLOCKCHAIN_FILE) || { chain: [], pending: [] };
    
    if (chainData.pending.length === 0) return res.json({ success: false, message: 'No pending transactions' });
    
    const newBlock = {
        index: chainData.chain.length,
        timestamp: new Date().toISOString(),
        transactions: chainData.pending,
        validator,
        previousHash: chainData.chain.length > 0 ? chainData.chain[chainData.chain.length - 1].hash : '0'
    };
    
    // Simple hash simulation
    const { createHash } = await import('crypto');
    newBlock.hash = createHash('sha256').update(JSON.stringify(newBlock)).digest('hex');
    
    chainData.chain.push(newBlock);
    chainData.pending = []; // Clear pending
    
    await writeJSON(BLOCKCHAIN_FILE, chainData);
    res.json({ success: true, block: newBlock });
});

// POST /api/blockchain/private/store - Store sensitive data
app.post('/api/blockchain/private/store', credentialLimiter, async (req, res) => {
    const { credentialId, encryptedData } = req.body;
    let privateData = await readJSON(PRIVATE_CHAIN_FILE) || {};
    
    privateData[credentialId] = encryptedData;
    await writeJSON(PRIVATE_CHAIN_FILE, privateData);
    
    res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Email Notification
// ---------------------------------------------------------------------------

// POST /api/email/notify - Send notification
app.post('/api/email/notify', mfaLimiter, async (req, res) => {
    const { to, subject, body } = req.body;
    
    // Logic similar to send-otp but generic
    const transport = getMailTransport();
    if (transport) {
        try {
            await transport.sendMail({
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to,
                subject,
                text: body,
            });
            return res.json({ success: true });
        } catch (err) {
            console.error('[email] Failed to send:', err);
            return res.status(500).json({ error: 'Email failed' });
        }
    }
    
    // Log for dev/demo if no SMTP
    console.log(`[EMAIL-MOCK] To: ${to} | Subject: ${subject} | Body: ${body.substring(0, 50)}...`);
    res.json({ success: true, mock: true });
});

// DELETE /api/did/:did - Revoke/Delete DID
app.delete('/api/did/:did', credentialLimiter, async (req, res) => {
    const { did } = req.params;
    const dids = await readDIDs();
    const index = dids.findIndex(d => d.id === did);

    if (index === -1) {
        return res.status(404).json({ error: 'DID not found' });
    }

    // Instead of hard delete, we often mark as deactivated in DID world, 
    // but for this API let's support "Revoke" meaning "Deactivate" 
    // or just "Delete" if valid cleanup is needed.
    // The previous localStorage implementation had `revokeDID` which set deactivated: true.
    
    const entry = dids[index];
    entry.document = { ...entry.document, deactivated: true };
    entry.metadata = { ...entry.metadata, status: 'revoked' };
    entry.updated = new Date().toISOString();

    dids[index] = entry;
    await writeDIDs(dids);

    console.log(`[DID] Revoked ${did}`);
    res.json({ success: true });
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
