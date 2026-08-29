import { expect, test } from '@playwright/test';

const evidenceDir = '.superpowers/sdd/2026-08-25-nikon-z50ii-interactive-exploded-model';

async function selectPart(page: import('@playwright/test').Page, partId: string): Promise<void> {
  await page.getByLabel('搜索相机部件').fill(partId);
  await page.getByTestId(`part-${partId}`).click();
  await expect(page.getByTestId('part-name-zh')).toBeVisible({ timeout: 30_000 });
}

test('inspection tools compose reversibly and expose six fitted camera presets', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/');
  await expect(page.locator('.load-progress')).toHaveText('2 / 8', { timeout: 30_000 });
  await selectPart(page, 'Z50II-02-001');

  for (const preset of ['front', 'rear', 'left', 'right', 'top', 'three-quarter']) {
    await expect(page.getByTestId(`camera-preset-${preset}`)).toBeVisible();
  }
  await page.getByTestId('camera-preset-front').click();
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${evidenceDir}/task-14-camera-front.png` });

  await page.getByTestId('ghost-selected').click();
  await expect(page.getByTestId('ghost-selected')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('isolate-selected').click();
  await expect(page.getByTestId('isolate-selected')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: `${evidenceDir}/task-14-ghost-isolate.png` });
  await page.getByTestId('visibility-reset').click();
  await expect(page.getByTestId('ghost-selected')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('isolate-selected')).toHaveAttribute('aria-pressed', 'false');

  await page.getByTestId('camera-preset-three-quarter').click();
  await page.waitForTimeout(650);
  await page.getByTestId('cutaway-axis').selectOption('x');
  await page.getByTestId('cutaway-offset').evaluate((input) => {
    (input as HTMLInputElement).value = '0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.getByTestId('cutaway-toggle').click();
  await expect(page.getByTestId('cutaway-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: `${evidenceDir}/task-14-cutaway.png` });
  await page.getByTestId('cutaway-toggle').click();
  await expect(page.getByTestId('cutaway-toggle')).toHaveAttribute('aria-pressed', 'false');

  await page.getByTestId('lighting-preset').selectOption('inspection');
  await expect(page.getByTestId('lighting-preset')).toHaveValue('inspection');
  await page.screenshot({ path: `${evidenceDir}/task-14-inspection-lighting.png` });

  await page.getByTestId('lighting-preset').selectOption('studio');
  expect(errors).toEqual([]);
});
