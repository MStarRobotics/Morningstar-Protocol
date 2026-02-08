/**
 * Input Validation & Sanitization Service
 * Production-grade defense layer for all user-facing inputs.
 *
 * Provides:
 *  - HTML / XSS sanitization
 *  - DID format sanitization & validation (W3C DID Core v1.0)
 *  - JSON safe-parsing
 *  - Entity-name, registration-id, email, credential-payload validation
 *  - File-upload constraint checking
 *  - Sliding-window rate limiter (pure in-memory, zero dependencies)
 *
 * References:
 *  - W3C DID Core 1.0: https://www.w3.org/TR/did-core/
 *  - RFC 5322 §3.4.1  (Internet Message Format – addr-spec)
 *  - W3C Verifiable Credentials Data Model 1.1
 */

// ---------------------------------------------------------------------------
// Shared result types
// ---------------------------------------------------------------------------

/** Standard validation result. */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/** Result of JSON sanitization / parse. */
export interface JSONSanitizeResult {
  valid: boolean;
  data?: unknown;
  error?: string;
}

/** Options that control file-upload validation. */
export interface FileUploadOptions {
  /** Maximum allowed file size in megabytes.  Defaults to 10 MB. */
  maxSizeMB?: number;
  /** MIME types that are accepted.  Defaults to a sensible allowlist. */
  allowedTypes?: string[];
}

/** Rate-limiter handle returned by `createRateLimiter`. */
export interface RateLimiter {
  /**
   * Returns `true` when the request is allowed under the current window,
   * `false` when the caller should be throttled.
   */
  check: () => boolean;
  /** Manually reset all tracked timestamps (e.g. after auth refresh). */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/**
 * W3C DID syntax (DID Core §3.1).
 * did = "did:" method-name ":" method-specific-id
 * method-name  = 1*method-char   ; method-char = %x61-7A / DIGIT
 * method-specific-id allows alphanum, ".", "-", "_", ":", percent-encoded
 */
const DID_REGEX =
  /^did:[a-z0-9]+:[a-zA-Z0-9._:%-]+$/;

/**
 * Conservative email regex that covers the practical subset of RFC 5322.
 * Intentionally avoids excessively permissive patterns that would let
 * clearly-bogus addresses through, while accepting all real-world addresses
 * (including "+" tags, multi-level subdomains, and new TLDs).
 */
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

/** Characters allowed in entity names (letters, digits, spaces, hyphens, apostrophes, periods). */
const ENTITY_NAME_REGEX = /^[a-zA-Z0-9 .'\-]+$/;

/** Alphanumeric + dashes for registration identifiers. */
const REGISTRATION_ID_REGEX = /^[a-zA-Z0-9-]+$/;

/** Default MIME allowlist for file uploads. */
const DEFAULT_ALLOWED_TYPES: readonly string[] = [
  'application/json',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/csv',
] as const;

/**
 * Dangerous HTML / script patterns we explicitly strip.
 * Ordering matters: broader tags first, then event handlers, then URIs.
 */
const HTML_STRIP_PATTERNS: readonly RegExp[] = [
  // Full <script> blocks (including multiline)
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  // All other HTML / XML tags
  /<\/?[a-z][a-z0-9]*\b[^>]*>/gi,
  // Residual event-handler attributes (in case tags were malformed)
  /on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi,
  // javascript: / data: URI schemes that can execute code
  /(?:javascript|data)\s*:/gi,
] as const;

/** Maximum safe depth for nested JSON to prevent stack-overflow DoS. */
const MAX_JSON_DEPTH = 32;

/** Maximum JSON string length accepted by `sanitizeJSON`. */
const MAX_JSON_LENGTH = 5 * 1024 * 1024; // 5 MB

// ---------------------------------------------------------------------------
// 1. Sanitization functions
// ---------------------------------------------------------------------------

/**
 * Strip HTML / script content from arbitrary string input.
 *
 * Designed as a **server-side** complement to contextual output encoding.
 * It progressively removes dangerous patterns until the string is stable
 * (handles double-encoding & nested injection attempts).
 *
 * @param input  Raw user-supplied string.
 * @returns      The sanitized string with all HTML stripped.
 */
export function sanitizeHTML(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  let result = input;

  // Decode common HTML entities that attackers use to bypass naive filters.
  result = decodeHTMLEntities(result);

  // Iteratively strip patterns (handles nested / double-encoded payloads).
  let previous = '';
  let iterations = 0;
  const maxIterations = 10; // Hard ceiling to prevent pathological inputs.

  while (result !== previous && iterations < maxIterations) {
    previous = result;
    for (const pattern of HTML_STRIP_PATTERNS) {
      result = result.replace(pattern, '');
    }
    iterations++;
  }

  // Collapse null bytes and trim whitespace.
  result = result.replace(/\0/g, '').trim();

  return result;
}

/**
 * Validate and normalise a Decentralized Identifier string.
 *
 * Returns the trimmed, lowercased method portion while keeping the
 * method-specific-id in its original case (DID Core §3.1 specifies that
 * the method name is case-insensitive but implementations SHOULD lowercase).
 *
 * @param input  Raw DID string.
 * @returns      The sanitized DID, or an empty string if the input is invalid.
 */
export function sanitizeDID(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  const trimmed = input.trim();

  if (!DID_REGEX.test(trimmed)) {
    return '';
  }

  // Normalise: lowercase the scheme ("did") and method name.
  const firstColon = trimmed.indexOf(':');
  const secondColon = trimmed.indexOf(':', firstColon + 1);

  const scheme = trimmed.slice(0, firstColon).toLowerCase();          // "did"
  const method = trimmed.slice(firstColon + 1, secondColon).toLowerCase();
  const specificId = trimmed.slice(secondColon + 1);                  // keep original case

  return `${scheme}:${method}:${specificId}`;
}

/**
 * Safely parse a JSON string, guarding against:
 *  - Prototype-pollution keys (`__proto__`, `constructor`, `prototype`)
 *  - Excessive nesting (stack-overflow DoS)
 *  - Oversized payloads
 *
 * @param input  Raw JSON string.
 * @returns      Parsed data or a descriptive error.
 */
export function sanitizeJSON(input: string): JSONSanitizeResult {
  if (typeof input !== 'string') {
    return { valid: false, error: 'Input must be a string' };
  }

  if (input.length === 0) {
    return { valid: false, error: 'Input is empty' };
  }

  if (input.length > MAX_JSON_LENGTH) {
    return {
      valid: false,
      error: `Input exceeds maximum allowed length of ${MAX_JSON_LENGTH} bytes`,
    };
  }

  // Quick check for prototype-pollution keys before parsing.
  if (/__proto__|constructor\s*:|prototype\s*:/i.test(input)) {
    return {
      valid: false,
      error: 'Input contains disallowed keys (__proto__, constructor, prototype)',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown parse error';
    return { valid: false, error: `Invalid JSON: ${message}` };
  }

  // Depth & prototype-pollution walk.
  const depthError = assertSafeObject(parsed, 0);
  if (depthError) {
    return { valid: false, error: depthError };
  }

  return { valid: true, data: parsed };
}

// ---------------------------------------------------------------------------
// 2. Validation functions
// ---------------------------------------------------------------------------

/**
 * Validate an entity name (institution, person, organisation).
 *
 * Rules:
 *  - Must be a non-empty string after trimming.
 *  - Between 2 and 100 characters (inclusive).
 *  - May contain letters (any case), digits, spaces, hyphens, apostrophes, and periods.
 *  - Must not consist entirely of spaces or punctuation.
 */
export function validateEntityName(name: string): ValidationResult {
  if (typeof name !== 'string') {
    return { valid: false, error: 'Entity name must be a string' };
  }

  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Entity name is required' };
  }

  if (trimmed.length < 2) {
    return { valid: false, error: 'Entity name must be at least 2 characters' };
  }

  if (trimmed.length > 100) {
    return { valid: false, error: 'Entity name must not exceed 100 characters' };
  }

  if (!ENTITY_NAME_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: 'Entity name may only contain letters, digits, spaces, hyphens, apostrophes, and periods',
    };
  }

  // Must contain at least one alphanumeric character.
  if (!/[a-zA-Z0-9]/.test(trimmed)) {
    return {
      valid: false,
      error: 'Entity name must contain at least one alphanumeric character',
    };
  }

  return { valid: true };
}

/**
 * Validate a registration / record identifier.
 *
 * Rules:
 *  - Non-empty string after trimming.
 *  - 1–128 characters.
 *  - Alphanumeric and hyphens only.
 *  - Must not start or end with a hyphen.
 */
export function validateRegistrationId(id: string): ValidationResult {
  if (typeof id !== 'string') {
    return { valid: false, error: 'Registration ID must be a string' };
  }

  const trimmed = id.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Registration ID is required' };
  }

  if (trimmed.length > 128) {
    return { valid: false, error: 'Registration ID must not exceed 128 characters' };
  }

  if (!REGISTRATION_ID_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: 'Registration ID may only contain letters, digits, and hyphens',
    };
  }

  if (trimmed.startsWith('-') || trimmed.endsWith('-')) {
    return {
      valid: false,
      error: 'Registration ID must not start or end with a hyphen',
    };
  }

  return { valid: true };
}

/**
 * Validate an email address (basic RFC 5322 compliance).
 *
 * NOTE: Full RFC 5322 validation is intentionally *not* attempted; instead
 * we cover the practical subset used by real mail providers, including "+"
 * sub-addressing tags and internationalised TLDs of 2+ characters.
 */
export function validateEmail(email: string): ValidationResult {
  if (typeof email !== 'string') {
    return { valid: false, error: 'Email must be a string' };
  }

  const trimmed = email.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Email address is required' };
  }

  if (trimmed.length > 254) {
    return { valid: false, error: 'Email address must not exceed 254 characters' };
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, error: 'Email address is not valid' };
  }

  // Local part must not exceed 64 characters (RFC 5321 §4.5.3.1.1).
  const atIndex = trimmed.indexOf('@');
  if (atIndex > 64) {
    return { valid: false, error: 'Email local part must not exceed 64 characters' };
  }

  return { valid: true };
}

/**
 * Validate a W3C Decentralized Identifier (DID).
 *
 * Checks:
 *  - Conforms to `did:method-name:method-specific-id` syntax.
 *  - Method name is lowercase alphanumeric.
 *  - Method-specific-id is at least 1 character.
 *  - Total length does not exceed 2048 characters.
 */
export function validateDID(did: string): ValidationResult {
  if (typeof did !== 'string') {
    return { valid: false, error: 'DID must be a string' };
  }

  const trimmed = did.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'DID is required' };
  }

  if (trimmed.length > 2048) {
    return { valid: false, error: 'DID must not exceed 2048 characters' };
  }

  if (!trimmed.startsWith('did:')) {
    return { valid: false, error: 'DID must start with "did:"' };
  }

  const parts = trimmed.split(':');

  if (parts.length < 3) {
    return {
      valid: false,
      error: 'DID must follow the format did:<method>:<method-specific-id>',
    };
  }

  const method = parts[1];
  if (!/^[a-z0-9]+$/.test(method)) {
    return {
      valid: false,
      error: 'DID method name must be lowercase alphanumeric',
    };
  }

  // method-specific-id is everything after the second colon.
  const specificId = parts.slice(2).join(':');
  if (specificId.length === 0) {
    return {
      valid: false,
      error: 'DID method-specific identifier is required',
    };
  }

  if (!DID_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: 'DID contains invalid characters',
    };
  }

  return { valid: true };
}

/**
 * Validate a W3C Verifiable Credential payload.
 *
 * Required fields (VC Data Model 1.1 §4):
 *  - `@context`     : array that includes the VC context URI
 *  - `type`         : array that includes "VerifiableCredential"
 *  - `issuer`       : non-empty string (DID) or object with `id`
 *  - `issuanceDate` : ISO 8601 date string
 *  - `credentialSubject` : non-null object
 *
 * This function performs **structural** validation only; it does not verify
 * signatures, revocation status, or schema conformance.
 */
export function validateCredentialPayload(payload: unknown): ValidationResult {
  if (payload === null || payload === undefined) {
    return { valid: false, error: 'Credential payload is required' };
  }

  if (typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, error: 'Credential payload must be a JSON object' };
  }

  const obj = payload as Record<string, unknown>;

  // --- @context ---
  const context = obj['@context'];
  if (!Array.isArray(context)) {
    return {
      valid: false,
      error: '"@context" must be an array',
    };
  }
  const VC_CONTEXT_V1 = 'https://www.w3.org/2018/credentials/v1';
  const VC_CONTEXT_V2 = 'https://www.w3.org/ns/credentials/v2';
  if (!context.includes(VC_CONTEXT_V1) && !context.includes(VC_CONTEXT_V2)) {
    return {
      valid: false,
      error: `"@context" must include "${VC_CONTEXT_V1}" or "${VC_CONTEXT_V2}"`,
    };
  }

  // --- type ---
  const type = obj['type'];
  if (!Array.isArray(type)) {
    return { valid: false, error: '"type" must be an array' };
  }
  if (!type.includes('VerifiableCredential')) {
    return {
      valid: false,
      error: '"type" must include "VerifiableCredential"',
    };
  }

  // --- issuer ---
  const issuer = obj['issuer'];
  if (issuer === undefined || issuer === null) {
    return { valid: false, error: '"issuer" is required' };
  }
  if (typeof issuer === 'string') {
    if (issuer.trim().length === 0) {
      return { valid: false, error: '"issuer" must not be empty' };
    }
  } else if (typeof issuer === 'object' && !Array.isArray(issuer)) {
    const issuerObj = issuer as Record<string, unknown>;
    if (typeof issuerObj['id'] !== 'string' || issuerObj['id'].trim().length === 0) {
      return { valid: false, error: '"issuer.id" must be a non-empty string' };
    }
  } else {
    return { valid: false, error: '"issuer" must be a string (DID) or an object with an "id" field' };
  }

  // --- issuanceDate ---
  const issuanceDate = obj['issuanceDate'];
  if (typeof issuanceDate !== 'string') {
    return { valid: false, error: '"issuanceDate" must be an ISO 8601 date string' };
  }
  if (Number.isNaN(Date.parse(issuanceDate))) {
    return { valid: false, error: '"issuanceDate" is not a valid date' };
  }

  // --- credentialSubject ---
  const subject = obj['credentialSubject'];
  if (subject === null || subject === undefined) {
    return { valid: false, error: '"credentialSubject" is required' };
  }
  if (typeof subject !== 'object' || Array.isArray(subject)) {
    return { valid: false, error: '"credentialSubject" must be a JSON object' };
  }

  return { valid: true };
}

/**
 * Validate a file upload against size and MIME-type constraints.
 *
 * Accepts a `File`-like object (must expose `name`, `size`, and `type`).
 * Works in both browser (`File`) and server (`Blob` / custom object) contexts.
 *
 * @param file  The file to validate.
 * @param opts  Optional constraints (see `FileUploadOptions`).
 */
export function validateFileUpload(
  file: File,
  opts: FileUploadOptions = {},
): ValidationResult {
  if (!file) {
    return { valid: false, error: 'File is required' };
  }

  const maxSizeMB = opts.maxSizeMB ?? 10;
  const allowedTypes = opts.allowedTypes ?? [...DEFAULT_ALLOWED_TYPES];

  // --- Name ---
  if (!file.name || file.name.trim().length === 0) {
    return { valid: false, error: 'File name is required' };
  }

  // Reject path-traversal attempts.
  if (/[/\\]|\.\./.test(file.name)) {
    return { valid: false, error: 'File name contains invalid characters' };
  }

  // Reject hidden files and those with no extension.
  if (file.name.startsWith('.')) {
    return { valid: false, error: 'Hidden files are not allowed' };
  }

  // --- Size ---
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size <= 0) {
    return { valid: false, error: 'File is empty' };
  }
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the ${maxSizeMB} MB limit`,
    };
  }

  // --- MIME type ---
  if (!file.type || file.type.trim().length === 0) {
    return { valid: false, error: 'File MIME type could not be determined' };
  }

  const normalizedType = file.type.toLowerCase().trim();
  const allowed = allowedTypes.map((t) => t.toLowerCase().trim());

  if (!allowed.includes(normalizedType)) {
    return {
      valid: false,
      error: `File type "${normalizedType}" is not allowed. Accepted types: ${allowed.join(', ')}`,
    };
  }

  // Reject double extensions that can trick naive MIME sniffers.
  const nameParts = file.name.split('.');
  if (nameParts.length > 2) {
    const dangerousExtensions = ['exe', 'bat', 'cmd', 'sh', 'ps1', 'vbs', 'js', 'msi', 'dll'];
    const allExtensions = nameParts.slice(1).map((e) => e.toLowerCase());
    if (allExtensions.some((ext) => dangerousExtensions.includes(ext))) {
      return {
        valid: false,
        error: 'File contains a potentially dangerous extension',
      };
    }
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// 3. Rate limiter
// ---------------------------------------------------------------------------

/**
 * Create a sliding-window rate limiter.
 *
 * The limiter stores timestamps of accepted requests and prunes entries that
 * have left the active window on every `check()` call.  It is intentionally
 * simple (O(n) per check on the window size) and suitable for per-user /
 * per-session throttling in a single process.
 *
 * @param maxRequests  Maximum number of allowed requests inside `windowMs`.
 * @param windowMs     Duration of the sliding window in milliseconds.
 * @returns            A `RateLimiter` handle with `check()` and `reset()`.
 *
 * @example
 * ```ts
 * const limiter = createRateLimiter(100, 60_000); // 100 req / min
 *
 * function handleRequest() {
 *   if (!limiter.check()) {
 *     throw new Error('Rate limit exceeded');
 *   }
 *   // …process request
 * }
 * ```
 */
export function createRateLimiter(
  maxRequests: number,
  windowMs: number,
): RateLimiter {
  if (!Number.isFinite(maxRequests) || maxRequests < 1) {
    throw new RangeError('maxRequests must be a positive integer');
  }
  if (!Number.isFinite(windowMs) || windowMs < 1) {
    throw new RangeError('windowMs must be a positive integer');
  }

  let timestamps: number[] = [];

  function prune(now: number): void {
    const cutoff = now - windowMs;
    // Binary-search for the first entry inside the window.
    let lo = 0;
    let hi = timestamps.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (timestamps[mid] <= cutoff) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    if (lo > 0) {
      timestamps = timestamps.slice(lo);
    }
  }

  function check(): boolean {
    const now = Date.now();
    prune(now);

    if (timestamps.length >= maxRequests) {
      return false; // throttled
    }

    timestamps.push(now);
    return true; // allowed
  }

  function reset(): void {
    timestamps = [];
  }

  return { check, reset };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Decode the most commonly abused HTML entities.
 * This runs *before* regex stripping so encoded payloads are caught.
 */
function decodeHTMLEntities(input: string): string {
  const entityMap: Record<string, string> = {
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#47;': '/',
  };

  let result = input;
  for (const [entity, char] of Object.entries(entityMap)) {
    // Case-insensitive replace (&#X27 vs &#x27).
    result = result.replace(new RegExp(entity, 'gi'), char);
  }

  // Numeric entities (decimal & hex).
  result = result.replace(/&#(\d+);/g, (_, dec) =>
    String.fromCharCode(Number(dec)),
  );
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );

  return result;
}

/**
 * Recursively walk a parsed JSON value and verify:
 *  - Maximum nesting depth is not exceeded.
 *  - No object key is a prototype-pollution vector.
 *
 * Returns `null` if the value is safe, or an error string otherwise.
 */
function assertSafeObject(value: unknown, depth: number): string | null {
  if (depth > MAX_JSON_DEPTH) {
    return `JSON nesting depth exceeds the maximum of ${MAX_JSON_DEPTH}`;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const err = assertSafeObject(value[i], depth + 1);
      if (err) return err;
    }
  } else if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    const forbidden = ['__proto__', 'constructor', 'prototype'];

    for (const key of keys) {
      if (forbidden.includes(key)) {
        return `Disallowed key "${key}" found in JSON`;
      }
      const err = assertSafeObject(
        (value as Record<string, unknown>)[key],
        depth + 1,
      );
      if (err) return err;
    }
  }

  return null;
}
