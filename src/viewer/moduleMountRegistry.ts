import { Group, Mesh, Object3D } from 'three';

import { disposeObjectTree } from './disposeObjectTree';
import type { LoadedModule } from './moduleLoader';

export class ModuleMountRegistry {
  readonly partIndex = new Map<string, Object3D>();

  private readonly moduleRoots = new Map<string, LoadedModule>();
  private readonly ownedRoots = new Set<Object3D>();
  private disposed = false;

  constructor(private readonly assemblyRoot: Group) {}

  add(module: LoadedModule): void {
    if (this.disposed) throw new Error('ModuleMountRegistry has been disposed');
    const current = this.moduleRoots.get(module.moduleId);
    if (current?.root === module.root) return;

    for (const [partId] of module.partIndex) {
      const indexedObject = this.partIndex.get(partId);
      const belongsToCurrent = current?.partIndex.get(partId) === indexedObject;
      if (indexedObject && !belongsToCurrent) {
        throw new Error(
          `Part index collision for ${partId} while adding ${module.moduleId}`,
        );
      }
    }

    if (current) this.remove(module.moduleId);

    module.root.userData.moduleId = module.moduleId;
    module.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    this.assemblyRoot.add(module.root);
    this.ownedRoots.add(module.root);
    this.moduleRoots.set(module.moduleId, module);
    for (const [partId, object] of module.partIndex) {
      this.partIndex.set(partId, object);
    }
  }

  remove(moduleId: string): void {
    if (this.disposed) return;
    const current = this.moduleRoots.get(moduleId);
    if (!current) return;
    this.assemblyRoot.remove(current.root);
    for (const [partId, object] of current.partIndex) {
      if (this.partIndex.get(partId) === object) this.partIndex.delete(partId);
    }
    this.moduleRoots.delete(moduleId);
  }

  dispose(): void {
    if (this.disposed) return;
    for (const module of this.moduleRoots.values()) {
      this.assemblyRoot.remove(module.root);
    }
    this.moduleRoots.clear();
    this.partIndex.clear();
    this.ownedRoots.forEach(disposeObjectTree);
    this.ownedRoots.clear();
    this.disposed = true;
  }
}
