import { expect, test } from '@playwright/test';

const evidenceDir = '.superpowers/sdd/2026-08-25-nikon-z50ii-interactive-exploded-model';

test('switches high and low transactionally without losing interaction state', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.locator('.load-progress')).toHaveText('2 / 8', { timeout: 30_000 });
  await page.getByLabel('搜索相机部件').fill('Z50II-02-001');
  await page.getByTestId('part-Z50II-02-001').click();
  await page.getByTestId('mode-free').click();
  await page.getByTestId('part-progress').evaluate((element) => {
    (element as HTMLInputElement).value = '500';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.getByTestId('ghost-selected').click();

  const root = page.locator('.app-shell');
  const before = await root.evaluate((element) => ({
    progress: element.getAttribute('data-assembly-progress'),
    mode: (element as HTMLElement).dataset.interactionMode,
    selected: (element as HTMLElement).dataset.selectedTransformBasis,
  }));

  await page.getByTestId('quality-profile').selectOption('low');
  await expect(root).toHaveAttribute('data-quality-effective', 'low');
  const chassisRow = page.locator('.module-group[data-module-id="01_chassis_front"]');
  const shellRow = page.locator('.module-group[data-module-id="02_outer_shell_controls"]');
  await expect(chassisRow).toHaveAttribute('data-quality', 'low');
  await expect(shellRow).toHaveAttribute('data-quality', 'low');
  await expect(chassisRow.locator('.module-status')).toContainText('已加载', { timeout: 30_000 });
  await expect(shellRow.locator('.module-status')).toContainText('已加载', { timeout: 30_000 });
  await expect(page.getByTestId('ghost-selected')).toHaveAttribute('aria-pressed', 'true');

  const afterLow = await root.evaluate((element) => ({
    progress: element.getAttribute('data-assembly-progress'),
    mode: (element as HTMLElement).dataset.interactionMode,
    selected: (element as HTMLElement).dataset.selectedTransformBasis,
  }));
  expect(afterLow).toEqual(before);

  await page.getByTestId('quality-profile').selectOption('high');
  await expect(root).toHaveAttribute('data-quality-effective', 'high');
  await expect(shellRow).toHaveAttribute('data-quality', 'high');
  await expect(shellRow.locator('.module-status')).toContainText('已加载', { timeout: 30_000 });
  await expect(page.getByTestId('ghost-selected')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: `${evidenceDir}/task-15-quality-low-high.png` });
  expect(errors).toEqual([]);
});

test('offers a concurrency-safe retry and keeps the current scene until recovery', async ({ page }) => {
  let failuresRemaining = 1;
  await page.route('**/high/08_io_flex_fasteners.glb', async (route) => {
    if (failuresRemaining > 0) {
      failuresRemaining -= 1;
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.getByTestId('load-all-modules').click();

  const retry = page.getByTestId('retry-08_io_flex_fasteners');
  await expect(retry).toBeVisible({ timeout: 30_000 });
  await retry.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  const recoveryRow = page.locator('.module-group[data-module-id="08_io_flex_fasteners"]');
  await expect(recoveryRow.locator('.module-status'))
    .toContainText('已加载', { timeout: 30_000 });
  await expect(page.locator('.load-progress')).toHaveText('8 / 8');
  await expect(recoveryRow)
    .toHaveAttribute('data-retry-count', '1');
});

test('keeps startup alive with independent HDR fallback', async ({ page }) => {
  await page.route('**/studio-neutral-1k.hdr', (route) => route.abort());
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');

  const canvas = page.locator('.viewer-canvas');
  await expect(canvas).toHaveAttribute('data-environment', 'room', { timeout: 30_000 });
  await expect(canvas).toHaveAttribute('data-environment-failed-url', /studio-neutral-1k\.hdr/);
  await expect(page.locator('.load-progress')).toHaveText('2 / 8', { timeout: 30_000 });
});

test('shows a Chinese compatibility message without a secondary crash when WebGL2 is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type === 'webgl2') return null;
      return (original as (...callArgs: unknown[]) => unknown).call(this, type, ...args);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto('/');

  const message = page.getByTestId('webgl-compatibility');
  await expect(message).toContainText('WebGL2');
  await expect(message).toContainText('桌面版 Chrome');
  await expect(message).toContainText('桌面版 Edge');
  await expect(page.locator('canvas')).toHaveCount(0);
});
