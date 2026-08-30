import {
  Color,
  LoadingManager,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Texture,
} from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js';

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
  failedTextureUrls?: readonly string[];
  failedMaterials?: readonly Material[];
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

function textureUnavailable(texture: Texture): boolean {
  const image = texture.image as {
    complete?: boolean;
    naturalWidth?: number;
    width?: number;
  } | null | undefined;
  if (!image) return true;
  if (image.complete === true && image.naturalWidth === 0) return true;
  return image.width === 0;
}

function materialTextures(material: Material): Texture[] {
  return Object.values(material)
    .filter((value): value is Texture => value instanceof Texture);
}

export function neutralizeFailedMaterialTextures(
  root: Object3D,
  failedTextureUrls: readonly string[],
  failedMaterials: readonly Material[] = [],
): void {
  if (failedTextureUrls.length === 0) return;
  const explicitlyFailed = new Set(failedMaterials);
  const replacements = new Map<Material, Material>();
  const failedTextures = new Set<Texture>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const assignments = Array.isArray(object.material) ? object.material : [object.material];
    let changed = false;
    const nextAssignments = assignments.map((material) => {
      const unavailableTextures = materialTextures(material).filter(textureUnavailable);
      if (unavailableTextures.length === 0 && !explicitlyFailed.has(material)) return material;
      const cached = replacements.get(material);
      if (cached) {
        changed = true;
        return cached;
      }
      const replacement = material.clone();
      for (const [key, value] of Object.entries(replacement)) {
        if (value instanceof Texture && unavailableTextures.includes(value)) {
          (replacement as unknown as Record<string, unknown>)[key] = null;
          failedTextures.add(value);
        }
      }
      const color = (replacement as Material & { color?: unknown }).color;
      if (color instanceof Color) {
        color.setHex(0x777777);
      }
      if (replacement instanceof MeshStandardMaterial) {
        replacement.emissive.setHex(0x000000);
      }
      replacement.userData.failedTextureUrls = [...failedTextureUrls];
      replacement.needsUpdate = true;
      replacements.set(material, replacement);
      changed = true;
      return replacement;
    });
    if (changed) object.material = Array.isArray(object.material)
      ? nextAssignments
      : nextAssignments[0]!;
  });
  replacements.forEach((_replacement, original) => original.dispose());
  failedTextures.forEach((texture) => texture.dispose());
}

function textureIndices(value: unknown, key = ''): number[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  if (key.endsWith('Texture') && typeof record.index === 'number') {
    return [record.index];
  }
  return Object.entries(record).flatMap(([childKey, child]) =>
    textureIndices(child, childKey));
}

function findFailedMaterials(
  root: Object3D,
  parser: GLTFParser,
  assetUrl: string,
  failedUrls: readonly string[],
): Material[] {
  const normalizedFailures = new Set(failedUrls.map((url) => new URL(url, assetUrl).toString()));
  const json = parser.json as {
    materials?: unknown[];
    textures?: Array<{ source?: number }>;
    images?: Array<{ uri?: string }>;
  };
  const failedMaterialIndices = new Set<number>();
  json.materials?.forEach((definition, materialIndex) => {
    const failed = textureIndices(definition).some((textureIndex) => {
      const sourceIndex = json.textures?.[textureIndex]?.source;
      const uri = sourceIndex === undefined ? undefined : json.images?.[sourceIndex]?.uri;
      return typeof uri === 'string'
        && normalizedFailures.has(new URL(uri, assetUrl).toString());
    });
    if (failed) failedMaterialIndices.add(materialIndex);
  });
  const materials = new Set<Material>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const assignments = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of assignments) {
      const materialIndex = parser.associations.get(material)?.materials;
      if (materialIndex !== undefined && failedMaterialIndices.has(materialIndex)) {
        materials.add(material);
      }
    }
  });
  return [...materials];
}

function createDefaultFetcher(): ModuleFetcher {
  const dracoLoader = new DRACOLoader();
  const baseUrl = new URL(import.meta.env.BASE_URL, document.baseURI);
  const decoderPath = URL.canParse('assets/draco/', import.meta.env.BASE_URL)
    ? new URL('assets/draco/', import.meta.env.BASE_URL).toString()
    : new URL('assets/draco/', baseUrl).toString();
  dracoLoader.setDecoderPath(decoderPath);

  const fetcher: ModuleFetcher = async (url) => {
    const failedTextureUrls: string[] = [];
    const manager = new LoadingManager();
    manager.onError = (failedUrl) => { failedTextureUrls.push(failedUrl); };
    const gltfLoader = new GLTFLoader(manager);
    gltfLoader.setDRACOLoader(dracoLoader);
    // Keeping the model URL absolute lets GLTFLoader resolve standards-compliant
    // external image URIs relative to the GLB itself in both Vite and offline builds.
    const resolvedUrl = new URL(url, baseUrl).toString();
    const asset = await gltfLoader.loadAsync(resolvedUrl);
    return {
      ...asset,
      failedTextureUrls,
      failedMaterials: findFailedMaterials(
        asset.scene,
        asset.parser,
        resolvedUrl,
        failedTextureUrls,
      ),
    };
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
  private readonly failedTextureUrls = new Map<string, readonly string[]>();
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

    const previous = this.states.get(key);
    this.states.set(key, {
      status: 'loading',
      quality,
      error: null,
      retryCount: previous?.retryCount ?? 0,
    });

    const promise = this.fetcher(module.urls[quality])
      .then(({ scene, failedTextureUrls = [], failedMaterials = [] }) => {
        if (this.disposed) {
          disposeObjectTree(scene);
          throw new Error(
            `ModuleLoader was disposed while loading ${moduleId}:${quality}`,
          );
        }
        let partIndex: Map<string, Object3D>;
        try {
          neutralizeFailedMaterialTextures(scene, failedTextureUrls, failedMaterials);
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
        this.failedTextureUrls.set(key, [...failedTextureUrls]);
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
        }
        throw error;
      });

    this.promiseCache.set(key, promise);
    return promise;
  }

  retry(moduleId: string, quality: QualityLevel): Promise<LoadedModule> {
    this.requireActive();
    this.requireModule(moduleId);
    this.requireQuality(quality);
    const key = moduleKey(moduleId, quality);
    const state = this.getState(moduleId, quality);
    if (state.status === 'loading') {
      const pending = this.promiseCache.get(key);
      if (pending) return pending;
    }
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

  getFailedTextureUrls(moduleId: string, quality: QualityLevel): readonly string[] {
    this.requireModule(moduleId);
    this.requireQuality(quality);
    return this.failedTextureUrls.get(moduleKey(moduleId, quality)) ?? [];
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
    this.failedTextureUrls.clear();
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
