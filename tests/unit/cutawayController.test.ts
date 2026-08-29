import { BoxGeometry, Mesh, MeshStandardMaterial, Scene, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';

import { CutawayController } from '../../src/viewer/cutawayController';
import { VisibilityController } from '../../src/viewer/visibilityController';

describe('CutawayController', () => {
  it('moves one visible X/Y/Z plane without mutating shared materials and restores exactly', () => {
    const shared = new MeshStandardMaterial();
    shared.clippingPlanes = null;
    const first = new Mesh(new BoxGeometry(), shared);
    const second = new Mesh(new BoxGeometry(), shared);
    const visibility = new VisibilityController([first, second]);
    const renderer = { localClippingEnabled: false };
    const scene = new Scene();
    const controller = new CutawayController(renderer, scene, visibility);

    controller.setAxis('y');
    controller.setOffset(-0.035);
    controller.setEnabled(true);

    expect(renderer.localClippingEnabled).toBe(true);
    expect(controller.helper.visible).toBe(true);
    const helperMaterial = Array.isArray(controller.helper.material)
      ? controller.helper.material[0]!
      : controller.helper.material;
    expect(helperMaterial.transparent).toBe(true);
    expect(helperMaterial.depthWrite).toBe(false);
    expect(helperMaterial.opacity).toBeLessThanOrEqual(0.12);
    expect(controller.plane.normal).toEqual(new Vector3(0, 1, 0));
    expect(controller.plane.constant).toBeCloseTo(0.035, 12);
    expect(first.material).not.toBe(shared);
    expect(second.material).not.toBe(shared);
    expect(first.material).not.toBe(second.material);
    expect((first.material as MeshStandardMaterial).clippingPlanes).toEqual([controller.plane]);
    expect(shared.clippingPlanes).toBeNull();

    const firstOwned = first.material as MeshStandardMaterial;
    const dispose = vi.fn();
    firstOwned.addEventListener('dispose', dispose);
    controller.setEnabled(false);

    expect(renderer.localClippingEnabled).toBe(false);
    expect(controller.helper.visible).toBe(false);
    expect(first.material).toBe(shared);
    expect(second.material).toBe(shared);
    expect(shared.clippingPlanes).toBeNull();
    expect(dispose).toHaveBeenCalledTimes(1);

    controller.dispose();
    expect(scene.children).not.toContain(controller.helper);
  });
});
