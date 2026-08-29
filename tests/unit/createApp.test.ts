import {
  BufferGeometry,
  EventDispatcher,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Ray,
  Scene,
  Texture,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';

import fixture from '../fixtures/assembly-manifest.valid.json';
import {
  createApp,
  type AppDependencies,
} from '../../src/app/createApp';
import { parseManifest } from '../../src/domain/manifest';
import type { AppShell } from '../../src/ui/appShell';
import type { TimelineCallbacks, TimelineController } from '../../src/ui/timeline';
import type { Viewer } from '../../src/viewer/createRenderer';
import { ModuleLoader } from '../../src/viewer/moduleLoader';

function fakeShell(): AppShell {
  return {
    root: { dataset: {}, setAttribute: vi.fn() } as unknown as HTMLElement,
    viewerHost: {} as HTMLElement,
    setModuleStatus: vi.fn(),
    dispose: vi.fn(),
  };
}

class FakeControls extends EventDispatcher<{ start: object }> {
  readonly target = new Vector3();
  enabled = true;
}

function canvasStub(): HTMLCanvasElement {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
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

  it('coordinates guided controls, root progress, exact offsets, and cancellation hooks', async () => {
    const manifest = parseManifest({
      ...fixture,
      modules: fixture.modules.map((module) => ({ ...module, preload: false })),
    });
    const shell = fakeShell();
    Object.defineProperty(shell, 'timelinePanel', { value: {} as HTMLElement });
    const part = new Object3D();
    part.position.set(0.01, 0.02, 0.03);
    part.updateMatrix();
    const assembledMatrix = part.matrix.clone();
    const camera = new PerspectiveCamera();
    const controls = new FakeControls();
    const viewer = {
      ...fakeViewer(),
      camera,
      controls,
      partIndex: new Map([[fixture.parts[0]!.partId, part]]),
    } as unknown as Viewer;
    let callbacks: TimelineCallbacks | undefined;
    let timelineMode: 'guided' | 'free' = 'guided';
    const timeline: TimelineController = {
      root: {} as HTMLElement,
      get mode() { return timelineMode; },
      render: vi.fn(),
      setMode: vi.fn((mode) => { timelineMode = mode; }),
      dispose: vi.fn(),
    };
    let frameCallback: FrameRequestCallback | undefined;
    const cancelFrame = vi.fn();
    const app = await createApp({} as HTMLElement, {
      loadManifest: async () => manifest,
      mountShell: () => shell,
      createViewer: () => viewer,
      createModuleLoader: () => new ModuleLoader(manifest, async () => { throw new Error('unused'); }),
      mountTimeline: (_host, _manifest, value) => {
        callbacks = value;
        return timeline;
      },
      requestAnimationFrame: (callback) => {
        frameCallback = callback;
        return 41;
      },
      cancelAnimationFrame: cancelFrame,
      prefersReducedMotion: () => false,
    });

    expect(app.guidedPlaybackActive).toBe(false);
    expect(app.freeDragEnabled).toBe(false);
    callbacks!.onModeChange('free');
    expect(timelineMode).toBe('free');
    expect(shell.root.dataset.interactionMode).toBe('free');
    expect(app.freeDragEnabled).toBe(true);
    callbacks!.onTogglePlay();
    expect(app.guidedPlaybackActive).toBe(false);
    callbacks!.onGlobalExplode(0.6);
    expect(app.assemblyState.progress[fixture.parts[0]!.partId]).toBe(0.6);
    callbacks!.onModeChange('guided');
    expect(timelineMode).toBe('guided');
    expect(app.freeDragEnabled).toBe(false);
    expect(app.guidedSequence.snapshot().normalizedTime).toBe(0.6);
    expect(app.assemblyState.progress[fixture.parts[0]!.partId]).toBe(1);
    expect(shell.root.dataset.assemblyProgress).toBe('0.6');

    callbacks!.onSeek(0.75);
    expect(shell.root.dataset.assemblyProgress).toBe('0.75');
    expect(shell.root.dataset.cameraTweenActive).toBe('true');
    expect(part.position.z).toBeGreaterThan(0.03);
    callbacks!.onGlobalExplode(0.6);
    expect(shell.root.dataset.assemblyProgress).toBe('0.6');
    expect(shell.root.dataset.cameraTweenActive).toBe('false');
    expect(app.assemblyState.history).toEqual([]);
    frameCallback!(100);
    expect(shell.root.dataset.assemblyProgress).toBe('0.6');
    callbacks!.onTogglePlay();
    expect(app.guidedSequence.snapshot().normalizedTime).toBe(0.6);
    expect(shell.root.dataset.assemblyProgress).toBe('0.6');
    expect(app.assemblyState.progress[fixture.parts[0]!.partId]).toBe(1);
    const atomicProgress = { ...app.assemblyState.progress };
    frameCallback!(200);
    expect(app.assemblyState.progress).toEqual(atomicProgress);
    callbacks!.onTogglePlay();
    callbacks!.onSeek(0);
    expect(part.matrix.elements).toEqual(assembledMatrix.elements);

    callbacks!.onTogglePlay();
    expect(app.guidedPlaybackActive).toBe(true);
    expect(app.freeDragEnabled).toBe(false);
    expect(frameCallback).toBeTypeOf('function');
    frameCallback!(100);
    app.cancelGuidedPlayback();
    expect(app.guidedPlaybackActive).toBe(false);
    expect(app.freeDragEnabled).toBe(false);

    app.dispose();
    expect(cancelFrame).toHaveBeenCalledWith(41);
    expect(timeline.dispose).toHaveBeenCalledTimes(1);
  });

  it('coordinates free drag history, undo/reset, and guided-mode drag cancellation', async () => {
    const manifest = parseManifest({
      ...fixture,
      modules: fixture.modules.map((module) => ({ ...module, preload: false })),
    });
    const shell = fakeShell();
    Object.defineProperty(shell, 'timelinePanel', { value: {} as HTMLElement });
    const part = new Object3D();
    const controls = new FakeControls();
    const camera = new PerspectiveCamera(45, 2, 0.01, 10);
    camera.position.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    const viewer = {
      ...fakeViewer(),
      renderer: { domElement: canvasStub() },
      scene: new Scene(),
      camera,
      controls,
      partIndex: new Map([[manifest.parts[0]!.partId, part]]),
    } as unknown as Viewer;
    let callbacks: TimelineCallbacks | undefined;
    let timelineMode: 'guided' | 'free' = 'guided';
    const timeline: TimelineController = {
      root: {} as HTMLElement,
      get mode() { return timelineMode; },
      render: vi.fn(),
      setMode: vi.fn((mode) => { timelineMode = mode; }),
      dispose: vi.fn(),
    };
    const app = await createApp({} as HTMLElement, {
      loadManifest: async () => manifest,
      mountShell: () => shell,
      createViewer: () => viewer,
      createModuleLoader: () => new ModuleLoader(manifest, async () => { throw new Error('unused'); }),
      mountTimeline: (_host, _manifest, value) => {
        callbacks = value;
        return timeline;
      },
    });
    const partId = manifest.parts[0]!.partId;
    callbacks!.onModeChange('free');
    const startRay = new Ray(new Vector3(0, 1, 0), new Vector3(0, -1, 0));
    app.axisDragController!.begin(partId, startRay, 31);
    app.axisDragController!.update(new Ray(new Vector3(0, 1, 0.02), new Vector3(0, -1, 0)));
    app.axisDragController!.end();

    expect(app.assemblyState.progress[partId]).toBe(0.5);
    expect(app.assemblyState.history).toEqual([{ partId, from: 0, to: 0.5 }]);
    app.undoLastMove();
    expect(app.assemblyState.progress[partId]).toBe(0);
    expect(app.assemblyState.history).toEqual([]);

    app.axisDragController!.begin(partId, startRay, 32);
    app.axisDragController!.update(new Ray(new Vector3(0, 1, 0.03), new Vector3(0, -1, 0)));
    app.axisDragController!.end();
    app.resetAssembly();
    expect(Object.values(app.assemblyState.progress)).toEqual([0, 0]);
    expect(app.assemblyState.history).toEqual([]);

    app.axisDragController!.begin(partId, startRay, 33);
    app.axisDragController!.update(new Ray(new Vector3(0, 1, 0.01), new Vector3(0, -1, 0)));
    callbacks!.onModeChange('guided');
    expect(app.axisDragController!.isDragging).toBe(false);
    expect(controls.enabled).toBe(true);
    expect(app.assemblyState.history).toEqual([]);
    app.dispose();
  });
});
