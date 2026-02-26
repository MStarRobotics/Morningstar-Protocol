/**
 * Verification script for Blockchain + Email backend endpoints.
 * Usage: node scripts/verify-blockchain.js
 * Optional:
 *   API_URL=http://localhost:3001
 *   EMAIL_EXPECTED_MODE=auto|mock|smtp
 *   API_AUTH_TOKEN=<bearer_token_for_protected_write_endpoints>
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';
const API_AUTH_TOKEN = String(process.env.API_AUTH_TOKEN || '').trim();
const rawExpectedMode = String(process.env.EMAIL_EXPECTED_MODE || 'auto').trim().toLowerCase();
const EMAIL_EXPECTED_MODE = ['auto', 'mock', 'smtp'].includes(rawExpectedMode)
  ? rawExpectedMode
  : 'auto';

if (rawExpectedMode !== EMAIL_EXPECTED_MODE) {
  console.warn(
    `WARN Invalid EMAIL_EXPECTED_MODE="${rawExpectedMode}". Falling back to "${EMAIL_EXPECTED_MODE}".`,
  );
}

let cachedEmailHealth = null;

async function fetchJson(path, options = {}) {
  const headers = {
    ...(options.headers || {}),
  };
  if (API_AUTH_TOKEN && !headers.Authorization) {
    headers.Authorization = `Bearer ${API_AUTH_TOKEN}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}

async function runCheck(name, check) {
  try {
    const result = await check();
    if (!result.ok) {
      console.error(`FAIL ${name}: ${result.message}`);
      return false;
    }
    if (result.message) {
      console.log(`PASS ${name}: ${result.message}`);
    } else {
      console.log(`PASS ${name}`);
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${name}: ${message}`);
    return false;
  }
}

async function checkHealth() {
  const { response, data } = await fetchJson('/api/health');
  if (!response.ok) {
    return { ok: false, message: `HTTP ${response.status}` };
  }
  if (!data || data.status !== 'ok') {
    return { ok: false, message: 'Unexpected health response payload' };
  }
  return { ok: true };
}

async function getEmailHealth() {
  if (cachedEmailHealth) {
    return cachedEmailHealth;
  }

  cachedEmailHealth = await fetchJson('/api/email/health');
  return cachedEmailHealth;
}

async function checkEmailHealth() {
  const { response, data } = await getEmailHealth();
  if (!response.ok) {
    const errorCode = data?.details?.code;
    const details = errorCode ? `${errorCode}: ${data?.error || 'email health check failed'}` : `HTTP ${response.status}`;
    return { ok: false, message: details };
  }

  const mode = data?.mode;
  if (mode !== 'mock' && mode !== 'smtp') {
    return { ok: false, message: 'Email health payload missing valid mode' };
  }

  if (EMAIL_EXPECTED_MODE !== 'auto' && mode !== EMAIL_EXPECTED_MODE) {
    return {
      ok: false,
      message: `Expected email mode=${EMAIL_EXPECTED_MODE}, but backend reported mode=${mode}`,
    };
  }

  const provider = data?.provider || 'unknown';
  const requestedMode = data?.requestedMode || 'unknown';
  return {
    ok: true,
    message: `mode=${mode} requested=${requestedMode} provider=${provider}`,
  };
}

async function checkTransactionSubmit() {
  const tx = {
    id: `tx_test_${Date.now()}`,
    type: 'ISSUE',
    data: { test: true },
  };

  const { response, data } = await fetchJson('/api/blockchain/transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: tx }),
  });

  if (!response.ok) {
    return { ok: false, message: `HTTP ${response.status}` };
  }
  if (!data?.success) {
    return { ok: false, message: 'API returned success=false' };
  }
  return { ok: true };
}

async function checkMineBlock() {
  const { response, data } = await fetchJson('/api/blockchain/block', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ validator: '0xTester' }),
  });

  if (!response.ok) {
    return { ok: false, message: `HTTP ${response.status}` };
  }
  if (!data?.success) {
    return { ok: false, message: data?.message || 'API returned success=false' };
  }
  return { ok: true };
}

async function checkPrivateStore() {
  const { response, data } = await fetchJson('/api/blockchain/private/store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credentialId: `cred_test_${Date.now()}`,
      encryptedData: { ciphertext: 'test_cipher' },
    }),
  });

  if (!response.ok) {
    return { ok: false, message: `HTTP ${response.status}` };
  }
  if (!data?.success) {
    return { ok: false, message: 'API returned success=false' };
  }
  return { ok: true };
}

async function checkEmailNotify() {
  const { data: emailHealthData } = await getEmailHealth();
  const effectiveMode = emailHealthData?.mode;

  const { response, data } = await fetchJson('/api/email/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: 'test@example.com',
      subject: 'Test Notification',
      body: 'This is a test email.',
    }),
  });

  if (response.ok && data?.success) {
    if (effectiveMode === 'smtp' && data.mode !== 'smtp') {
      return {
        ok: false,
        message: `Expected SMTP response mode=smtp but received mode=${String(data.mode || 'unknown')}`,
      };
    }
    if (effectiveMode === 'smtp' && data.mock) {
      return {
        ok: false,
        message: 'Email endpoint reported mock success while SMTP mode is active',
      };
    }

    if (effectiveMode === 'mock') {
      return { ok: true, message: 'Mock email delivery confirmed' };
    }
    return { ok: true, message: 'SMTP email delivery confirmed' };
  }

  const errorCode = data?.details?.code || 'UNKNOWN_ERROR';
  const errorMessage = data?.error || `HTTP ${response.status}`;

  if (effectiveMode === 'smtp') {
    return {
      ok: false,
      message: `SMTP mode active; email send failed (${errorCode}: ${errorMessage})`,
    };
  }

  if (effectiveMode === 'mock') {
    return {
      ok: false,
      message: `Mock mode should not fail (${errorCode}: ${errorMessage})`,
    };
  }

  return { ok: false, message: `${errorCode}: ${errorMessage}` };
}

async function main() {
  console.log('--- Testing Blockchain + Email Backend API ---');
  console.log(`API_URL=${API_URL}`);
  console.log(`EMAIL_EXPECTED_MODE=${EMAIL_EXPECTED_MODE}`);
  if (API_AUTH_TOKEN) {
    console.log('API_AUTH_TOKEN=provided');
  }

  const healthOk = await runCheck('Health check', checkHealth);
  if (!healthOk) {
    console.error(
      'Backend server is not reachable. Start it with "cd backend && npm start" and try again.',
    );
    process.exit(1);
  }

  const checks = [];
  checks.push(await runCheck('Submit transaction', checkTransactionSubmit));
  checks.push(await runCheck('Mine block', checkMineBlock));
  checks.push(await runCheck('Store private data', checkPrivateStore));
  checks.push(await runCheck('Email transport health', checkEmailHealth));
  checks.push(await runCheck('Send email notification', checkEmailNotify));

  const allPassed = checks.every(Boolean);
  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exit(1);
});
