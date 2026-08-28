import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  Material,
  Mesh,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
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
  addModule(module: LoadedModule): void;
  removeModule(moduleId: string): void;
  resize(): void;
  render(): void;
  dispose(): void;
}

function disposeObjectResources(root: Object3D): void {
  const geometries = new Set<{ dispose(): void }>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    const meshMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of meshMaterials) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof Texture) textures.add(value);
      }
    }
  });

  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

export function createViewer(container: HTMLElement): Viewer {
  const renderer = new WebGLRenderer({ antialias: true, alpha: false });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.65;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.domElement.className = 'viewer-canvas';
  renderer.domElement.setAttribute('aria-label', 'Nikon Z50II 三维结构视图');
  container.append(renderer.domElement);

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

  const moduleRoots = new Map<string, LoadedModule>();
  const ownedRoots = new Set<Object3D>();
  const partIndex = new Map<string, Object3D>();
  let disposed = false;

  const publicBaseUrl = new URL(import.meta.env.BASE_URL, document.baseURI);
  const environmentUrl = new URL(
    'assets/environment/studio-neutral-1k.hdr',
    publicBaseUrl,
  ).toString();
  const environmentReady = new RGBELoader()
    .loadAsync(environmentUrl)
    .then((sourceTexture) => {
      if (disposed) {
        sourceTexture.dispose();
        return;
      }
      const nextTarget = pmremGenerator.fromEquirectangular(sourceTexture);
      sourceTexture.dispose();
      environmentTarget?.dispose();
      environmentTarget = nextTarget;
      scene.environment = nextTarget.texture;
    })
    .catch(() => {
      // The generated neutral room remains active when the optional HDR is unavailable.
    });

  const resize = (): void => {
    if (disposed) return;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
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
    controls.update();
    composer.render();
  };
  renderer.setAnimationLoop(render);

  const removeModule = (moduleId: string): void => {
    const current = moduleRoots.get(moduleId);
    if (!current) return;
    assemblyRoot.remove(current.root);
    for (const [partId, object] of current.partIndex) {
      if (partIndex.get(partId) === object) partIndex.delete(partId);
    }
    moduleRoots.delete(moduleId);
  };

  const addModule = (module: LoadedModule): void => {
    if (disposed) throw new Error('Cannot add a module to a disposed viewer');
    const current = moduleRoots.get(module.moduleId);
    if (current?.root === module.root) return;
    if (current) removeModule(module.moduleId);

    module.root.userData.moduleId = module.moduleId;
    module.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    assemblyRoot.add(module.root);
    ownedRoots.add(module.root);
    moduleRoots.set(module.moduleId, module);
    for (const [partId, object] of module.partIndex) partIndex.set(partId, object);
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    resizeObserver?.disconnect();
    if (!resizeObserver) window.removeEventListener('resize', resize);
    controls.dispose();
    for (const moduleId of [...moduleRoots.keys()]) removeModule(moduleId);
    partIndex.clear();
    ownedRoots.forEach(disposeObjectResources);
    ownedRoots.clear();
    outlinePass.dispose();
    gtaoPass.dispose();
    composer.dispose();
    environmentTarget?.dispose();
    environmentTarget = null;
    pmremGenerator.dispose();
    disposeObjectResources(floor);
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
    addModule,
    removeModule,
    resize,
    render,
    dispose,
  };
}
