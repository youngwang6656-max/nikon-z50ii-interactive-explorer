import { Object3D } from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import type {
  AssemblyManifest,
  ModuleManifest,
  QualityLevel,
} from '../domain/manifest';
import { disposeObjectTree } from './disposeObjectTree';

export type ModuleStatus = 'idle' | 'loading' | 'ready' | 'failed';

export interface ModuleLoadState {
  status: ModuleStatus;
  quality: QualityLevel;
  error: string | null;
  retryCount: number;
}

export interface ModuleAsset {
  scene: Object3D;
}

export interface ModuleFetcher {
  (url: string): Promise<ModuleAsset>;
  dispose?: () => void;
}

export interface LoadedModule {
  moduleId: string;
  quality: QualityLevel;
  root: Object3D;
  partIndex: ReadonlyMap<string, Object3D>;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isQualityLevel(value: string): value is QualityLevel {
  return value === 'high' || value === 'low';
}

function moduleKey(moduleId: string, quality: QualityLevel): string {
  return `${moduleId}:${quality}`;
}

function indexParts(moduleId: string, root: Object3D): Map<string, Object3D> {
  const partIndex = new Map<string, Object3D>();

  root.traverse((object) => {
    const partId = object.userData.partId;
    if (typeof partId !== 'string' || partId.length === 0) return;
    if (partIndex.has(partId)) {
      throw new Error(`${moduleId} contains duplicate partId ${partId}`);
    }
    partIndex.set(partId, object);
  });

  return partIndex;
}

function createDefaultFetcher(): ModuleFetcher {
  const dracoLoader = new DRACOLoader();
  const baseUrl = new URL(import.meta.env.BASE_URL, document.baseURI);
  const decoderPath = URL.canParse('assets/draco/', import.meta.env.BASE_URL)
    ? new URL('assets/draco/', import.meta.env.BASE_URL).toString()
    : new URL('assets/draco/', baseUrl).toString();
  dracoLoader.setDecoderPath(decoderPath);

  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);

  const fetcher: ModuleFetcher = async (url) => {
    // Keeping the model URL absolute lets GLTFLoader resolve standards-compliant
    // external image URIs relative to the GLB itself in both Vite and offline builds.
    const resolvedUrl = new URL(url, baseUrl).toString();
    return gltfLoader.loadAsync(resolvedUrl);
  };
  fetcher.dispose = () => dracoLoader.dispose();
  return fetcher;
}

export class ModuleLoader {
  private readonly modules = new Map<string, ModuleManifest>();
  private readonly expectedPartIds = new Map<string, readonly string[]>();
  private readonly fetcher: ModuleFetcher;
  private readonly promiseCache = new Map<string, Promise<LoadedModule>>();
  private readonly states = new Map<string, ModuleLoadState>();
  private readonly lastQuality = new Map<string, QualityLevel>();
  private readonly lastFailedQuality = new Map<string, QualityLevel>();
  private disposed = false;

  constructor(manifest: AssemblyManifest, fetcher: ModuleFetcher = createDefaultFetcher()) {
    this.fetcher = fetcher;

    for (const module of manifest.modules) {
      this.modules.set(module.moduleId, module);
      this.expectedPartIds.set(
        module.moduleId,
        manifest.parts
          .filter((part) => part.moduleId === module.moduleId)
          .map((part) => part.partId),
      );
    }
  }

  load(moduleId: string, quality: QualityLevel): Promise<LoadedModule> {
    this.requireActive();
    const module = this.requireModule(moduleId);
    this.requireQuality(quality);
    const key = moduleKey(moduleId, quality);
    const cached = this.promiseCache.get(key);
    if (cached) return cached;

    this.lastQuality.set(moduleId, quality);
    const previous = this.states.get(key);
    this.states.set(key, {
      status: 'loading',
      quality,
      error: null,
      retryCount: previous?.retryCount ?? 0,
    });

    const promise = this.fetcher(module.urls[quality])
      .then(({ scene }) => {
        if (this.disposed) {
          disposeObjectTree(scene);
          throw new Error(
            `ModuleLoader was disposed while loading ${moduleId}:${quality}`,
          );
        }
        let partIndex: Map<string, Object3D>;
        try {
          partIndex = indexParts(moduleId, scene);
          const expectedPartIds = this.expectedPartIds.get(moduleId) ?? [];
          const expectedSet = new Set(expectedPartIds);
          const unexpectedPartIds = [...partIndex.keys()].filter(
            (partId) => !expectedSet.has(partId),
          );
          if (unexpectedPartIds.length > 0) {
            throw new Error(
              `${moduleId} contains unexpected parts: ${unexpectedPartIds.join(', ')}`,
            );
          }
          const missingPartIds = expectedPartIds.filter(
            (partId) => !partIndex.has(partId),
          );
          if (missingPartIds.length > 0) {
            throw new Error(
              `${moduleId} is missing expected parts: ${missingPartIds.join(', ')}`,
            );
          }
        } catch (error) {
          disposeObjectTree(scene);
          throw error;
        }

        this.states.set(key, {
          status: 'ready',
          quality,
          error: null,
          retryCount: this.states.get(key)?.retryCount ?? 0,
        });
        if (this.lastFailedQuality.get(moduleId) === quality) {
          this.lastFailedQuality.delete(moduleId);
        }

        return { moduleId, quality, root: scene, partIndex };
      })
      .catch((error: unknown) => {
        if (!this.disposed) {
          this.states.set(key, {
            status: 'failed',
            quality,
            error: describeError(error),
            retryCount: this.states.get(key)?.retryCount ?? 0,
          });
          this.lastFailedQuality.set(moduleId, quality);
        }
        throw error;
      });

    this.promiseCache.set(key, promise);
    return promise;
  }

  retry(moduleId: string): Promise<LoadedModule> {
    this.requireActive();
    this.requireModule(moduleId);
    const quality =
      this.lastFailedQuality.get(moduleId) ?? this.lastQuality.get(moduleId) ?? 'high';
    const key = moduleKey(moduleId, quality);
    const state = this.getState(moduleId, quality);
    if (state.status !== 'failed') {
      throw new Error(
        `Cannot retry ${moduleId}:${quality} because its state is ${state.status}`,
      );
    }
    this.states.set(key, {
      status: 'idle',
      quality,
      error: null,
      retryCount: state.retryCount + 1,
    });
    this.promiseCache.delete(key);
    return this.load(moduleId, quality);
  }

  getState(moduleId: string, quality: QualityLevel): ModuleLoadState {
    this.requireModule(moduleId);
    this.requireQuality(quality);
    return (
      this.states.get(moduleKey(moduleId, quality)) ?? {
        status: 'idle',
        quality,
        error: null,
        retryCount: 0,
      }
    );
  }

  resolvePartId(object: Object3D | null): string | null {
    let current = object;
    while (current) {
      const partId = current.userData.partId;
      if (typeof partId === 'string' && partId.length > 0) return partId;
      current = current.parent;
    }
    return null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.promiseCache.clear();
    this.fetcher.dispose?.();
  }

  private requireModule(moduleId: string): ModuleManifest {
    const module = this.modules.get(moduleId);
    if (!module) throw new Error(`Unknown module: ${moduleId}`);
    return module;
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('ModuleLoader has been disposed');
  }

  private requireQuality(quality: string): asserts quality is QualityLevel {
    if (!isQualityLevel(quality)) throw new Error(`Unknown quality: ${quality}`);
  }
}
