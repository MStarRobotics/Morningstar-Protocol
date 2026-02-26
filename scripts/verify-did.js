/**
 * Verification script for DID Backend API
 * Usage: node scripts/verify-did.js
 * Optional:
 *   API_URL=http://localhost:3001
 *   API_AUTH_TOKEN=<user_access_token_for_protected_write_endpoints>
 */

const API_BASE = process.env.API_URL || 'http://localhost:3001';
const API_AUTH_TOKEN = String(process.env.API_AUTH_TOKEN || '').trim();

function authHeaders(headers = {}) {
  if (!API_AUTH_TOKEN) return headers;
  return {
    ...headers,
    Authorization: `Bearer ${API_AUTH_TOKEN}`,
  };
}

async function test() {
  console.log('--- Testing DID Backend API ---');
  console.log(`API_URL=${API_BASE}`);
  if (!API_AUTH_TOKEN) {
    console.error(
      'Missing API_AUTH_TOKEN. DID write endpoints now require a user session access token.',
    );
    process.exit(1);
  }
  console.log('API_AUTH_TOKEN=provided');

  // 1. Health check
  try {
    const health = await fetch(`${API_BASE}/api/health`).then(r => r.json());
    console.log('Health check:', health.status === 'ok' ? 'PASS' : 'FAIL');
  } catch (e) {
    console.error('Backend not running!', e);
    process.exit(1);
  }

  // 2. Register DID
  const didId = `did:test:${Date.now()}`;
  const doc = { id: didId, controller: didId };
  const metadata = { role: 'tester' };

  console.log(`Registering ${didId}...`);
  const regRes = await fetch(`${API_BASE}/api/did`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ didDocument: doc, metadata })
  });
  
  if (regRes.status === 201) {
    console.log('Registration: PASS');
  } else {
    console.error('Registration: FAIL', await regRes.text());
  }

  // 3. Resolve DID
  console.log(`Resolving ${didId}...`);
  const resolveRes = await fetch(`${API_BASE}/api/did/${didId}`);
  const resolved = await resolveRes.json();
  
  if (resolveRes.ok && resolved.id === didId) {
    console.log('Resolution: PASS');
  } else {
    console.error('Resolution: FAIL', resolved);
  }

  // 4. List DIDs
  console.log('Listing DIDs...');
  const listRes = await fetch(`${API_BASE}/api/did`);
  const list = await listRes.json();
  
  if (listRes.ok && Array.isArray(list) && list.some(d => d.did === didId)) {
    console.log('List DIDs: PASS');
  } else {
    console.error('List DIDs: FAIL', list);
  }

  // 5. Update DID
  console.log(`Updating ${didId}...`);
  const updateRes = await fetch(`${API_BASE}/api/did/${didId}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ metadata: { role: 'admin' } })
  });

  if (updateRes.ok) {
    console.log('Update: PASS');
  } else {
    console.error('Update: FAIL', await updateRes.text());
  }

  // 6. Verify Update
  const verifyUpdate = await fetch(`${API_BASE}/api/did/${didId}`).then(r => r.json());
  if (verifyUpdate.metadata?.role === 'admin') {
    console.log('Verify Update: PASS');
  } else {
    console.error('Verify Update: FAIL', verifyUpdate);
  }

  // 7. Revoke DID
  console.log(`Revoking ${didId}...`);
  const revokeRes = await fetch(`${API_BASE}/api/did/${didId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });

  if (revokeRes.ok) {
    console.log('Revoke: PASS');
  } else {
    console.error('Revoke: FAIL', await revokeRes.text());
  }

  // 8. Verify Revocation
  const verifyRevoke = await fetch(`${API_BASE}/api/did/${didId}`).then(r => r.json());
  if (verifyRevoke.document?.deactivated === true) {
    console.log('Verify Revocation: PASS');
  } else {
    console.error('Verify Revocation: FAIL', verifyRevoke);
  }
}

test();
