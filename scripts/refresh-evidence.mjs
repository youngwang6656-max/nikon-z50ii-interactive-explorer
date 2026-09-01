import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv.length > 2) {
  console.error('Evidence refresh is intentionally a complete, fixed Chrome+Edge run and accepts no arguments.');
  process.exitCode = 2;
} else {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const runner = resolve(projectRoot, 'scripts/run-e2e.mjs');
  const child = spawn(process.execPath, [runner, '--update-snapshots=all'], {
    cwd: projectRoot,
    env: { ...process.env, Z50II_REFRESH_EVIDENCE: '1' },
    stdio: 'inherit',
    windowsHide: true,
  });
  child.once('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.once('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}
