import {
  Euler,
  Group,
  Matrix4,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Ray,
  Raycaster,
  Scene,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';

import fixture from '../fixtures/assembly-manifest.valid.json';
import { createAssemblyState, type AssemblyState } from '../../src/domain/assemblyState';
import { parseManifest } from '../../src/domain/manifest';
import {
  AxisDragController,
  cameraWorldUp,
  chooseDragPlaneNormal,
  progressFromDistance,
  projectDeltaToAxis,
} from '../../src/viewer/axisDragController';
import { GuidedPartTransforms } from '../../src/viewer/guidedPartTransforms';

const manifest = parseManifest({
  ...fixture,
  modules: fixture.modules.map((module) => ({ ...module, preload: false })),
});

function controllerHarness(initialState = createAssemblyState(manifest)) {
  let state = initialState;
  const first = new Object3D();
  const second = new Object3D();
  const controls = { enabled: true };
  const setAssemblyState = vi.fn((next: AssemblyState) => { state = next; });
  const camera = new PerspectiveCamera(45, 1, 0.01, 10);
  camera.position.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  const controller = new AxisDragController({
    camera,
    controls,
    manifest,
    partIndex: new Map([
      [manifest.parts[0]!.partId, first],
      [manifest.parts[1]!.partId, second],
    ]),
    getAssemblyState: () => state,
    setAssemblyState,
    getSelectedPartId: () => manifest.parts[0]!.partId,
    isEnabled: () => true,
  });
  return { controller, controls, first, second, setAssemblyState, state: () => state };
}

function canvasHarness() {
  const listeners = new Map<string, Set<EventListener>>();
  const canvas = {
    addEventListener(type: string, listener: EventListener) {
      const handlers = listeners.get(type) ?? new Set<EventListener>();
      handlers.add(listener);
      listeners.set(type, handlers);
    },
    removeEventListener(type: string, listener: EventListener) {
      listeners.get(type)?.delete(listener);
    },
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLCanvasElement;
  return {
    canvas,
    dispatch(type: string, values: Partial<PointerEvent>) {
      listeners.get(type)?.forEach((listener) => listener({
        pointerId: 1,
        button: 0,
        isPrimary: true,
        clientX: 100,
        clientY: 50,
        preventDefault: vi.fn(),
        ...values,
      } as PointerEvent));
    },
  };
}

describe('axis drag projection', () => {
  it('projects pointer travel onto the configured axis and clamps travel progress', () => {
    expect(projectDeltaToAxis([3, 4, 0], [1, 0, 0])).toBe(3);
    expect(progressFromDistance(75, 50)).toBe(1);
    expect(progressFromDistance(-10, 50)).toBe(0);
  });

  it('chooses a finite plane normal perpendicular to the axis for view-axis and fallback cases', () => {
    const parallel = chooseDragPlaneNormal([0, 0, 1], [0, 0, 1], [0, 1, 0]);
    const degenerateUp = chooseDragPlaneNormal([0, 0, 1], [0, 0, 1], [0, 0, 1]);

    for (const normal of [parallel, degenerateUp]) {
      expect(normal.every(Number.isFinite)).toBe(true);
      expect(Math.hypot(...normal)).toBeCloseTo(1, 12);
      expect(projectDeltaToAxis(normal, [0, 0, 1])).toBeCloseTo(0, 12);
    }
  });
});

describe('AxisDragController', () => {
  it('rejects a locked part with exact missing IDs and changes no state, matrix, or orbit state', () => {
    const harness = controllerHarness();
    const partId = manifest.parts[1]!.partId;
    harness.second.position.set(0.01, 0.02, 0.03);
    harness.second.rotation.set(0.2, -0.3, 0.4);
    harness.second.scale.set(1.2, 0.8, 1.1);
    harness.second.updateMatrix();
    const matrixBefore = harness.second.matrix.clone();

    expect(harness.controller.begin(
      partId,
      new Ray(new Vector3(0, 0, 1), new Vector3(0, 0, -1)),
      7,
    )).toEqual({ allowed: false, missingPartIds: [manifest.parts[0]!.partId] });

    expect(harness.controller.isDragging).toBe(false);
    expect(harness.controls.enabled).toBe(true);
    expect(harness.setAssemblyState).not.toHaveBeenCalled();
    expect(harness.second.matrix.elements).toEqual(matrixBefore.elements);
  });

  it('allows a dependency-locked part to move back toward assembly but never above pointer-down progress', () => {
    const prerequisiteId = manifest.parts[0]!.partId;
    const dependentId = manifest.parts[1]!.partId;
    const initial = {
      ...createAssemblyState(manifest),
      progress: {
        ...createAssemblyState(manifest).progress,
        [prerequisiteId]: 0.5,
        [dependentId]: 0.5,
      },
      history: [],
    };
    let state: AssemblyState = initial;
    const dependent = new Object3D();
    const controls = { enabled: true };
    const camera = new PerspectiveCamera(45, 1, 0.01, 10);
    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    const controller = new AxisDragController({
      camera,
      controls,
      manifest,
      partIndex: new Map([[dependentId, dependent]]),
      getAssemblyState: () => state,
      setAssemblyState: (next) => { state = next; },
      getSelectedPartId: () => dependentId,
      isEnabled: () => true,
    });
    const startRay = new Ray(new Vector3(0, 0, 1), new Vector3(0, 0, -1));

    expect(controller.begin(dependentId, startRay, 44)).toEqual({
      allowed: true,
      missingPartIds: [prerequisiteId],
    });
    controller.update(new Ray(new Vector3(-0.006, 0, 1), new Vector3(0, 0, -1)));
    expect(state.progress[dependentId]).toBeCloseTo(0.3, 12);
    controller.update(new Ray(new Vector3(0.012, 0, 1), new Vector3(0, 0, -1)));
    expect(state.progress[dependentId]).toBe(0.5);
    state = {
      ...state,
      progress: { ...state.progress, [prerequisiteId]: 1 },
    };
    controller.update(new Ray(new Vector3(0.012, 0, 1), new Vector3(0, 0, -1)));
    expect(state.progress[dependentId]).toBeCloseTo(0.9, 12);
    expect(controller.end()).toBe(true);
    expect(state.history).toEqual([{ partId: dependentId, from: 0.5, to: 0.9 }]);
  });

  it('coalesces high-frequency previews into one undo record and restores orbit on end', () => {
    const harness = controllerHarness();
    const partId = manifest.parts[0]!.partId;
    const startRay = new Ray(new Vector3(0, 1, 0), new Vector3(0, -1, 0));

    expect(harness.controller.begin(partId, startRay, 3)).toEqual({
      allowed: true,
      missingPartIds: [],
    });
    expect(harness.controls.enabled).toBe(false);
    harness.controller.update(new Ray(new Vector3(0, 1, 0), new Vector3(0, -1, 0)));
    harness.controller.update(new Ray(new Vector3(0, 1, 0.01), new Vector3(0, -1, 0)));
    harness.controller.update(new Ray(new Vector3(0, 1, 0.03), new Vector3(0, -1, 0)));

    expect(harness.state().progress[partId]).toBeCloseTo(0.75, 12);
    expect(harness.state().history).toEqual([]);
    expect(harness.controller.end()).toBe(true);
    expect(harness.state().history).toEqual([{ partId, from: 0, to: 0.75 }]);
    expect(harness.controls.enabled).toBe(true);
  });

  it('cancels to the exact pointer-down state and creates no history for a no-op end', () => {
    const partId = manifest.parts[0]!.partId;
    const initial = {
      ...createAssemblyState(manifest),
      progress: { ...createAssemblyState(manifest).progress, [partId]: 0.2 },
      history: [{ partId, from: 0, to: 0.2 }],
    };
    const harness = controllerHarness(initial);
    const startRay = new Ray(new Vector3(0, 1, 0), new Vector3(0, -1, 0));

    harness.controller.begin(partId, startRay, 4);
    harness.controller.update(new Ray(new Vector3(0, 1, 0.02), new Vector3(0, -1, 0)));
    expect(harness.controller.cancel()).toBe(true);
    expect(harness.state()).toEqual(initial);
    expect(harness.controls.enabled).toBe(true);

    harness.controller.begin(partId, startRay, 5);
    expect(harness.controller.end()).toBe(false);
    expect(harness.state()).toEqual(initial);
  });

  it('applies exact world-axis travel without rotation or scale drift under a transformed parent', () => {
    const partId = manifest.parts[0]!.partId;
    let state = createAssemblyState(manifest);
    const parent = new Group();
    parent.position.set(0.13, -0.07, 0.09);
    parent.rotation.copy(new Euler(0.35, -0.42, 0.18));
    parent.scale.set(1.4, 0.75, 1.2);
    const part = new Object3D();
    part.position.set(0.02, 0.01, -0.03);
    part.rotation.copy(new Euler(-0.21, 0.16, 0.29));
    part.scale.set(0.8, 1.3, 1.1);
    parent.add(part);
    parent.updateWorldMatrix(true, true);
    const assembledLocal = part.matrix.clone();
    const assembledWorld = part.matrixWorld.clone();
    const transforms = new GuidedPartTransforms(manifest);
    transforms.apply(state, new Map([[partId, part]]));
    const controls = { enabled: true };
    const camera = new PerspectiveCamera(45, 1, 0.01, 10);
    camera.position.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    const controller = new AxisDragController({
      camera,
      controls,
      manifest,
      partIndex: new Map([[partId, part]]),
      getAssemblyState: () => state,
      setAssemblyState(next) {
        state = next;
        transforms.apply(state, new Map([[partId, part]]));
      },
      getSelectedPartId: () => partId,
      isEnabled: () => true,
    });

    controller.begin(partId, new Ray(new Vector3(0, 1, 0), new Vector3(0, -1, 0)), 8);
    controller.update(new Ray(new Vector3(0, 1, 0.02), new Vector3(0, -1, 0)));
    parent.updateWorldMatrix(true, true);
    const expectedWorld = assembledWorld.clone();
    expectedWorld.elements[14] += 0.02;

    part.matrixWorld.elements.forEach((value, index) => {
      expect(value).toBeCloseTo(expectedWorld.elements[index]!, 14);
    });
    expect(part.matrix.elements.slice(0, 12)).toEqual(assembledLocal.elements.slice(0, 12));
    controller.cancel();
    expect(part.matrix.elements).toEqual(assembledLocal.elements);
  });

  it('fails a parallel ray-plane intersection gracefully without disabling orbit', () => {
    const harness = controllerHarness();
    const partId = manifest.parts[0]!.partId;
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, 0);

    const result = harness.controller.begin(
      partId,
      new Ray(new Vector3(0, 1, 0), new Vector3(1, 0, 0)),
      9,
    );

    expect(result).toEqual({ allowed: true, missingPartIds: [] });
    expect(harness.controller.isDragging).toBe(false);
    expect(harness.controls.enabled).toBe(true);
  });

  it('rejects an exact camera-on-axis start before capture or orbit mutation', () => {
    const partId = manifest.parts[0]!.partId;
    const controls = { enabled: true };
    const camera = new PerspectiveCamera(45, 1, 0.01, 10);
    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    camera.updateWorldMatrix(true, false);
    const controller = new AxisDragController({
      camera,
      controls,
      manifest,
      partIndex: new Map([[partId, new Object3D()]]),
      getAssemblyState: () => createAssemblyState(manifest),
      setAssemblyState: vi.fn(),
      getSelectedPartId: () => partId,
      isEnabled: () => true,
    });

    expect(controller.begin(
      partId,
      new Ray(new Vector3(0, 0, 1), new Vector3(0, 0, -1)),
      45,
    )).toEqual({ allowed: true, missingPartIds: [] });
    expect(controller.isDragging).toBe(false);
    expect(controls.enabled).toBe(true);
    expect(controller.update(new Ray(new Vector3(0.1, 0, 1), new Vector3(0, 0, -1)))).toBeNull();
  });

  it('computes camera up from the world quaternion for a parented camera', () => {
    const parent = new Group();
    parent.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
    const camera = new PerspectiveCamera();
    parent.add(camera);
    parent.updateWorldMatrix(true, true);
    const expected = camera.up.clone().applyQuaternion(camera.getWorldQuaternion(new Quaternion()));

    expect(cameraWorldUp(camera)).toEqual(expected.toArray());
    expect(cameraWorldUp(camera)[0]).toBeCloseTo(-1, 14);
  });

  it('silently aborts to the pointer-down snapshot and leaves later pointer events inert', () => {
    const pointer = canvasHarness();
    const partId = manifest.parts[0]!.partId;
    let state = createAssemblyState(manifest);
    const setAssemblyState = vi.fn((next: AssemblyState) => { state = next; });
    const controls = { enabled: true };
    const camera = new PerspectiveCamera(45, 2, 0.01, 10);
    camera.position.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    const controller = new AxisDragController({
      canvas: pointer.canvas,
      camera,
      controls,
      manifest,
      partIndex: new Map([[partId, new Object3D()]]),
      getAssemblyState: () => state,
      setAssemblyState,
      getSelectedPartId: () => partId,
      isEnabled: () => true,
    });

    pointer.dispatch('pointerdown', { pointerId: 50 });
    pointer.dispatch('pointermove', { pointerId: 50, clientY: 30 });
    const callsBeforeAbort = setAssemblyState.mock.calls.length;
    const restored = controller.abort();
    expect(restored).toEqual(createAssemblyState(manifest));
    expect(setAssemblyState).toHaveBeenCalledTimes(callsBeforeAbort);
    expect(controller.isDragging).toBe(false);
    expect(controls.enabled).toBe(true);
    pointer.dispatch('pointermove', { pointerId: 50, clientY: 10 });
    pointer.dispatch('pointerup', { pointerId: 50, clientY: 10 });
    expect(setAssemblyState).toHaveBeenCalledTimes(callsBeforeAbort);
  });

  it('owns pointer capture and always restores orbit on pointer cancellation, lost capture, and disposal', () => {
    const pointer = canvasHarness();
    const partId = manifest.parts[0]!.partId;
    const part = new Object3D();
    let state = createAssemblyState(manifest);
    const controls = { enabled: true };
    const camera = new PerspectiveCamera(45, 2, 0.01, 10);
    camera.position.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateWorldMatrix(true, false);
    const controller = new AxisDragController({
      canvas: pointer.canvas,
      camera,
      controls,
      manifest,
      partIndex: new Map([[partId, part]]),
      getAssemblyState: () => state,
      setAssemblyState: (next) => { state = next; },
      getSelectedPartId: () => partId,
      isEnabled: () => true,
    });

    pointer.dispatch('pointerdown', { pointerId: 11 });
    expect(controller.isDragging).toBe(true);
    expect(controls.enabled).toBe(false);
    expect(pointer.canvas.setPointerCapture).toHaveBeenCalledWith(11);
    pointer.dispatch('pointercancel', { pointerId: 11 });
    expect(controller.isDragging).toBe(false);
    expect(controls.enabled).toBe(true);

    pointer.dispatch('pointerdown', { pointerId: 12 });
    pointer.dispatch('lostpointercapture', { pointerId: 12 });
    expect(controller.isDragging).toBe(false);
    expect(controls.enabled).toBe(true);

    pointer.dispatch('pointerdown', { pointerId: 13 });
    controller.cancel();
    expect(pointer.canvas.releasePointerCapture).toHaveBeenCalledWith(13);
    pointer.dispatch('pointerdown', { pointerId: 14 });
    controller.dispose();
    expect(controller.isDragging).toBe(false);
    expect(controls.enabled).toBe(true);
  });

  it('ignores secondary and additional pointers without corrupting the active primary drag', () => {
    const pointer = canvasHarness();
    const partId = manifest.parts[0]!.partId;
    const controls = { enabled: true };
    const camera = new PerspectiveCamera(45, 2, 0.01, 10);
    camera.position.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    const controller = new AxisDragController({
      canvas: pointer.canvas,
      camera,
      controls,
      manifest,
      partIndex: new Map([[partId, new Object3D()]]),
      getAssemblyState: () => createAssemblyState(manifest),
      setAssemblyState: vi.fn(),
      getSelectedPartId: () => partId,
      isEnabled: () => true,
    });

    pointer.dispatch('pointerdown', { pointerId: 20, button: 2 });
    expect(controller.isDragging).toBe(false);
    pointer.dispatch('pointerdown', { pointerId: 21 });
    expect(controller.isDragging).toBe(true);
    pointer.dispatch('pointerdown', { pointerId: 22, isPrimary: false });
    pointer.dispatch('pointerup', { pointerId: 22, isPrimary: false });
    expect(controller.isDragging).toBe(true);
    expect(controls.enabled).toBe(false);
    pointer.dispatch('pointerup', { pointerId: 21 });
    expect(controller.isDragging).toBe(false);
    expect(controls.enabled).toBe(true);
  });

  it('renders a non-pickable, world-axis-oriented, screen-scaled handle only for movable free selections', () => {
    let selectedPartId: string | null = manifest.parts[0]!.partId;
    let enabled = false;
    let state = createAssemblyState(manifest);
    const scene = new Scene();
    const first = new Object3D();
    first.position.set(0.1, 0.2, 0.3);
    const second = new Object3D();
    const camera = new PerspectiveCamera(45, 2, 0.01, 10);
    camera.position.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    const controller = new AxisDragController({
      camera,
      scene,
      viewportHeight: () => 500,
      manifest,
      partIndex: new Map([
        [manifest.parts[0]!.partId, first],
        [manifest.parts[1]!.partId, second],
      ]),
      getAssemblyState: () => state,
      setAssemblyState: (next) => { state = next; },
      getSelectedPartId: () => selectedPartId,
      isEnabled: () => enabled,
    });
    const handle = scene.getObjectByName('FREE_DISASSEMBLY_AXIS_HANDLE')!;

    expect(handle).toBeDefined();
    expect(handle.visible).toBe(false);
    enabled = true;
    controller.refreshHandle();
    expect(handle.visible).toBe(true);
    expect(handle.userData.pickable).toBe(false);
    expect(handle.children).toHaveLength(3);
    const raycaster = new Raycaster(new Vector3(0.1, 0.2, 1), new Vector3(0, 0, -1));
    expect(raycaster.intersectObject(handle, true)).toEqual([]);
    expect(handle.position.toArray()).toEqual([0.1, 0.2, 0.3]);
    const orientedAxis = new Vector3(0, 1, 0).applyQuaternion(handle.quaternion);
    expect(orientedAxis.x).toBeCloseTo(0, 14);
    expect(orientedAxis.y).toBeCloseTo(0, 14);
    expect(orientedAxis.z).toBeCloseTo(1, 14);
    const initialScale = handle.scale.x;
    camera.position.set(0, 0, 2);
    controller.refreshHandle();
    expect(handle.scale.x).toBeGreaterThan(initialScale);

    selectedPartId = manifest.parts[1]!.partId;
    controller.refreshHandle();
    expect(handle.visible).toBe(false);
    state = {
      ...state,
      progress: {
        ...state.progress,
        [manifest.parts[0]!.partId]: 0.5,
        [manifest.parts[1]!.partId]: 0.5,
      },
    };
    controller.refreshHandle();
    expect(handle.visible).toBe(true);
    selectedPartId = manifest.parts[0]!.partId;
    first.visible = false;
    controller.refreshHandle();
    expect(handle.visible).toBe(false);

    controller.dispose();
    expect(scene.getObjectByName('FREE_DISASSEMBLY_AXIS_HANDLE')).toBeUndefined();
  });
});
