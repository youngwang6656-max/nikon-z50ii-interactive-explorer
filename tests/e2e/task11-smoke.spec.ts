import { expect, test } from '@playwright/test';

const evidenceDir = '.superpowers/sdd/2026-08-25-nikon-z50ii-interactive-exploded-model';

test('selection, search, display commands, pointer gestures, and responsive inspector', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.locator('.load-progress')).toHaveText('2 / 8', { timeout: 30_000 });

  const search = page.getByLabel('搜索相机部件');
  await search.fill('传感器');
  await page.getByTestId('part-Z50II-03-009').click();
  await expect(page.getByTestId('part-name-zh')).toHaveText('固定式DX传感器封装', { timeout: 30_000 });
  await expect(page.locator('[data-module-id="03_mount_shutter_sensor"] .module-status')).toHaveText('已加载');

  const canvas = page.locator('.viewer-canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  const canvasSelected = page.locator('.part-row.is-selected');
  await expect(canvasSelected).toBeVisible();
  await expect(search).toHaveValue('传感器');
  await expect(canvasSelected).not.toContainText('传感器');
  await expect(canvasSelected).not.toContainText(/sensor/i);

  await search.focus();
  await search.press('Escape');
  await expect(page.getByText('等待选择部件', { exact: true })).toBeVisible();

  await page.getByTestId('part-Z50II-03-009').click();
  const beforeDragName = await page.getByTestId('part-name-zh').innerText();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.78, box!.y + box!.height * 0.68, { steps: 4 });
  await page.mouse.move(box!.x + box!.width / 2 + 1, box!.y + box!.height / 2 + 1, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('part-name-zh')).toHaveText(beforeDragName);

  const progressBefore = await page.getByTestId('part-progress').innerText();
  const hide = page.getByRole('button', { name: '隐藏当前部件' });
  const isolate = page.getByRole('button', { name: '隔离显示当前部件' });
  const transparency = page.getByRole('button', { name: '切换当前部件透明度' });
  await hide.click();
  await expect(hide).toHaveAttribute('aria-pressed', 'true');
  await isolate.click();
  await expect(isolate).toHaveAttribute('aria-pressed', 'true');
  await expect(hide).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('part-Z50II-03-010').click();
  await expect(page.getByTestId('part-name-zh')).toHaveText('传感器盖玻璃');
  await expect(isolate).toHaveAttribute('aria-pressed', 'false');

  await page.getByTestId('part-Z50II-03-009').click();
  await transparency.click();
  await expect(transparency).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('part-Z50II-03-010').click();
  await expect(transparency).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('part-Z50II-03-009').click();
  await expect(transparency).toHaveAttribute('aria-pressed', 'true');
  await transparency.click();
  await expect(page.getByTestId('part-progress')).toHaveText(progressBefore);

  await isolate.click();
  await expect(isolate).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('load-all-modules').click();
  await expect(page.locator('.load-progress')).toHaveText('8 / 8', { timeout: 30_000 });
  await expect(page.locator('.module-status')).toHaveText(Array(8).fill('已加载'));
  await expect(isolate).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: `${evidenceDir}/task-11-fix1-desktop.png` });

  const minimumFonts = await page.locator(
    '.part-code,.part-name-zh,.part-name-en,.module-status,.inspector-description-en,.inspector-action',
  ).evaluateAll((elements) => elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)));
  expect(Math.min(...minimumFonts)).toBeGreaterThanOrEqual(10);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('.load-progress')).toHaveText('2 / 8', { timeout: 30_000 });
  await page.getByLabel('搜索相机部件').fill('传感器');
  await page.getByTestId('part-Z50II-03-009').click();
  await expect(page.getByTestId('part-name-zh')).toBeVisible({ timeout: 30_000 });
  await page.locator('.inspector-panel').scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: '隔离显示当前部件' })).toBeVisible();
  const timeline = page.locator('.timeline-panel[aria-label="拆解序列与爆炸进度控制"]');
  await expect(timeline).toBeVisible();
  const mobileMetrics = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(mobileMetrics.width).toBeLessThanOrEqual(mobileMetrics.viewport);
  await page.screenshot({ path: `${evidenceDir}/task-11-fix1-mobile.png` });
  await timeline.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${evidenceDir}/task-11-fix1-mobile-timeline.png` });

  expect(errors).toEqual([]);
});
