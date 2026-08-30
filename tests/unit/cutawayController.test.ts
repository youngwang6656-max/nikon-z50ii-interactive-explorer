import { BoxGeometry, Mesh, MeshStandardMaterial, Plane, Scene, Vector3 } from 'three';
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

  it('composes with ghost and inspection while preserving pre-existing clipping planes', () => {
    const originalPlane = new Plane(new Vector3(0, 0, 1), -0.012);
    const originalClipping = [originalPlane];
    const original = new MeshStandardMaterial();
    original.clippingPlanes = originalClipping;
    const mesh = new Mesh(new BoxGeometry(), original);
    const visibility = new VisibilityController([mesh]);
    const controller = new CutawayController(
      { localClippingEnabled: false },
      new Scene(),
      visibility,
    );

    visibility.ghost(mesh);
    visibility.setInspectionMode(true);
    expect((mesh.material as MeshStandardMaterial).clippingPlanes).toEqual(originalClipping);

    controller.setEnabled(true);
    expect((mesh.material as MeshStandardMaterial).clippingPlanes).toEqual([
      originalPlane,
      controller.plane,
    ]);
    expect(original.clippingPlanes).toBe(originalClipping);

    controller.setEnabled(false);
    expect(mesh.material).not.toBe(original);
    expect((mesh.material as MeshStandardMaterial).clippingPlanes).toEqual(originalClipping);

    visibility.unghost(mesh);
    expect(mesh.material).not.toBe(original);
    expect((mesh.material as MeshStandardMaterial).clippingPlanes).toEqual(originalClipping);
    visibility.setInspectionMode(false);
    expect(mesh.material).toBe(original);
    expect(original.clippingPlanes).toBe(originalClipping);

    controller.dispose();
    visibility.dispose();
  });
});
