import { expect, test } from '@playwright/test';

const evidenceDir = '.superpowers/sdd/2026-08-25-nikon-z50ii-interactive-exploded-model';

async function selectPart(page: import('@playwright/test').Page, partId: string): Promise<void> {
  const search = page.getByLabel('搜索相机部件');
  await search.fill(partId);
  await page.getByTestId(`part-${partId}`).click();
  await expect(page.getByTestId('part-name-zh')).toBeVisible({ timeout: 30_000 });
}

async function setPartProgress(page: import('@playwright/test').Page, value: number): Promise<void> {
  await page.getByTestId('part-progress').evaluate((control, nextValue) => {
    (control as HTMLElement & { value: string }).value = String(nextValue);
    control.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

test('free disassembly supports constrained drag, dependency guidance, undo/cancel/reset, and mobile controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.locator('.load-progress')).toHaveText('2 / 8', { timeout: 30_000 });
  const root = page.locator('.app-shell');
  await page.getByTestId('mode-free').click();
  await expect(root).toHaveAttribute('data-interaction-mode', 'free');
  await expect(page.getByTestId('mode-free')).toHaveAttribute('aria-pressed', 'true');

  await selectPart(page, 'Z50II-08-011');
  await expect(page.getByTestId('part-name-zh')).toHaveText('左上机壳螺钉');
  const range = page.getByTestId('part-progress').locator('input[type="range"]');
  const basisBeforeDrag = await root.getAttribute('data-selected-transform-basis');
  expect(basisBeforeDrag).not.toBeNull();
  await expect(range).toHaveAttribute('min', '0');
  await expect(range).toHaveAttribute('max', '1000');
  await setPartProgress(page, 500);
  await expect(page.getByTestId('part-progress')).toHaveText('50%');
  await page.getByTestId('undo-move').click();
  await expect(page.getByTestId('part-progress')).toHaveText('0%');

  const canvas = page.locator('.viewer-canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const centerX = box!.x + box!.width / 2;
  const centerY = box!.y + box!.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 130, centerY - 100, { steps: 8 });
  await page.mouse.up();
  const draggedValue = await range.inputValue();
  expect(Number(draggedValue)).toBeGreaterThan(0);
  await expect(root).toHaveAttribute('data-selected-transform-basis', basisBeforeDrag!);
  await page.screenshot({ path: `${evidenceDir}/task-13-free-drag-desktop.png` });

  await page.getByTestId('reset-assembly').click();
  await expect(page.getByTestId('part-progress')).toHaveText('0%');
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 110, centerY - 90, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByTestId('part-progress')).toHaveText('0%');

  await setPartProgress(page, 400);
  const search = page.getByLabel('搜索相机部件');
  await search.focus();
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('part-progress')).toHaveText('40%');
  await page.getByTestId('undo-move').focus();
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('part-progress')).toHaveText('0%');

  await selectPart(page, 'Z50II-04-001');
  await expect(page.getByTestId('part-name-zh')).toHaveText('主电路板');
  const warning = page.getByTestId('dependency-warning');
  await expect(warning).toHaveAttribute('data-locked', 'true');
  await expect(warning).toContainText('影像处理器封装');
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 130, centerY - 100, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('part-progress')).toHaveText('0%');
  await page.screenshot({ path: `${evidenceDir}/task-13-locked-dependency.png` });
  await page.getByRole('button', { name: '定位并选择前置部件：影像处理器封装' }).click();
  await expect(page.getByTestId('part-name-zh')).toHaveText('影像处理器封装', { timeout: 30_000 });

  await selectPart(page, 'Z50II-08-011');
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 100, centerY - 80, { steps: 5 });
  await page.getByTestId('mode-guided').selectOption('guided');
  await page.mouse.up();
  await expect(root).toHaveAttribute('data-interaction-mode', 'guided');
  await expect(root).toHaveAttribute('data-free-drag-enabled', 'false');

  await page.getByTestId('mode-free').click();
  await setPartProgress(page, 700);
  await page.getByTestId('reset-assembly').click();
  await expect(page.getByTestId('part-progress')).toHaveText('0%');
  await page.getByTestId('undo-move').click();
  await expect(page.getByTestId('part-progress')).toHaveText('0%');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.inspector-panel').scrollIntoViewIfNeeded();
  const mobileMetrics = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    targets: [...document.querySelectorAll<HTMLElement>(
      '[data-testid="mode-free"],[data-testid="undo-move"],[data-testid="reset-assembly"],.part-progress-range',
    )].map((element) => element.getBoundingClientRect().height),
  }));
  expect(mobileMetrics.width).toBeLessThanOrEqual(mobileMetrics.viewport);
  expect(Math.min(...mobileMetrics.targets)).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `${evidenceDir}/task-13-mobile-free-controls.png`, fullPage: true });
  expect(errors).toEqual([]);
});
