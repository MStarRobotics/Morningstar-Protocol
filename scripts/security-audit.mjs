import { spawnSync } from 'node:child_process';
import path from 'node:path';

const rootDir = process.cwd();
const targets = [
  { name: 'frontend', cwd: rootDir },
  { name: 'backend', cwd: path.join(rootDir, 'backend') },
];
const auditLevel = 'moderate';

const isCi = process.env.CI === 'true';
let onlyConnectivityFailures = true;
const vulnerabilityFailures = [];
const connectivityFailures = [];
const passes = [];

function isConnectivityIssue(output) {
  return /(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|network request failed|audit endpoint returned an error)/i.test(output);
}

for (const target of targets) {
  const result = spawnSync(
    'npm',
    ['audit', `--audit-level=${auditLevel}`],
    { cwd: target.cwd, encoding: 'utf8' },
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status === 0) {
    passes.push(target.name);
    console.log(`[audit] ${target.name}: passed (${auditLevel}+ threshold).`);
    onlyConnectivityFailures = false;
    continue;
  }

  const combined = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (!isConnectivityIssue(combined)) {
    vulnerabilityFailures.push(target.name);
    console.error(`[audit] ${target.name}: failed due to vulnerabilities at ${auditLevel}+ threshold.`);
    onlyConnectivityFailures = false;
  } else {
    connectivityFailures.push(target.name);
    console.warn(`[audit] ${target.name}: registry unavailable, skipping strict enforcement for this target.`);
  }
}

if (vulnerabilityFailures.length === 0 && connectivityFailures.length === 0) {
  console.log(`[audit] summary: ${passes.length} target(s) passed, 0 failed.`);
  process.exit(0);
}

if (onlyConnectivityFailures && !isCi) {
  console.warn(`[audit] summary: connectivity-only failures for ${connectivityFailures.join(', ')} (local mode tolerated).`);
  process.exit(0);
}

if (connectivityFailures.length > 0) {
  console.error(`[audit] summary: connectivity failure for ${connectivityFailures.join(', ')}.`);
}

if (vulnerabilityFailures.length > 0) {
  console.error(`[audit] summary: vulnerability failure for ${vulnerabilityFailures.join(', ')}.`);
}

process.exit(1);
