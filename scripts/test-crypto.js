
// Mock implementation of the logic I added to src/services/vc/cryptoSuites.ts
// to verify it works correctly in Node.js

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function bytesToBase58(bytes) {
  let x = BigInt(0);
  for (const byte of bytes) {
    x = (x * 256n) + BigInt(byte);
  }

  let output = '';
  while (x > 0n) {
    const mod = Number(x % 58n);
    x = x / 58n;
    output = BASE58_ALPHABET[mod] + output;
  }

  // Leading zeros
  for (const byte of bytes) {
    if (byte === 0) output = BASE58_ALPHABET[0] + output;
    else break;
  }

  return output;
}

function base58ToBytes(str) {
  if (str.length === 0) return new Uint8Array(0);

  let x = BigInt(0);
  for (const char of str) {
    const value = BASE58_ALPHABET.indexOf(char);
    if (value < 0) throw new Error(`Invalid base58 character: ${char}`);
    x = (x * 58n) + BigInt(value);
  }

  const bytes = [];
  while (x > 0n) {
    bytes.unshift(Number(x % 256n));
    x = x / 256n;
  }

  // Leading ones
  for (const char of str) {
    if (char === BASE58_ALPHABET[0]) bytes.unshift(0);
    else break;
  }

  return new Uint8Array(bytes);
}

// Test cases
console.log('Testing Base58 implementation...');

const testCases = [
  { bytes: [0, 0, 0, 0], expected: '1111' },
  { bytes: [0, 1], expected: '12' },
  { bytes: [255], expected: '5Q' },
  // 64 byte signature simulation
  { 
    bytes: new Uint8Array(64).fill(255), // All ones
    description: '64-byte overflow test'
  }
];

let failed = false;

testCases.forEach((test, index) => {
  try {
    const input = test.bytes instanceof Uint8Array ? test.bytes : new Uint8Array(test.bytes);
    const encoded = bytesToBase58(input);
    const decoded = base58ToBytes(encoded);
    
    // Verify round trip
    if (input.length !== decoded.length || !input.every((v, i) => v === decoded[i])) {
      console.error(`❌ Test ${index} Failed: Round trip mismatch`);
      console.error('Input:', input);
      console.error('Encoded:', encoded);
      console.error('Decoded:', decoded);
      failed = true;
    } else {
        console.log(`✅ Test ${index} Passed: ${test.description || encoded}`);
    }

  } catch (e) {
    console.error(`❌ Test ${index} Failed with error:`, e);
    failed = true;
  }
});

if (!failed) {
  console.log('\n🎉 All Base58 tests passed! usage of BigInt prevents overflow.');
} else {
    process.exit(1);
}
