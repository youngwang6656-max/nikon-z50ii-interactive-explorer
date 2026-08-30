import type { QualityLevel } from '../domain/manifest';

export type QualityMode = QualityLevel | 'auto';

export interface QualityProfile {
  readonly quality: QualityLevel;
  readonly pixelRatioCap: number;
  readonly shadowMapSize: number;
  readonly aoEnabled: boolean;
  readonly aoIntensity: number;
  readonly aoSamples: number;
  readonly environmentIntensity: number;
}

export const AUTO_SAMPLE_COUNT = 120;
export const AUTO_CHANGE_COOLDOWN_MS = 10_000;

export const QUALITY_PROFILES: Readonly<Record<QualityLevel, QualityProfile>> = {
  high: Object.freeze({
    quality: 'high',
    pixelRatioCap: 2,
    shadowMapSize: 2048,
    aoEnabled: true,
    aoIntensity: 0.72,
    aoSamples: 16,
    environmentIntensity: 1,
  }),
  low: Object.freeze({
    quality: 'low',
    pixelRatioCap: 1.25,
    shadowMapSize: 1024,
    aoEnabled: true,
    aoIntensity: 0.28,
    aoSamples: 8,
    environmentIntensity: 0.55,
  }),
};

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

/**
 * The intermediate band is intentional hysteresis: medians in
 * [16.7 ms, 22.2 ms] retain the current profile instead of oscillating.
 */
export function chooseAutoQuality(
  movingFrameTimes: readonly number[],
  current: QualityLevel = 'high',
): QualityLevel {
  if (movingFrameTimes.length < AUTO_SAMPLE_COUNT) return current;
  const sampleMedian = median(movingFrameTimes.slice(-AUTO_SAMPLE_COUNT));
  if (sampleMedian > 22.2) return 'low';
  if (sampleMedian < 16.7) return 'high';
  return current;
}

export class AdaptiveQualityController {
  private readonly samples: number[] = [];
  private currentMode: QualityMode = 'auto';
  private currentQuality: QualityLevel = 'high';
  private lastChangeAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly onChange: (quality: QualityLevel) => void) {}

  get mode(): QualityMode {
    return this.currentMode;
  }

  get effectiveQuality(): QualityLevel {
    return this.currentQuality;
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  setMode(mode: QualityMode, now = performance.now()): void {
    this.currentMode = mode;
    this.samples.length = 0;
    const requested = mode === 'auto' ? 'high' : mode;
    this.apply(requested, now, false);
  }

  observeFrame(frameTimeMs: number, cameraMoving: boolean, now: number): void {
    if (this.currentMode !== 'auto' || !cameraMoving || !Number.isFinite(frameTimeMs)) return;
    this.samples.push(Math.max(0, frameTimeMs));
    if (this.samples.length < AUTO_SAMPLE_COUNT) return;
    const requested = chooseAutoQuality(this.samples, this.currentQuality);
    this.samples.length = 0;
    this.apply(requested, now, true);
  }

  private apply(quality: QualityLevel, now: number, respectCooldown: boolean): void {
    if (quality === this.currentQuality) return;
    if (respectCooldown && now - this.lastChangeAt < AUTO_CHANGE_COOLDOWN_MS) return;
    this.currentQuality = quality;
    this.lastChangeAt = now;
    this.onChange(quality);
  }
}
