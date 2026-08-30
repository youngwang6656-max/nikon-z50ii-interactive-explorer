import { expect, test, type Page } from '@playwright/test';

const evidenceDir = '.superpowers/sdd/2026-08-25-nikon-z50ii-interactive-exploded-model';

function captureUnexpectedErrors(page: Page, expectedConsoleErrors: RegExp[] = []): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (
      message.type() === 'error'
      && !expectedConsoleErrors.some((pattern) => pattern.test(message.text()))
    ) {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  return errors;
}

async function selectPart(page: Page, partId: string): Promise<void> {
  await page.getByLabel('搜索相机部件').fill(partId);
  await page.getByTestId(`part-${partId}`).click();
  await expect(page.getByTestId('part-name-zh')).toBeVisible({ timeout: 30_000 });
}

async function setRange(page: Page, testId: string, value: number): Promise<void> {
  await page.getByTestId(testId).evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    input.value = String(nextValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

test('final normal workflow covers 100 parts, both disassembly modes, inspection tools, and exact reassembly', async ({ page, browser }, testInfo) => {
  console.log(`[acceptance] ${testInfo.project.name} browser ${browser.version()}`);
  const errors = captureUnexpectedErrors(page);
  await page.goto('/');

  await expect(page.getByText('参考级内部结构，非 Nikon 原厂 CAD')).toBeVisible();
  await page.getByTestId('load-all-modules').click();
  await expect(page.locator('.load-progress')).toHaveText('8 / 8', { timeout: 30_000 });
  await expect(page.locator('[data-testid^="part-Z50II-"]')).toHaveCount(100);
  await expect(page.locator('.module-group')).toHaveCount(8);

  const root = page.locator('.app-shell');
  await selectPart(page, 'Z50II-04-001');
  await page.getByTestId('mode-free').click();
  await expect(root).toHaveAttribute('data-interaction-mode', 'free');
  await expect(page.getByTestId('dependency-warning')).toHaveAttribute('data-locked', 'true');
  await expect(page.getByTestId('dependency-warning')).not.toBeEmpty();
  await setRange(page, 'part-progress', 500);
  await expect(page.getByTestId('part-progress')).toHaveValue('0');

  await selectPart(page, 'Z50II-08-011');
  const assembledBasis = await root.getAttribute('data-selected-transform-basis');
  expect(assembledBasis).not.toBeNull();
  await setRange(page, 'part-progress', 500);
  await expect(page.getByTestId('part-progress-live')).toHaveText('50%');
  await page.getByTestId('undo-move').click();
  await expect(page.getByTestId('part-progress-live')).toHaveText('0%');
  await expect(root).toHaveAttribute('data-selected-transform-basis', assembledBasis!);

  await page.getByTestId('mode-guided').selectOption('guided');
  await expect(root).toHaveAttribute('data-interaction-mode', 'guided');
  await setRange(page, 'guided-progress', 1000);
  await expect(root).toHaveAttribute('data-assembly-progress', '1');
  await page.getByTestId('camera-preset-three-quarter').click();
  await expect(root).toHaveAttribute('data-camera-tween-active', 'true');
  await expect(root).toHaveAttribute('data-camera-tween-active', 'false');
  await page.screenshot({ path: `${evidenceDir}/task-16-browser-exploded.png` });
  await setRange(page, 'guided-progress', 0);
  await expect(root).toHaveAttribute('data-assembly-progress', '0');
  await expect(root).toHaveAttribute('data-selected-transform-basis', assembledBasis!);

  await page.getByTestId('hide-selected').click();
  await expect(page.getByTestId('hide-selected')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('visibility-reset').click();
  await page.getByTestId('ghost-selected').click();
  await expect(page.getByTestId('ghost-selected')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('isolate-selected').click();
  await expect(page.getByTestId('isolate-selected')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('visibility-reset').click();

  await page.getByTestId('cutaway-axis').selectOption('x');
  await page.getByTestId('cutaway-toggle').click();
  await expect(page.getByTestId('cutaway-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('cutaway-toggle').click();
  await page.getByTestId('lighting-preset').selectOption('inspection');
  await expect(page.getByTestId('lighting-preset')).toHaveValue('inspection');
  await page.getByTestId('lighting-preset').selectOption('studio');
  await expect(page.getByTestId('lighting-preset')).toHaveValue('studio');

  await page.getByTestId('camera-preset-three-quarter').click();
  await expect(root).toHaveAttribute('data-camera-tween-active', 'true');
  await expect(root).toHaveAttribute('data-camera-tween-active', 'false');
  await expect(page.locator('.viewer-canvas')).toHaveScreenshot('z50ii-assembled-studio.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.02,
  });
  await page.screenshot({ path: `${evidenceDir}/task-16-browser-assembled.png` });
  expect(errors).toEqual([]);
});

test('final recovery workflow retries a failed GLB without losing the working scene', async ({ page, browser }, testInfo) => {
  console.log(`[acceptance] ${testInfo.project.name} browser ${browser.version()}`);
  const errors = captureUnexpectedErrors(page, [/Failed to load resource: net::ERR_FAILED/]);
  let failuresRemaining = 1;
  await page.route('**/high/08_io_flex_fasteners.glb', async (route) => {
    if (failuresRemaining > 0) {
      failuresRemaining -= 1;
      await route.abort();
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  await page.getByTestId('load-all-modules').click();
  const retry = page.getByTestId('retry-08_io_flex_fasteners');
  await expect(retry).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.load-progress')).toHaveText('7 / 8');
  await retry.click();
  const moduleRow = page.locator('.module-group[data-module-id="08_io_flex_fasteners"]');
  await expect(moduleRow.locator('.module-status')).toContainText('已加载', { timeout: 30_000 });
  await expect(page.locator('.load-progress')).toHaveText('8 / 8');
  await expect(moduleRow).toHaveAttribute('data-retry-count', '1');
  await expect(page.locator('[data-testid^="part-Z50II-"]')).toHaveCount(100);
  await page.screenshot({ path: `${evidenceDir}/task-16-browser-recovered.png` });
  expect(errors).toEqual([]);
});
