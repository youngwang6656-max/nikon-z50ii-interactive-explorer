import { expect, test } from '@playwright/test';
import { evidenceDir } from './evidence-paths';

async function selectPart(page: import('@playwright/test').Page, partId: string): Promise<void> {
  const search = page.getByLabel('搜索相机部件');
  await search.fill(partId);
  await page.getByTestId(`part-${partId}`).click();
  await expect(page.getByTestId('part-name-zh')).toBeVisible({ timeout: 30_000 });
}

async function setPartProgress(page: import('@playwright/test').Page, value: number): Promise<void> {
  await page.getByTestId('part-progress').evaluate((input, nextValue) => {
    (input as HTMLInputElement).value = String(nextValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
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
  const range = page.getByTestId('part-progress');
  const basisBeforeDrag = await root.getAttribute('data-selected-transform-basis');
  expect(basisBeforeDrag).not.toBeNull();
  await expect(range).toHaveAttribute('min', '0');
  await expect(range).toHaveAttribute('max', '1000');
  await range.evaluate((input) => {
    for (const value of ['200', '350', '500']) {
      (input as HTMLInputElement).value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.getByTestId('part-progress-live')).toHaveText('50%');
  await page.getByTestId('undo-move').click();
  await expect(page.getByTestId('part-progress-live')).toHaveText('0%');
  await setPartProgress(page, 300);
  await range.focus();
  await range.dispatchEvent('pointerdown', { pointerId: 70, button: 0, isPrimary: true });
  await range.evaluate((input) => {
    (input as HTMLInputElement).value = '700';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('part-progress-live')).toHaveText('30%');
  await page.getByTestId('undo-move').click();
  await expect(page.getByTestId('part-progress-live')).toHaveText('0%');

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
  const basisAfterDrag = await root.getAttribute('data-selected-transform-basis');
  const beforeDragValues = basisBeforeDrag!.split(',').map(Number);
  const afterDragValues = basisAfterDrag!.split(',').map(Number);
  expect(afterDragValues).toHaveLength(16);
  expect(afterDragValues.slice(0, 12)).toEqual(beforeDragValues.slice(0, 12));
  expect(afterDragValues.slice(12, 15)).not.toEqual(beforeDragValues.slice(12, 15));
  await page.screenshot({ path: `${evidenceDir}/task-13-free-drag-desktop.png` });

  await page.getByTestId('reset-assembly').click();
  await expect(page.getByTestId('part-progress-live')).toHaveText('0%');
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 90, centerY - 70, { steps: 4 });
  await range.focus();
  await range.dispatchEvent('pointerdown', { pointerId: 69, button: 0, isPrimary: true });
  await range.evaluate((input) => (input as HTMLInputElement).blur());
  await page.mouse.up();
  await expect(page.getByTestId('part-progress-live')).toHaveText('0%');

  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 90, centerY - 70, { steps: 4 });
  await setPartProgress(page, 300);
  await page.mouse.up();
  await expect(page.getByTestId('part-progress-live')).toHaveText('30%');
  await page.getByTestId('undo-move').click();
  await expect(page.getByTestId('part-progress-live')).toHaveText('0%');

  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 110, centerY - 90, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByTestId('part-progress-live')).toHaveText('0%');

  await setPartProgress(page, 400);
  await range.dispatchEvent('pointerdown', { pointerId: 71, button: 0, isPrimary: true });
  await range.evaluate((input) => {
    (input as HTMLInputElement).value = '800';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.getByTestId('global-explode').evaluate((input) => {
    (input as HTMLInputElement).value = '200';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await range.dispatchEvent('change');
  await expect(page.getByTestId('part-progress-live')).toHaveText('20%');
  await page.getByTestId('reset-assembly').click();
  await expect(page.getByTestId('part-progress-live')).toHaveText('0%');

  await setPartProgress(page, 400);
  const search = page.getByLabel('搜索相机部件');
  await search.focus();
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('part-progress-live')).toHaveText('40%');
  await page.getByTestId('undo-move').focus();
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('part-progress-live')).toHaveText('0%');

  await selectPart(page, 'Z50II-04-001');
  await expect(page.getByTestId('part-name-zh')).toHaveText('主电路板');
  const warning = page.getByTestId('dependency-warning');
  await expect(warning).toHaveAttribute('data-locked', 'true');
  await expect(warning).toContainText('影像处理器封装');
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 130, centerY - 100, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('part-progress-live')).toHaveText('0%');
  await setPartProgress(page, 500);
  await expect(page.getByTestId('part-progress')).toHaveValue('0');
  await expect(page.getByTestId('part-progress-live')).toHaveText('0%');
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
  await expect(page.getByTestId('part-progress-live')).toHaveText('0%');
  await page.getByTestId('undo-move').click();
  await expect(page.getByTestId('part-progress-live')).toHaveText('0%');

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
