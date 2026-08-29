import { describe, expect, it } from 'vitest';

import productionManifestFixture from '../../public/assembly-manifest.json';
import { createAssemblyState, setGlobalExplode } from '../../src/domain/assemblyState';
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
});
