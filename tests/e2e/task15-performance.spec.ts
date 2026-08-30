import { expect, test } from '@playwright/test';

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

test('measures the rebuilt viewer honestly at 1920x1080', async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const navigationStarted = performance.now();
  await page.goto('/');
  await expect(page.locator('.load-progress')).toHaveText('2 / 8', { timeout: 30_000 });
  const initialLoadMs = performance.now() - navigationStarted;

  await page.getByTestId('quality-profile').selectOption('high');
  const allLoadStarted = performance.now();
  await page.getByTestId('load-all-modules').click();
  await expect(page.locator('.load-progress')).toHaveText('8 / 8', { timeout: 30_000 });
  const allModulesLoadMs = performance.now() - allLoadStarted;

  const root = page.locator('.app-shell');
  const sceneMetrics = await root.evaluate((element) => {
    const rootElement = element as HTMLElement;
    const textureBytes = rootElement.dataset.textureBytes;
    return {
      profile: rootElement.dataset.qualityEffective ?? 'unavailable',
      triangles: Number(rootElement.dataset.totalTriangles ?? '0'),
      textureBytes: textureBytes === 'unavailable'
        ? null
        : Number(textureBytes ?? '0'),
      textureBytesUnavailableReason:
        rootElement.dataset.textureBytesUnavailableReason ?? null,
    };
  });

  const gpu = await page.locator('.viewer-canvas').evaluate((canvas) => {
    const gl = (canvas as HTMLCanvasElement).getContext('webgl2');
    if (!gl) return { renderer: null, unavailableReason: 'WebGL2 context unavailable' };
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    if (debug) {
      return {
        renderer: String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)),
        unavailableReason: null,
      };
    }
    const renderer = gl.getParameter(gl.RENDERER);
    return renderer
      ? { renderer: String(renderer), unavailableReason: null }
      : { renderer: null, unavailableReason: 'GPU renderer parameter unavailable' };
  });

  const canvas = page.locator('.viewer-canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const orbitFrames = page.evaluate(() => new Promise<number[]>((resolve) => {
    const times: number[] = [];
    const started = performance.now();
    const collect = (timestamp: number): void => {
      times.push(timestamp);
      if (timestamp - started >= 2_000) resolve(times);
      else requestAnimationFrame(collect);
    };
    requestAnimationFrame(collect);
  }));
  await page.mouse.move(box!.x + box!.width * 0.4, box!.y + box!.height * 0.5);
  await page.mouse.down();
  for (let step = 0; step < 90; step += 1) {
    await page.mouse.move(
      box!.x + box!.width * (0.4 + step / 450),
      box!.y + box!.height * (0.5 + Math.sin(step / 8) * 0.08),
    );
  }
  await page.mouse.up();
  const orbitTimes = await orbitFrames;
  const orbitFpsSamples = orbitTimes.slice(1).map((time, index) =>
    1_000 / (time - orbitTimes[index]!),
  ).filter(Number.isFinite);

  const explosionFpsSamples = await page.getByTestId('global-explode').evaluate(
    (element) => new Promise<number[]>((resolve) => {
      const input = element as HTMLInputElement;
      const fps: number[] = [];
      let frame = 0;
      let previous: number | null = null;
      const animate = (timestamp: number): void => {
        if (previous !== null && timestamp > previous) fps.push(1_000 / (timestamp - previous));
        previous = timestamp;
        input.value = String(Math.round((frame / 89) * 1000));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        frame += 1;
        if (frame < 90) requestAnimationFrame(animate);
        else resolve(fps);
      };
      requestAnimationFrame(animate);
    }),
  );

  const result = {
    browser: testInfo.project.name,
    browserVersion: browser.version(),
    gpuRenderer: gpu.renderer,
    gpuRendererUnavailableReason: gpu.unavailableReason,
    viewport: { width: 1920, height: 1080 },
    profile: sceneMetrics.profile,
    triangles: sceneMetrics.triangles,
    textureBytes: sceneMetrics.textureBytes,
    textureBytesUnavailableReason: sceneMetrics.textureBytesUnavailableReason,
    initialLoadMs: Number(initialLoadMs.toFixed(3)),
    allModulesLoadMs: Number(allModulesLoadMs.toFixed(3)),
    medianOrbitFps: Number(median(orbitFpsSamples).toFixed(3)),
    minimumFullExplosionFps: Number(Math.min(...explosionFpsSamples).toFixed(3)),
  };
  console.log(`PERFORMANCE_RESULT ${JSON.stringify(result)}`);

  expect(result.profile).toBe('high');
  expect(result.triangles).toBeGreaterThan(0);
  expect(result.medianOrbitFps).toBeGreaterThan(0);
  expect(result.minimumFullExplosionFps).toBeGreaterThan(0);
});
