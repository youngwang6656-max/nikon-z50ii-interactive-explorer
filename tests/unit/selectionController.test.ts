import {
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
} from 'three';
import { describe, expect, it, vi } from 'vitest';

import { SelectionController } from '../../src/viewer/selectionController';

function canvasStub(): HTMLCanvasElement {
  const listeners = new Map<string, Set<EventListener>>();
  return {
    addEventListener(type: string, listener: EventListener) {
      const handlers = listeners.get(type) ?? new Set<EventListener>();
      handlers.add(listener);
      listeners.set(type, handlers);
    },
    removeEventListener(type: string, listener: EventListener) {
      listeners.get(type)?.delete(listener);
    },
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

    expect(remove).toHaveBeenCalledTimes(2);
    expect(outlinePass.selectedObjects).toEqual([]);
  });
});
