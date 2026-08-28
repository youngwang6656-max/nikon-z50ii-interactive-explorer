import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const PORT = 4175;
const ORIGIN = `http://${HOST}:${PORT}`;
const READY_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 5_000;
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const viteCli = resolve(projectRoot, 'node_modules/vite/bin/vite.js');
const playwrightCli = resolve(projectRoot, 'node_modules/@playwright/test/cli.js');

let previewProcess;
let playwrightProcess;
let shuttingDown = false;

const delay = (milliseconds) => new Promise((resolveDelay) => {
  setTimeout(resolveDelay, milliseconds);
});

function waitForExit(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(child?.exitCode ?? 0);
  }
  return new Promise((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
}

async function assertPortAvailable() {
  await new Promise((resolveAvailable, rejectAvailable) => {
    const probe = createServer();
    probe.unref();
    probe.once('error', (error) => {
      rejectAvailable(new Error(`E2E preview port ${PORT} is unavailable: ${error.message}`));
    });
    probe.listen({ host: HOST, port: PORT, exclusive: true }, () => {
      probe.close((error) => error ? rejectAvailable(error) : resolveAvailable());
    });
  });
}

function spawnNode(entryPoint, arguments_) {
  return spawn(process.execPath, [entryPoint, ...arguments_], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
}

async function waitForPreview(child) {
  let spawnError;
  child.once('error', (error) => { spawnError = error; });
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Vite preview exited before becoming ready (code ${child.exitCode ?? 'signal'})`);
    }
    try {
      const response = await fetch(ORIGIN, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // The direct child is still starting; retry until the bounded deadline.
    }
    await delay(100);
  }
  throw new Error(`Vite preview did not become ready at ${ORIGIN} within ${READY_TIMEOUT_MS} ms`);
}

async function stopChild(child, label) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = waitForExit(child);
  child.kill();
  const stopped = await Promise.race([
    exited.then(() => true),
    delay(STOP_TIMEOUT_MS).then(() => false),
  ]);
  if (stopped) return;
  child.kill('SIGKILL');
  const killed = await Promise.race([
    exited.then(() => true),
    delay(STOP_TIMEOUT_MS).then(() => false),
  ]);
  if (!killed) throw new Error(`${label} process ${child.pid ?? 'unknown'} did not stop`);
}

async function stopOwnedProcesses() {
  await stopChild(playwrightProcess, 'Playwright');
  const previewPid = previewProcess?.pid;
  await stopChild(previewProcess, 'Vite preview');
  if (previewPid) console.log(`[e2e] stopped Vite preview pid ${previewPid}`);
  playwrightProcess = undefined;
  previewProcess = undefined;
}

async function handleSignal(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await stopOwnedProcesses();
  } finally {
    process.exit(signal === 'SIGINT' ? 130 : 143);
  }
}

process.once('SIGINT', () => { void handleSignal('SIGINT'); });
process.once('SIGTERM', () => { void handleSignal('SIGTERM'); });

try {
  await assertPortAvailable();
  previewProcess = spawnNode(viteCli, [
    'preview',
    '--host', HOST,
    '--port', String(PORT),
    '--strictPort',
  ]);
  await waitForPreview(previewProcess);
  console.log(`[e2e] Vite preview ready at ${ORIGIN} (pid ${previewProcess.pid ?? 'unknown'})`);

  playwrightProcess = spawnNode(playwrightCli, [
    'test',
    ...process.argv.slice(2),
  ]);
  const testExitCode = await waitForExit(playwrightProcess);
  playwrightProcess = undefined;
  process.exitCode = testExitCode;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await stopOwnedProcesses();
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
}
