import { Matrix4, Object3D, Vector3 } from 'three';

import { getPartOffset, type AssemblyState } from '../domain/assemblyState';
import type { AssemblyManifest } from '../domain/manifest';

interface AssembledTransform {
  readonly position: Vector3;
  readonly localMatrix: Matrix4;
  readonly worldMatrix: Matrix4;
}

export class GuidedPartTransforms {
  private readonly assembledTransforms = new WeakMap<Object3D, AssembledTransform>();

  constructor(private readonly manifest: AssemblyManifest) {}

  apply(state: AssemblyState, partIndex: ReadonlyMap<string, Object3D>): void {
    const manifestOrder = new Map(this.manifest.parts.map((part, index) => [part.partId, index]));
    const entries = this.manifest.parts
      .map((part) => ({ part, object: partIndex.get(part.partId) }))
      .filter((entry): entry is { part: typeof entry.part; object: Object3D } => Boolean(entry.object))
      .sort((left, right) => this.depth(left.object) - this.depth(right.object)
        || (manifestOrder.get(left.part.partId) ?? 0) - (manifestOrder.get(right.part.partId) ?? 0));
    const indexedObjects = new Map(entries.map(({ part, object }) => [object, part.partId]));
    const assembledWorldCache = new Map<Object3D, Matrix4>();

    // Capture every new root before moving any root. For a late nested root,
    // reconstruct through ancestors' assembled matrices rather than their
    // currently exploded world matrices.
    entries.forEach(({ object }) => {
      if (this.assembledTransforms.has(object)) return;
      if (object.matrixAutoUpdate) object.updateMatrix();
      const localMatrix = object.matrix.clone();
      const worldMatrix = this.assembledWorldMatrix(object, assembledWorldCache);
      this.assembledTransforms.set(object, {
        position: object.position.clone(),
        localMatrix,
        worldMatrix,
      });
      assembledWorldCache.set(object, worldMatrix);
    });

    const parentInverse = new Matrix4();
    const desiredWorld = new Matrix4();
    const targetLocal = new Matrix4();
    entries.forEach(({ part, object }) => {
      const assembled = this.assembledTransforms.get(object)!;
      const [x, y, z] = getPartOffset(state, part.partId);
      desiredWorld.copy(assembled.worldMatrix);
      desiredWorld.elements[12] += x;
      desiredWorld.elements[13] += y;
      desiredWorld.elements[14] += z;

      if (object.parent) {
        object.parent.updateWorldMatrix(true, false);
        parentInverse.copy(object.parent.matrixWorld).invert();
        targetLocal.multiplyMatrices(parentInverse, desiredWorld);
      } else {
        targetLocal.copy(desiredWorld);
      }

      const canRestoreExact = x === 0 && y === 0 && z === 0
        && this.indexedAncestorsAreAssembled(object, indexedObjects, state);
      if (canRestoreExact) {
        object.position.copy(assembled.position);
        object.matrix.copy(assembled.localMatrix);
      } else {
        object.position.setFromMatrixPosition(targetLocal);
        object.matrix.copy(assembled.localMatrix);
        object.matrix.elements[12] = targetLocal.elements[12]!;
        object.matrix.elements[13] = targetLocal.elements[13]!;
        object.matrix.elements[14] = targetLocal.elements[14]!;
      }
      object.matrixWorldNeedsUpdate = true;
      object.updateWorldMatrix(false, true);
    });
  }

  private depth(object: Object3D): number {
    let depth = 0;
    for (let parent = object.parent; parent; parent = parent.parent) depth += 1;
    return depth;
  }

  private assembledWorldMatrix(
    object: Object3D,
    cache: Map<Object3D, Matrix4>,
  ): Matrix4 {
    const cached = cache.get(object);
    if (cached) return cached.clone();
    const recorded = this.assembledTransforms.get(object);
    if (recorded) return recorded.worldMatrix.clone();
    if (object.matrixAutoUpdate) object.updateMatrix();
    const result = object.parent
      ? this.assembledWorldMatrix(object.parent, cache).multiply(object.matrix)
      : object.matrix.clone();
    cache.set(object, result.clone());
    return result;
  }

  private indexedAncestorsAreAssembled(
    object: Object3D,
    indexedObjects: ReadonlyMap<Object3D, string>,
    state: AssemblyState,
  ): boolean {
    for (let parent = object.parent; parent; parent = parent.parent) {
      const partId = indexedObjects.get(parent);
      if (partId && (state.progress[partId] ?? 0) !== 0) return false;
    }
    return true;
  }
}
