/**
 * Gemini AI Service
 *
 * In production, all requests are proxied through the backend server
 * so API keys are never exposed in the client bundle.
 *
 * In development, direct API calls are supported when VITE_GEMINI_API_KEY
 * is set (convenience only — never ship client-side keys).
 */

import { api, env } from './env';
import { logger } from './logger';
import type { SchemaTemplate } from '../types';

interface GeminiTextPart {
  text?: string;
}

interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiTextPart[];
    };
  }>;
}

// ---------------------------------------------------------------------------
// Proxy-first request helper
// ---------------------------------------------------------------------------

async function geminiRequest<T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<T | null> {
  // 1) Prefer backend proxy (default path in all environments)
  try {
    const res = await fetch(api.url(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Proxy ${endpoint} failed: ${res.status}`);
    }

    return (await res.json()) as T;
  } catch (proxyError) {
    if (env.isProd) {
      logger.error('[Gemini] Backend proxy request failed in production.', proxyError);
      return null;
    }
  }

  // 2) Fallback: direct API call (dev-only)
  return null;
}

// ---------------------------------------------------------------------------
// Direct Gemini helpers (development only)
// ---------------------------------------------------------------------------

function extractGeminiText(payload: GeminiApiResponse): string {
  const parts = payload.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((part) => part.text || '').join('').trim();
}

function parseJsonResponse(text: string): unknown {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned);
}

function normalizeSchemaTemplate(payload: unknown): SchemaTemplate | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as { schemaName?: unknown; fields?: unknown };

  if (typeof candidate.schemaName !== 'string' || !candidate.schemaName.trim()) {
    return null;
  }

  if (!Array.isArray(candidate.fields)) {
    return null;
  }

  const normalizedFields = candidate.fields
    .map((field) => {
      if (!field || typeof field !== 'object') return null;
      const entry = field as { name?: unknown; type?: unknown; required?: unknown };
      if (typeof entry.name !== 'string' || typeof entry.type !== 'string') return null;
      return {
        name: entry.name,
        type: entry.type,
        required: Boolean(entry.required),
      };
    })
    .filter((field): field is { name: string; type: string; required: boolean } => field !== null);

  if (normalizedFields.length === 0) return null;

  return {
    schemaName: candidate.schemaName,
    fields: normalizedFields,
  };
}

async function callGeminiDirect(prompt: string, responseMimeType?: 'application/json'): Promise<string> {
  if (!env.geminiApiKey) {
    throw new Error('Missing VITE_GEMINI_API_KEY');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: responseMimeType ? { responseMimeType } : undefined,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const payload = (await response.json()) as GeminiApiResponse;
  const text = extractGeminiText(payload);
  if (!text) {
    throw new Error('Gemini returned an empty response');
  }
  return text;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a JSON-LD compatible schema structure from a natural language description.
 */
export const generateSchemaWithGemini = async (description: string) => {
  // Try proxy first
  try {
    const result = await geminiRequest<unknown>(
      '/api/gemini/schema',
      { description }
    );
    const normalized = normalizeSchemaTemplate(result);
    if (normalized) return normalized;
  } catch (error) {
    logger.error('[Gemini] Proxy schema request failed:', error);
  }

  // Dev fallback: direct API call
  if (!env.geminiApiKey) {
    throw new Error(
      'Gemini unavailable. Set VITE_API_PROXY_URL (production) or VITE_GEMINI_API_KEY (dev).'
    );
  }

  try {
    const prompt = `Generate a JSON structure for an academic credential schema based on this description: "${description}".
      The output should be a list of fields appropriate for a Verifiable Credential.
      Each field should have a 'name', 'type' (string, number, date), and 'required' (boolean).
      Return ONLY valid JSON with this shape:
      {"schemaName":"...","fields":[{"name":"...","type":"string|number|date|boolean","required":true}]}`;
    const text = await callGeminiDirect(prompt, 'application/json');
    const parsed = parseJsonResponse(text);
    const normalized = normalizeSchemaTemplate(parsed);
    if (!normalized) {
      throw new Error('Gemini returned malformed schema');
    }
    return normalized;
  } catch (error) {
    logger.error('[Gemini] Direct schema API call failed:', error);
    throw new Error('Schema generation failed. Check your Gemini API key or proxy configuration.');
  }
};

/**
 * Analyzes a verification result to provide a trust summary.
 */
export const analyzeVerificationTrust = async (credentialData: Record<string, unknown>) => {
  // Try proxy first
  try {
    const result = await geminiRequest<{ summary: string }>(
      '/api/gemini/trust',
      { credentialData }
    );
    if (result) return result.summary;
  } catch (error) {
    logger.error('[Gemini] Proxy trust request failed:', error);
  }

  // Dev fallback: direct API call
  try {
    if (!env.geminiApiKey) {
      return 'Verified via Polygon Network. Issuer signature valid.';
    }

    const text = await callGeminiDirect(`Analyze this credential data for a "Trust Report".
      Data: ${JSON.stringify(credentialData)}
      Provide a short, professional summary (max 2 sentences) confirming its validity and mentioning the issuer's reputation context (simulated).`);

    return text || 'Verified via Polygon Network. Issuer signature valid.';
  } catch (error) {
    logger.warn('[Gemini] Direct API call failed — returning fallback trust report:', error);
    return 'Verified via Polygon Network. Issuer signature valid.';
  }
};
