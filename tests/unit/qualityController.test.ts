import { describe, expect, it, vi } from 'vitest';

import {
  AdaptiveQualityController,
  QUALITY_PROFILES,
  chooseAutoQuality,
} from '../../src/viewer/qualityController';

describe('chooseAutoQuality', () => {
  it('uses exactly 120 moving-frame samples and strict hysteresis thresholds', () => {
    expect(chooseAutoQuality(Array(119).fill(23), 'high')).toBe('high');
    expect(chooseAutoQuality(Array(120).fill(23), 'high')).toBe('low');
    expect(chooseAutoQuality(Array(120).fill(16), 'low')).toBe('high');
    expect(chooseAutoQuality(Array(120).fill(22.2), 'high')).toBe('high');
    expect(chooseAutoQuality(Array(120).fill(16.7), 'low')).toBe('low');
    expect(chooseAutoQuality(Array(120).fill(19), 'low')).toBe('low');
  });

  it('uses the median rather than a mean distorted by outliers', () => {
    expect(chooseAutoQuality([
      ...Array(61).fill(16),
      ...Array(59).fill(100),
    ], 'low')).toBe('high');
  });
});

describe('AdaptiveQualityController', () => {
  it('starts auto at high, samples only moving frames, and changes at most once per 10 seconds', () => {
    const onChange = vi.fn();
    const controller = new AdaptiveQualityController(onChange);

    expect(controller.mode).toBe('auto');
    expect(controller.effectiveQuality).toBe('high');

    for (let index = 0; index < 120; index += 1) {
      controller.observeFrame(23, false, index * 20);
    }
    expect(controller.sampleCount).toBe(0);

    for (let index = 0; index < 120; index += 1) {
      controller.observeFrame(23, true, index * 20);
    }
    expect(controller.effectiveQuality).toBe('low');
    expect(onChange).toHaveBeenCalledWith('low');

    for (let index = 0; index < 120; index += 1) {
      controller.observeFrame(16, true, 3_000 + index * 20);
    }
    expect(controller.effectiveQuality).toBe('low');

    for (let index = 0; index < 120; index += 1) {
      controller.observeFrame(16, true, 12_000 + index * 20);
    }
    expect(controller.effectiveQuality).toBe('high');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('applies explicit profiles immediately and restarts auto from high', () => {
    const onChange = vi.fn();
    const controller = new AdaptiveQualityController(onChange);

    controller.setMode('low');
    expect(controller.effectiveQuality).toBe('low');
    controller.setMode('auto');
    expect(controller.effectiveQuality).toBe('high');
    expect(controller.sampleCount).toBe(0);
  });
});

describe('quality profiles', () => {
  it('defines the required rendering budgets without changing assembly semantics', () => {
    expect(QUALITY_PROFILES.high).toEqual({
      quality: 'high',
      pixelRatioCap: 2,
      shadowMapSize: 2048,
      aoEnabled: true,
      aoIntensity: 0.72,
      aoSamples: 16,
      environmentIntensity: 1,
    });
    expect(QUALITY_PROFILES.low).toEqual({
      quality: 'low',
      pixelRatioCap: 1.25,
      shadowMapSize: 1024,
      aoEnabled: true,
      aoIntensity: 0.28,
      aoSamples: 8,
      environmentIntensity: 0.55,
    });
  });
});
