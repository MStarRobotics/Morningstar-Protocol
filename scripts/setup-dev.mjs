import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const dockerMode = process.argv.includes('--docker');

const frontendEnvExample = path.join(rootDir, '.env.example');
const frontendEnvLocal = path.join(rootDir, '.env.local');
const backendEnvExample = path.join(rootDir, 'backend', '.env.example');
const backendEnvLocal = path.join(rootDir, 'backend', '.env');

function runOrExit(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureFile(examplePath, targetPath) {
  if (existsSync(targetPath)) {
    return false;
  }

  mkdirSync(path.dirname(targetPath), { recursive: true });
  copyFileSync(examplePath, targetPath);
  return true;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ensureEnvKey(filePath, key, value) {
  const content = readFileSync(filePath, 'utf8');
  const pattern = new RegExp(`^${escapeRegExp(key)}=`, 'm');
  if (pattern.test(content)) {
    return false;
  }

  const next = `${content}${content.endsWith('\n') ? '' : '\n'}${key}=${value}\n`;
  writeFileSync(filePath, next, 'utf8');
  return true;
}

console.log(`[setup] mode=${dockerMode ? 'docker' : 'local'}`);

const frontendCreated = ensureFile(frontendEnvExample, frontendEnvLocal);
const backendCreated = ensureFile(backendEnvExample, backendEnvLocal);

if (frontendCreated) {
  console.log('[setup] created .env.local from .env.example');
}
if (backendCreated) {
  console.log('[setup] created backend/.env from backend/.env.example');
}

const frontendDefaults = [
  ['VITE_API_PROXY_URL', 'http://localhost:3001'],
];

const localAllowedOrigins = 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080';
const dockerAllowedOrigins = 'http://localhost:8080';

const backendDefaults = [
  ['EMAIL_TRANSPORT_MODE', 'mock'],
  ['ALLOWED_ORIGINS', dockerMode ? dockerAllowedOrigins : localAllowedOrigins],
  ['GOVERNANCE_BOOTSTRAP_WALLETS', String(process.env.GOVERNANCE_BOOTSTRAP_WALLETS || '')],
];

for (const [key, value] of frontendDefaults) {
  if (ensureEnvKey(frontendEnvLocal, key, value)) {
    console.log(`[setup] appended ${key} to .env.local`);
  }
}

for (const [key, value] of backendDefaults) {
  if (ensureEnvKey(backendEnvLocal, key, value)) {
    console.log(`[setup] appended ${key} to backend/.env`);
  }
}

if (!dockerMode) {
  console.log('[setup] installing root dependencies');
  runOrExit('npm', ['install'], rootDir);

  console.log('[setup] installing backend dependencies');
  runOrExit('npm', ['install'], path.join(rootDir, 'backend'));
}

console.log('[setup] done');
