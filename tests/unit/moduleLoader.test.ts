import {
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Texture,
} from 'three';
import { describe, expect, it, vi } from 'vitest';

import fixture from '../fixtures/assembly-manifest.valid.json';
import { parseManifest, type QualityLevel } from '../../src/domain/manifest';
import { ModuleLoader, type ModuleFetcher } from '../../src/viewer/moduleLoader';
import { neutralizeFailedMaterialTextures } from '../../src/viewer/moduleLoader';

const manifest = parseManifest(fixture);

function sceneWithParts(...partIds: string[]): Group {
  const scene = new Group();
  scene.name = 'loaded-module';

  for (const partId of partIds) {
    const part = new Group();
    part.name = partId;
    part.userData.partId = partId;
    part.add(new Mesh());
    scene.add(part);
  }

  return scene;
}

function successfulFetcher(): ModuleFetcher {
  return vi.fn(async (url) => ({
    scene: url.includes('/02.')
      ? sceneWithParts('Z50II-02-001')
      : sceneWithParts('Z50II-01-001'),
  }));
}

function trackedPartScene(partId: string): {
  scene: Group;
  disposeCounts: { geometry: number; material: number; texture: number };
} {
  const scene = new Group();
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
  scene.add(part);
  return { scene, disposeCounts };
}

describe('ModuleLoader', () => {
  it('deduplicates concurrent requests and reuses the loaded root', async () => {
    let resolveFetch: ((value: { scene: Object3D }) => void) | undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<{ scene: Object3D }>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const loader = new ModuleLoader(manifest, fetcher);

    const first = loader.load('01_chassis_front', 'high');
    const concurrent = loader.load('01_chassis_front', 'high');

    expect(concurrent).toBe(first);
    expect(loader.getState('01_chassis_front', 'high')).toEqual({
      status: 'loading',
      quality: 'high',
      error: null,
      retryCount: 0,
    });

    resolveFetch?.({ scene: sceneWithParts('Z50II-01-001') });
    const loaded = await first;

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(loader.load('01_chassis_front', 'high')).toBe(first);
    await expect(loader.load('01_chassis_front', 'high')).resolves.toBe(loaded);
  });

  it('uses independent cache and state keys for each quality', async () => {
    const fetcher = successfulFetcher();
    const loader = new ModuleLoader(manifest, fetcher);

    const high = loader.load('01_chassis_front', 'high');
    const low = loader.load('01_chassis_front', 'low');

    expect(low).not.toBe(high);
    await Promise.all([high, low]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(1, 'assets/models/high/01.glb');
    expect(fetcher).toHaveBeenNthCalledWith(2, 'assets/models/low/01.glb');
    expect(loader.getState('01_chassis_front', 'high').status).toBe('ready');
    expect(loader.getState('01_chassis_front', 'low').status).toBe('ready');
  });

  it('records a failed attempt and retries the same quality explicitly', async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('network');
      return { scene: sceneWithParts('Z50II-01-001') };
    });
    const loader = new ModuleLoader(manifest, fetcher);

    const failed = loader.load('01_chassis_front', 'low');
    await expect(failed).rejects.toThrow('network');
    expect(loader.getState('01_chassis_front', 'low')).toEqual({
      status: 'failed',
      quality: 'low',
      error: 'network',
      retryCount: 0,
    });
    expect(loader.load('01_chassis_front', 'low')).toBe(failed);

    const recovered = await loader.retry('01_chassis_front');

    expect(recovered.quality).toBe('low');
    expect(calls).toBe(2);
    expect(loader.getState('01_chassis_front', 'low')).toEqual({
      status: 'ready',
      quality: 'low',
      error: null,
      retryCount: 1,
    });
  });

  it('keeps the latest error and retry count when a retry also fails', async () => {
    const fetcher = vi
      .fn<ModuleFetcher>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce('decoder unavailable');
    const loader = new ModuleLoader(manifest, fetcher);

    await expect(loader.load('01_chassis_front', 'high')).rejects.toThrow('offline');
    await expect(loader.retry('01_chassis_front')).rejects.toBe('decoder unavailable');

    expect(loader.getState('01_chassis_front', 'high')).toEqual({
      status: 'failed',
      quality: 'high',
      error: 'decoder unavailable',
      retryCount: 1,
    });
  });

  it('deduplicates concurrent retries and increments the retry count once', async () => {
    let resolveRetry: ((value: { scene: Object3D }) => void) | undefined;
    const fetcher = vi
      .fn<ModuleFetcher>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRetry = resolve; }));
    const loader = new ModuleLoader(manifest, fetcher);
    await expect(loader.load('01_chassis_front', 'high')).rejects.toThrow('offline');

    const first = loader.retry('01_chassis_front');
    const concurrent = loader.retry('01_chassis_front');

    expect(concurrent).toBe(first);
    expect(loader.getState('01_chassis_front', 'high').retryCount).toBe(1);
    resolveRetry?.({ scene: sceneWithParts('Z50II-01-001') });
    await expect(first).resolves.toMatchObject({ quality: 'high' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('neutralizes only materials whose texture failed and records the failed URL', async () => {
    const scene = sceneWithParts('Z50II-01-001');
    const healthyTexture = new Texture({ naturalWidth: 32 } as HTMLImageElement);
    // GLTFLoader omits a texture slot after an external image request fails.
    const failedMaterial = new MeshStandardMaterial({ color: 0xff00ff });
    const healthyMaterial = new MeshStandardMaterial({ color: 0x123456, map: healthyTexture });
    const affected = new Mesh(new BufferGeometry(), failedMaterial);
    const unaffected = new Mesh(new BufferGeometry(), healthyMaterial);
    scene.children[0]!.add(affected, unaffected);
    const failedUrl = 'https://example.test/textures/missing-basecolor.png';

    const loader = new ModuleLoader(manifest, async () => ({
      scene,
      failedTextureUrls: [failedUrl],
      failedMaterials: [failedMaterial],
    }));
    await loader.load('01_chassis_front', 'high');

    expect(affected.material).not.toBe(failedMaterial);
    expect((affected.material as MeshStandardMaterial).color.getHex()).toBe(0x777777);
    expect((affected.material as MeshStandardMaterial).map).toBeNull();
    expect(affected.material.userData.failedTextureUrls).toEqual([failedUrl]);
    expect(unaffected.material).toBe(healthyMaterial);
    expect(loader.getFailedTextureUrls('01_chassis_front', 'high')).toEqual([failedUrl]);
  });

  it('does not neutralize a material when there are no failed texture URLs', () => {
    const scene = new Group();
    const material = new MeshStandardMaterial({ color: 0xff00ff, map: new Texture() });
    const mesh = new Mesh(new BufferGeometry(), material);
    scene.add(mesh);

    neutralizeFailedMaterialTextures(scene, []);

    expect(mesh.material).toBe(material);
  });

  it('does not create a duplicate loaded root when retry is called after success', async () => {
    const fetcher = successfulFetcher();
    const loader = new ModuleLoader(manifest, fetcher);

    await loader.load('01_chassis_front', 'high');

    expect(() => loader.retry('01_chassis_front')).toThrow(
      'Cannot retry 01_chassis_front:high because its state is ready',
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects a module whose loaded scene omits expected manifest parts', async () => {
    const loader = new ModuleLoader(manifest, async () => ({ scene: new Group() }));

    await expect(loader.load('02_outer_shell_controls', 'high')).rejects.toThrow(
      '02_outer_shell_controls is missing expected parts: Z50II-02-001',
    );
    expect(loader.getState('02_outer_shell_controls', 'high').status).toBe('failed');
  });

  it('indexes part roots and resolves descendant meshes through their nearest part ancestor', async () => {
    const scene = new Group();
    const outerPart = new Group();
    outerPart.userData.partId = 'Z50II-02-001';
    const outerMesh = new Mesh();
    const nestedPart = new Group();
    nestedPart.userData.partId = 'Z50II-01-001';
    const nestedMesh = new Mesh();
    nestedPart.add(nestedMesh);
    outerPart.add(outerMesh, nestedPart);
    scene.add(outerPart);

    const extendedManifest = parseManifest({
      ...fixture,
      parts: fixture.parts.map((part) =>
        part.partId === 'Z50II-01-001'
          ? { ...part, moduleId: '02_outer_shell_controls' }
          : part,
      ),
    });
    const loader = new ModuleLoader(extendedManifest, async () => ({ scene }));

    const loaded = await loader.load('02_outer_shell_controls', 'high');

    expect(loaded.partIndex.get('Z50II-02-001')).toBe(outerPart);
    expect(loaded.partIndex.get('Z50II-01-001')).toBe(nestedPart);
    expect(loader.resolvePartId(outerMesh)).toBe('Z50II-02-001');
    expect(loader.resolvePartId(nestedMesh)).toBe('Z50II-01-001');
    expect(loader.resolvePartId(scene)).toBeNull();
  });

  it('rejects duplicate part IDs in one loaded root', async () => {
    const scene = new Group();
    const first = new Group();
    const duplicate = new Group();
    first.userData.partId = 'Z50II-01-001';
    duplicate.userData.partId = 'Z50II-01-001';
    scene.add(first, duplicate);
    const loader = new ModuleLoader(manifest, async () => ({ scene }));

    await expect(loader.load('01_chassis_front', 'high')).rejects.toThrow(
      '01_chassis_front contains duplicate partId Z50II-01-001',
    );
  });

  it('rejects tagged parts that belong to another manifest module', async () => {
    const scene = sceneWithParts('Z50II-01-001', 'Z50II-02-001');
    const loader = new ModuleLoader(manifest, async () => ({ scene }));

    await expect(loader.load('01_chassis_front', 'high')).rejects.toThrow(
      '01_chassis_front contains unexpected parts: Z50II-02-001',
    );
    expect(loader.getState('01_chassis_front', 'high').status).toBe('failed');
  });

  it('rejects unknown modules and runtime-invalid qualities before fetching', () => {
    const fetcher = successfulFetcher();
    const loader = new ModuleLoader(manifest, fetcher);

    expect(() => loader.load('99_unknown', 'high')).toThrow('Unknown module: 99_unknown');
    expect(() =>
      loader.load('01_chassis_front', 'medium' as QualityLevel),
    ).toThrow('Unknown quality: medium');
    expect(() => loader.getState('99_unknown', 'high')).toThrow('Unknown module: 99_unknown');
    expect(() => loader.retry('99_unknown')).toThrow('Unknown module: 99_unknown');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('disposes owned fetch resources once and rejects later loads', () => {
    const dispose = vi.fn();
    const fetcher = Object.assign(successfulFetcher(), { dispose });
    const loader = new ModuleLoader(manifest, fetcher);

    loader.dispose();
    loader.dispose();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(() => loader.load('01_chassis_front', 'high')).toThrow(
      'ModuleLoader has been disposed',
    );
  });

  it('disposes a decoded scene exactly once when an in-flight load finishes after disposal', async () => {
    let resolveFetch: ((value: { scene: Object3D }) => void) | undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<{ scene: Object3D }>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const { scene, disposeCounts } = trackedPartScene('Z50II-01-001');
    const loader = new ModuleLoader(manifest, fetcher);

    const pending = loader.load('01_chassis_front', 'high');
    loader.dispose();
    resolveFetch?.({ scene });

    await expect(pending).rejects.toThrow(
      'ModuleLoader was disposed while loading 01_chassis_front:high',
    );
    expect(disposeCounts).toEqual({ geometry: 1, material: 1, texture: 1 });
    loader.dispose();
    expect(disposeCounts).toEqual({ geometry: 1, material: 1, texture: 1 });
  });

  it('rejects retry after disposal without changing the failed state', async () => {
    const fetcher = vi.fn<ModuleFetcher>().mockRejectedValue(new Error('offline'));
    const loader = new ModuleLoader(manifest, fetcher);
    await expect(loader.load('01_chassis_front', 'low')).rejects.toThrow('offline');
    const beforeDispose = loader.getState('01_chassis_front', 'low');

    loader.dispose();

    expect(() => loader.retry('01_chassis_front')).toThrow(
      'ModuleLoader has been disposed',
    );
    expect(loader.getState('01_chassis_front', 'low')).toEqual(beforeDispose);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
