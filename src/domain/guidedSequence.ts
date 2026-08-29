import type { AssemblyState, MoveRecord } from './assemblyState';
import type { AssemblyManifest, DisassemblyStep, PartManifest } from './manifest';

export interface GuidedSequenceOptions {
  stepDurationMs?: number;
}

export interface GuidedSequenceSnapshot {
  readonly normalizedTime: number;
  readonly isPlaying: boolean;
  readonly activeStepIndex: number;
  readonly completedStepCount: number;
  readonly stepProgress: number;
  readonly currentStep: DisassemblyStep | null;
  readonly assembly: AssemblyState;
}

const DEFAULT_STEP_DURATION_MS = 1_250;
const BOUNDARY_EPSILON = 1e-10;
// Keep sub-microsecond carry at femtosecond precision. Published time uses
// the cumulative whole+fraction pair, so partitioning does not round every
// incoming delta independently.
const FRACTIONAL_MICROSECOND_SCALE = 1_000_000_000;

function clamp01(value: number): number {
  if (Number.isNaN(value) || value === Number.NEGATIVE_INFINITY) return 0;
  if (value === Number.POSITIVE_INFINITY) return 1;
  return Math.min(1, Math.max(0, value));
}

function cubicEaseInOut(value: number): number {
  const time = clamp01(value);
  return time < 0.5
    ? 4 * time * time * time
    : 1 - ((-2 * time + 2) ** 3) / 2;
}

function compareParts(left: PartManifest, right: PartManifest): number {
  return left.step - right.step
    || (left.partId < right.partId ? -1 : left.partId > right.partId ? 1 : 0);
}

function dependencyOrder(manifest: AssemblyManifest): PartManifest[] {
  const partsById = new Map(manifest.parts.map((part) => [part.partId, part]));
  const dependentIds = new Map<string, string[]>();
  const remaining = new Map<string, number>();

  manifest.parts.forEach((part) => {
    const dependencies = part.dependsOn.filter((partId) => partsById.has(partId));
    remaining.set(part.partId, dependencies.length);
    dependencies.forEach((dependencyId) => {
      const dependents = dependentIds.get(dependencyId) ?? [];
      dependents.push(part.partId);
      dependentIds.set(dependencyId, dependents);
    });
  });

  const ready = manifest.parts
    .filter((part) => remaining.get(part.partId) === 0)
    .sort(compareParts);
  const result: PartManifest[] = [];
  while (ready.length > 0) {
    const part = ready.shift()!;
    result.push(part);
    dependentIds.get(part.partId)?.forEach((partId) => {
      const count = (remaining.get(partId) ?? 0) - 1;
      remaining.set(partId, count);
      if (count === 0) {
        ready.push(partsById.get(partId)!);
        ready.sort(compareParts);
      }
    });
  }

  if (result.length < manifest.parts.length) {
    const included = new Set(result.map((part) => part.partId));
    result.push(...manifest.parts.filter((part) => !included.has(part.partId)).sort(compareParts));
  }
  return result;
}

function immutableManifestSnapshot(manifest: AssemblyManifest): AssemblyManifest {
  return Object.freeze({
    ...manifest,
    product: Object.freeze({ ...manifest.product }),
    modules: Object.freeze(manifest.modules.map((module) => Object.freeze({
      ...module,
      urls: Object.freeze({ ...module.urls }),
    }))),
    parts: Object.freeze(manifest.parts.map((part) => Object.freeze({
      ...part,
      explodeAxis: Object.freeze([...part.explodeAxis]),
      dependsOn: Object.freeze([...part.dependsOn]),
    }))),
    steps: Object.freeze(manifest.steps.map((step) => Object.freeze({
      ...step,
      partIds: Object.freeze([...step.partIds]),
    }))),
  }) as AssemblyManifest;
}

function immutableAssemblySnapshot(
  state: AssemblyState,
  snapshotManifest: AssemblyManifest,
): AssemblyState {
  const history = state.history.map((move) => Object.freeze({ ...move })) as MoveRecord[];
  return Object.freeze({
    manifest: snapshotManifest,
    progress: Object.freeze({ ...state.progress }),
    history: Object.freeze(history) as unknown as MoveRecord[],
  });
}

export class GuidedSequence {
  private readonly steps: readonly DisassemblyStep[];
  private readonly partStepIndex = new Map<string, number>();
  private readonly orderedParts: readonly PartManifest[];
  private readonly snapshotManifest: AssemblyManifest;
  private readonly stepDurationMs: number;
  private readonly totalDurationMicroseconds: number;
  private state: AssemblyState;
  private normalizedTime = 0;
  private elapsedMicroseconds = 0;
  private fractionalMicroseconds = 0;
  private playing = false;

  constructor(
    private readonly manifest: AssemblyManifest,
    initialState: AssemblyState,
    options: GuidedSequenceOptions = {},
  ) {
    this.steps = [...manifest.steps];
    this.snapshotManifest = immutableManifestSnapshot(manifest);
    this.steps.forEach((step, index) => {
      step.partIds.forEach((partId) => this.partStepIndex.set(partId, index));
    });
    this.orderedParts = dependencyOrder(manifest);
    this.stepDurationMs = Number.isFinite(options.stepDurationMs)
      && (options.stepDurationMs ?? 0) > 0
      ? options.stepDurationMs!
      : DEFAULT_STEP_DURATION_MS;
    this.totalDurationMicroseconds = Math.round(
      this.steps.length * this.stepDurationMs * 1_000,
    );
    this.state = {
      manifest,
      progress: Object.fromEntries(
        manifest.parts.map((part) => [part.partId, clamp01(initialState.progress[part.partId] ?? 0)]),
      ),
      // Guided time is an absolute assembly state, not an undoable free-mode
      // move. Never let undo cross the mode boundary.
      history: [],
    };
  }

  play(): void {
    if (this.steps.length === 0 || this.normalizedTime >= 1) {
      this.playing = false;
      return;
    }
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  next(): void {
    if (this.steps.length === 0) return;
    const scaledTime = this.normalizedTime * this.steps.length;
    const boundary = Math.floor(scaledTime + BOUNDARY_EPSILON) + 1;
    this.seek(boundary / this.steps.length);
  }

  previous(): void {
    if (this.steps.length === 0) return;
    const scaledTime = this.normalizedTime * this.steps.length;
    const boundary = Math.ceil(scaledTime - BOUNDARY_EPSILON) - 1;
    this.seek(boundary / this.steps.length);
  }

  seek(requestedTime: number): void {
    if (this.steps.length === 0) {
      this.normalizedTime = 0;
      this.playing = false;
      return;
    }
    this.normalizedTime = clamp01(requestedTime);
    const exactMicroseconds = this.normalizedTime * this.totalDurationMicroseconds;
    this.elapsedMicroseconds = Math.floor(exactMicroseconds);
    this.fractionalMicroseconds = this.stableFraction(
      exactMicroseconds - this.elapsedMicroseconds,
    );
    if (this.fractionalMicroseconds >= 1) {
      this.elapsedMicroseconds += 1;
      this.fractionalMicroseconds = 0;
    }
    this.updateNormalizedTime();
    this.applyTimeToAssembly();
    if (this.normalizedTime >= 1) this.playing = false;
  }

  tick(milliseconds: number): void {
    if (!this.playing || !Number.isFinite(milliseconds) || milliseconds <= 0) return;
    const deltaMicroseconds = milliseconds * 1_000;
    if (deltaMicroseconds <= 0) return;
    if (deltaMicroseconds >= this.totalDurationMicroseconds) {
      this.elapsedMicroseconds = this.totalDurationMicroseconds;
      this.fractionalMicroseconds = 0;
    } else {
      const wholeDelta = Math.floor(deltaMicroseconds);
      const fractionalDelta = deltaMicroseconds - wholeDelta;
      const combinedFraction = this.stableFraction(
        this.fractionalMicroseconds + fractionalDelta,
      );
      const carry = Math.floor(combinedFraction);
      this.elapsedMicroseconds = Math.min(
        this.totalDurationMicroseconds,
        this.elapsedMicroseconds + wholeDelta + carry,
      );
      this.fractionalMicroseconds = this.elapsedMicroseconds >= this.totalDurationMicroseconds
        ? 0
        : combinedFraction - carry;
    }
    this.updateNormalizedTime();
    this.applyTimeToAssembly();
    if (this.elapsedMicroseconds >= this.totalDurationMicroseconds) {
      this.normalizedTime = 1;
      this.fractionalMicroseconds = 0;
      this.playing = false;
    }
  }

  replaceAssemblyState(state: AssemblyState): void {
    this.state = {
      manifest: this.manifest,
      progress: Object.fromEntries(
        this.manifest.parts.map((part) => [part.partId, clamp01(state.progress[part.partId] ?? 0)]),
      ),
      history: [],
    };
  }

  snapshot(): GuidedSequenceSnapshot {
    const scaledTime = this.normalizedTime * this.steps.length;
    const completedStepCount = this.normalizedTime >= 1
      ? this.steps.length
      : Math.floor(scaledTime);
    const activeStepIndex = this.steps.length === 0
      ? -1
      : Math.min(completedStepCount, this.steps.length - 1);
    const stepProgress = this.normalizedTime >= 1 || activeStepIndex < 0
      ? (this.normalizedTime >= 1 ? 1 : 0)
      : scaledTime - completedStepCount;

    return Object.freeze({
      normalizedTime: this.normalizedTime,
      isPlaying: this.playing,
      activeStepIndex,
      completedStepCount,
      stepProgress,
      currentStep: activeStepIndex < 0 ? null : this.snapshotManifest.steps[activeStepIndex]!,
      assembly: immutableAssemblySnapshot(this.state, this.snapshotManifest),
    });
  }

  private applyTimeToAssembly(): void {
    const scaledTime = this.normalizedTime * this.steps.length;
    const completedSteps = this.normalizedTime >= 1
      ? this.steps.length
      : Math.floor(scaledTime);
    const easedStepProgress = this.normalizedTime >= 1
      ? 1
      : cubicEaseInOut(scaledTime - completedSteps);
    const desiredProgress = new Map<string, number>();

    this.manifest.parts.forEach((part) => {
      const stepIndex = this.partStepIndex.get(part.partId);
      const progress = stepIndex === undefined
        ? 0
        : stepIndex < completedSteps
          ? 1
          : stepIndex === completedSteps
            ? easedStepProgress
            : 0;
      desiredProgress.set(part.partId, progress);
    });

    const nextProgress = { ...this.state.progress };
    const partsToDecrease = this.orderedParts
      .filter((part) => (nextProgress[part.partId] ?? 0) > (desiredProgress.get(part.partId) ?? 0))
      .reverse();
    const partsToIncrease = this.orderedParts
      .filter((part) => (nextProgress[part.partId] ?? 0) < (desiredProgress.get(part.partId) ?? 0));
    [...partsToDecrease, ...partsToIncrease].forEach((part) => {
      nextProgress[part.partId] = desiredProgress.get(part.partId) ?? 0;
    });
    this.state = { ...this.state, progress: nextProgress };
  }

  private stableFraction(value: number): number {
    return Math.round(value * FRACTIONAL_MICROSECOND_SCALE)
      / FRACTIONAL_MICROSECOND_SCALE;
  }

  private updateNormalizedTime(): void {
    this.normalizedTime = this.totalDurationMicroseconds === 0
      ? 0
      : (this.elapsedMicroseconds + this.fractionalMicroseconds)
        / this.totalDurationMicroseconds;
  }
}
