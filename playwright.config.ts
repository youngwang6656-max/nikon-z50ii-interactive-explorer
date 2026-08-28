import { defineConfig } from '@playwright/test';

const environment = (globalThis as {
  process?: { env?: Record<string, string | undefined> };
}).process?.env;
const executablePath = environment?.PLAYWRIGHT_EXECUTABLE_PATH;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4175',
    browserName: 'chromium',
    ...(executablePath
      ? { launchOptions: { executablePath } }
      : { channel: 'chrome' as const }),
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
});
