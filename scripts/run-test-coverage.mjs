import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const vitestCliPath = path.resolve(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs');

const baseArgs = [vitestCliPath, 'run'];

let runArgs = [...baseArgs, '--coverage'];
try {
  require.resolve('@vitest/coverage-v8');
} catch {
  console.warn(
    '[coverage] @vitest/coverage-v8 is not installed. Running tests without coverage output.',
  );
  runArgs = baseArgs;
}

const result = spawnSync(process.execPath, runArgs, { stdio: 'inherit' });
process.exit(result.status ?? 1);
