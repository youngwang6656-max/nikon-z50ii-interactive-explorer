import type { AssemblyManifest, PartManifest, Vec3 } from './manifest';

export interface MoveRecord {
  partId: string;
  from: number;
  to: number;
}

export interface AssemblyState {
  manifest: AssemblyManifest;
  progress: Record<string, number>;
  history: MoveRecord[];
}

export interface MovePermission {
  allowed: boolean;
  missingPartIds: string[];
}

const clampProgress = (value: number): number => {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

const partById = (manifest: AssemblyManifest, partId: string): PartManifest | undefined =>
  manifest.parts.find((part) => part.partId === partId);

const compareParts = (left: PartManifest, right: PartManifest): number =>
  left.step - right.step || (left.partId < right.partId ? -1 : left.partId > right.partId ? 1 : 0);

const dependencyOrder = (manifest: AssemblyManifest): PartManifest[] => {
  const partsById = new Map(manifest.parts.map((part) => [part.partId, part]));
  const dependents = new Map<string, string[]>();
  const remainingDependencies = new Map<string, number>();

  manifest.parts.forEach((part) => {
    const dependencies = part.dependsOn.filter((dependencyId) => partsById.has(dependencyId));
    remainingDependencies.set(part.partId, dependencies.length);
    dependencies.forEach((dependencyId) => {
      const dependentIds = dependents.get(dependencyId) ?? [];
      dependentIds.push(part.partId);
      dependents.set(dependencyId, dependentIds);
    });
  });

  const ready = manifest.parts
    .filter((part) => remainingDependencies.get(part.partId) === 0)
    .sort(compareParts);
  const ordered: PartManifest[] = [];

  while (ready.length > 0) {
    const part = ready.shift()!;
    ordered.push(part);
    dependents.get(part.partId)?.forEach((dependentId) => {
      const remaining = (remainingDependencies.get(dependentId) ?? 0) - 1;
      remainingDependencies.set(dependentId, remaining);
      if (remaining === 0) {
        ready.push(partsById.get(dependentId)!);
        ready.sort(compareParts);
      }
    });
  }

  // Parsed manifests are guaranteed acyclic. Keep a deterministic fallback
  // for callers that construct an AssemblyManifest directly.
  if (ordered.length < manifest.parts.length) {
    const orderedIds = new Set(ordered.map((part) => part.partId));
    ordered.push(...manifest.parts.filter((part) => !orderedIds.has(part.partId)).sort(compareParts));
  }
  return ordered;
};

export function createAssemblyState(manifest: AssemblyManifest): AssemblyState {
  const progress: Record<string, number> = {};
  manifest.parts.forEach((part) => {
    progress[part.partId] = 0;
  });
  return { manifest, progress, history: [] };
}

export function canMovePart(state: AssemblyState, partId: string): MovePermission {
  const part = partById(state.manifest, partId);
  if (!part) return { allowed: false, missingPartIds: [] };

  const missingPartIds = part.dependsOn.filter((dependencyId) => (state.progress[dependencyId] ?? 0) < 1);
  return { allowed: missingPartIds.length === 0, missingPartIds };
}

const withProgress = (state: AssemblyState, partId: string, to: number): AssemblyState => {
  const from = state.progress[partId] ?? 0;
  if (from === to) return state;

  return {
    manifest: state.manifest,
    progress: { ...state.progress, [partId]: to },
    history: [...state.history, { partId, from, to }],
  };
};

export function setPartProgress(state: AssemblyState, partId: string, requestedProgress: number): AssemblyState {
  const part = partById(state.manifest, partId);
  if (!part) return state;

  const from = state.progress[partId] ?? 0;
  const to = clampProgress(requestedProgress);
  if (from === to) return state;

  // Returning towards the assembled state is always safe. Opening a part
  // requires every configured prerequisite to be completely removed.
  if (to > from && !canMovePart(state, partId).allowed) return state;
  return withProgress(state, partId, to);
}

export function setGlobalExplode(state: AssemblyState, requestedProgress: number): AssemblyState {
  const target = clampProgress(requestedProgress);
  const orderedParts = dependencyOrder(state.manifest);
  const partsToDecrease = orderedParts
    .filter((part) => (state.progress[part.partId] ?? 0) > target)
    .reverse();
  const partsToIncrease = orderedParts.filter((part) => (state.progress[part.partId] ?? 0) < target);

  // Guided global movement deliberately applies the same target to every
  // part. Decreases close dependents first; increases open prerequisites
  // first. This remains deterministic even when current progress is mixed.
  return [...partsToDecrease, ...partsToIncrease].reduce(
    (nextState, part) => withProgress(nextState, part.partId, target),
    state,
  );
}

export function undoLastMove(state: AssemblyState): AssemblyState {
  const lastMove = state.history.at(-1);
  if (!lastMove) return state;

  return {
    manifest: state.manifest,
    progress: { ...state.progress, [lastMove.partId]: lastMove.from },
    history: state.history.slice(0, -1),
  };
}

export function resetAssembly(state: AssemblyState): AssemblyState {
  const progress: Record<string, number> = {};
  state.manifest.parts.forEach((part) => {
    progress[part.partId] = 0;
  });
  return { manifest: state.manifest, progress, history: [] };
}

export function getPartOffset(state: AssemblyState, partId: string): Vec3 {
  const part = partById(state.manifest, partId);
  if (!part) return [0, 0, 0];

  const distance = (state.progress[partId] ?? 0) * part.explodeDistance;
  return [
    part.explodeAxis[0] * distance,
    part.explodeAxis[1] * distance,
    part.explodeAxis[2] * distance,
  ];
}
