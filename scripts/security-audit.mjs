import { spawnSync } from 'node:child_process';
import path from 'node:path';

const rootDir = process.cwd();
const targets = [
  { name: 'frontend', cwd: rootDir },
  { name: 'backend', cwd: path.join(rootDir, 'backend') },
];

const isCi = process.env.CI === 'true';
let hasFailures = false;
let onlyConnectivityFailures = true;

function isConnectivityIssue(output) {
  return /(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|network request failed|audit endpoint returned an error)/i.test(output);
}

for (const target of targets) {
  const result = spawnSync(
    'npm',
    ['audit', '--audit-level=high'],
    { cwd: target.cwd, encoding: 'utf8' },
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status === 0) {
    onlyConnectivityFailures = false;
    continue;
  }

  hasFailures = true;
  const combined = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (!isConnectivityIssue(combined)) {
    onlyConnectivityFailures = false;
  } else {
    console.warn(`[audit] ${target.name}: registry unavailable, skipping strict enforcement for this target.`);
  }
}

if (!hasFailures) {
  console.log('[audit] completed without high-severity findings.');
  process.exit(0);
}

if (onlyConnectivityFailures && !isCi) {
  console.warn('[audit] completed with connectivity-only failures in local mode.');
  process.exit(0);
}

process.exit(1);
