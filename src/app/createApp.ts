import { parseManifest, type AssemblyManifest } from '../domain/manifest';
import { mountAppShell, type AppShell } from '../ui/appShell';
import { createViewer, type Viewer } from '../viewer/createRenderer';
import { disposeObjectTree } from '../viewer/disposeObjectTree';
import { ModuleLoader } from '../viewer/moduleLoader';

export interface App {
  readonly manifest: AssemblyManifest;
  readonly shell: AppShell;
  readonly viewer: Viewer;
  readonly moduleLoader: ModuleLoader;
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
  let disposed = false;

  const preloadPromises = manifest.modules
    .filter(
      (module) => module.preload && PRELOAD_MODULE_IDS.has(module.moduleId),
    )
    .map(async (module) => {
      shell.setModuleStatus(module.moduleId, 'loading');
      try {
        const loaded = await moduleLoader.load(module.moduleId, 'high');
        if (disposed) {
          disposeObjectTree(loaded.root);
          return;
        }
        try {
          viewer.addModule(loaded);
        } catch (error) {
          disposeObjectTree(loaded.root);
          throw error;
        }
        shell.setModuleStatus(module.moduleId, 'ready');
      } catch (error) {
        if (disposed) return;
        shell.setModuleStatus(
          module.moduleId,
          'failed',
          error instanceof Error ? error.message : String(error),
        );
      }
    });
  const preloadReady = Promise.allSettled(preloadPromises).then(() => undefined);

  return {
    manifest,
    shell,
    viewer,
    moduleLoader,
    preloadReady,
    dispose() {
      if (disposed) return;
      disposed = true;
      moduleLoader.dispose();
      viewer.dispose();
      shell.dispose();
    },
  };
}
