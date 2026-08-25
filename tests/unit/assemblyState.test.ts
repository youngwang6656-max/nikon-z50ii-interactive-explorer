import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/assembly-manifest.valid.json';
import {
  canMovePart, createAssemblyState, getPartOffset,
  resetAssembly, setGlobalExplode, setPartProgress, undoLastMove,
} from '../../src/domain/assemblyState';
import { parseManifest } from '../../src/domain/manifest';

const manifest = parseManifest(fixture);

describe('assembly state', () => {
  it('blocks a dependent part until prerequisites are fully removed', () => {
    let state = createAssemblyState(manifest);
    const first = manifest.parts[0]!;
    const second = manifest.parts[1]!;
    expect(canMovePart(state, second.partId).allowed).toBe(false);
    state = setPartProgress(state, first.partId, 1);
    expect(canMovePart(state, second.partId).allowed).toBe(true);
  });

  it('clamps progress and converts it to an offset', () => {
    const part = manifest.parts[0]!;
    const state = setPartProgress(createAssemblyState(manifest), part.partId, 2);
    expect(state.progress[part.partId]).toBe(1);
    expect(getPartOffset(state, part.partId)).toEqual([
      part.explodeAxis[0] * part.explodeDistance,
      part.explodeAxis[1] * part.explodeDistance,
      part.explodeAxis[2] * part.explodeDistance,
    ]);
  });

  it('supports global explode, undo, and reset', () => {
    const exploded = setGlobalExplode(createAssemblyState(manifest), 0.5);
    expect(Object.values(exploded.progress).every((value) => value === 0.5)).toBe(true);
    expect(undoLastMove(exploded).progress).not.toEqual(exploded.progress);
    expect(Object.values(resetAssembly(exploded).progress).every((value) => value === 0)).toBe(true);
  });

  it('does not mutate prior states and allows a part to return before its dependency', () => {
    const first = manifest.parts[0]!;
    const second = manifest.parts[1]!;
    const initial = createAssemblyState(manifest);
    const openedFirst = setPartProgress(initial, first.partId, 1);
    const openedSecond = setPartProgress(openedFirst, second.partId, 0.5);
    const returnedSecond = setPartProgress(openedSecond, second.partId, 0);

    expect(initial.progress[first.partId]).toBe(0);
    expect(openedFirst.history).toEqual([{ partId: first.partId, from: 0, to: 1 }]);
    expect(returnedSecond.progress[second.partId]).toBe(0);
    expect(returnedSecond.history.at(-1)).toEqual({ partId: second.partId, from: 0.5, to: 0 });
  });

  it('returns the prerequisites that prevent a forward move', () => {
    const second = manifest.parts[1]!;
    expect(canMovePart(createAssemblyState(manifest), second.partId)).toEqual({
      allowed: false,
      missingPartIds: [manifest.parts[0]!.partId],
    });
  });

  it('records global moves in dependency-safe order', () => {
    const assembled = createAssemblyState(manifest);
    const opened = setGlobalExplode(assembled, 1);
    expect(opened.history.map(({ partId }) => partId)).toEqual([
      manifest.parts[0]!.partId,
      manifest.parts[1]!.partId,
    ]);
    const closed = setGlobalExplode(opened, 0);
    expect(closed.history.slice(-2).map(({ partId }) => partId)).toEqual([
      manifest.parts[1]!.partId,
      manifest.parts[0]!.partId,
    ]);
  });

  it('uses dependency order when manifest steps disagree with prerequisites', () => {
    const graphWithDifferentSteps = structuredClone(fixture);
    graphWithDifferentSteps.parts[0]!.step = 2;
    graphWithDifferentSteps.parts[1]!.step = 1;
    graphWithDifferentSteps.steps[0]!.partIds = [graphWithDifferentSteps.parts[1]!.partId];
    graphWithDifferentSteps.steps[1]!.partIds = [graphWithDifferentSteps.parts[0]!.partId];
    const differentManifest = parseManifest(graphWithDifferentSteps);

    const exploded = setGlobalExplode(createAssemblyState(differentManifest), 1);
    expect(exploded.history.map(({ partId }) => partId)).toEqual([
      differentManifest.parts[0]!.partId,
      differentManifest.parts[1]!.partId,
    ]);
  });

  it('decreases parts above target before increasing parts below target', () => {
    const fullyExploded = setGlobalExplode(createAssemblyState(manifest), 1);
    const mixed = undoLastMove(fullyExploded);
    const adjusted = setGlobalExplode(mixed, 0.5);

    expect(adjusted.history.slice(-2).map(({ partId }) => partId)).toEqual([
      manifest.parts[0]!.partId,
      manifest.parts[1]!.partId,
    ]);
    expect(Object.values(adjusted.progress).every((value) => value === 0.5)).toBe(true);
  });
});
