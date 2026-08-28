import {
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Texture,
} from 'three';
import { describe, expect, it } from 'vitest';

import type { LoadedModule } from '../../src/viewer/moduleLoader';
import { ModuleMountRegistry } from '../../src/viewer/moduleMountRegistry';

function loadedModule(
  moduleId: string,
  partId: string,
): {
  loaded: LoadedModule;
  part: Group;
  disposeCounts: { geometry: number; material: number; texture: number };
} {
  const root = new Group();
  const part = new Group();
  part.userData.partId = partId;
  const geometry = new BufferGeometry();
  const texture = new Texture();
  const material = new MeshStandardMaterial({ map: texture });
  const disposeCounts = { geometry: 0, material: 0, texture: 0 };
  geometry.addEventListener('dispose', () => {
    disposeCounts.geometry += 1;
  });
  material.addEventListener('dispose', () => {
    disposeCounts.material += 1;
  });
  texture.addEventListener('dispose', () => {
    disposeCounts.texture += 1;
  });
  part.add(new Mesh(geometry, material));
  root.add(part);
  return {
    loaded: {
      moduleId,
      quality: 'high',
      root,
      partIndex: new Map([[partId, part]]),
    },
    part,
    disposeCounts,
  };
}

describe('ModuleMountRegistry', () => {
  it('rejects a cross-module part collision before mutating roots or the shared index', () => {
    const assemblyRoot = new Group();
    const registry = new ModuleMountRegistry(assemblyRoot);
    const first = loadedModule('01_chassis_front', 'Z50II-01-001');
    const colliding = loadedModule('02_outer_shell_controls', 'Z50II-01-001');
    registry.add(first.loaded);

    expect(() => registry.add(colliding.loaded)).toThrow(
      'Part index collision for Z50II-01-001 while adding 02_outer_shell_controls',
    );

    expect(assemblyRoot.children).toEqual([first.loaded.root]);
    expect(registry.partIndex.get('Z50II-01-001')).toBe(first.part);
    expect(colliding.loaded.root.parent).toBeNull();
    expect(colliding.loaded.root.userData.moduleId).toBeUndefined();
  });

  it('replaces module quality transactionally and disposes every owned root once at teardown', () => {
    const assemblyRoot = new Group();
    const registry = new ModuleMountRegistry(assemblyRoot);
    const high = loadedModule('01_chassis_front', 'Z50II-01-001');
    const low = loadedModule('01_chassis_front', 'Z50II-01-001');
    low.loaded.quality = 'low';

    registry.add(high.loaded);
    registry.add(low.loaded);

    expect(assemblyRoot.children).toEqual([low.loaded.root]);
    expect(high.loaded.root.parent).toBeNull();
    expect(registry.partIndex.get('Z50II-01-001')).toBe(low.part);

    registry.add(high.loaded);
    expect(assemblyRoot.children).toEqual([high.loaded.root]);
    expect(registry.partIndex.get('Z50II-01-001')).toBe(high.part);

    registry.dispose();
    registry.dispose();

    expect(assemblyRoot.children).toHaveLength(0);
    expect(registry.partIndex.size).toBe(0);
    expect(high.disposeCounts).toEqual({ geometry: 1, material: 1, texture: 1 });
    expect(low.disposeCounts).toEqual({ geometry: 1, material: 1, texture: 1 });
    expect(() => registry.add(high.loaded)).toThrow(
      'ModuleMountRegistry has been disposed',
    );
  });
});
