import { spawnSync } from 'node:child_process';

const buildResult = spawnSync(
  'npm',
  ['run', 'build'],
  { encoding: 'utf8' },
);

const output = `${buildResult.stdout || ''}\n${buildResult.stderr || ''}`;
if (buildResult.stdout) process.stdout.write(buildResult.stdout);
if (buildResult.stderr) process.stderr.write(buildResult.stderr);

if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

const warningLines = output
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0)
  .filter((line) => (
    line.startsWith('(!)') ||
    /warning:/i.test(line) ||
    /contains an annotation that Rollup cannot interpret due to the position of the comment/i.test(line)
  ));

const ignoredWarningPatterns = [
  /contains an annotation that Rollup cannot interpret due to the position of the comment/i,
  /^\(!\)\s*Some chunks are larger than/i,
  /Adjust chunk size limit for this warning/i,
];

const actionableWarnings = warningLines.filter(
  (line) => !ignoredWarningPatterns.some((pattern) => pattern.test(line)),
);

if (actionableWarnings.length > 0) {
  console.error('[build-warning-check] actionable warnings detected:');
  for (const warning of actionableWarnings) {
    console.error(`- ${warning}`);
  }
  process.exit(1);
}

console.log('[build-warning-check] no actionable build warnings detected.');
