import {
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Plane,
} from 'three';

type MaterialAssignment = Material | Material[];
type TargetSource = Iterable<Object3D> | (() => Iterable<Object3D>);

interface OwnedMaterialAssignment {
  original: MaterialAssignment;
  owned: MaterialAssignment;
}

export interface VisibilityState {
  hidden: boolean;
  isolated: boolean;
  ghosted: boolean;
}

function visitExactTarget(root: Object3D, visitor: (object: Object3D) => void): void {
  visitor(root);
  for (const child of root.children) {
    if (typeof child.userData.partId === 'string') continue;
    visitExactTarget(child, visitor);
  }
}

function materials(assignment: MaterialAssignment): Material[] {
  return Array.isArray(assignment) ? assignment : [assignment];
}

function cloneAssignment(
  assignment: MaterialAssignment,
  ghosted: boolean,
  clippingPlane: Plane | null,
  inspection: boolean,
): MaterialAssignment {
  const clone = (original: Material): Material => {
    const owned = original.clone();
    const originalClippingPlanes = original.clippingPlanes;
    if (ghosted) {
      owned.opacity = 0.18;
      owned.transparent = true;
      owned.depthWrite = false;
    }
    if (clippingPlane) {
      owned.clippingPlanes = originalClippingPlanes
        ? [...originalClippingPlanes, clippingPlane]
        : [clippingPlane];
      owned.clipIntersection = false;
      owned.clipShadows = true;
    } else {
      owned.clippingPlanes = originalClippingPlanes
        ? [...originalClippingPlanes]
        : null;
    }
    if (inspection && owned instanceof MeshStandardMaterial) {
      owned.envMapIntensity = Math.min(owned.envMapIntensity, 0.28);
    }
    owned.needsUpdate = true;
    return owned;
  };
  return Array.isArray(assignment) ? assignment.map(clone) : clone(assignment);
}

export class VisibilityController {
  private readonly getTargets: () => Iterable<Object3D>;
  private readonly hiddenSnapshots = new Map<Object3D, Map<Object3D, boolean>>();
  private readonly ghostedTargets = new Set<Object3D>();
  private readonly ownedAssignments = new Map<Mesh, OwnedMaterialAssignment>();
  private isolationTarget: Object3D | null = null;
  private isolationSnapshot = new Map<Object3D, boolean>();
  private clippingPlane: Plane | null = null;
  private inspection = false;
  private disposed = false;

  constructor(targets: TargetSource) {
    this.getTargets = typeof targets === 'function' ? targets : () => targets;
  }

  getState(target: Object3D): VisibilityState {
    return {
      hidden: this.hiddenSnapshots.has(target),
      isolated: this.isolationTarget === target,
      ghosted: this.ghostedTargets.has(target),
    };
  }

  hide(target: Object3D): void {
    if (this.disposed || this.hiddenSnapshots.has(target)) return;
    const snapshot = new Map<Object3D, boolean>();
    visitExactTarget(target, (object) => {
      snapshot.set(object, object.visible);
      object.visible = false;
    });
    this.hiddenSnapshots.set(target, snapshot);
  }

  show(target: Object3D): void {
    if (this.disposed) return;
    const snapshot = this.hiddenSnapshots.get(target);
    if (!snapshot) return;
    for (const [object, visible] of snapshot) object.visible = visible;
    this.hiddenSnapshots.delete(target);
    if (this.isolationTarget) this.applyIsolation();
  }

  isolate(target: Object3D): void {
    if (this.disposed || this.isolationTarget === target) return;
    this.clearIsolation();
    this.isolationTarget = target;
    this.applyIsolation();
  }

  clearIsolation(): void {
    if (this.disposed || !this.isolationTarget) return;
    for (const [object, visible] of this.isolationSnapshot) object.visible = visible;
    this.isolationSnapshot.clear();
    this.isolationTarget = null;
  }

  ghost(target: Object3D): void {
    if (this.disposed || this.ghostedTargets.has(target)) return;
    this.ghostedTargets.add(target);
    this.refreshMaterials();
  }

  unghost(target: Object3D): void {
    if (this.disposed || !this.ghostedTargets.delete(target)) return;
    this.refreshMaterials();
  }

  setClippingPlane(plane: Plane | null): void {
    if (this.disposed || this.clippingPlane === plane) return;
    this.clippingPlane = plane;
    this.refreshMaterials();
  }

  setInspectionMode(enabled: boolean): void {
    if (this.disposed || this.inspection === enabled) return;
    this.inspection = enabled;
    this.refreshMaterials();
  }

  refresh(): void {
    if (this.disposed) return;
    if (this.isolationTarget) this.applyIsolation();
    this.refreshMaterials();
  }

  resetVisibility(): void {
    if (this.disposed) return;
    this.clearIsolation();
    for (const target of [...this.hiddenSnapshots.keys()]) this.show(target);
    this.ghostedTargets.clear();
    this.refreshMaterials();
  }

  reset(): void {
    if (this.disposed) return;
    this.resetVisibility();
    this.clippingPlane = null;
    this.inspection = false;
    this.refreshMaterials();
  }

  dispose(): void {
    if (this.disposed) return;
    this.reset();
    this.disposed = true;
  }

  private targets(): Object3D[] {
    return [...new Set(this.getTargets())];
  }

  private applyIsolation(): void {
    const selected = this.isolationTarget;
    if (!selected) return;
    for (const target of this.targets()) {
      visitExactTarget(target, (object) => {
        if (!this.isolationSnapshot.has(object)) {
          this.isolationSnapshot.set(object, object.visible);
        }
        object.visible = target === selected;
      });
    }
  }

  private refreshMaterials(): void {
    const ghostedMeshes = new Set<Mesh>();
    for (const target of this.ghostedTargets) {
      visitExactTarget(target, (object) => {
        if (object instanceof Mesh) ghostedMeshes.add(object);
      });
    }

    const currentMeshes = new Set<Mesh>();
    for (const target of this.targets()) {
      visitExactTarget(target, (object) => {
        if (object instanceof Mesh) currentMeshes.add(object);
      });
    }

    for (const [mesh, assignment] of [...this.ownedAssignments]) {
      if (currentMeshes.has(mesh)) continue;
      mesh.material = assignment.original;
      materials(assignment.owned).forEach((material) => material.dispose());
      this.ownedAssignments.delete(mesh);
    }

    for (const mesh of currentMeshes) {
      const ghosted = ghostedMeshes.has(mesh);
      const affected = ghosted || this.clippingPlane !== null || this.inspection;
      const existing = this.ownedAssignments.get(mesh);
      if (!affected) {
        if (!existing) continue;
        mesh.material = existing.original;
        materials(existing.owned).forEach((material) => material.dispose());
        this.ownedAssignments.delete(mesh);
        continue;
      }
      const original = existing?.original ?? mesh.material;
      if (existing) materials(existing.owned).forEach((material) => material.dispose());
      const owned = cloneAssignment(
        original,
        ghosted,
        this.clippingPlane,
        this.inspection,
      );
      mesh.material = owned;
      this.ownedAssignments.set(mesh, { original, owned });
    }
  }
}
