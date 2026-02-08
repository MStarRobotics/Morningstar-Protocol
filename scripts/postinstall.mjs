/**
 * Postinstall script: patches @noble/hashes v2 exports map to re-expose
 * the v1-style subpath entries (sha256, sha512) that downstream packages
 * like did-jwt and ethers still import.
 *
 * Safe to run multiple times.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const HASHES_PKG = resolve('node_modules/@noble/hashes/package.json');

if (!existsSync(HASHES_PKG)) {
  process.exit(0);
}

const pkg = JSON.parse(readFileSync(HASHES_PKG, 'utf-8'));

const patches = {
  './sha256': { import: './sha2.js', default: './sha2.js' },
  './sha256.js': { import: './sha2.js', default: './sha2.js' },
  './sha512': { import: './sha2.js', default: './sha2.js' },
  './sha512.js': { import: './sha2.js', default: './sha2.js' },
};

let changed = false;
for (const [key, value] of Object.entries(patches)) {
  if (!pkg.exports[key]) {
    pkg.exports[key] = value;
    changed = true;
  }
}

if (changed) {
  writeFileSync(HASHES_PKG, JSON.stringify(pkg, null, 2) + '\n');
  console.log('[postinstall] Patched @noble/hashes exports map for v1 compat.');
}
