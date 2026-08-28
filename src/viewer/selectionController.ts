import {
  Box3,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  Sphere,
  Vector2,
  Vector3,
} from 'three';

export interface OutlineSelectionTarget {
  selectedObjects: Object3D[];
}

export interface CameraControlsTarget {
  readonly target: Vector3;
  update(): boolean | void;
}

export interface SelectionHit {
  readonly object: Object3D;
  readonly distance: number;
}

export interface SelectionControllerOptions {
  canvas: HTMLCanvasElement;
  camera: PerspectiveCamera;
  controls?: CameraControlsTarget;
  assemblyRoot: Object3D;
  outlinePass: OutlineSelectionTarget;
  partIndex: ReadonlyMap<string, Object3D>;
  intersect?: (
    raycaster: Raycaster,
    camera: PerspectiveCamera,
    assemblyRoot: Object3D,
  ) => readonly SelectionHit[];
}

type SelectionListener = (partId: string | null) => void;

function isEffectivelyVisible(object: Object3D, boundary: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    if (current === boundary) return true;
    current = current.parent;
  }
  return false;
}

function nearestPartId(object: Object3D, boundary: Object3D): string | null {
  let current: Object3D | null = object;
  while (current) {
    const partId = current.userData.partId;
    if (typeof partId === 'string' && partId.length > 0) return partId;
    if (current === boundary) return null;
    current = current.parent;
  }
  return null;
}

export class SelectionController {
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: PerspectiveCamera;
  private readonly controls: CameraControlsTarget | undefined;
  private readonly assemblyRoot: Object3D;
  private readonly outlinePass: OutlineSelectionTarget;
  private readonly partIndex: ReadonlyMap<string, Object3D>;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly intersect: NonNullable<SelectionControllerOptions['intersect']>;
  private readonly listeners = new Set<SelectionListener>();
  private pointerOrigin: { x: number; y: number } | null = null;
  private disposed = false;
  selectedPartId: string | null = null;

  constructor(options: SelectionControllerOptions) {
    this.canvas = options.canvas;
    this.camera = options.camera;
    this.controls = options.controls;
    this.assemblyRoot = options.assemblyRoot;
    this.outlinePass = options.outlinePass;
    this.partIndex = options.partIndex;
    this.intersect =
      options.intersect ??
      ((raycaster, _camera, assemblyRoot) =>
        raycaster.intersectObject(assemblyRoot, true));

    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
  }

  onSelectionChange(listener: SelectionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  select(partId: string | null): void {
    if (this.disposed) return;
    const selected = partId ? this.partIndex.get(partId) : undefined;
    const nextPartId = selected ? partId : null;
    const outlined = selected && isEffectivelyVisible(selected, this.assemblyRoot)
      ? selected
      : null;
    this.outlinePass.selectedObjects.splice(
      0,
      this.outlinePass.selectedObjects.length,
      ...(outlined ? [outlined] : []),
    );
    if (this.selectedPartId === nextPartId) return;
    this.selectedPartId = nextPartId;
    this.listeners.forEach((listener) => listener(nextPartId));
  }

  pick(clientX: number, clientY: number): string | null {
    if (this.disposed) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      this.select(null);
      return null;
    }
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.intersect(this.raycaster, this.camera, this.assemblyRoot)
      .find(({ object }) =>
        object instanceof Mesh && isEffectivelyVisible(object, this.assemblyRoot),
      );
    const partId = hit ? nearestPartId(hit.object, this.assemblyRoot) : null;
    this.select(partId);
    return this.selectedPartId;
  }

  focus(partId: string): boolean {
    if (this.disposed) return false;
    const object = this.partIndex.get(partId);
    if (!object) return false;
    object.updateWorldMatrix(true, true);
    const bounds = new Box3().setFromObject(object);
    if (bounds.isEmpty()) return false;
    const sphere = bounds.getBoundingSphere(new Sphere());
    const radius = Math.max(sphere.radius, 0.012);
    const halfFov = (this.camera.fov * Math.PI) / 360;
    const verticalDistance = radius / Math.max(Math.tan(halfFov), 0.01);
    const horizontalDistance = verticalDistance / Math.max(this.camera.aspect, 0.35);
    const distance = Math.max(verticalDistance, horizontalDistance) * 1.5;
    const direction = this.camera.position.clone().sub(sphere.center);
    if (direction.lengthSq() < 1e-8) direction.set(1, 0.65, 1);
    direction.normalize();
    this.camera.position.copy(sphere.center).addScaledVector(direction, distance);
    this.camera.near = Math.max(0.001, distance / 100);
    this.camera.far = Math.max(2, distance * 50);
    this.camera.updateProjectionMatrix();
    this.controls?.target.copy(sphere.center);
    this.controls?.update();
    this.camera.lookAt(sphere.center);
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.outlinePass.selectedObjects.splice(0);
    this.listeners.clear();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.pointerOrigin = { x: event.clientX, y: event.clientY };
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const origin = this.pointerOrigin;
    this.pointerOrigin = null;
    if (!origin || event.button !== 0) return;
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 5) return;
    this.pick(event.clientX, event.clientY);
  };
}
