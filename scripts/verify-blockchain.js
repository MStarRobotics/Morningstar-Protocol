/**
 * Verification script for Blockchain + Email backend endpoints.
 * Usage: node scripts/verify-blockchain.js
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';

async function fetchJson(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, options);
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
    console.log(`PASS ${name}`);
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
  const { response, data } = await fetchJson('/api/email/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: 'test@example.com',
      subject: 'Test Notification',
      body: 'This is a test email.',
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

async function main() {
  console.log('--- Testing Blockchain + Email Backend API ---');
  console.log(`API_URL=${API_URL}`);

  const healthOk = await runCheck('Health check', checkHealth);
  if (!healthOk) {
    console.error(
      'Backend server is not reachable. Start it with "cd backend && npm start" and try again.',
    );
    process.exit(1);
  }

  const checks = await Promise.all([
    runCheck('Submit transaction', checkTransactionSubmit),
    runCheck('Mine block', checkMineBlock),
    runCheck('Store private data', checkPrivateStore),
    runCheck('Send email notification', checkEmailNotify),
  ]);

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
