import { Material, Plane, PlaneHelper, Scene, Vector3 } from 'three';

import { VisibilityController } from './visibilityController';

export type CutawayAxis = 'x' | 'y' | 'z';

export interface LocalClippingRenderer {
  localClippingEnabled: boolean;
}

const AXIS_NORMALS: Record<CutawayAxis, Vector3> = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
};

export class CutawayController {
  readonly plane = new Plane(AXIS_NORMALS.x.clone(), 0);
  readonly helper: PlaneHelper;
  private readonly originalLocalClipping: boolean;
  private currentAxis: CutawayAxis = 'x';
  private currentOffset = 0;
  private active = false;
  private disposed = false;

  constructor(
    private readonly renderer: LocalClippingRenderer,
    private readonly scene: Scene,
    private readonly visibility: VisibilityController,
    helperSize = 0.13,
  ) {
    this.originalLocalClipping = renderer.localClippingEnabled;
    this.helper = new PlaneHelper(this.plane, helperSize, 0x35d8ff);
    this.helper.name = 'Z50II_CUTAWAY_PLANE_HELPER';
    this.helper.visible = false;
    this.helper.renderOrder = 1000;
    const helperMaterials = Array.isArray(this.helper.material)
      ? this.helper.material
      : [this.helper.material];
    helperMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.09;
      material.depthWrite = false;
    });
    scene.add(this.helper);
  }

  get enabled(): boolean {
    return this.active;
  }

  get axis(): CutawayAxis {
    return this.currentAxis;
  }

  get offset(): number {
    return this.currentOffset;
  }

  setEnabled(enabled: boolean): void {
    if (this.disposed || this.active === enabled) return;
    this.active = enabled;
    this.renderer.localClippingEnabled = enabled || this.originalLocalClipping;
    this.helper.visible = enabled;
    this.visibility.setClippingPlane(enabled ? this.plane : null);
  }

  setAxis(axis: CutawayAxis): void {
    if (this.disposed || this.currentAxis === axis) return;
    this.currentAxis = axis;
    this.updatePlane();
  }

  setOffset(offset: number): void {
    if (this.disposed || !Number.isFinite(offset) || this.currentOffset === offset) return;
    this.currentOffset = offset;
    this.updatePlane();
  }

  refresh(): void {
    if (!this.disposed && this.active) this.visibility.refresh();
  }

  dispose(): void {
    if (this.disposed) return;
    this.setEnabled(false);
    this.renderer.localClippingEnabled = this.originalLocalClipping;
    this.scene.remove(this.helper);
    this.helper.geometry.dispose();
    const helperMaterials = Array.isArray(this.helper.material)
      ? this.helper.material
      : [this.helper.material];
    helperMaterials.forEach((material: Material) => material.dispose());
    this.disposed = true;
  }

  private updatePlane(): void {
    this.plane.normal.copy(AXIS_NORMALS[this.currentAxis]);
    this.plane.constant = -this.currentOffset;
    if (this.active) this.visibility.refresh();
  }
}
