import { parseManifest, type AssemblyManifest } from '../domain/manifest';
import { mountAppShell, type AppShell } from '../ui/appShell';
import { createViewer, type Viewer } from '../viewer/createRenderer';
import { ModuleLoader } from '../viewer/moduleLoader';

export interface App {
  readonly manifest: AssemblyManifest;
  readonly shell: AppShell;
  readonly viewer: Viewer;
  readonly moduleLoader: ModuleLoader;
  dispose(): void;
}

const PRELOAD_MODULE_IDS = new Set([
  '01_chassis_front',
  '02_outer_shell_controls',
]);

export async function createApp(container: HTMLElement): Promise<App> {
  const baseUrl = new URL(import.meta.env.BASE_URL, document.baseURI);
  const manifestUrl = new URL('assembly-manifest.json', baseUrl);
  const response = await fetch(manifestUrl);
  if (!response.ok) {
    throw new Error(`Unable to load assembly manifest (${response.status})`);
  }
  const manifest = parseManifest(await response.json());
  const shell = mountAppShell(container, manifest);

  let viewer: Viewer;
  try {
    viewer = createViewer(shell.viewerHost);
  } catch (error) {
    shell.dispose();
    throw error;
  }

  const moduleLoader = new ModuleLoader(manifest);
  let disposed = false;

  const preloadPromises = manifest.modules
    .filter(
      (module) => module.preload && PRELOAD_MODULE_IDS.has(module.moduleId),
    )
    .map(async (module) => {
      shell.setModuleStatus(module.moduleId, 'loading');
      try {
        const loaded = await moduleLoader.load(module.moduleId, 'high');
        if (disposed) return;
        viewer.addModule(loaded);
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
  void Promise.allSettled(preloadPromises);

  return {
    manifest,
    shell,
    viewer,
    moduleLoader,
    dispose() {
      if (disposed) return;
      disposed = true;
      moduleLoader.dispose();
      viewer.dispose();
      shell.dispose();
    },
  };
}
