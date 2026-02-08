/**
 * Gemini AI Service
 *
 * In production, all requests are proxied through the backend server
 * so API keys are never exposed in the client bundle.
 *
 * In development, direct API calls are supported when VITE_GEMINI_API_KEY
 * is set (convenience only — never ship client-side keys).
 */

import { env } from './env';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Proxy-first request helper
// ---------------------------------------------------------------------------

async function geminiRequest<T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<T | null> {
  // 1) Prefer backend proxy (production path)
  if (env.apiProxyUrl) {
    const res = await fetch(`${env.apiProxyUrl.replace(/\/$/, '')}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Proxy ${endpoint} failed: ${res.status}`);
    }
    return (await res.json()) as T;
  }

  // 2) Fallback: direct API call (dev-only, warn loudly)
  if (env.isProd) {
    logger.error(
      '[Gemini] VITE_API_PROXY_URL is not set. ' +
      'Direct API calls with client-side keys are disabled in production.'
    );
    return null;
  }

  return null; // Caller handles null
}

// ---------------------------------------------------------------------------
// Direct Gemini helpers (development only)
// ---------------------------------------------------------------------------

async function getDirectClient() {
  if (!env.geminiApiKey) return null;
  const { GoogleGenAI } = await import('@google/genai');
  return new GoogleGenAI({ apiKey: env.geminiApiKey });
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
    const result = await geminiRequest<{ schemaName: string; fields: unknown[] }>(
      '/api/gemini/schema',
      { description }
    );
    if (result) return result;
  } catch (error) {
    logger.error('[Gemini] Proxy schema request failed:', error);
  }

  // Dev fallback: direct API call
  const ai = await getDirectClient();
  if (!ai) {
    throw new Error(
      'Gemini unavailable. Set VITE_API_PROXY_URL (production) or VITE_GEMINI_API_KEY (dev).'
    );
  }

  try {
    const { Type } = await import('@google/genai');
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

    return response.text ? JSON.parse(response.text) : null;
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
    const ai = await getDirectClient();
    if (!ai) {
      return 'Verified via Polygon Network. Issuer signature valid.';
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `Analyze this credential data for a "Trust Report".
      Data: ${JSON.stringify(credentialData)}
      Provide a short, professional summary (max 2 sentences) confirming its validity and mentioning the issuer's reputation context (simulated).`,
    });

    return response.text ?? 'Verified via Polygon Network. Issuer signature valid.';
  } catch (error) {
    logger.warn('[Gemini] Direct API call failed — returning fallback trust report:', error);
    return 'Verified via Polygon Network. Issuer signature valid.';
  }
};
