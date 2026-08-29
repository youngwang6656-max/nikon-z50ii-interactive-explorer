import { Box3, Mesh, Object3D, PerspectiveCamera, Sphere, Vector3 } from 'three';

export interface CameraControlsLike {
  readonly target: Vector3;
  addEventListener(type: 'start', listener: () => void): void;
  removeEventListener(type: 'start', listener: () => void): void;
}
export interface CameraPresetTweenOptions {
  durationMs?: number;
  reducedMotion?: boolean;
  getVisibleObjects?: () => Iterable<Object3D>;
  fitPadding?: number;
}

const PRESET_OFFSETS = {
  front: [0, 0.04, 0.25],
  rear: [0, 0.04, -0.25],
  left: [-0.25, 0.04, 0],
  right: [0.25, 0.04, 0],
  top: [0, 0.25, 0.02],
  bottom: [0, -0.25, 0.02],
  'three-quarter': [0.165, 0.115, 0.205],
} as const;

const DEFAULT_DURATION_MS = 480;

function visibleBounds(objects: Iterable<Object3D>): Box3 {
  const bounds = new Box3().makeEmpty();
  for (const root of objects) {
    root.updateWorldMatrix(true, true);
    root.traverseVisible((object) => {
      if (!(object instanceof Mesh) || !object.geometry) return;
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      if (object.geometry.boundingBox) {
        bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
      }
    });
  }
  return bounds;
}

function easeInOutCubic(value: number): number {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - ((-2 * value + 2) ** 3) / 2;
}

export class CameraPresetTween {
  private readonly durationMs: number;
  private readonly reducedMotion: boolean;
  private readonly getVisibleObjects: (() => Iterable<Object3D>) | undefined;
  private readonly fitPadding: number;
  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private elapsedMs = 0;
  private running = false;
  private disposed = false;

  private readonly cancelForUserOrbit = (): void => {
    this.cancel();
  };

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly controls: CameraControlsLike,
    options: CameraPresetTweenOptions = {},
  ) {
    this.durationMs = Number.isFinite(options.durationMs) && (options.durationMs ?? 0) > 0
      ? options.durationMs!
      : DEFAULT_DURATION_MS;
    this.reducedMotion = options.reducedMotion ?? false;
    this.getVisibleObjects = options.getVisibleObjects;
    this.fitPadding = Number.isFinite(options.fitPadding) && (options.fitPadding ?? 0) > 0
      ? options.fitPadding!
      : 1.18;
    controls.addEventListener('start', this.cancelForUserOrbit);
  }

  get active(): boolean {
    return this.running;
  }

  start(presetName: string): void {
    if (this.disposed) return;
    const presetOffset = PRESET_OFFSETS[presetName as keyof typeof PRESET_OFFSETS]
      ?? PRESET_OFFSETS['three-quarter'];
    const offset = new Vector3(...presetOffset);
    if (this.getVisibleObjects) {
      const bounds = visibleBounds(this.getVisibleObjects());
      if (!bounds.isEmpty()) {
        const center = bounds.getCenter(new Vector3());
        const radius = bounds.getBoundingSphere(new Sphere()).radius;
        const verticalHalfFov = (this.camera.fov * Math.PI) / 360;
        const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * this.camera.aspect);
        const limitingHalfFov = Math.max(0.01, Math.min(verticalHalfFov, horizontalHalfFov));
        const distance = Math.max(0.01, (radius / Math.sin(limitingHalfFov)) * this.fitPadding);
        const direction = offset.normalize().multiplyScalar(distance);
        this.controls.target.copy(center);
        offset.copy(direction);
      }
    }
    this.from.copy(this.camera.position);
    this.to.copy(this.controls.target).add(offset);
    this.elapsedMs = 0;

    if (this.reducedMotion) {
      this.camera.position.copy(this.to);
      this.camera.lookAt(this.controls.target);
      this.running = false;
      return;
    }
    this.running = !this.from.equals(this.to);
  }

  tick(milliseconds: number): void {
    if (!this.running || !Number.isFinite(milliseconds) || milliseconds <= 0) return;
    this.elapsedMs = Math.min(this.durationMs, this.elapsedMs + milliseconds);
    const progress = this.elapsedMs / this.durationMs;
    this.camera.position.lerpVectors(this.from, this.to, easeInOutCubic(progress));
    this.camera.lookAt(this.controls.target);
    if (progress >= 1) this.running = false;
  }

  cancel(): void {
    this.running = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancel();
    this.controls.removeEventListener('start', this.cancelForUserOrbit);
    this.disposed = true;
  }
}
