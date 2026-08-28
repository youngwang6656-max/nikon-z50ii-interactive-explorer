import {
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
} from 'three';
import { describe, expect, it, vi } from 'vitest';

import { SelectionController } from '../../src/viewer/selectionController';

interface CanvasHarness {
  canvas: HTMLCanvasElement;
  dispatch(type: string, event: Partial<PointerEvent>): void;
  setPointerCapture: ReturnType<typeof vi.fn>;
  releasePointerCapture: ReturnType<typeof vi.fn>;
}

function canvasHarness(): CanvasHarness {
  const listeners = new Map<string, Set<EventListener>>();
  const setPointerCapture = vi.fn();
  const releasePointerCapture = vi.fn();
  const canvas = {
    addEventListener(type: string, listener: EventListener) {
      const handlers = listeners.get(type) ?? new Set<EventListener>();
      handlers.add(listener);
      listeners.set(type, handlers);
    },
    removeEventListener(type: string, listener: EventListener) {
      listeners.get(type)?.delete(listener);
    },
    setPointerCapture,
    releasePointerCapture,
    getBoundingClientRect: () => ({
      left: 10,
      top: 20,
      width: 200,
      height: 100,
      right: 210,
      bottom: 120,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLCanvasElement;
  return {
    canvas,
    setPointerCapture,
    releasePointerCapture,
    dispatch(type, event) {
      listeners.get(type)?.forEach((listener) => listener({
        button: 0,
        pointerId: 1,
        clientX: 20,
        clientY: 30,
        ...event,
      } as PointerEvent));
    },
  };
}

function canvasStub(): HTMLCanvasElement {
  return canvasHarness().canvas;
}

function part(partId: string): { root: Group; mesh: Mesh } {
  const root = new Group();
  root.userData.partId = partId;
  const mesh = new Mesh(undefined, new MeshBasicMaterial({ color: 0xff00ff }));
  root.add(mesh);
  return { root, mesh };
}

describe('SelectionController', () => {
  it('picks the first visible loaded mesh and resolves its nearest part ancestor', () => {
    const assemblyRoot = new Group();
    const outer = part('outer');
    const inner = part('inner');
    outer.root.add(inner.root);
    const hidden = part('hidden');
    hidden.root.visible = false;
    assemblyRoot.add(outer.root, hidden.root);
    const outlinePass = { selectedObjects: [] as Object3D[] };
    const controller = new SelectionController({
      canvas: canvasStub(),
      camera: new PerspectiveCamera(),
      assemblyRoot,
      outlinePass,
      partIndex: new Map([
        ['outer', outer.root],
        ['inner', inner.root],
        ['hidden', hidden.root],
      ]),
      intersect: vi.fn(() => [
        { object: hidden.mesh, distance: 1 },
        { object: inner.mesh, distance: 2 },
        { object: outer.mesh, distance: 3 },
      ]),
    });

    expect(controller.pick(110, 70)).toBe('inner');
    expect(controller.selectedPartId).toBe('inner');
    expect(outlinePass.selectedObjects).toEqual([inner.root]);
  });

  it('clears only selection when a pick hits empty space', () => {
    const selected = part('selected');
    const outlinePass = { selectedObjects: [] as Object3D[] };
    const intersect = vi
      .fn<() => Array<{ object: Object3D; distance: number }>>()
      .mockReturnValueOnce([{ object: selected.mesh, distance: 1 }])
      .mockReturnValueOnce([]);
    const controller = new SelectionController({
      canvas: canvasStub(),
      camera: new PerspectiveCamera(),
      assemblyRoot: selected.root,
      outlinePass,
      partIndex: new Map([['selected', selected.root]]),
      intersect,
    });

    controller.pick(20, 30);
    expect(controller.pick(20, 30)).toBeNull();
    expect(controller.selectedPartId).toBeNull();
    expect(outlinePass.selectedObjects).toEqual([]);
  });

  it('reuses the shared outline pass without replacing or mutating materials', () => {
    const selected = part('selected');
    const originalMaterial = selected.mesh.material as MeshBasicMaterial;
    const originalOpacity = originalMaterial.opacity;
    const selectedObjects: Object3D[] = [];
    const outlinePass = { selectedObjects };
    const controller = new SelectionController({
      canvas: canvasStub(),
      camera: new PerspectiveCamera(),
      assemblyRoot: selected.root,
      outlinePass,
      partIndex: new Map([['selected', selected.root]]),
      intersect: () => [],
    });

    controller.select('selected');

    expect(outlinePass.selectedObjects).toBe(selectedObjects);
    expect(outlinePass.selectedObjects).toEqual([selected.root]);
    expect(selected.mesh.material).toBe(originalMaterial);
    expect((selected.mesh.material as MeshBasicMaterial).opacity).toBe(originalOpacity);
  });

  it('removes owned pointer listeners and clears the outline on disposal', () => {
    const canvas = canvasStub();
    const remove = vi.spyOn(canvas, 'removeEventListener');
    const outlinePass = { selectedObjects: [] as Object3D[] };
    const controller = new SelectionController({
      canvas,
      camera: new PerspectiveCamera(),
      assemblyRoot: new Group(),
      outlinePass,
      partIndex: new Map(),
      intersect: () => [],
    });

    controller.dispose();
    controller.dispose();

    expect(remove).toHaveBeenCalledTimes(5);
    expect(outlinePass.selectedObjects).toEqual([]);
  });

  it('does not pick after a looped drag whose endpoint returns near its origin', () => {
    const harness = canvasHarness();
    const selected = part('selected');
    const outlinePass = { selectedObjects: [] as Object3D[] };
    const intersect = vi.fn(() => [{ object: selected.mesh, distance: 1 }]);
    const controller = new SelectionController({
      canvas: harness.canvas,
      camera: new PerspectiveCamera(),
      assemblyRoot: selected.root,
      outlinePass,
      partIndex: new Map([['selected', selected.root]]),
      intersect,
    });

    harness.dispatch('pointerdown', { pointerId: 7, clientX: 20, clientY: 30 });
    harness.dispatch('pointermove', { pointerId: 7, clientX: 80, clientY: 90 });
    harness.dispatch('pointermove', { pointerId: 8, clientX: 20, clientY: 30 });
    harness.dispatch('pointerup', { pointerId: 7, clientX: 21, clientY: 31 });

    expect(intersect).not.toHaveBeenCalled();
    expect(controller.selectedPartId).toBeNull();
    expect(harness.setPointerCapture).toHaveBeenCalledWith(7);
    expect(harness.releasePointerCapture).toHaveBeenCalledWith(7);
  });

  it('cancels an active multi-pointer gesture without picking', () => {
    const harness = canvasHarness();
    const intersect = vi.fn(() => []);
    const controller = new SelectionController({
      canvas: harness.canvas,
      camera: new PerspectiveCamera(),
      assemblyRoot: new Group(),
      outlinePass: { selectedObjects: [] },
      partIndex: new Map(),
      intersect,
    });

    harness.dispatch('pointerdown', { pointerId: 4 });
    harness.dispatch('pointerdown', { pointerId: 5 });
    harness.dispatch('pointercancel', { pointerId: 4 });
    harness.dispatch('pointerup', { pointerId: 4 });

    expect(intersect).not.toHaveBeenCalled();
    expect(harness.setPointerCapture).toHaveBeenCalledTimes(2);
    controller.dispose();
  });

  it('invalidates a click after a second pointer and recovers after every pointer ends', () => {
    const harness = canvasHarness();
    const selected = part('selected');
    const intersect = vi.fn(() => [{ object: selected.mesh, distance: 1 }]);
    const controller = new SelectionController({
      canvas: harness.canvas,
      camera: new PerspectiveCamera(),
      assemblyRoot: selected.root,
      outlinePass: { selectedObjects: [] },
      partIndex: new Map([['selected', selected.root]]),
      intersect,
    });

    harness.dispatch('pointerdown', { pointerId: 1, isPrimary: true });
    harness.dispatch('pointerdown', { pointerId: 2, isPrimary: false });
    harness.dispatch('pointermove', { pointerId: 2, clientX: 90, clientY: 70 });
    harness.dispatch('pointerup', { pointerId: 2, isPrimary: false });
    harness.dispatch('pointerup', { pointerId: 1, isPrimary: true });

    expect(intersect).not.toHaveBeenCalled();
    expect(controller.selectedPartId).toBeNull();

    harness.dispatch('pointerdown', { pointerId: 3, isPrimary: true });
    harness.dispatch('pointerup', { pointerId: 3, isPrimary: true });

    expect(intersect).toHaveBeenCalledTimes(1);
    expect(controller.selectedPartId).toBe('selected');
  });
});
