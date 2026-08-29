import { parseManifest, type AssemblyManifest } from '../domain/manifest';
import {
  createAssemblyState,
  resetAssembly as resetAssemblyState,
  setGlobalExplode,
  setPartProgress,
  undoLastMove as undoLastMoveState,
  type AssemblyState,
} from '../domain/assemblyState';
import { GuidedSequence } from '../domain/guidedSequence';
import { mountAssemblyTree, type AssemblyTreeController } from '../ui/assemblyTree';
import { mountAppShell, type AppShell } from '../ui/appShell';
import { mountInspector, type InspectorController } from '../ui/inspector';
import { handleSelectionShortcut, handleUndoShortcut } from '../ui/keyboardShortcuts';
import {
  mountTimeline,
  type TimelineCallbacks,
  type TimelineController,
  type TimelineMode,
} from '../ui/timeline';
import { CameraPresetTween } from '../viewer/cameraPresetTween';
import { createViewer, type Viewer } from '../viewer/createRenderer';
import { disposeObjectTree } from '../viewer/disposeObjectTree';
import { ModuleLoader, type LoadedModule } from '../viewer/moduleLoader';
import { PartDisplayController } from '../viewer/partDisplayController';
import { GuidedPartTransforms } from '../viewer/guidedPartTransforms';
import { SelectionController } from '../viewer/selectionController';
import { AxisDragController } from '../viewer/axisDragController';

export interface App {
  readonly manifest: AssemblyManifest;
  readonly shell: AppShell;
  readonly viewer: Viewer;
  readonly moduleLoader: ModuleLoader;
  readonly assemblyState: AssemblyState;
  readonly selectionController: SelectionController | null;
  readonly axisDragController: AxisDragController | null;
  readonly assemblyTree: AssemblyTreeController | null;
  readonly inspector: InspectorController | null;
  readonly timeline: TimelineController | null;
  readonly guidedSequence: GuidedSequence;
  readonly guidedPlaybackActive: boolean;
  readonly freeDragEnabled: boolean;
  readonly preloadReady: Promise<void>;
  cancelGuidedPlayback(): void;
  undoLastMove(): void;
  resetAssembly(): void;
  dispose(): void;
}

export interface AppDependencies {
  loadManifest?: () => Promise<AssemblyManifest>;
  mountShell?: (container: HTMLElement, manifest: AssemblyManifest) => AppShell;
  createViewer?: (container: HTMLElement) => Viewer;
  createModuleLoader?: (manifest: AssemblyManifest) => ModuleLoader;
  mountTimeline?: (
    host: HTMLElement,
    manifest: AssemblyManifest,
    callbacks: TimelineCallbacks,
  ) => TimelineController;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame?: (handle: number) => void;
  prefersReducedMotion?: () => boolean;
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
  let assemblyState = createAssemblyState(manifest);
  const guidedSequence = new GuidedSequence(manifest, assemblyState);
  const guidedTransforms = new GuidedPartTransforms(manifest);
  let disposed = false;

  const mountedModuleIds = new Set<string>();
  const moduleMountPromises = new Map<string, Promise<void>>();
  const displayController = viewer.partIndex
    ? new PartDisplayController(viewer.partIndex)
    : null;

  let assemblyTree: AssemblyTreeController | null = null;
  let inspector: InspectorController | null = null;
  let timeline: TimelineController | null = null;
  let selectionController: SelectionController | null = null;
  let axisDragController: AxisDragController | null = null;
  let selectionRequest = 0;
  const requestFrame = dependencies.requestAnimationFrame
    ?? ((callback: FrameRequestCallback) => window.requestAnimationFrame(callback));
  const cancelFrame = dependencies.cancelAnimationFrame
    ?? ((handle: number) => window.cancelAnimationFrame(handle));
  const reducedMotion = dependencies.prefersReducedMotion?.()
    ?? (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const cameraTween = viewer.camera && viewer.controls
    ? new CameraPresetTween(viewer.camera, viewer.controls, { reducedMotion })
    : null;
  let animationFrameId: number | null = null;
  let previousFrameTime: number | null = null;
  let publishedProgress = 0;
  let interactionMode: TimelineMode = 'guided';

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
      if (viewer.partIndex) guidedTransforms.apply(assemblyState, viewer.partIndex);
      axisDragController?.refreshHandle();
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

  const publishSelectedTransformBasis = (partId: string | null): void => {
    const object = partId ? viewer.partIndex?.get(partId) : undefined;
    if (!object) {
      delete shell.root.dataset.selectedTransformBasis;
      return;
    }
    if (object.matrixAutoUpdate) object.updateMatrix();
    shell.root.dataset.selectedTransformBasis = object.matrix.elements
      .slice(0, 12)
      .map((value) => Number(value.toPrecision(15)))
      .join(',');
  };

  const updateSelectionUi = (partId: string | null): void => {
    assemblyTree?.select(partId);
    inspector?.select(partId);
    inspector?.setActionState(partId && displayController
      ? displayController.getState(partId)
      : { hidden: false, isolated: false, transparent: false });
    axisDragController?.refreshHandle();
    publishSelectedTransformBasis(partId);
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

  const formatProgress = (value: number): string => {
    if (value === 0 || value === 1) return String(value);
    return String(Number(value.toFixed(6)));
  };

  const averageProgress = (state: AssemblyState): number => {
    const values = manifest.parts.map((part) => state.progress[part.partId] ?? 0);
    return values.length === 0
      ? 0
      : values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  const publishSequence = (
    progressAttribute?: number,
    globalProgress = averageProgress(guidedSequence.snapshot().assembly),
  ): void => {
    if (progressAttribute !== undefined) publishedProgress = progressAttribute;
    const snapshot = guidedSequence.snapshot();
    assemblyState = snapshot.assembly;
    shell.root.dataset.assemblyProgress = formatProgress(publishedProgress);
    shell.root.setAttribute('data-assembly-progress', formatProgress(publishedProgress));
    shell.root.dataset.interactionMode = interactionMode;
    shell.root.dataset.guidedPlaybackActive = String(
      interactionMode === 'guided' && snapshot.isPlaying,
    );
    shell.root.dataset.freeDragEnabled = String(interactionMode === 'free');
    shell.root.dataset.cameraTweenActive = String(cameraTween?.active ?? false);
    guidedTransforms.apply(assemblyState, viewer.partIndex ?? new Map());
    inspector?.updateAssemblyState(assemblyState);
    timeline?.render(snapshot, globalProgress);
    axisDragController?.refreshHandle();
    publishSelectedTransformBasis(selectionController?.selectedPartId ?? null);
  };

  const publishFreeAssembly = (nextState: AssemblyState): void => {
    if (disposed) return;
    assemblyState = nextState;
    guidedSequence.replaceAssemblyState(nextState);
    publishedProgress = averageProgress(nextState);
    const snapshot = guidedSequence.snapshot();
    shell.root.dataset.assemblyProgress = formatProgress(publishedProgress);
    shell.root.setAttribute('data-assembly-progress', formatProgress(publishedProgress));
    shell.root.dataset.interactionMode = interactionMode;
    shell.root.dataset.guidedPlaybackActive = 'false';
    shell.root.dataset.freeDragEnabled = String(interactionMode === 'free');
    shell.root.dataset.cameraTweenActive = String(cameraTween?.active ?? false);
    guidedTransforms.apply(assemblyState, viewer.partIndex ?? new Map());
    inspector?.updateAssemblyState(assemblyState);
    timeline?.render(snapshot, publishedProgress);
    axisDragController?.refreshHandle();
    publishSelectedTransformBasis(selectionController?.selectedPartId ?? null);
  };

  const undoFreeMove = (): void => {
    if (interactionMode !== 'free' || disposed) return;
    axisDragController?.cancel();
    publishFreeAssembly(undoLastMoveState(assemblyState));
  };

  const resetFreeAssembly = (): void => {
    if (disposed) return;
    axisDragController?.cancel();
    const nextState = resetAssemblyState(assemblyState);
    if (interactionMode === 'free') publishFreeAssembly(nextState);
    else {
      assemblyState = nextState;
      guidedSequence.replaceAssemblyState(nextState);
      guidedSequence.seek(0);
      publishSequence(0, 0);
    }
  };

  const startCurrentCameraPreset = (): void => {
    const preset = guidedSequence.snapshot().currentStep?.cameraPreset;
    if (preset) cameraTween?.start(preset);
  };

  const runAnimationFrame = (timestamp: number): void => {
    animationFrameId = null;
    if (disposed) return;
    const delta = previousFrameTime === null ? 0 : Math.max(0, timestamp - previousFrameTime);
    previousFrameTime = timestamp;
    const sequenceWasPlaying = guidedSequence.snapshot().isPlaying;
    const previousStepIndex = guidedSequence.snapshot().activeStepIndex;
    guidedSequence.tick(delta);
    cameraTween?.tick(delta);
    if (guidedSequence.snapshot().activeStepIndex !== previousStepIndex) startCurrentCameraPreset();
    publishSequence(sequenceWasPlaying ? guidedSequence.snapshot().normalizedTime : undefined);
    if (guidedSequence.snapshot().isPlaying || cameraTween?.active) {
      animationFrameId = requestFrame(runAnimationFrame);
    } else {
      previousFrameTime = null;
    }
  };

  const ensureAnimationFrame = (): void => {
    if (disposed || animationFrameId !== null) return;
    previousFrameTime = null;
    animationFrameId = requestFrame(runAnimationFrame);
  };

  const cancelGuidedPlayback = (): void => {
    guidedSequence.pause();
    cameraTween?.cancel();
    previousFrameTime = null;
    publishSequence();
  };

  const seekGuided = (normalizedTime: number): void => {
    const previousStepIndex = guidedSequence.snapshot().activeStepIndex;
    guidedSequence.seek(normalizedTime);
    if (guidedSequence.snapshot().activeStepIndex !== previousStepIndex) startCurrentCameraPreset();
    if (normalizedTime > 0) void loadAllModules();
    publishSequence(guidedSequence.snapshot().normalizedTime);
    if (cameraTween?.active) ensureAnimationFrame();
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
      onProgressChange: (partId, progress) => {
        if (interactionMode !== 'free') return;
        publishFreeAssembly(setPartProgress(assemblyState, partId, progress));
      },
      onSelectDependency: (partId) => { void selectTreePart(partId); },
      onUndoMove: undoFreeMove,
      onResetAssembly: resetFreeAssembly,
    });
    selectionController.onSelectionChange((partId) => {
      selectionRequest += 1;
      displayController?.reconcileSelection(partId);
      selectionController?.select(partId);
      updateSelectionUi(partId);
    });
    assemblyTree.setLoadProgress(0, manifest.modules.length);
  }

  if (
    viewer.renderer?.domElement
    && viewer.camera
    && viewer.scene
    && viewer.partIndex
  ) {
    axisDragController = new AxisDragController({
      canvas: viewer.renderer.domElement,
      camera: viewer.camera,
      controls: viewer.controls,
      scene: viewer.scene,
      manifest,
      partIndex: viewer.partIndex,
      getAssemblyState: () => assemblyState,
      setAssemblyState: publishFreeAssembly,
      getSelectedPartId: () => selectionController
        ? selectionController.selectedPartId
        : (viewer.partIndex.keys().next().value ?? null),
      isEnabled: () => interactionMode === 'free',
      isPartHidden: (partId) => displayController?.getState(partId).hidden ?? false,
    });
  }

  if (shell.timelinePanel) {
    timeline = (dependencies.mountTimeline ?? mountTimeline)(shell.timelinePanel, manifest, {
      onModeChange(mode) {
        if (mode === 'guided') axisDragController?.cancel();
        else cancelGuidedPlayback();
        interactionMode = mode;
        timeline?.setMode(mode);
        if (mode === 'free') publishFreeAssembly(assemblyState);
        else {
          guidedSequence.replaceAssemblyState(assemblyState);
          seekGuided(publishedProgress);
        }
      },
      onTogglePlay() {
        if (interactionMode !== 'guided') return;
        if (guidedSequence.snapshot().isPlaying) {
          cancelGuidedPlayback();
          return;
        }
        const playhead = publishedProgress >= 1 ? 0 : publishedProgress;
        guidedSequence.seek(playhead);
        guidedSequence.play();
        startCurrentCameraPreset();
        void loadAllModules();
        publishSequence(playhead);
        ensureAnimationFrame();
      },
      onPrevious() {
        if (interactionMode !== 'guided') return;
        const previousStepIndex = guidedSequence.snapshot().activeStepIndex;
        guidedSequence.previous();
        if (guidedSequence.snapshot().activeStepIndex !== previousStepIndex) startCurrentCameraPreset();
        publishSequence(guidedSequence.snapshot().normalizedTime);
        if (cameraTween?.active) ensureAnimationFrame();
      },
      onNext() {
        if (interactionMode !== 'guided') return;
        const previousStepIndex = guidedSequence.snapshot().activeStepIndex;
        guidedSequence.next();
        if (guidedSequence.snapshot().activeStepIndex !== previousStepIndex) startCurrentCameraPreset();
        void loadAllModules();
        publishSequence(guidedSequence.snapshot().normalizedTime);
        if (cameraTween?.active) ensureAnimationFrame();
      },
      onSeek(normalizedTime) {
        if (interactionMode === 'guided') seekGuided(normalizedTime);
      },
      onGlobalExplode(progress) {
        guidedSequence.pause();
        cameraTween?.cancel();
        previousFrameTime = null;
        assemblyState = {
          ...setGlobalExplode(assemblyState, progress),
          history: [],
        };
        guidedSequence.replaceAssemblyState(assemblyState);
        if (interactionMode === 'free') publishFreeAssembly(assemblyState);
        else publishSequence(progress, progress);
      },
    });
    timeline.setMode(interactionMode);
    publishSequence(0);
  }

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && axisDragController?.isDragging) {
      event.preventDefault();
      axisDragController.cancel();
      return;
    }
    if (interactionMode === 'free' && handleUndoShortcut(event, undoFreeMove)) return;
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
    get assemblyState() { return assemblyState; },
    selectionController,
    axisDragController,
    assemblyTree,
    inspector,
    timeline,
    guidedSequence,
    get guidedPlaybackActive() {
      return interactionMode === 'guided' && guidedSequence.snapshot().isPlaying;
    },
    get freeDragEnabled() { return interactionMode === 'free'; },
    preloadReady,
    cancelGuidedPlayback,
    undoLastMove: undoFreeMove,
    resetAssembly: resetFreeAssembly,
    dispose() {
      if (disposed) return;
      disposed = true;
      selectionRequest += 1;
      if (selectionController) document.removeEventListener('keydown', handleKeyDown);
      if (animationFrameId !== null) cancelFrame(animationFrameId);
      animationFrameId = null;
      previousFrameTime = null;
      guidedSequence.pause();
      cameraTween?.dispose();
      timeline?.dispose();
      axisDragController?.dispose();
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
