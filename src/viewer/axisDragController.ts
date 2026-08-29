import {
  BufferGeometry,
  ConeGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Material,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  Quaternion,
  Ray,
  Raycaster,
  Vector2,
  Vector3,
} from 'three';

import {
  canMovePart,
  type AssemblyState,
  type MovePermission,
} from '../domain/assemblyState';
import type { AssemblyManifest, Vec3 } from '../domain/manifest';

const EPSILON = 1e-10;

export interface AxisDragControls {
  enabled: boolean;
  addEventListener?(type: 'change', listener: () => void): void;
  removeEventListener?(type: 'change', listener: () => void): void;
}

export interface AxisDragControllerOptions {
  canvas?: HTMLCanvasElement;
  camera: PerspectiveCamera;
  controls?: AxisDragControls;
  scene?: Object3D;
  viewportHeight?: () => number;
  manifest: AssemblyManifest;
  partIndex: ReadonlyMap<string, Object3D>;
  getAssemblyState(): AssemblyState;
  setAssemblyState(state: AssemblyState): void;
  getSelectedPartId(): string | null;
  isEnabled(): boolean;
  isPartHidden?(partId: string): boolean;
}

interface ActiveDrag {
  readonly pointerId: number;
  readonly partId: string;
  readonly explodeDistance: number;
  readonly axis: Vector3;
  readonly plane: Plane;
  readonly startPoint: Vector3;
  readonly startProgress: number;
  readonly startState: AssemblyState;
  readonly controlsWereEnabled: boolean | null;
  previewProgress: number;
}

function vector(value: Vec3): Vector3 {
  return new Vector3(value[0], value[1], value[2]);
}

function tuple(value: Vector3): [number, number, number] {
  return [value.x, value.y, value.z];
}

function normalized(value: Vec3): Vector3 {
  const result = vector(value);
  return result.lengthSq() > EPSILON ? result.normalize() : result.set(1, 0, 0);
}

export function projectDeltaToAxis(delta: Vec3, axis: Vec3): number {
  return vector(delta).dot(normalized(axis));
}

export function progressFromDistance(distance: number, explodeDistance: number): number {
  if (!Number.isFinite(distance) || !Number.isFinite(explodeDistance) || explodeDistance <= 0) return 0;
  return Math.min(1, Math.max(0, distance / explodeDistance));
}

export function chooseDragPlaneNormal(
  axisValue: Vec3,
  cameraDirectionValue: Vec3,
  cameraUpValue: Vec3 = [0, 1, 0],
): [number, number, number] {
  const axis = normalized(axisValue);
  const projectPerpendicular = (candidate: Vector3): Vector3 =>
    candidate.addScaledVector(axis, -candidate.dot(axis));
  const normal = projectPerpendicular(normalized(cameraDirectionValue));
  if (normal.lengthSq() <= EPSILON) {
    normal.copy(projectPerpendicular(normalized(cameraUpValue)));
  }
  if (normal.lengthSq() <= EPSILON) {
    const fallback = Math.abs(axis.x) <= Math.abs(axis.y) && Math.abs(axis.x) <= Math.abs(axis.z)
      ? new Vector3(1, 0, 0)
      : Math.abs(axis.y) <= Math.abs(axis.z)
        ? new Vector3(0, 1, 0)
        : new Vector3(0, 0, 1);
    normal.copy(projectPerpendicular(fallback));
  }
  return tuple(normal.normalize());
}

export function cameraWorldUp(camera: PerspectiveCamera): [number, number, number] {
  camera.updateWorldMatrix(true, false);
  return tuple(camera.up.clone().applyQuaternion(camera.getWorldQuaternion(new Quaternion())).normalize());
}

function cloneState(state: AssemblyState): AssemblyState {
  return {
    manifest: state.manifest,
    progress: { ...state.progress },
    history: state.history.map((move) => ({ ...move })),
  };
}

function isEffectivelyVisible(object: Object3D): boolean {
  for (let current: Object3D | null = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

export class AxisDragController {
  private readonly camera: PerspectiveCamera;
  private readonly canvas: HTMLCanvasElement | undefined;
  private readonly controls: AxisDragControls | undefined;
  private readonly scene: Object3D | undefined;
  private readonly viewportHeight: () => number;
  private readonly manifest: AssemblyManifest;
  private readonly partIndex: ReadonlyMap<string, Object3D>;
  private readonly getAssemblyState: () => AssemblyState;
  private readonly setAssemblyState: (state: AssemblyState) => void;
  private readonly getSelectedPartId: () => string | null;
  private readonly isEnabled: () => boolean;
  private readonly isPartHidden: ((partId: string) => boolean) | undefined;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly handle: Group | null;
  private capturedPointerId: number | null = null;
  private active: ActiveDrag | null = null;
  private disposed = false;

  constructor(options: AxisDragControllerOptions) {
    this.canvas = options.canvas;
    this.camera = options.camera;
    this.controls = options.controls;
    this.scene = options.scene;
    this.viewportHeight = options.viewportHeight
      ?? (() => this.canvas?.getBoundingClientRect().height ?? 720);
    this.manifest = options.manifest;
    this.partIndex = options.partIndex;
    this.getAssemblyState = options.getAssemblyState;
    this.setAssemblyState = options.setAssemblyState;
    this.getSelectedPartId = options.getSelectedPartId;
    this.isEnabled = options.isEnabled;
    this.isPartHidden = options.isPartHidden;
    this.handle = this.scene ? this.createHandle() : null;
    this.canvas?.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas?.addEventListener('pointermove', this.handlePointerMove);
    this.canvas?.addEventListener('pointerup', this.handlePointerUp);
    this.canvas?.addEventListener('pointercancel', this.handlePointerCancel);
    this.canvas?.addEventListener('lostpointercapture', this.handleLostPointerCapture);
    this.controls?.addEventListener?.('change', this.refreshHandle);
    this.refreshHandle();
  }

  get isDragging(): boolean {
    return this.active !== null;
  }

  begin(partId: string, ray: Ray, pointerId = 0): MovePermission {
    const state = this.getAssemblyState();
    const dependencyPermission = canMovePart(state, partId);
    const startProgress = state.progress[partId] ?? 0;
    const permission = dependencyPermission.allowed || startProgress > 0
      ? { allowed: true, missingPartIds: dependencyPermission.missingPartIds }
      : dependencyPermission;
    if (!permission.allowed) return permission;
    if (this.disposed || this.active || !this.isEnabled() || this.getSelectedPartId() !== partId) {
      return permission;
    }
    const part = this.manifest.parts.find((candidate) => candidate.partId === partId);
    const object = this.partIndex.get(partId);
    if (!part || !object || part.explodeDistance <= 0 || !isEffectivelyVisible(object)) return permission;

    this.camera.updateWorldMatrix(true, false);
    const cameraDirection = this.camera.getWorldDirection(new Vector3());
    const axis = normalized(part.explodeAxis);
    const projectedView = cameraDirection.clone().addScaledVector(
      axis,
      -cameraDirection.dot(axis),
    );
    if (projectedView.lengthSq() <= EPSILON) return permission;
    const cameraUp = vector(cameraWorldUp(this.camera));
    const normal = vector(chooseDragPlaneNormal(
      part.explodeAxis,
      tuple(cameraDirection),
      tuple(cameraUp),
    ));
    object.updateWorldMatrix(true, false);
    const origin = object.getWorldPosition(new Vector3());
    const plane = new Plane().setFromNormalAndCoplanarPoint(normal, origin);
    const startPoint = ray.intersectPlane(plane, new Vector3());
    if (!startPoint) return permission;

    const startState = cloneState(state);
    const capturedProgress = startState.progress[partId] ?? 0;
    const controlsWereEnabled = this.controls ? this.controls.enabled : null;
    this.active = {
      pointerId,
      partId,
      explodeDistance: part.explodeDistance,
      axis,
      plane,
      startPoint,
      startProgress: capturedProgress,
      startState,
      controlsWereEnabled,
      previewProgress: capturedProgress,
    };
    if (this.controls) this.controls.enabled = false;
    this.refreshHandle();
    return permission;
  }

  update(ray: Ray): number | null {
    const active = this.active;
    if (!active || this.disposed) return null;
    const point = ray.intersectPlane(active.plane, new Vector3());
    if (!point) return active.previewProgress;
    const projectedDistance = point.sub(active.startPoint).dot(active.axis);
    let progress = progressFromDistance(
      active.startProgress * active.explodeDistance + projectedDistance,
      active.explodeDistance,
    );
    if (
      progress > active.startProgress
      && !canMovePart(this.getAssemblyState(), active.partId).allowed
    ) progress = active.startProgress;
    if (progress === active.previewProgress) return progress;
    active.previewProgress = progress;
    this.setAssemblyState({
      manifest: active.startState.manifest,
      progress: { ...active.startState.progress, [active.partId]: progress },
      history: active.startState.history.map((move) => ({ ...move })),
    });
    this.refreshHandle();
    return progress;
  }

  end(): boolean {
    const active = this.active;
    if (!active) return false;
    this.active = null;
    this.releasePointer();
    this.restoreControls(active);
    if (active.previewProgress === active.startProgress) {
      this.refreshHandle();
      return false;
    }
    this.setAssemblyState({
      manifest: active.startState.manifest,
      progress: { ...active.startState.progress, [active.partId]: active.previewProgress },
      history: [
        ...active.startState.history.map((move) => ({ ...move })),
        { partId: active.partId, from: active.startProgress, to: active.previewProgress },
      ],
    });
    this.refreshHandle();
    return true;
  }

  cancel(): boolean {
    const active = this.active;
    if (!active) return false;
    const restored = this.abort()!;
    if (active.previewProgress !== active.startProgress) this.setAssemblyState(restored);
    return true;
  }

  abort(): AssemblyState | null {
    const active = this.active;
    if (!active) return null;
    this.active = null;
    this.releasePointer();
    this.restoreControls(active);
    this.refreshHandle();
    return cloneState(active.startState);
  }

  readonly refreshHandle = (): void => {
    const handle = this.handle;
    if (!handle || this.disposed) return;
    handle.visible = false;
    const partId = this.getSelectedPartId();
    if (!this.isEnabled() || !partId || this.isPartHidden?.(partId)) return;
    const state = this.getAssemblyState();
    const permission = canMovePart(state, partId);
    const part = this.manifest.parts.find((candidate) => candidate.partId === partId);
    const object = this.partIndex.get(partId);
    if (
      (!permission.allowed && (state.progress[partId] ?? 0) <= 0)
      || !part
      || !object
      || !isEffectivelyVisible(object)
    ) return;

    object.updateWorldMatrix(true, false);
    const origin = object.getWorldPosition(new Vector3());
    const axis = normalized(part.explodeAxis);
    handle.position.copy(origin);
    handle.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), axis);
    this.camera.updateWorldMatrix(true, false);
    const distance = Math.max(this.camera.getWorldPosition(new Vector3()).distanceTo(origin), 0.001);
    const viewportHeight = Math.max(this.viewportHeight(), 1);
    const worldHeight = 2 * distance * Math.tan((this.camera.fov * Math.PI) / 360);
    const scale = Math.max(worldHeight * (48 / viewportHeight), 0.0015);
    handle.scale.setScalar(scale);
    handle.visible = true;
    handle.updateMatrixWorld(true);
  };

  dispose(): void {
    if (this.disposed) return;
    this.cancel();
    this.disposed = true;
    this.releasePointer();
    this.canvas?.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas?.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas?.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas?.removeEventListener('pointercancel', this.handlePointerCancel);
    this.canvas?.removeEventListener('lostpointercapture', this.handleLostPointerCapture);
    this.controls?.removeEventListener?.('change', this.refreshHandle);
    if (this.handle) {
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<Material>();
      this.handle.traverse((object) => {
        if (object instanceof Line || object instanceof Mesh) {
          geometries.add(object.geometry);
          const assignments = Array.isArray(object.material) ? object.material : [object.material];
          assignments.forEach((material) => materials.add(material));
        }
      });
      this.handle.removeFromParent();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    }
  }

  private restoreControls(active: ActiveDrag): void {
    if (this.controls && active.controlsWereEnabled !== null) {
      this.controls.enabled = active.controlsWereEnabled;
    }
  }

  private createHandle(): Group {
    const handle = new Group();
    handle.name = 'FREE_DISASSEMBLY_AXIS_HANDLE';
    handle.visible = false;
    handle.renderOrder = 20;
    handle.userData.pickable = false;
    handle.raycast = () => undefined;
    const lineMaterial = new LineBasicMaterial({
      color: 0x35d8ff,
      transparent: true,
      opacity: 0.92,
      depthTest: false,
      depthWrite: false,
    });
    const lineGeometry = new BufferGeometry().setFromPoints([
      new Vector3(0, -1, 0),
      new Vector3(0, 1, 0),
    ]);
    const line = new Line(lineGeometry, lineMaterial);
    line.raycast = () => undefined;
    const arrowMaterial = new MeshBasicMaterial({
      color: 0x35d8ff,
      transparent: true,
      opacity: 0.92,
      depthTest: false,
      depthWrite: false,
    });
    const positive = new Mesh(new ConeGeometry(0.11, 0.28, 12), arrowMaterial);
    positive.position.y = 1;
    positive.raycast = () => undefined;
    const negative = new Mesh(new ConeGeometry(0.11, 0.28, 12), arrowMaterial);
    negative.position.y = -1;
    negative.rotation.z = Math.PI;
    negative.raycast = () => undefined;
    handle.add(line, positive, negative);
    this.scene!.add(handle);
    return handle;
  }

  private rayFromPointer(event: PointerEvent): Ray | null {
    const canvas = this.canvas;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.camera.updateWorldMatrix(true, false);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.ray.clone();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.disposed || this.active || event.button !== 0 || event.isPrimary === false) return;
    const partId = this.getSelectedPartId();
    const ray = this.rayFromPointer(event);
    if (!partId || !ray) return;
    this.begin(partId, ray, event.pointerId);
    if (!this.active) return;
    event.preventDefault();
    try {
      this.canvas?.setPointerCapture(event.pointerId);
      this.capturedPointerId = event.pointerId;
    } catch {
      // Detached canvases and synthetic pointers may reject capture.
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.active || event.pointerId !== this.active.pointerId) return;
    const ray = this.rayFromPointer(event);
    if (ray) this.update(ray);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (!this.active || event.pointerId !== this.active.pointerId) return;
    const ray = this.rayFromPointer(event);
    if (ray) this.update(ray);
    this.end();
    this.releasePointer();
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (!this.active || event.pointerId !== this.active.pointerId) return;
    this.cancel();
    this.releasePointer();
  };

  private readonly handleLostPointerCapture = (event: PointerEvent): void => {
    if (this.capturedPointerId !== event.pointerId) return;
    this.capturedPointerId = null;
    if (this.active?.pointerId === event.pointerId) this.cancel();
  };

  private releasePointer(): void {
    const pointerId = this.capturedPointerId;
    this.capturedPointerId = null;
    if (pointerId === null) return;
    try {
      this.canvas?.releasePointerCapture(pointerId);
    } catch {
      // Capture may already have been released by the browser.
    }
  }
}
