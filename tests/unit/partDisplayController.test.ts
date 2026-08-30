import {
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Texture,
} from 'three';
import { describe, expect, it, vi } from 'vitest';

import { PartDisplayController } from '../../src/viewer/partDisplayController';

function indexedPart(partId: string, material: MeshStandardMaterial) {
  const root = new Group();
  root.userData.partId = partId;
  const mesh = new Mesh(undefined, material);
  root.add(mesh);
  return { root, mesh };
}

describe('PartDisplayController', () => {
  it('transfers hidden, isolated, and ghosted state to replacement part objects', () => {
    const firstA = new Group();
    const firstB = new Group();
    firstA.add(new Mesh(new BufferGeometry(), new MeshStandardMaterial()));
    firstB.add(new Mesh(new BufferGeometry(), new MeshStandardMaterial()));
    const index = new Map<string, Object3D>([['a', firstA], ['b', firstB]]);
    const controller = new PartDisplayController(index);
    controller.toggleHidden('a');
    controller.toggleTransparency('a');
    controller.toggleIsolation('b');
    const snapshot = controller.snapshot();

    const nextA = new Group();
    const nextB = new Group();
    nextA.add(new Mesh(new BufferGeometry(), new MeshStandardMaterial()));
    nextB.add(new Mesh(new BufferGeometry(), new MeshStandardMaterial()));
    index.set('a', nextA);
    index.set('b', nextB);
    controller.restore(snapshot);

    expect(controller.getState('a')).toEqual({
      hidden: true,
      isolated: false,
      transparent: true,
    });
    expect(controller.getState('b')).toEqual({
      hidden: false,
      isolated: true,
      transparent: false,
    });
    expect(nextA.visible).toBe(false);
    expect(nextB.visible).toBe(true);
  });
  it('isolates transparency to one mesh sharing a GLTF material and restores exact ownership', () => {
    const shared = new MeshStandardMaterial({ opacity: 0.82, transparent: false });
    const sharedTexture = new Texture();
    shared.map = sharedTexture;
    const textureDispose = vi.fn();
    sharedTexture.addEventListener('dispose', textureDispose);
    const left = indexedPart('left', shared);
    const right = indexedPart('right', shared);
    const controller = new PartDisplayController(new Map([
      ['left', left.root],
      ['right', right.root],
    ]));

    controller.toggleTransparency('left');

    expect(left.mesh.material).not.toBe(shared);
    expect((left.mesh.material as MeshStandardMaterial).opacity).toBe(0.18);
    expect((left.mesh.material as MeshStandardMaterial).map).toBe(sharedTexture);
    expect(right.mesh.material).toBe(shared);
    expect(shared.opacity).toBe(0.82);

    const owned = left.mesh.material as MeshStandardMaterial;
    const dispose = vi.fn();
    owned.addEventListener('dispose', dispose);
    controller.toggleTransparency('left');

    expect(left.mesh.material).toBe(shared);
    expect(right.mesh.material).toBe(shared);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).not.toHaveBeenCalled();
    controller.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).not.toHaveBeenCalled();
  });

  it('applies an active isolation snapshot to parts mounted later and restores hidden state', () => {
    const first = indexedPart('first', new MeshStandardMaterial());
    const second = indexedPart('second', new MeshStandardMaterial());
    const index = new Map([['first', first.root]]);
    const controller = new PartDisplayController(index);

    controller.toggleIsolation('first');
    index.set('second', second.root);
    controller.apply();
    expect(second.mesh.visible).toBe(false);

    controller.toggleIsolation('first');
    expect(first.mesh.visible).toBe(true);
    expect(second.mesh.visible).toBe(true);
  });

  it('reveals an isolated hidden target, restores hidden state, and resets isolation on new selection', () => {
    const first = indexedPart('first', new MeshStandardMaterial());
    const second = indexedPart('second', new MeshStandardMaterial());
    const controller = new PartDisplayController(new Map([
      ['first', first.root],
      ['second', second.root],
    ]));

    controller.toggleHidden('first');
    controller.toggleIsolation('first');
    expect(first.mesh.visible).toBe(true);
    expect(second.mesh.visible).toBe(false);

    controller.toggleIsolation('first');
    expect(first.mesh.visible).toBe(false);
    expect(second.mesh.visible).toBe(true);

    controller.toggleIsolation('first');
    controller.reconcileSelection('second');
    expect(controller.getState('first').isolated).toBe(false);
    expect(first.mesh.visible).toBe(false);
    expect(second.mesh.visible).toBe(true);
    expect(controller.getState('second').hidden).toBe(false);
  });

  it('restores active cloned materials exactly once when disposed', () => {
    const original = new MeshStandardMaterial();
    const part = indexedPart('part', original);
    const controller = new PartDisplayController(new Map([['part', part.root]]));
    controller.toggleTransparency('part');
    const owned = part.mesh.material as MeshStandardMaterial;
    const dispose = vi.fn();
    owned.addEventListener('dispose', dispose);

    controller.dispose();
    controller.dispose();

    expect(part.mesh.material).toBe(original);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
