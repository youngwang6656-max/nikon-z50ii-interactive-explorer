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
import {
  createApp,
  type AppDependencies,
} from '../../src/app/createApp';
import { parseManifest } from '../../src/domain/manifest';
import type { AppShell } from '../../src/ui/appShell';
import type { Viewer } from '../../src/viewer/createRenderer';
import { ModuleLoader } from '../../src/viewer/moduleLoader';

function fakeShell(): AppShell {
  return {
    root: {} as HTMLElement,
    viewerHost: {} as HTMLElement,
    setModuleStatus: vi.fn(),
    dispose: vi.fn(),
  };
}

function fakeViewer(): Viewer {
  return {
    addModule: vi.fn(),
    removeModule: vi.fn(),
    resize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(),
  } as unknown as Viewer;
}

function trackedScene(): {
  scene: Group;
  counts: { geometry: number; material: number; texture: number };
} {
  const scene = new Group();
  const part = new Group();
  part.userData.partId = 'Z50II-01-001';
  const geometry = new BufferGeometry();
  const texture = new Texture();
  const material = new MeshStandardMaterial({ map: texture });
  const counts = { geometry: 0, material: 0, texture: 0 };
  geometry.addEventListener('dispose', () => {
    counts.geometry += 1;
  });
  material.addEventListener('dispose', () => {
    counts.material += 1;
  });
  texture.addEventListener('dispose', () => {
    counts.texture += 1;
  });
  part.add(new Mesh(geometry, material));
  scene.add(part);
  return { scene, counts };
}

describe('createApp lifecycle', () => {
  it('does not attach a late preload root after app disposal and releases it once', async () => {
    const manifest = parseManifest({
      ...fixture,
      modules: fixture.modules.map((module) => ({
        ...module,
        preload: module.moduleId === '01_chassis_front',
      })),
    });
    let resolveFetch: ((value: { scene: Object3D }) => void) | undefined;
    const loader = new ModuleLoader(
      manifest,
      () =>
        new Promise<{ scene: Object3D }>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const shell = fakeShell();
    const viewer = fakeViewer();
    const { scene, counts } = trackedScene();
    const dependencies: AppDependencies = {
      loadManifest: async () => manifest,
      mountShell: () => shell,
      createViewer: () => viewer,
      createModuleLoader: () => loader,
    };

    const app = await createApp({} as HTMLElement, dependencies);
    app.dispose();
    resolveFetch?.({ scene });
    await app.preloadReady;
    app.dispose();

    expect(viewer.addModule).not.toHaveBeenCalled();
    expect(scene.parent).toBeNull();
    expect(counts).toEqual({ geometry: 1, material: 1, texture: 1 });
    expect(viewer.dispose).toHaveBeenCalledTimes(1);
    expect(shell.dispose).toHaveBeenCalledTimes(1);
  });

  it('can create and tear down repeated app instances with isolated owners', async () => {
    const manifest = parseManifest({
      ...fixture,
      modules: fixture.modules.map((module) => ({ ...module, preload: false })),
    });
    const shells: AppShell[] = [];
    const viewers: Viewer[] = [];
    const dependencies: AppDependencies = {
      loadManifest: async () => manifest,
      mountShell: () => {
        const shell = fakeShell();
        shells.push(shell);
        return shell;
      },
      createViewer: () => {
        const viewer = fakeViewer();
        viewers.push(viewer);
        return viewer;
      },
      createModuleLoader: () =>
        new ModuleLoader(manifest, async () => {
          throw new Error('no preload expected');
        }),
    };

    const first = await createApp({} as HTMLElement, dependencies);
    first.dispose();
    const second = await createApp({} as HTMLElement, dependencies);
    second.dispose();

    expect(shells).toHaveLength(2);
    expect(viewers).toHaveLength(2);
    expect(shells[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(shells[1]?.dispose).toHaveBeenCalledTimes(1);
    expect(viewers[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(viewers[1]?.dispose).toHaveBeenCalledTimes(1);
  });
});
