import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';

import productionManifestFixture from '../../public/assembly-manifest.json';
import { createAssemblyState, setGlobalExplode } from '../../src/domain/assemblyState';
import { parseManifest } from '../../src/domain/manifest';
import { GuidedPartTransforms } from '../../src/viewer/guidedPartTransforms';

const manifest = parseManifest(productionManifestFixture);

describe('guided part transforms', () => {
  it('always derives position from the stored assembled transform and restores the exact matrix', () => {
    const part = manifest.parts[0]!;
    const object = new Object3D();
    object.position.set(0.013, -0.027, 0.041);
    object.rotation.set(0.1, -0.2, 0.3);
    object.scale.set(0.7, 1.2, 0.9);
    object.updateMatrix();
    const assembledMatrix = object.matrix.clone();
    const assembledQuaternion = object.quaternion.clone();
    const assembledScale = object.scale.clone();
    const index = new Map([[part.partId, object]]);
    const transforms = new GuidedPartTransforms(manifest);

    transforms.apply(setGlobalExplode(createAssemblyState(manifest), 1), index);
    const explodedPosition = object.position.clone();
    transforms.apply(setGlobalExplode(createAssemblyState(manifest), 0.3), index);
    transforms.apply(setGlobalExplode(createAssemblyState(manifest), 1), index);
    expect(object.position.equals(explodedPosition)).toBe(true);
    expect(object.quaternion.equals(assembledQuaternion)).toBe(true);
    expect(object.scale.equals(assembledScale)).toBe(true);

    transforms.apply(createAssemblyState(manifest), index);
    expect(object.matrix.elements).toEqual(assembledMatrix.elements);
  });

  it('captures late-loaded module parts at their own exact assembled positions', () => {
    const transforms = new GuidedPartTransforms(manifest);
    const state = setGlobalExplode(createAssemblyState(manifest), 1);
    const index = new Map<string, Object3D>();
    transforms.apply(state, index);

    const latePart = manifest.parts.find((part) => part.moduleId === '08_io_flex_fasteners')!;
    const lateObject = new Object3D();
    lateObject.position.set(-0.031, 0.009, 0.012);
    lateObject.updateMatrix();
    lateObject.matrixAutoUpdate = false;
    const assembled = lateObject.position.clone();
    index.set(latePart.partId, lateObject);
    transforms.apply(state, index);

    expect(lateObject.position.toArray()).toEqual([
      assembled.x + latePart.explodeAxis[0] * latePart.explodeDistance,
      assembled.y + latePart.explodeAxis[1] * latePart.explodeDistance,
      assembled.z + latePart.explodeAxis[2] * latePart.explodeDistance,
    ]);
    expect(lateObject.matrix.elements[12]).toBeCloseTo(lateObject.position.x, 12);
    expect(lateObject.matrix.elements[13]).toBeCloseTo(lateObject.position.y, 12);
    expect(lateObject.matrix.elements[14]).toBeCloseTo(lateObject.position.z, 12);
  });
});
