import { parseManifest, type AssemblyManifest } from '../domain/manifest';
import { createAssemblyState, type AssemblyState } from '../domain/assemblyState';
import { mountAssemblyTree, type AssemblyTreeController } from '../ui/assemblyTree';
import { mountAppShell, type AppShell } from '../ui/appShell';
import { mountInspector, type InspectorController } from '../ui/inspector';
import { handleSelectionShortcut } from '../ui/keyboardShortcuts';
import { createViewer, type Viewer } from '../viewer/createRenderer';
import { disposeObjectTree } from '../viewer/disposeObjectTree';
import { ModuleLoader, type LoadedModule } from '../viewer/moduleLoader';
import { PartDisplayController } from '../viewer/partDisplayController';
import { SelectionController } from '../viewer/selectionController';

export interface App {
  readonly manifest: AssemblyManifest;
  readonly shell: AppShell;
  readonly viewer: Viewer;
  readonly moduleLoader: ModuleLoader;
  readonly assemblyState: AssemblyState;
  readonly selectionController: SelectionController | null;
  readonly assemblyTree: AssemblyTreeController | null;
  readonly inspector: InspectorController | null;
  readonly preloadReady: Promise<void>;
  dispose(): void;
}

export interface AppDependencies {
  loadManifest?: () => Promise<AssemblyManifest>;
  mountShell?: (container: HTMLElement, manifest: AssemblyManifest) => AppShell;
  createViewer?: (container: HTMLElement) => Viewer;
  createModuleLoader?: (manifest: AssemblyManifest) => ModuleLoader;
}

const PRELOAD_MODULE_IDS = new Set([
  '01_chassis_front',
  '02_outer_shell_controls',
]);

async function loadPublicManifest(): Promise<AssemblyManifest> {
  const baseUrl = new URL(import.meta.env.BASE_URL, document.baseURI);
  const manifestUrl = new URL('assembly-manifest.json', baseUrl);
  const response = await fetch(manifestUrl);
  if (!response.ok) {
    throw new Error(`Unable to load assembly manifest (${response.status})`);
  }
  return parseManifest(await response.json());
}

export async function createApp(
  container: HTMLElement,
  dependencies: AppDependencies = {},
): Promise<App> {
  const manifest = await (dependencies.loadManifest ?? loadPublicManifest)();
  const shell = (dependencies.mountShell ?? mountAppShell)(container, manifest);

  let viewer: Viewer;
  try {
    viewer = (dependencies.createViewer ?? createViewer)(shell.viewerHost);
  } catch (error) {
    shell.dispose();
    throw error;
  }

  const moduleLoader = (
    dependencies.createModuleLoader ?? ((value) => new ModuleLoader(value))
  )(manifest);
  const assemblyState = createAssemblyState(manifest);
  let disposed = false;

  const mountedModuleIds = new Set<string>();
  const moduleMountPromises = new Map<string, Promise<void>>();
  const displayController = viewer.partIndex
    ? new PartDisplayController(viewer.partIndex)
    : null;

  let assemblyTree: AssemblyTreeController | null = null;
  let inspector: InspectorController | null = null;
  let selectionController: SelectionController | null = null;
  let selectionRequest = 0;

  const setModuleStatus = (
    moduleId: string,
    status: 'idle' | 'loading' | 'ready' | 'failed',
    error?: string,
  ): void => {
    shell.setModuleStatus(moduleId, status, error);
    assemblyTree?.setModuleStatus(moduleId, status, error);
  };

  const attachLoadedModule = (loaded: LoadedModule): void => {
    if (mountedModuleIds.has(loaded.moduleId)) return;
    try {
      viewer.addModule(loaded);
      mountedModuleIds.add(loaded.moduleId);
      assemblyTree?.setLoadProgress(mountedModuleIds.size, manifest.modules.length);
      displayController?.apply();
    } catch (error) {
      disposeObjectTree(loaded.root);
      throw error;
    }
  };

  const loadAndMountModule = (moduleId: string): Promise<void> => {
    const existing = moduleMountPromises.get(moduleId);
    if (existing) return existing;
    const operation = (async () => {
      setModuleStatus(moduleId, 'loading');
      try {
        const state = moduleLoader.getState(moduleId, 'high');
        const loaded = await (state.status === 'failed'
          ? moduleLoader.retry(moduleId)
          : moduleLoader.load(moduleId, 'high'));
        if (disposed) {
          disposeObjectTree(loaded.root);
          return;
        }
        attachLoadedModule(loaded);
        setModuleStatus(moduleId, 'ready');
      } catch (error) {
        if (disposed) return;
        setModuleStatus(
          moduleId,
          'failed',
          error instanceof Error ? error.message : String(error),
        );
        moduleMountPromises.delete(moduleId);
        throw error;
      }
    })();
    moduleMountPromises.set(moduleId, operation);
    return operation;
  };

  const updateSelectionUi = (partId: string | null): void => {
    assemblyTree?.select(partId);
    inspector?.select(partId);
    inspector?.setActionState(partId && displayController
      ? displayController.getState(partId)
      : { hidden: false, isolated: false, transparent: false });
  };

  const selectTreePart = async (partId: string): Promise<void> => {
    const request = ++selectionRequest;
    const part = manifest.parts.find((candidate) => candidate.partId === partId);
    if (!part) return;
    await loadAndMountModule(part.moduleId);
    if (disposed || request !== selectionRequest) return;
    selectionController?.select(partId);
    selectionController?.focus(partId);
  };

  const loadAllModules = async (): Promise<void> => {
    const completed = new Set(mountedModuleIds);
    assemblyTree?.setLoadProgress(completed.size, manifest.modules.length);
    await Promise.allSettled(
      manifest.modules.map(async (module) => {
        if (!mountedModuleIds.has(module.moduleId)) await loadAndMountModule(module.moduleId);
        if (mountedModuleIds.has(module.moduleId)) completed.add(module.moduleId);
        assemblyTree?.setLoadProgress(completed.size, manifest.modules.length);
      }),
    );
    assemblyTree?.setLoadProgress(mountedModuleIds.size, manifest.modules.length);
  };

  if (
    shell.assemblyPanel &&
    shell.inspectorPanel &&
    viewer.renderer?.domElement &&
    viewer.camera &&
    viewer.assemblyRoot &&
    viewer.outlinePass &&
    viewer.partIndex
  ) {
    assemblyTree = mountAssemblyTree(shell.assemblyPanel, manifest, {
      onSelectPart: selectTreePart,
      onLoadAll: loadAllModules,
    });
    selectionController = new SelectionController({
      canvas: viewer.renderer.domElement,
      camera: viewer.camera,
      controls: viewer.controls,
      assemblyRoot: viewer.assemblyRoot,
      outlinePass: viewer.outlinePass,
      partIndex: viewer.partIndex,
    });
    inspector = mountInspector(shell.inspectorPanel, manifest, assemblyState, {
      onFocus: (partId) => { selectionController?.focus(partId); },
      onHide: (partId) => {
        displayController?.toggleHidden(partId);
        selectionController?.select(partId);
        updateSelectionUi(partId);
      },
      onIsolate: (partId) => {
        displayController?.toggleIsolation(partId);
        selectionController?.select(partId);
        updateSelectionUi(partId);
      },
      onTransparency: (partId) => {
        displayController?.toggleTransparency(partId);
        updateSelectionUi(partId);
      },
      onResetSelection: () => { selectionController?.select(null); },
    });
    selectionController.onSelectionChange((partId) => {
      selectionRequest += 1;
      displayController?.reconcileSelection(partId);
      selectionController?.select(partId);
      updateSelectionUi(partId);
    });
    assemblyTree.setLoadProgress(0, manifest.modules.length);
  }

  const handleKeyDown = (event: KeyboardEvent): void => {
    handleSelectionShortcut(
      event,
      () => selectionController?.select(null),
      () => assemblyTree?.focusSearch(),
    );
  };
  if (selectionController) document.addEventListener('keydown', handleKeyDown);

  const preloadPromises = manifest.modules
    .filter(
      (module) => module.preload && PRELOAD_MODULE_IDS.has(module.moduleId),
    )
    .map(async (module) => {
      try {
        await loadAndMountModule(module.moduleId);
      } catch { /* status is published by the shared mount operation */ }
    });
  const preloadReady = Promise.allSettled(preloadPromises).then(() => undefined);

  return {
    manifest,
    shell,
    viewer,
    moduleLoader,
    assemblyState,
    selectionController,
    assemblyTree,
    inspector,
    preloadReady,
    dispose() {
      if (disposed) return;
      disposed = true;
      selectionRequest += 1;
      if (selectionController) document.removeEventListener('keydown', handleKeyDown);
      selectionController?.dispose();
      assemblyTree?.dispose();
      inspector?.dispose();
      displayController?.dispose();
      moduleLoader.dispose();
      viewer.dispose();
      shell.dispose();
    },
  };
}
