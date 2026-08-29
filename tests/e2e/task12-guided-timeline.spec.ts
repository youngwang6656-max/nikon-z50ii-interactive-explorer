import { expect, test } from '@playwright/test';

const evidenceDir = '.superpowers/sdd/2026-08-25-nikon-z50ii-interactive-exploded-model';

async function setRange(page: import('@playwright/test').Page, testId: string, value: number): Promise<void> {
  await page.getByTestId(testId).evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    input.value = String(nextValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

test('guided timeline moves forward and reverse, coordinates loading, and reassembles exactly', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.locator('.load-progress')).toHaveText('2 / 8', { timeout: 30_000 });
  const root = page.locator('.app-shell');
  await expect(root).toHaveAttribute('data-assembly-progress', '0');
  await expect(page.getByTestId('mode-guided')).toHaveValue('guided');
  await expect(page.getByTestId('guided-play')).toHaveAccessibleName('播放拆解序列');
  await expect(page.getByTestId('guided-step-title')).toContainText('拆卸');
  await expect(page.getByLabel('整体爆炸进度')).toBeVisible();

  await page.getByTestId('guided-next').click();
  await expect(root).toHaveAttribute('data-assembly-progress', '0.025');
  await expect(page.locator('.timeline-count')).toHaveText('01 / 40');
  await expect(page.locator('.load-progress')).toHaveText('8 / 8', { timeout: 30_000 });

  await page.getByLabel('搜索相机部件').fill('Z50II-08-011');
  await page.getByTestId('part-Z50II-08-011').click();
  await expect(page.getByTestId('part-progress')).toHaveText('100%');

  await setRange(page, 'guided-progress', 1000);
  await expect(root).toHaveAttribute('data-assembly-progress', '1');
  await expect(page.locator('.timeline-count')).toHaveText('40 / 40');
  await expect(page.getByTestId('part-progress')).toHaveText('100%');
  await expect(root).toHaveAttribute('data-camera-tween-active', 'false');
  await page.screenshot({ path: `${evidenceDir}/task-12-desktop-exploded.png` });

  await setRange(page, 'guided-progress', 0);
  await expect(root).toHaveAttribute('data-assembly-progress', '0');
  await expect(page.getByTestId('part-progress')).toHaveText('0%');

  await setRange(page, 'global-explode', 600);
  await expect(root).toHaveAttribute('data-assembly-progress', '0.6');
  await expect(page.getByTestId('part-progress')).toHaveText('60%');
  await setRange(page, 'global-explode', 0);
  await expect(root).toHaveAttribute('data-assembly-progress', '0');
  await expect(page.getByTestId('part-progress')).toHaveText('0%');

  await page.getByTestId('guided-play').click();
  await expect(page.getByTestId('guided-play')).toHaveAccessibleName('暂停拆解序列');
  await expect(root).toHaveAttribute('data-guided-playback-active', 'true');
  await expect(root).toHaveAttribute('data-free-drag-enabled', 'false');
  await page.getByTestId('guided-play').click();
  await expect(root).toHaveAttribute('data-guided-playback-active', 'false');
  await expect(root).toHaveAttribute('data-free-drag-enabled', 'true');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.timeline-panel').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('guided-progress')).toBeVisible();
  const metrics = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(metrics.width).toBeLessThanOrEqual(metrics.viewport);
  await page.screenshot({ path: `${evidenceDir}/task-12-mobile-timeline.png` });
  expect(errors).toEqual([]);
});
