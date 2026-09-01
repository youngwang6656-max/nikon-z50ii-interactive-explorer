import { expect, test } from '@playwright/test';
import { performancePath } from './evidence-paths';

const VIEWPORT = { width: 1920, height: 1080 } as const;
const REPETITIONS = 3;
// These are hardware-tolerant regression guards, not the design's soft 45 FPS quality target.
const MINIMUM_ORBIT_FPS = 20;
const MINIMUM_FULL_EXPLOSION_FPS = 15;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function rounded(value: number): number {
  return Number(value.toFixed(3));
}

test('measures the rebuilt viewer honestly at 1920x1080', async ({ page, browser }, testInfo) => {
  test.setTimeout(240_000);
  await page.setViewportSize(VIEWPORT);

  const runs: Array<{
    repetition: number;
    cacheState: 'cold' | 'warm';
    initialLoadMs: number;
    allModulesLoadMs: number;
    medianOrbitFps: number;
    orbitMovementFrames: number;
    orbitPointerMoves: number;
    orbitInputDurationMs: number;
    minimumFullExplosionFps: number;
  }> = [];
  let sceneMetrics: {
    profile: string;
    triangles: number;
    textureBytes: number | null;
    textureBytesUnavailableReason: string | null;
  } | null = null;
  let gpu: { renderer: string | null; unavailableReason: string | null } | null = null;

  for (let repetition = 0; repetition < REPETITIONS; repetition += 1) {
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
    sceneMetrics = await root.evaluate((element) => {
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

    gpu = await page.locator('.viewer-canvas').evaluate((canvas) => {
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
    const orbitMeasurement = page.evaluate(() => new Promise<{
      timestamps: number[];
      pointerMoves: number;
      inputDurationMs: number;
    }>((resolveMeasurement) => {
      const canvasElement = document.querySelector<HTMLCanvasElement>('.viewer-canvas');
      if (!canvasElement) {
        resolveMeasurement({ timestamps: [], pointerMoves: 0, inputDurationMs: 0 });
        return;
      }
      const timestamps: number[] = [];
      let dragging = false;
      let pointerMoves = 0;
      let firstMoveAt: number | null = null;
      let lastMoveAt: number | null = null;

      const cleanup = (): void => {
        canvasElement.removeEventListener('pointerdown', onPointerDown);
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        delete canvasElement.dataset.performanceOrbitReady;
      };
      const onPointerDown = (): void => {
        dragging = true;
      };
      const onPointerMove = (event: PointerEvent): void => {
        if (!dragging || (event.buttons & 1) === 0) return;
        const now = performance.now();
        firstMoveAt ??= now;
        lastMoveAt = now;
        pointerMoves += 1;
      };
      const onPointerUp = (): void => {
        dragging = false;
        requestAnimationFrame(() => {
          cleanup();
          resolveMeasurement({
            timestamps,
            pointerMoves,
            inputDurationMs: firstMoveAt !== null && lastMoveAt !== null
              ? lastMoveAt - firstMoveAt
              : 0,
          });
        });
      };
      const collectMovementFrame = (timestamp: number): void => {
        if (dragging && lastMoveAt !== null && performance.now() - lastMoveAt <= 100) {
          timestamps.push(timestamp);
        }
        if (dragging || timestamps.length === 0) requestAnimationFrame(collectMovementFrame);
      };

      canvasElement.addEventListener('pointerdown', onPointerDown);
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
      canvasElement.dataset.performanceOrbitReady = 'true';
      requestAnimationFrame(collectMovementFrame);
    }));
    await expect(canvas).toHaveAttribute('data-performance-orbit-ready', 'true');
    await page.mouse.move(box!.x + box!.width * 0.35, box!.y + box!.height * 0.5);
    await page.mouse.down();
    for (let step = 0; step < 180; step += 1) {
      const progress = step / 179;
      await page.mouse.move(
        box!.x + box!.width * (0.35 + progress * 0.3),
        box!.y + box!.height * (0.5 + Math.sin(step / 10) * 0.12),
      );
      await page.waitForTimeout(10);
    }
    await page.mouse.up();
    const orbit = await orbitMeasurement;
    const orbitFpsSamples = orbit.timestamps.slice(1).map((time, index) =>
      1_000 / (time - orbit.timestamps[index]!),
    ).filter(Number.isFinite);
    expect(orbit.pointerMoves).toBeGreaterThanOrEqual(170);
    expect(orbit.timestamps.length).toBeGreaterThanOrEqual(30);
    expect(orbit.timestamps.length).toBeGreaterThan(orbit.pointerMoves);

    const explosionFpsSamples = await page.getByTestId('global-explode').evaluate(
      (element) => new Promise<number[]>((resolveSamples) => {
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
          else resolveSamples(fps);
        };
        requestAnimationFrame(animate);
      }),
    );

    runs.push({
      repetition: repetition + 1,
      cacheState: repetition === 0 ? 'cold' : 'warm',
      initialLoadMs: rounded(initialLoadMs),
      allModulesLoadMs: rounded(allModulesLoadMs),
      medianOrbitFps: rounded(median(orbitFpsSamples)),
      orbitMovementFrames: orbit.timestamps.length,
      orbitPointerMoves: orbit.pointerMoves,
      orbitInputDurationMs: rounded(orbit.inputDurationMs),
      minimumFullExplosionFps: rounded(Math.min(...explosionFpsSamples)),
    });
  }

  expect(sceneMetrics).not.toBeNull();
  expect(gpu).not.toBeNull();
  const result = {
    browser: testInfo.project.name === 'chrome'
      ? 'Chrome'
      : testInfo.project.name === 'edge'
        ? 'Edge'
        : testInfo.project.name,
    browserVersion: browser.version(),
    gpuRenderer: gpu!.renderer,
    gpuRendererUnavailableReason: gpu!.unavailableReason,
    viewport: VIEWPORT,
    profile: sceneMetrics!.profile,
    triangles: sceneMetrics!.triangles,
    textureBytes: sceneMetrics!.textureBytes,
    textureBytesUnavailableReason: sceneMetrics!.textureBytesUnavailableReason,
    repetitions: REPETITIONS,
    runs,
    initialLoadMs: rounded(median(runs.map((run) => run.initialLoadMs))),
    allModulesLoadMs: rounded(median(runs.map((run) => run.allModulesLoadMs))),
    medianOrbitFps: rounded(median(runs.map((run) => run.medianOrbitFps))),
    minimumFullExplosionFps: rounded(Math.min(
      ...runs.map((run) => run.minimumFullExplosionFps),
    )),
  };

  expect(result.profile).toBe('high');
  expect(result.triangles).toBeGreaterThan(0);
  expect(result.medianOrbitFps).toBeGreaterThanOrEqual(MINIMUM_ORBIT_FPS);
  expect(result.minimumFullExplosionFps).toBeGreaterThanOrEqual(
    MINIMUM_FULL_EXPLOSION_FPS,
  );

  // The project intentionally has no @types/node dependency, while Playwright runs this file in Node.
  // @ts-expect-error Node's runtime module is available to Playwright.
  const { readFile, writeFile } = await import('node:fs/promises');
  let priorResults: unknown[] = [];
  if (testInfo.project.name === 'edge') {
    try {
      const prior = JSON.parse(await readFile(performancePath, 'utf8')) as {
        results?: unknown[];
      };
      priorResults = prior.results ?? [];
    } catch {
      priorResults = [];
    }
  }
  const report = {
    schemaVersion: 2,
    generatedBy: 'tests/e2e/task15-performance.spec.ts',
    measuredAt: new Date().toISOString(),
    methodology: {
      viewport: VIEWPORT,
      browserMode: 'Installed browser channel in Playwright headless mode; the reported WebGL renderer identifies the actual GPU path',
      profile: 'high',
      repetitions: REPETITIONS,
      cacheStates: 'Run 1 uses the fresh Playwright browser context HTTP cache (cold); runs 2-3 reload in the same context (warm). The preview server and operating-system file cache may already be warm.',
      summaryStatistic: 'Median of three per-run values, except minimumFullExplosionFps is the minimum observed across all three runs',
      initialLoadDefinition: 'Navigation start until both preload modules report ready',
      allModulesLoadDefinition: 'Load-all activation until all eight modules report ready',
      orbitDefinition: 'Median requestAnimationFrame FPS during an active primary-button orbit, gated to frames no more than 100 ms after the latest pointer move; 180 pointer moves use a 10 ms minimum pacing delay across the measured interval, actual input duration is recorded, and post-input stationary frames are excluded',
      fullExplosionDefinition: 'Minimum requestAnimationFrame FPS while advancing the full-explosion slider across 90 frames',
      regressionFloors: {
        medianOrbitFps: MINIMUM_ORBIT_FPS,
        minimumFullExplosionFps: MINIMUM_FULL_EXPLOSION_FPS,
        rationale: 'Hardware-tolerant hard floors catch severe regressions; 45 FPS remains a soft quality target rather than a universal pass criterion',
      },
      textureBytesDefinition: 'Sum of unique decoded texture width x height x 4 bytes in loaded module materials',
    },
    results: [
      ...priorResults.filter((candidate) =>
        typeof candidate !== 'object'
        || candidate === null
        || (candidate as { browser?: string }).browser !== result.browser,
      ),
      result,
    ],
  };
  await writeFile(performancePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`PERFORMANCE_RESULT ${JSON.stringify(result)}`);
});
