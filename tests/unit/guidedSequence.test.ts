import { describe, expect, it } from 'vitest';

import productionManifestFixture from '../../public/assembly-manifest.json';
import { createAssemblyState, setGlobalExplode, undoLastMove } from '../../src/domain/assemblyState';
import { GuidedSequence } from '../../src/domain/guidedSequence';
import { parseManifest, type AssemblyManifest } from '../../src/domain/manifest';

const manifest = parseManifest(productionManifestFixture);

function singleStepManifest(): AssemblyManifest {
  return parseManifest({
    ...productionManifestFixture,
    modules: productionManifestFixture.modules.slice(0, 1),
    parts: [{
      ...productionManifestFixture.parts.find((part) => part.partId === 'Z50II-01-001')!,
      step: 1,
      dependsOn: [],
    }],
    steps: [{
      step: 1,
      titleZh: '拆卸主机架',
      titleEn: 'Remove chassis',
      partIds: ['Z50II-01-001'],
      cameraPreset: 'front',
    }],
  });
}

describe('guided sequence', () => {
  it('uses all 40 production steps and reverses to exact assembled progress', () => {
    expect(manifest.steps.map((step) => step.step)).toEqual(
      Array.from({ length: 40 }, (_, index) => index + 1),
    );
    const sequence = new GuidedSequence(manifest, createAssemblyState(manifest));

    sequence.seek(1);
    expect(sequence.snapshot().normalizedTime).toBe(1);
    expect(Object.values(sequence.snapshot().assembly.progress).every((progress) => progress === 1)).toBe(true);

    sequence.seek(0);
    expect(sequence.snapshot().normalizedTime).toBe(0);
    expect(Object.values(sequence.snapshot().assembly.progress).every((progress) => progress === 0)).toBe(true);
  });

  it('uses cubic ease-in-out and moves every part in a step together', () => {
    const sequence = new GuidedSequence(manifest, createAssemblyState(manifest));
    const firstStepTime = 0.25 / manifest.steps.length;
    sequence.seek(firstStepTime);

    const firstStepProgress = manifest.steps[0]!.partIds.map(
      (partId) => sequence.snapshot().assembly.progress[partId],
    );
    expect(firstStepProgress).toEqual(Array(firstStepProgress.length).fill(0.0625));
    expect(sequence.snapshot().assembly.progress[manifest.steps[1]!.partIds[0]!]).toBe(0);

    sequence.seek(0.75 / manifest.steps.length);
    expect(sequence.snapshot().assembly.progress[manifest.steps[0]!.partIds[0]!]).toBe(0.9375);
  });

  it('is deterministic for arbitrary tick chunks and auto-pauses at the end', () => {
    const oneChunk = new GuidedSequence(manifest, createAssemblyState(manifest), { stepDurationMs: 100 });
    const manyChunks = new GuidedSequence(manifest, createAssemblyState(manifest), { stepDurationMs: 100 });
    oneChunk.play();
    manyChunks.play();

    oneChunk.tick(4_000);
    [317, 83, 900, 1_100, 1_600].forEach((milliseconds) => manyChunks.tick(milliseconds));

    expect(oneChunk.snapshot()).toEqual(manyChunks.snapshot());
    expect(oneChunk.snapshot().normalizedTime).toBe(1);
    expect(oneChunk.snapshot().isPlaying).toBe(false);
  });

  it('reaches the exact endpoint for thousands of one-millisecond ticks', () => {
    const oneChunk = new GuidedSequence(manifest, createAssemblyState(manifest), { stepDurationMs: 100 });
    const tinyChunks = new GuidedSequence(manifest, createAssemblyState(manifest), { stepDurationMs: 100 });
    oneChunk.play();
    tinyChunks.play();

    oneChunk.tick(4_000);
    for (let index = 0; index < 4_000; index += 1) tinyChunks.tick(1);

    expect(tinyChunks.snapshot()).toEqual(oneChunk.snapshot());
    expect(tinyChunks.snapshot().normalizedTime).toBe(1);
    expect(tinyChunks.snapshot().isPlaying).toBe(false);
  });

  it('preserves fractional time across the exact reviewer partitions', () => {
    const oneChunk = new GuidedSequence(manifest, createAssemblyState(manifest), { stepDurationMs: 100 });
    const twoChunks = new GuidedSequence(manifest, createAssemblyState(manifest), { stepDurationMs: 100 });
    oneChunk.play();
    twoChunks.play();

    oneChunk.tick(16.6667);
    twoChunks.tick(8.33335);
    twoChunks.tick(8.33335);

    expect(twoChunks.snapshot().normalizedTime).toBe(oneChunk.snapshot().normalizedTime);
    expect(twoChunks.snapshot().assembly.progress).toEqual(oneChunk.snapshot().assembly.progress);
    expect(twoChunks.snapshot().isPlaying).toBe(oneChunk.snapshot().isPlaying);
  });

  it('publishes the same integer-microsecond time for the exact cumulative-rounding repro', () => {
    const chunks = [909.962542, 209.823401, 992.713704];
    const summedMilliseconds = chunks.reduce((total, chunk) => total + chunk, 0);
    const oneChunk = new GuidedSequence(manifest, createAssemblyState(manifest), { stepDurationMs: 100 });
    const partitioned = new GuidedSequence(manifest, createAssemblyState(manifest), { stepDurationMs: 100 });
    oneChunk.play();
    partitioned.play();

    oneChunk.tick(summedMilliseconds);
    chunks.forEach((chunk) => partitioned.tick(chunk));

    expect(summedMilliseconds).toBe(2_112.4996469999996);
    expect(partitioned.snapshot().normalizedTime).toBe(2_112_500 / 4_000_000);
    expect(partitioned.snapshot()).toEqual(oneChunk.snapshot());
  });

  it('does not auto-pause before cumulative time reaches the endpoint quantum', () => {
    const sequence = new GuidedSequence(manifest, createAssemblyState(manifest), { stepDurationMs: 100 });
    sequence.play();

    let elapsedMilliseconds = 0;
    for (let index = 0; index < 5_998; index += 1) {
      sequence.tick(0.6666665);
      elapsedMilliseconds += 0.6666665;
    }

    expect(sequence.snapshot().normalizedTime).toBeLessThan(1);
    expect(sequence.snapshot().isPlaying).toBe(true);
    sequence.tick(4_000 - elapsedMilliseconds);
    expect(sequence.snapshot().normalizedTime).toBe(1);
    expect(sequence.snapshot().isPlaying).toBe(false);
  });

  it('keeps varied partitions equivalent at a step boundary and the endpoint', () => {
    const partitionTenthsOfMicrosecond = (total: number, seed: number): number[] => {
      const chunks: number[] = [];
      let remaining = total;
      let value = seed >>> 0;
      while (remaining > 0) {
        value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
        const amount = Math.min(remaining, 1 + (value % 1_000_000));
        chunks.push(amount / 10_000);
        remaining -= amount;
      }
      return chunks;
    };
    const compareAt = (tenthsOfMicrosecond: number): void => {
      const single = new GuidedSequence(manifest, createAssemblyState(manifest), { stepDurationMs: 100 });
      const partitioned = new GuidedSequence(manifest, createAssemblyState(manifest), { stepDurationMs: 100 });
      const chunks = partitionTenthsOfMicrosecond(tenthsOfMicrosecond, 0x5a17);
      const summedMilliseconds = chunks.reduce((total, chunk) => total + chunk, 0);
      single.play();
      partitioned.play();
      single.tick(summedMilliseconds);
      chunks.forEach((chunk) => partitioned.tick(chunk));

      expect(partitioned.snapshot().normalizedTime).toBe(single.snapshot().normalizedTime);
      expect(partitioned.snapshot().assembly.progress).toEqual(single.snapshot().assembly.progress);
      expect(partitioned.snapshot().isPlaying).toBe(single.snapshot().isPlaying);
    };

    compareAt(1_000_000);
    compareAt(40_000_000);
  });

  it('resets cumulative time on seek and preserves it across pause and state replacement', () => {
    const sequence = new GuidedSequence(manifest, createAssemblyState(manifest), { stepDurationMs: 100 });
    sequence.play();
    sequence.tick(0.0006);
    sequence.seek(0);
    sequence.tick(0.0004);
    expect(sequence.snapshot().normalizedTime).toBe(0);

    sequence.seek(0);
    sequence.play();
    sequence.tick(0.0006);
    sequence.pause();
    sequence.replaceAssemblyState(sequence.snapshot().assembly);
    sequence.play();
    sequence.tick(Number.NaN);
    sequence.tick(-20);
    sequence.tick(0.0004);
    expect(sequence.snapshot().normalizedTime).toBe(1 / 4_000_000);
  });

  it('pauses without advancing and clamps seek values', () => {
    const sequence = new GuidedSequence(manifest, createAssemblyState(manifest));
    sequence.play();
    sequence.pause();
    sequence.tick(5_000);
    expect(sequence.snapshot().normalizedTime).toBe(0);
    sequence.seek(3);
    expect(sequence.snapshot().normalizedTime).toBe(1);
    sequence.seek(Number.NaN);
    expect(sequence.snapshot().normalizedTime).toBe(0);
  });

  it('moves next and previous between step boundaries after repeated reverse seeks', () => {
    const sequence = new GuidedSequence(manifest, createAssemblyState(manifest));
    sequence.seek(10.4 / 40);
    sequence.previous();
    expect(sequence.snapshot().normalizedTime).toBe(10 / 40);
    sequence.previous();
    expect(sequence.snapshot().normalizedTime).toBe(9 / 40);
    sequence.next();
    expect(sequence.snapshot().normalizedTime).toBe(10 / 40);
    sequence.seek(0.9);
    sequence.seek(0.1);
    sequence.seek(0.9);
    expect(sequence.snapshot().normalizedTime).toBe(0.9);
  });

  it('handles zero and one-step manifests without invalid playback state', () => {
    const oneStep = singleStepManifest();
    const sequence = new GuidedSequence(oneStep, createAssemblyState(oneStep), { stepDurationMs: 10 });
    sequence.next();
    expect(sequence.snapshot().normalizedTime).toBe(1);
    sequence.previous();
    expect(sequence.snapshot().normalizedTime).toBe(0);

    const empty = { ...oneStep, parts: [], steps: [] };
    const emptySequence = new GuidedSequence(empty, createAssemblyState(empty));
    emptySequence.play();
    emptySequence.tick(100);
    emptySequence.seek(1);
    expect(emptySequence.snapshot().normalizedTime).toBe(0);
    expect(emptySequence.snapshot().isPlaying).toBe(false);
  });

  it('isolates snapshots from internal progress and history', () => {
    const sequence = new GuidedSequence(manifest, createAssemblyState(manifest));
    sequence.seek(0.5);
    const snapshot = sequence.snapshot();
    const partId = manifest.parts[0]!.partId;

    expect(() => {
      (snapshot.assembly.progress as Record<string, number>)[partId] = 0.123;
    }).toThrow();
    expect(() => {
      (snapshot.assembly.history as unknown[]).push({});
    }).toThrow();
    expect(() => {
      snapshot.currentStep!.partIds.push('mutated');
    }).toThrow();
    expect(() => {
      snapshot.assembly.manifest.parts[0]!.dependsOn.push('mutated');
    }).toThrow();
    expect(sequence.snapshot().assembly.progress[partId]).not.toBe(0.123);
    expect(sequence.snapshot().currentStep!.partIds).not.toContain('mutated');
  });

  it('reconciles a mixed global state through dependency-safe reverse then forward ordering', () => {
    let mixed = setGlobalExplode(createAssemblyState(manifest), 0.8);
    mixed = {
      ...mixed,
      progress: {
        ...mixed.progress,
        [manifest.parts[0]!.partId]: 0.1,
        [manifest.parts.at(-1)!.partId]: 1,
      },
      history: [],
    };
    const sequence = new GuidedSequence(manifest, mixed);
    sequence.seek(0.5);
    const progress = sequence.snapshot().assembly.progress;
    for (const part of manifest.parts) {
      if (progress[part.partId]! > 0) {
        expect(part.dependsOn.every((dependencyId) => progress[dependencyId] === 1)).toBe(true);
      }
    }
  });

  it('clears incompatible free-mode history on construction, replacement, and guided seek', () => {
    const partId = manifest.parts[0]!.partId;
    const prior = {
      ...createAssemblyState(manifest),
      progress: { ...createAssemblyState(manifest).progress, [partId]: 0.4 },
      history: [{ partId, from: 0, to: 0.4 }],
    };
    const sequence = new GuidedSequence(manifest, prior);
    expect(sequence.snapshot().assembly.history).toEqual([]);

    sequence.replaceAssemblyState({
      ...prior,
      progress: { ...prior.progress, [partId]: 0.7 },
      history: [{ partId, from: 0.4, to: 0.7 }],
    });
    sequence.seek(0.5);
    const guided = sequence.snapshot().assembly;
    const afterUndo = undoLastMove(guided);

    expect(guided.history).toEqual([]);
    expect(afterUndo.progress).toEqual(guided.progress);
  });
});
