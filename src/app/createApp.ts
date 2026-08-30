import {
  parseManifest,
  type AssemblyManifest,
  type QualityLevel,
} from '../domain/manifest';
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
import { CutawayController } from '../viewer/cutawayController';
import { LightingController } from '../viewer/lightingController';
import type { VisibilityController } from '../viewer/visibilityController';
import {
  AdaptiveQualityController,
  QUALITY_PROFILES,
  type QualityMode,
} from '../viewer/qualityController';

export interface App {
  readonly manifest: AssemblyManifest;
  readonly shell: AppShell;
  readonly viewer: Viewer;
  readonly moduleLoader: ModuleLoader;
  readonly assemblyState: AssemblyState;
  readonly selectionController: SelectionController | null;
  readonly axisDragController: AxisDragController | null;
  readonly visibilityController: VisibilityController | null;
  readonly cutawayController: CutawayController | null;
  readonly lightingController: LightingController | null;
  readonly assemblyTree: AssemblyTreeController | null;
  readonly inspector: InspectorController | null;
  readonly timeline: TimelineController | null;
  readonly guidedSequence: GuidedSequence;
  readonly qualityController: AdaptiveQualityController;
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

export function resetVisibilityAndRestoreSelection(
  visibility: Pick<VisibilityController, 'resetVisibility'>,
  selection: Pick<SelectionController, 'selectedPartId' | 'select'> | null,
): string | null {
  visibility.resetVisibility();
  const selectedPartId = selection?.selectedPartId ?? null;
  selection?.select(selectedPartId);
  return selectedPartId;
}

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
  const appStartedAt = performance.now();
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
  const mountedQualities = new Map<string, QualityLevel>();
  const moduleMountOperations = new Map<string, {
    readonly quality: QualityLevel;
    readonly promise: Promise<void>;
  }>();
  const displayController = viewer.partIndex
    ? new PartDisplayController(viewer.partIndex)
    : null;
  const visibilityController = displayController?.visibility ?? null;
  const cutawayController = visibilityController && viewer.renderer && viewer.scene
    ? new CutawayController(viewer.renderer, viewer.scene, visibilityController)
    : null;
  const lightingController = visibilityController && viewer.renderer && viewer.scene
    ? new LightingController(viewer.renderer, viewer.scene, visibilityController)
    : null;

  let assemblyTree: AssemblyTreeController | null = null;
  let inspector: InspectorController | null = null;
  let timeline: TimelineController | null = null;
  let selectionController: SelectionController | null = null;
  let axisDragController: AxisDragController | null = null;
  let rangeGesture: {
    readonly partId: string;
    readonly startState: AssemblyState;
    readonly restoreRequired: boolean;
    progress: number;
  } | null = null;
  let selectionRequest = 0;
  const requestFrame = dependencies.requestAnimationFrame
    ?? ((callback: FrameRequestCallback) => window.requestAnimationFrame(callback));
  const cancelFrame = dependencies.cancelAnimationFrame
    ?? ((handle: number) => window.cancelAnimationFrame(handle));
  const reducedMotion = dependencies.prefersReducedMotion?.()
    ?? (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const cameraTween = viewer.camera && viewer.controls
    ? new CameraPresetTween(viewer.camera, viewer.controls, {
        reducedMotion,
        ...(viewer.partIndex ? { getVisibleObjects: () => viewer.partIndex.values() } : {}),
      })
    : null;
  let animationFrameId: number | null = null;
  let animationGeneration = 0;
  let previousFrameTime: number | null = null;
  let publishedProgress = 0;
  let interactionMode: TimelineMode = 'guided';
  let switchMountedModules = async (_quality: QualityLevel): Promise<void> => undefined;
  const qualityController = new AdaptiveQualityController((quality) => {
    void switchMountedModules(quality);
  });
  let removeFrameObserver: (() => void) | null = null;

  const setModuleStatus = (
    moduleId: string,
    status: 'idle' | 'loading' | 'ready' | 'failed',
    error?: string,
    quality: QualityLevel = qualityController.effectiveQuality,
  ): void => {
    shell.setModuleStatus(moduleId, status, error);
    const state = moduleLoader.getState(moduleId, quality);
    assemblyTree?.setModuleStatus(
      moduleId,
      status,
      error,
      state.retryCount,
      quality,
    );
  };

  const publishSceneMetrics = (): void => {
    const metrics = viewer.getPerformanceMetrics?.();
    if (!metrics) return;
    shell.root.dataset.totalTriangles = String(metrics.triangles);
    shell.root.dataset.textureBytes = metrics.textureBytes === null
      ? 'unavailable'
      : String(metrics.textureBytes);
    if (metrics.textureBytesUnavailableReason) {
      shell.root.dataset.textureBytesUnavailableReason =
        metrics.textureBytesUnavailableReason;
    } else {
      delete shell.root.dataset.textureBytesUnavailableReason;
    }
  };

  const attachLoadedModule = (loaded: LoadedModule): void => {
    if (mountedQualities.get(loaded.moduleId) === loaded.quality) return;
    const displaySnapshot = displayController?.snapshot();
    const selectedPartId = selectionController?.selectedPartId ?? null;
    try {
      viewer.addModule(loaded);
      mountedModuleIds.add(loaded.moduleId);
      mountedQualities.set(loaded.moduleId, loaded.quality);
      assemblyTree?.setLoadProgress(mountedModuleIds.size, manifest.modules.length);
      if (displaySnapshot) displayController?.restore(displaySnapshot);
      else displayController?.apply();
      cutawayController?.refresh();
      lightingController?.refresh();
      if (viewer.partIndex) guidedTransforms.apply(assemblyState, viewer.partIndex);
      selectionController?.select(selectedPartId);
      updateSelectionUi(selectedPartId);
      axisDragController?.refreshHandle();
      publishSceneMetrics();
    } catch (error) {
      disposeObjectTree(loaded.root);
      throw error;
    }
  };

  const loadAndMountModule = (
    moduleId: string,
    quality: QualityLevel = qualityController.effectiveQuality,
  ): Promise<void> => {
    const existing = moduleMountOperations.get(moduleId);
    if (existing?.quality === quality) return existing.promise;
    const before = existing?.promise.catch(() => undefined) ?? Promise.resolve();
    let operation: Promise<void>;
    operation = before.then(async () => {
      if (disposed) return;
      setModuleStatus(moduleId, 'loading', undefined, quality);
      try {
        const state = moduleLoader.getState(moduleId, quality);
        const loaded = await (state.status === 'failed'
          ? moduleLoader.retry(moduleId, quality)
          : moduleLoader.load(moduleId, quality));
        if (disposed) {
          disposeObjectTree(loaded.root);
          return;
        }
        attachLoadedModule(loaded);
        setModuleStatus(moduleId, 'ready', undefined, quality);
      } catch (error) {
        if (disposed) return;
        setModuleStatus(
          moduleId,
          'failed',
          error instanceof Error ? error.message : String(error),
          quality,
        );
        throw error;
      }
    }).finally(() => {
      if (moduleMountOperations.get(moduleId)?.promise === operation) {
        moduleMountOperations.delete(moduleId);
      }
    });
    moduleMountOperations.set(moduleId, { quality, promise: operation });
    return operation;
  };

  const publishQuality = (): void => {
    const effective = qualityController.effectiveQuality;
    shell.root.dataset.qualityMode = qualityController.mode;
    shell.root.dataset.qualityEffective = effective;
    viewer.setQualityProfile?.(QUALITY_PROFILES[effective]);
    lightingController?.setQualityEnvironmentIntensity(
      QUALITY_PROFILES[effective].environmentIntensity,
    );
    assemblyTree?.setQuality(qualityController.mode, effective);
  };

  switchMountedModules = async (quality: QualityLevel): Promise<void> => {
    if (disposed) return;
    publishQuality();
    await Promise.allSettled(
      [...mountedModuleIds].map((moduleId) => loadAndMountModule(moduleId, quality)),
    );
    if (disposed || quality !== qualityController.effectiveQuality) return;
    publishQuality();
  };

  const setQualityMode = async (mode: QualityMode): Promise<void> => {
    const previousQuality = qualityController.effectiveQuality;
    qualityController.setMode(mode);
    publishQuality();
    if (qualityController.effectiveQuality === previousQuality) {
      await switchMountedModules(qualityController.effectiveQuality);
    }
  };

  const publishSelectedTransformBasis = (partId: string | null): void => {
    const object = partId ? viewer.partIndex?.get(partId) : undefined;
    if (!object) {
      delete shell.root.dataset.selectedTransformBasis;
      return;
    }
    if (object.matrixAutoUpdate) object.updateMatrix();
    shell.root.dataset.selectedTransformBasis = object.matrix.elements
      .slice(0, 16)
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
    const loadStartedAt = performance.now();
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
    shell.root.dataset.allModulesLoadMs = String(
      Number((performance.now() - loadStartedAt).toFixed(3)),
    );
    publishSceneMetrics();
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

  const cloneAssemblyState = (state: AssemblyState): AssemblyState => ({
    manifest: state.manifest,
    progress: { ...state.progress },
    history: state.history.map((move) => ({ ...move })),
  });

  const abortAllFreeGestures = (): AssemblyState => {
    const rangeStart = rangeGesture?.startState ?? null;
    const axisStart = axisDragController?.abort() ?? null;
    rangeGesture = null;
    inspector?.abortProgressGesture();
    return cloneAssemblyState(rangeStart ?? axisStart ?? assemblyState);
  };

  const undoFreeMove = (): void => {
    if (interactionMode !== 'free' || disposed) return;
    const baseline = abortAllFreeGestures();
    publishFreeAssembly(undoLastMoveState(baseline));
  };

  const resetFreeAssembly = (): void => {
    if (disposed) return;
    const baseline = abortAllFreeGestures();
    const nextState = resetAssemblyState(baseline);
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

  const runAnimationFrame = (timestamp: number, generation: number): void => {
    if (generation !== animationGeneration || disposed) return;
    animationFrameId = null;
    const delta = previousFrameTime === null ? 0 : Math.max(0, timestamp - previousFrameTime);
    previousFrameTime = timestamp;
    const sequenceWasPlaying = guidedSequence.snapshot().isPlaying;
    const previousStepIndex = guidedSequence.snapshot().activeStepIndex;
    guidedSequence.tick(delta);
    cameraTween?.tick(delta);
    if (guidedSequence.snapshot().activeStepIndex !== previousStepIndex) startCurrentCameraPreset();
    publishSequence(sequenceWasPlaying ? guidedSequence.snapshot().normalizedTime : undefined);
    if (guidedSequence.snapshot().isPlaying || cameraTween?.active) {
      animationFrameId = requestFrame((nextTimestamp) => {
        runAnimationFrame(nextTimestamp, generation);
      });
    } else {
      previousFrameTime = null;
    }
  };

  const ensureAnimationFrame = (): void => {
    if (disposed || animationFrameId !== null) return;
    previousFrameTime = null;
    const generation = animationGeneration;
    animationFrameId = requestFrame((timestamp) => {
      runAnimationFrame(timestamp, generation);
    });
  };

  const stopGuidedMotion = (): AssemblyState => {
    guidedSequence.pause();
    cameraTween?.cancel();
    animationGeneration += 1;
    if (animationFrameId !== null) cancelFrame(animationFrameId);
    animationFrameId = null;
    previousFrameTime = null;
    return cloneAssemblyState(guidedSequence.snapshot().assembly);
  };

  const cancelGuidedPlayback = (): void => {
    stopGuidedMotion();
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
      onRetryModule: (moduleId) => loadAndMountModule(
        moduleId,
        qualityController.effectiveQuality,
      ),
      onQualityChange: setQualityMode,
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
      onVisibilityReset: () => {
        const selectedPartId = visibilityController
          ? resetVisibilityAndRestoreSelection(visibilityController, selectionController)
          : (selectionController?.selectedPartId ?? null);
        updateSelectionUi(selectedPartId);
      },
      onCutawayToggle: (enabled) => { cutawayController?.setEnabled(enabled); },
      onCutawayAxis: (axis) => { cutawayController?.setAxis(axis); },
      onCutawayOffset: (offset) => { cutawayController?.setOffset(offset); },
      onLightingPreset: (preset) => { lightingController?.setPreset(preset); },
      onCameraPreset: (preset) => {
        cameraTween?.start(preset);
        if (cameraTween?.active) ensureAnimationFrame();
      },
      onResetSelection: () => { selectionController?.select(null); },
      onProgressGesture: (partId, progress, phase) => {
        if (interactionMode !== 'free') return;
        if (phase === 'begin') {
          const axisStart = axisDragController?.abort() ?? null;
          const startState = cloneAssemblyState(axisStart ?? assemblyState);
          rangeGesture = {
            partId,
            startState,
            restoreRequired: axisStart !== null,
            progress: startState.progress[partId] ?? 0,
          };
          return;
        }
        const gesture = rangeGesture;
        if (!gesture || gesture.partId !== partId) return;
        if (phase === 'preview') {
          const moved = setPartProgress(gesture.startState, partId, progress);
          const preview = moved === gesture.startState
            ? gesture.startState
            : { ...moved, history: gesture.startState.history.map((move) => ({ ...move })) };
          gesture.progress = preview.progress[partId] ?? gesture.startState.progress[partId] ?? 0;
          publishFreeAssembly(preview);
          return;
        }
        rangeGesture = null;
        if (phase === 'cancel') {
          publishFreeAssembly(gesture.startState);
          return;
        }
        const from = gesture.startState.progress[partId] ?? 0;
        if (gesture.progress === from) {
          if (gesture.restoreRequired) publishFreeAssembly(gesture.startState);
          return;
        }
        publishFreeAssembly(setPartProgress(gesture.startState, partId, gesture.progress));
      },
      onSelectDependency: (partId) => { void selectTreePart(partId); },
      onUndoMove: undoFreeMove,
      onResetAssembly: resetFreeAssembly,
    });
    inspector.setFreeMode(false);
    selectionController.onSelectionChange((partId) => {
      selectionRequest += 1;
      displayController?.reconcileSelection(partId);
      selectionController?.select(partId);
      updateSelectionUi(partId);
    });
    assemblyTree.setLoadProgress(0, manifest.modules.length);
    assemblyTree.setQuality(qualityController.mode, qualityController.effectiveQuality);
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
        if (mode === 'free') {
          const currentAssembly = stopGuidedMotion();
          interactionMode = mode;
          inspector?.setFreeMode(true);
          timeline?.setMode(mode);
          publishFreeAssembly({ ...currentAssembly, history: [] });
          return;
        }
        const baseline = abortAllFreeGestures();
        interactionMode = mode;
        inspector?.setFreeMode(false);
        timeline?.setMode(mode);
        assemblyState = baseline;
        publishedProgress = averageProgress(baseline);
        guidedSequence.replaceAssemblyState(baseline);
        seekGuided(publishedProgress);
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
        const baseline = abortAllFreeGestures();
        stopGuidedMotion();
        assemblyState = {
          ...setGlobalExplode(baseline, progress),
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

  publishQuality();
  removeFrameObserver = viewer.onFrame?.((frameTimeMs, cameraMoving, now) => {
    qualityController.observeFrame(frameTimeMs, cameraMoving, now);
  }) ?? null;

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
  const preloadReady = Promise.allSettled(preloadPromises).then(() => {
    shell.root.dataset.initialLoadMs = String(
      Number((performance.now() - appStartedAt).toFixed(3)),
    );
    publishSceneMetrics();
  });

  return {
    manifest,
    shell,
    viewer,
    moduleLoader,
    get assemblyState() { return assemblyState; },
    selectionController,
    axisDragController,
    visibilityController,
    cutawayController,
    lightingController,
    assemblyTree,
    inspector,
    timeline,
    guidedSequence,
    qualityController,
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
      animationGeneration += 1;
      previousFrameTime = null;
      guidedSequence.pause();
      removeFrameObserver?.();
      removeFrameObserver = null;
      cameraTween?.dispose();
      timeline?.dispose();
      axisDragController?.dispose();
      selectionController?.dispose();
      assemblyTree?.dispose();
      inspector?.dispose();
      cutawayController?.dispose();
      lightingController?.dispose();
      displayController?.dispose();
      moduleLoader.dispose();
      viewer.dispose();
      shell.dispose();
    },
  };
}
