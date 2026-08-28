import { Material, Mesh, Object3D } from 'three';

type MaterialAssignment = Material | Material[];

interface OwnedMaterialAssignment {
  partId: string;
  original: MaterialAssignment;
  owned: MaterialAssignment;
}

export interface PartDisplayState {
  hidden: boolean;
  isolated: boolean;
  transparent: boolean;
}

function visitExactPart(root: Object3D, visitor: (object: Object3D) => void): void {
  visitor(root);
  for (const child of root.children) {
    if (typeof child.userData.partId === 'string') continue;
    visitExactPart(child, visitor);
  }
}

function ownedMaterials(assignment: MaterialAssignment): Material[] {
  return Array.isArray(assignment) ? assignment : [assignment];
}

function cloneTransparent(assignment: MaterialAssignment): MaterialAssignment {
  const clone = (material: Material): Material => {
    const owned = material.clone();
    owned.transparent = true;
    owned.opacity = Math.min(owned.opacity, 0.24);
    owned.depthWrite = false;
    owned.needsUpdate = true;
    return owned;
  };
  return Array.isArray(assignment) ? assignment.map(clone) : clone(assignment);
}

export class PartDisplayController {
  private readonly partIndex: ReadonlyMap<string, Object3D>;
  private readonly hiddenPartIds = new Set<string>();
  private readonly transparentPartIds = new Set<string>();
  private readonly ownedAssignments = new Map<Mesh, OwnedMaterialAssignment>();
  private isolatedPartId: string | null = null;
  private disposed = false;

  constructor(partIndex: ReadonlyMap<string, Object3D>) {
    this.partIndex = partIndex;
  }

  getState(partId: string): PartDisplayState {
    return {
      hidden: this.hiddenPartIds.has(partId) && this.isolatedPartId !== partId,
      isolated: this.isolatedPartId === partId,
      transparent: this.transparentPartIds.has(partId),
    };
  }

  toggleHidden(partId: string): void {
    if (this.disposed || !this.partIndex.has(partId)) return;
    if (this.isolatedPartId === partId) {
      this.isolatedPartId = null;
      this.hiddenPartIds.add(partId);
    } else if (this.hiddenPartIds.has(partId)) {
      this.hiddenPartIds.delete(partId);
    } else {
      this.hiddenPartIds.add(partId);
    }
    this.apply();
  }

  toggleIsolation(partId: string): void {
    if (this.disposed || !this.partIndex.has(partId)) return;
    this.isolatedPartId = this.isolatedPartId === partId ? null : partId;
    this.apply();
  }

  toggleTransparency(partId: string): void {
    if (this.disposed || !this.partIndex.has(partId)) return;
    if (this.transparentPartIds.has(partId)) this.transparentPartIds.delete(partId);
    else this.transparentPartIds.add(partId);
    this.apply();
  }

  reconcileSelection(partId: string | null): void {
    if (this.disposed) return;
    if (this.isolatedPartId && this.isolatedPartId !== partId) this.isolatedPartId = null;
    if (partId) this.hiddenPartIds.delete(partId);
    this.apply();
  }

  apply(): void {
    if (this.disposed) return;
    for (const [partId, root] of this.partIndex) {
      const visible = this.isolatedPartId
        ? this.isolatedPartId === partId
        : !this.hiddenPartIds.has(partId);
      visitExactPart(root, (object) => {
        if (object instanceof Mesh) object.visible = visible;
      });
    }

    for (const [mesh, assignment] of [...this.ownedAssignments]) {
      if (this.transparentPartIds.has(assignment.partId)) continue;
      mesh.material = assignment.original;
      ownedMaterials(assignment.owned).forEach((material) => material.dispose());
      this.ownedAssignments.delete(mesh);
    }

    for (const partId of this.transparentPartIds) {
      const root = this.partIndex.get(partId);
      if (!root) continue;
      visitExactPart(root, (object) => {
        if (!(object instanceof Mesh) || this.ownedAssignments.has(object)) return;
        const original = object.material;
        const owned = cloneTransparent(original);
        object.material = owned;
        this.ownedAssignments.set(object, { partId, original, owned });
      });
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const [mesh, assignment] of this.ownedAssignments) {
      mesh.material = assignment.original;
      ownedMaterials(assignment.owned).forEach((material) => material.dispose());
    }
    this.ownedAssignments.clear();
    this.hiddenPartIds.clear();
    this.transparentPartIds.clear();
    this.isolatedPartId = null;
  }
}
