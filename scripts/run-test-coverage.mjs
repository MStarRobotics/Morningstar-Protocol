import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const vitestCliPath = path.resolve(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs');
const strictFlags = new Set(['--strict', '--require-provider']);
const argv = process.argv.slice(2);
const requireCoverageProvider = process.env.REQUIRE_COVERAGE_PROVIDER === 'true' || argv.some((arg) => strictFlags.has(arg));
const passthroughArgs = argv.filter((arg) => !strictFlags.has(arg));

const baseArgs = [vitestCliPath, 'run', ...passthroughArgs];

let runArgs = [...baseArgs, '--coverage'];
try {
  require.resolve('@vitest/coverage-v8');
} catch {
  if (requireCoverageProvider) {
    console.error(
      '[coverage] @vitest/coverage-v8 is required but not installed. ' +
        'Install it before running coverage in strict mode.',
    );
    process.exit(1);
  } else {
    console.warn(
      '[coverage] @vitest/coverage-v8 is not installed. Running tests without coverage output.',
    );
    runArgs = baseArgs;
  }
}

const result = spawnSync(process.execPath, runArgs, { stdio: 'inherit' });
process.exit(result.status ?? 1);
