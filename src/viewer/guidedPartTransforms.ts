import { Matrix4, Object3D, Vector3 } from 'three';

import { getPartOffset, type AssemblyState } from '../domain/assemblyState';
import type { AssemblyManifest } from '../domain/manifest';

interface AssembledTransform {
  readonly position: Vector3;
  readonly matrix: Matrix4;
}

export class GuidedPartTransforms {
  private readonly assembledTransforms = new WeakMap<Object3D, AssembledTransform>();

  constructor(private readonly manifest: AssemblyManifest) {}

  apply(state: AssemblyState, partIndex: ReadonlyMap<string, Object3D>): void {
    for (const part of this.manifest.parts) {
      const object = partIndex.get(part.partId);
      if (!object) continue;
      let assembled = this.assembledTransforms.get(object);
      if (!assembled) {
        if (object.matrixAutoUpdate) object.updateMatrix();
        assembled = {
          position: object.position.clone(),
          matrix: object.matrix.clone(),
        };
        this.assembledTransforms.set(object, assembled);
      }

      const progress = state.progress[part.partId] ?? 0;
      if (progress === 0) {
        object.position.copy(assembled.position);
        object.matrix.copy(assembled.matrix);
        object.matrixWorldNeedsUpdate = true;
        continue;
      }

      const [x, y, z] = getPartOffset(state, part.partId);
      object.position.copy(assembled.position).add(new Vector3(x, y, z));
      object.matrix.copy(assembled.matrix);
      object.matrix.elements[12] += x;
      object.matrix.elements[13] += y;
      object.matrix.elements[14] += z;
      object.matrixWorldNeedsUpdate = true;
    }
  }
}
