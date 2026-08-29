import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';

import { VisibilityController } from '../../src/viewer/visibilityController';

function part(material: MeshStandardMaterial, visible = true) {
  const root = new Group();
  const mesh = new Mesh(new BoxGeometry(), material);
  mesh.visible = visible;
  root.add(mesh);
  return { root, mesh };
}

describe('VisibilityController', () => {
  it('restores the exact prior flags after hide/show and isolate/clear', () => {
    const first = part(new MeshStandardMaterial(), false);
    const second = part(new MeshStandardMaterial(), true);
    const controller = new VisibilityController([first.root, second.root]);

    controller.hide(second.root);
    expect(second.mesh.visible).toBe(false);
    controller.show(second.root);
    expect(second.mesh.visible).toBe(true);

    controller.isolate(first.root);
    expect(first.mesh.visible).toBe(true);
    expect(second.mesh.visible).toBe(false);
    controller.clearIsolation();

    expect(first.mesh.visible).toBe(false);
    expect(second.mesh.visible).toBe(true);
  });

  it('ghosts with owned clones and restores exact shared material references and properties', () => {
    const shared = new MeshStandardMaterial({
      opacity: 0.73,
      transparent: false,
      depthWrite: true,
      metalness: 0.81,
      roughness: 0.27,
    });
    const first = part(shared);
    const second = part(shared);
    const controller = new VisibilityController([first.root, second.root]);

    controller.ghost(first.root);

    const owned = first.mesh.material as MeshStandardMaterial;
    expect(owned).not.toBe(shared);
    expect(owned.opacity).toBe(0.18);
    expect(owned.transparent).toBe(true);
    expect(owned.depthWrite).toBe(false);
    expect(owned.metalness).toBe(0.81);
    expect(owned.roughness).toBe(0.27);
    expect(second.mesh.material).toBe(shared);
    expect(shared.opacity).toBe(0.73);
    expect(shared.transparent).toBe(false);
    expect(shared.depthWrite).toBe(true);

    const dispose = vi.fn();
    owned.addEventListener('dispose', dispose);
    controller.unghost(first.root);

    expect(first.mesh.material).toBe(shared);
    expect(second.mesh.material).toBe(shared);
    expect(shared.opacity).toBe(0.73);
    expect(shared.transparent).toBe(false);
    expect(shared.depthWrite).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('reset and dispose restore every active visibility and material layer exactly once', () => {
    const original = new MeshStandardMaterial({ opacity: 0.64, transparent: true, depthWrite: false });
    const target = part(original);
    const other = part(new MeshStandardMaterial());
    const controller = new VisibilityController([target.root, other.root]);

    controller.hide(other.root);
    controller.ghost(target.root);
    const owned = target.mesh.material as MeshStandardMaterial;
    const dispose = vi.fn();
    owned.addEventListener('dispose', dispose);
    controller.reset();

    expect(other.mesh.visible).toBe(true);
    expect(target.mesh.material).toBe(original);
    expect(original.opacity).toBe(0.64);
    expect(original.transparent).toBe(true);
    expect(original.depthWrite).toBe(false);
    expect(dispose).toHaveBeenCalledTimes(1);

    controller.dispose();
    controller.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
