import { expect, test, type Locator, type Page } from '@playwright/test';
import { evidenceDir } from './evidence-paths';

test.describe.configure({ timeout: 120_000 });

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

async function waitForCameraSettled(page: Page): Promise<void> {
  await page.locator('.app-shell').evaluate((root) => new Promise<void>((resolve, reject) => {
    const startedAt = performance.now();
    let stableFrames = 0;
    const observe = (): void => {
      const elapsed = performance.now() - startedAt;
      const active = (root as HTMLElement).dataset.cameraTweenActive === 'true';
      stableFrames = !active && elapsed >= 200 ? stableFrames + 1 : 0;
      if (stableFrames >= 4) {
        resolve();
        return;
      }
      if (elapsed >= 10_000) {
        reject(new Error('Camera did not reach a stable terminal state within 10 seconds.'));
        return;
      }
      requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  }));
}

async function captureAllPartTransforms(page: Page): Promise<string> {
  const serialized = await page.locator('.app-shell').getAttribute('data-all-part-transform-basis');
  expect(serialized).not.toBeNull();
  const transforms = JSON.parse(serialized!) as Record<string, number[]>;
  expect(Object.keys(transforms)).toHaveLength(100);
  for (const matrix of Object.values(transforms)) {
    expect(matrix).toHaveLength(16);
    expect(matrix.every(Number.isFinite)).toBe(true);
  }
  return serialized!;
}

interface HighlightMetrics {
  clippedActiveRatio: number;
  largestClippedComponentPixels: number;
  largestClippedComponentBounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
}

async function highlightMetrics(page: Page, target: Locator): Promise<HighlightMetrics> {
  const image = await target.screenshot({
    animations: 'disabled',
    path: `${evidenceDir}/task-16-browser-canvas.png`,
  });
  const dataUrl = `data:image/png;base64,${image.toString('base64')}`;
  return page.evaluate(async (source) => {
    const imageElement = new Image();
    imageElement.src = source;
    await imageElement.decode();
    const canvas = document.createElement('canvas');
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Unable to analyze the controlled visual baseline.');
    context.drawImage(imageElement, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let activePixels = 0;
    let clippedPixels = 0;
    const clippedMask = new Uint8Array(canvas.width * canvas.height);
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index]!;
      const green = pixels[index + 1]!;
      const blue = pixels[index + 2]!;
      if (Math.max(red, green, blue) <= 32) continue;
      activePixels += 1;
      if (red >= 250 && green >= 250 && blue >= 250) {
        clippedPixels += 1;
        clippedMask[index / 4] = 1;
      }
    }
    if (activePixels === 0) throw new Error('Visual baseline contains no active pixels.');
    let largestClippedComponentPixels = 0;
    let largestClippedComponentBounds: HighlightMetrics['largestClippedComponentBounds'] = null;
    const stack: number[] = [];
    for (let seed = 0; seed < clippedMask.length; seed += 1) {
      if (clippedMask[seed] === 0) continue;
      clippedMask[seed] = 0;
      stack.push(seed);
      let componentPixels = 0;
      let minX = canvas.width;
      let minY = canvas.height;
      let maxX = 0;
      let maxY = 0;
      while (stack.length > 0) {
        const pixel = stack.pop()!;
        const x = pixel % canvas.width;
        const y = Math.floor(pixel / canvas.width);
        componentPixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        const neighbors = [
          x > 0 ? pixel - 1 : -1,
          x + 1 < canvas.width ? pixel + 1 : -1,
          y > 0 ? pixel - canvas.width : -1,
          y + 1 < canvas.height ? pixel + canvas.width : -1,
        ];
        for (const neighbor of neighbors) {
          if (neighbor < 0 || clippedMask[neighbor] === 0) continue;
          clippedMask[neighbor] = 0;
          stack.push(neighbor);
        }
      }
      if (componentPixels > largestClippedComponentPixels) {
        largestClippedComponentPixels = componentPixels;
        largestClippedComponentBounds = { minX, minY, maxX, maxY };
      }
    }
    return {
      clippedActiveRatio: clippedPixels / activePixels,
      largestClippedComponentPixels,
      largestClippedComponentBounds,
    };
  }, dataUrl);
}

test('guided disassembly restores the exact 16-element transforms of all 100 parts', async ({ page, browser }, testInfo) => {
  console.log(`[acceptance] ${testInfo.project.name} browser ${browser.version()}`);
  const errors = captureUnexpectedErrors(page);
  await page.goto('/');
  await page.getByTestId('load-all-modules').click();
  await expect(page.locator('.load-progress')).toHaveText('8 / 8', { timeout: 30_000 });
  await expect(page.locator('[data-testid^="part-Z50II-"]')).toHaveCount(100);
  const root = page.locator('.app-shell');
  const assembledTransforms = await captureAllPartTransforms(page);
  await setRange(page, 'guided-progress', 1000);
  await expect(root).toHaveAttribute('data-assembly-progress', '1');
  await page.getByTestId('camera-preset-three-quarter').click();
  await waitForCameraSettled(page);
  await page.screenshot({ path: `${evidenceDir}/task-16-browser-exploded.png` });
  await setRange(page, 'guided-progress', 0);
  await expect(root).toHaveAttribute('data-assembly-progress', '0');
  expect(await captureAllPartTransforms(page)).toBe(assembledTransforms);
  expect(errors).toEqual([]);
});

test('final interaction workflow covers locks, free undo, visibility, cutaway, lighting, and calibrated visuals', async ({ page, browser }, testInfo) => {
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
  await waitForCameraSettled(page);
  const canvas = page.locator('.viewer-canvas');
  const highlights = await highlightMetrics(page, canvas);
  console.log(`[acceptance] ${testInfo.project.name} highlight metrics ${JSON.stringify(highlights)}`);
  expect(highlights.clippedActiveRatio).toBeLessThanOrEqual(0.06);
  expect(highlights.largestClippedComponentPixels).toBeLessThanOrEqual(512);
  await expect(canvas).toHaveScreenshot('z50ii-assembled-studio.png', {
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
  await expect.poll(async () => page.locator(
    '.module-group[data-status="ready"], .module-group[data-status="failed"]',
  ).count()).toBe(8);
  await expect(page.locator('.module-group[data-status="failed"]')).toHaveCount(1);
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
