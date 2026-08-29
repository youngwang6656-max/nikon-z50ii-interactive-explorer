import { Group, Object3D, Vector3 } from 'three';
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

  it('applies manifest offsets in world axes through a rotated and scaled parent', () => {
    const part = manifest.parts[0]!;
    const parent = new Group();
    parent.position.set(0.4, -0.2, 0.3);
    parent.rotation.set(0.3, 0.7, -0.2);
    parent.scale.set(1.5, 0.75, 2);
    const object = new Object3D();
    object.position.set(0.03, 0.04, -0.02);
    object.rotation.set(-0.2, 0.1, 0.4);
    object.scale.set(0.8, 1.1, 0.9);
    parent.add(object);
    parent.updateMatrixWorld(true);
    const assembledWorld = object.getWorldPosition(new Vector3());
    const assembledLocal = object.matrix.clone();
    const quaternion = object.quaternion.clone();
    const scale = object.scale.clone();
    const state = createAssemblyState(manifest);
    state.progress[part.partId] = 1;
    const transforms = new GuidedPartTransforms(manifest);

    transforms.apply(state, new Map([[part.partId, object]]));
    const explodedWorld = object.getWorldPosition(new Vector3());

    expect(explodedWorld.x).toBeCloseTo(assembledWorld.x + part.explodeAxis[0] * part.explodeDistance, 12);
    expect(explodedWorld.y).toBeCloseTo(assembledWorld.y + part.explodeAxis[1] * part.explodeDistance, 12);
    expect(explodedWorld.z).toBeCloseTo(assembledWorld.z + part.explodeAxis[2] * part.explodeDistance, 12);
    expect(object.quaternion.equals(quaternion)).toBe(true);
    expect(object.scale.equals(scale)).toBe(true);

    transforms.apply(createAssemblyState(manifest), new Map([[part.partId, object]]));
    expect(object.matrix.elements).toEqual(assembledLocal.elements);
  });

  it('gives nested indexed roots independent world offsets while ordinary descendants follow their host', () => {
    const parentPart = manifest.parts[0]!;
    const childPart = manifest.parts[1]!;
    const taggedParent = new Group();
    taggedParent.position.set(0.02, 0.01, -0.03);
    const ordinaryChild = new Object3D();
    ordinaryChild.position.set(0.01, 0, 0);
    const taggedChild = new Object3D();
    taggedChild.position.set(0, 0.02, 0.01);
    taggedParent.add(ordinaryChild, taggedChild);
    taggedParent.updateMatrixWorld(true);
    const parentWorld = taggedParent.getWorldPosition(new Vector3());
    const ordinaryWorld = ordinaryChild.getWorldPosition(new Vector3());
    const childWorld = taggedChild.getWorldPosition(new Vector3());
    const state = createAssemblyState(manifest);
    state.progress[parentPart.partId] = 1;
    state.progress[childPart.partId] = 1;
    const transforms = new GuidedPartTransforms(manifest);
    const index = new Map([
      [parentPart.partId, taggedParent],
      [childPart.partId, taggedChild],
    ]);

    transforms.apply(state, index);

    expect(taggedParent.getWorldPosition(new Vector3()).toArray()).toEqual([
      parentWorld.x + parentPart.explodeAxis[0] * parentPart.explodeDistance,
      parentWorld.y + parentPart.explodeAxis[1] * parentPart.explodeDistance,
      parentWorld.z + parentPart.explodeAxis[2] * parentPart.explodeDistance,
    ]);
    expect(ordinaryChild.getWorldPosition(new Vector3()).toArray()).toEqual([
      ordinaryWorld.x + parentPart.explodeAxis[0] * parentPart.explodeDistance,
      ordinaryWorld.y + parentPart.explodeAxis[1] * parentPart.explodeDistance,
      ordinaryWorld.z + parentPart.explodeAxis[2] * parentPart.explodeDistance,
    ]);
    expect(taggedChild.getWorldPosition(new Vector3()).toArray()).toEqual([
      childWorld.x + childPart.explodeAxis[0] * childPart.explodeDistance,
      childWorld.y + childPart.explodeAxis[1] * childPart.explodeDistance,
      childWorld.z + childPart.explodeAxis[2] * childPart.explodeDistance,
    ]);
  });

  it('captures a replacement object as a fresh assembled transform', () => {
    const part = manifest.parts[0]!;
    const state = createAssemblyState(manifest);
    state.progress[part.partId] = 1;
    const transforms = new GuidedPartTransforms(manifest);
    const high = new Object3D();
    high.position.set(0.01, 0.02, 0.03);
    transforms.apply(state, new Map([[part.partId, high]]));

    const low = new Object3D();
    low.position.set(-0.02, 0.04, 0.01);
    low.rotation.set(0.1, 0.2, 0.3);
    low.updateMatrix();
    const lowAssembled = low.matrix.clone();
    transforms.apply(state, new Map([[part.partId, low]]));
    transforms.apply(createAssemblyState(manifest), new Map([[part.partId, low]]));

    expect(low.matrix.elements).toEqual(lowAssembled.elements);
  });
});
