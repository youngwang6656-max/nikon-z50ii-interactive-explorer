import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  Material,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Texture,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';

import type { LoadedModule } from './moduleLoader';
import { disposeObjectTree } from './disposeObjectTree';
import { ModuleMountRegistry } from './moduleMountRegistry';
import {
  QUALITY_PROFILES,
  type QualityProfile,
} from './qualityController';

export const WEBGL_COMPATIBILITY_MESSAGE =
  '当前设备无法创建 WebGL2 三维视图。请使用支持硬件加速的桌面版 Chrome 或桌面版 Edge。';

export class WebGLCompatibilityError extends Error {
  constructor() {
    super(WEBGL_COMPATIBILITY_MESSAGE);
    this.name = 'WebGLCompatibilityError';
  }
}

export function createWebGLCompatibilityMessage(): HTMLElement {
  const message = document.createElement('section');
  message.className = 'webgl-compatibility';
  message.dataset.testid = 'webgl-compatibility';
  message.setAttribute('role', 'alert');
  const title = document.createElement('h2');
  title.textContent = '无法启动三维视图';
  const detail = document.createElement('p');
  detail.textContent = WEBGL_COMPATIBILITY_MESSAGE;
  message.append(title, detail);
  return message;
}

export async function loadEnvironmentWithFallback(
  load: () => Promise<import('three').Texture>,
  apply: (texture: import('three').Texture) => void,
  fallback: (reason: string) => void,
): Promise<void> {
  try {
    const sourceTexture = await load();
    try {
      apply(sourceTexture);
    } finally {
      sourceTexture.dispose();
    }
  } catch (error) {
    fallback(error instanceof Error ? error.message : String(error));
  }
}

export interface SceneMetrics {
  readonly triangles: number;
  readonly textureBytes: number | null;
  readonly textureBytesUnavailableReason: string | null;
}

export function collectSceneMetrics(scene: Object3D): SceneMetrics {
  let triangles = 0;
  const textures = new Set<Texture>();
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const indexCount = object.geometry.index?.count;
    const positionCount = object.geometry.getAttribute('position')?.count ?? 0;
    triangles += Math.floor((indexCount ?? positionCount) / 3);
    const assignments: Material[] = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of assignments) {
      for (const value of Object.values(material)) {
        if (value instanceof Texture) textures.add(value);
      }
    }
  });

  let textureBytes = 0;
  const unavailable: string[] = [];
  for (const texture of textures) {
    const image = texture.image as {
      width?: number;
      height?: number;
      data?: { byteLength?: number };
    } | null | undefined;
    const byteLength = image?.data?.byteLength;
    if (typeof byteLength === 'number') {
      textureBytes += byteLength;
      continue;
    }
    if (typeof image?.width === 'number' && typeof image.height === 'number') {
      textureBytes += image.width * image.height * 4;
      continue;
    }
    unavailable.push(texture.name || texture.uuid);
  }
  return {
    triangles,
    textureBytes: unavailable.length === 0 ? textureBytes : null,
    textureBytesUnavailableReason: unavailable.length === 0
      ? null
      : `Decoded dimensions unavailable for ${unavailable.length} texture(s)`,
  };
}

export function calibrateInspectionMaterials(root: Object3D): void {
  const calibrated = new Set<MeshStandardMaterial>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial) || calibrated.has(material)) continue;
      if (material.userData.materialRole !== 'sensor_glass' && material.name !== 'sensor_glass') continue;
      calibrated.add(material);
      material.color.setHex(0x082c36);
      material.metalness = 0;
      material.roughness = Math.max(material.roughness, 0.7);
      material.envMapIntensity = 0;
      if (material instanceof MeshPhysicalMaterial) {
        material.clearcoat = 0;
        material.transmission = 0;
        material.specularIntensity = 0;
        material.iridescence = 0;
      }
      material.needsUpdate = true;
    }
  });
}

export interface Viewer {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly composer: EffectComposer;
  readonly outlinePass: OutlinePass;
  readonly assemblyRoot: Group;
  readonly partIndex: Map<string, Object3D>;
  readonly environmentReady: Promise<void>;
  readonly quality: import('../domain/manifest').QualityLevel;
  addModule(module: LoadedModule): void;
  removeModule(moduleId: string): void;
  resize(): void;
  render(): void;
  setQualityProfile(profile: QualityProfile): void;
  onFrame(listener: (frameTimeMs: number, cameraMoving: boolean, now: number) => void): () => void;
  getPerformanceMetrics(): SceneMetrics;
  dispose(): void;
}

export function createViewer(container: HTMLElement): Viewer {
  const canvas = document.createElement('canvas');
  canvas.className = 'viewer-canvas';
  container.append(canvas);
  const context = canvas.getContext('webgl2', {
    alpha: false,
    antialias: true,
    depth: true,
    powerPreference: 'high-performance',
  });
  if (!context) {
    canvas.replaceWith(createWebGLCompatibilityMessage());
    throw new WebGLCompatibilityError();
  }
  const renderer = new WebGLRenderer({
    canvas,
    context,
    antialias: true,
    alpha: false,
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.65;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', 'Nikon Z50II 三维结构视图');

  const scene = new Scene();
  scene.background = new Color(0x070a0f);
  scene.environmentIntensity = 0.08;

  const camera = new PerspectiveCamera(34, 1, 0.005, 20);
  camera.position.set(0.165, 0.115, 0.205);
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.minDistance = 0.08;
  controls.maxDistance = 1.2;
  controls.target.set(0, 0, 0);

  const assemblyRoot = new Group();
  assemblyRoot.name = 'Z50II_ASSEMBLY';
  scene.add(assemblyRoot);

  const keyLight = new DirectionalLight(0xe8f3ff, 1);
  keyLight.position.set(0.18, 0.24, 0.16);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 0.05;
  keyLight.shadow.camera.far = 1;
  scene.add(keyLight, new AmbientLight(0x7890aa, 0.06));

  const floor = new Mesh(
    new PlaneGeometry(0.7, 0.7),
    new ShadowMaterial({ color: 0x000000, opacity: 0.32 }),
  );
  floor.name = 'TECHNICAL_SHADOW_FLOOR';
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.061;
  floor.receiveShadow = true;
  scene.add(floor);

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const gtaoPass = new GTAOPass(scene, camera, 1, 1);
  gtaoPass.blendIntensity = 0.72;
  const outlinePass = new OutlinePass(new Vector2(1, 1), scene, camera);
  outlinePass.visibleEdgeColor.set(0x35d8ff);
  outlinePass.hiddenEdgeColor.set(0x0c7694);
  outlinePass.edgeStrength = 3.2;
  outlinePass.edgeThickness = 1.1;
  outlinePass.selectedObjects = [];
  composer.addPass(renderPass);
  composer.addPass(gtaoPass);
  composer.addPass(outlinePass);

  const pmremGenerator = new PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const roomEnvironment = new RoomEnvironment();
  let environmentTarget: WebGLRenderTarget | null =
    pmremGenerator.fromScene(roomEnvironment, 0.04);
  roomEnvironment.dispose();
  scene.environment = environmentTarget.texture;

  const moduleRegistry = new ModuleMountRegistry(assemblyRoot);
  const partIndex = moduleRegistry.partIndex;
  let disposed = false;
  let quality = QUALITY_PROFILES.high.quality;
  let pixelRatioCap = QUALITY_PROFILES.high.pixelRatioCap;
  let cameraMovedSinceRender = false;
  let previousRenderAt: number | null = null;
  const frameListeners = new Set<(
    frameTimeMs: number,
    cameraMoving: boolean,
    now: number,
  ) => void>();
  const markMoving = (): void => {
    cameraMovedSinceRender = true;
  };
  controls.addEventListener('change', markMoving);

  const publicBaseUrl = new URL(import.meta.env.BASE_URL, document.baseURI);
  const environmentUrl = new URL(
    'assets/environment/studio-neutral-1k.hdr',
    publicBaseUrl,
  ).toString();
  const environmentReady = loadEnvironmentWithFallback(
    () => new RGBELoader().loadAsync(environmentUrl),
    (sourceTexture) => {
      if (disposed) {
        return;
      }
      const nextTarget = pmremGenerator.fromEquirectangular(sourceTexture);
      environmentTarget?.dispose();
      environmentTarget = nextTarget;
      scene.environment = nextTarget.texture;
      renderer.domElement.dataset.environment = 'hdr';
    },
    (reason) => {
      // The generated neutral room remains active when the optional HDR is unavailable.
      renderer.domElement.dataset.environment = 'room';
      renderer.domElement.dataset.environmentError = reason;
      renderer.domElement.dataset.environmentFailedUrl = environmentUrl;
    },
  );

  const resize = (): void => {
    if (disposed) return;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, pixelRatioCap);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    outlinePass.resolution.set(width * pixelRatio, height * pixelRatio);
  };

  const resizeObserver =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  if (resizeObserver) resizeObserver.observe(container);
  else window.addEventListener('resize', resize);
  resize();

  const render = (): void => {
    if (disposed) return;
    const now = performance.now();
    const frameTime = previousRenderAt === null ? 0 : now - previousRenderAt;
    previousRenderAt = now;
    controls.update();
    composer.render();
    const moving = cameraMovedSinceRender;
    cameraMovedSinceRender = false;
    if (frameTime > 0) {
      frameListeners.forEach((listener) => listener(frameTime, moving, now));
    }
  };
  renderer.setAnimationLoop(render);

  const setQualityProfile = (profile: QualityProfile): void => {
    quality = profile.quality;
    pixelRatioCap = profile.pixelRatioCap;
    renderer.domElement.dataset.quality = profile.quality;
    gtaoPass.enabled = profile.aoEnabled;
    gtaoPass.blendIntensity = profile.aoIntensity;
    gtaoPass.updateGtaoMaterial({ samples: profile.aoSamples });
    gtaoPass.updatePdMaterial({ samples: Math.max(4, profile.aoSamples / 2) });
    scene.environmentIntensity = 0.22 * profile.environmentIntensity;
    scene.traverse((object) => {
      if (!(object instanceof DirectionalLight) || !object.castShadow) return;
      object.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
      object.shadow.map?.dispose();
      object.shadow.map = null;
    });
    resize();
  };
  setQualityProfile(QUALITY_PROFILES.high);

  const removeModule = (moduleId: string): void => moduleRegistry.remove(moduleId);

  const addModule = (module: LoadedModule): void => {
    if (disposed) throw new Error('Cannot add a module to a disposed viewer');
    calibrateInspectionMaterials(module.root);
    moduleRegistry.add(module);
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    resizeObserver?.disconnect();
    if (!resizeObserver) window.removeEventListener('resize', resize);
    controls.dispose();
    controls.removeEventListener('change', markMoving);
    frameListeners.clear();
    moduleRegistry.dispose();
    outlinePass.dispose();
    gtaoPass.dispose();
    composer.dispose();
    environmentTarget?.dispose();
    environmentTarget = null;
    pmremGenerator.dispose();
    disposeObjectTree(floor);
    renderer.dispose();
    renderer.domElement.remove();
  };

  return {
    renderer,
    scene,
    camera,
    controls,
    composer,
    outlinePass,
    assemblyRoot,
    partIndex,
    environmentReady,
    get quality() { return quality; },
    addModule,
    removeModule,
    resize,
    render,
    setQualityProfile,
    onFrame(listener) {
      frameListeners.add(listener);
      return () => { frameListeners.delete(listener); };
    },
    getPerformanceMetrics() { return collectSceneMetrics(assemblyRoot); },
    dispose,
  };
}
