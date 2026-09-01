import { defineConfig } from '@playwright/test';

const environment = (globalThis as {
  process?: { env?: Record<string, string | undefined> };
}).process?.env;
const executablePath = environment?.PLAYWRIGHT_EXECUTABLE_PATH;

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'runtime-results/playwright',
  snapshotPathTemplate: 'tests/e2e/__screenshots__/{arg}{ext}',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4175',
    browserName: 'chromium',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
  projects: executablePath
    ? [{ name: 'chromium', use: { viewport: { width: 1440, height: 900 } } }]
    : [
        { name: 'chrome', use: { channel: 'chrome', viewport: { width: 1440, height: 900 } } },
        { name: 'edge', use: { channel: 'msedge', viewport: { width: 1440, height: 900 } } },
      ],
});
