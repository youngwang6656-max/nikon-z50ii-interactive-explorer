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
  const currentValues = state.manifest.parts.map((part) => state.progress[part.partId] ?? 0);
  const average = currentValues.length === 0
    ? 0
    : currentValues.reduce((sum, value) => sum + value, 0) / currentValues.length;
  const opening = target > average;
  const orderedParts = [...state.manifest.parts].sort((left, right) => {
    const stepOrder = opening ? left.step - right.step : right.step - left.step;
    return stepOrder;
  });

  // Guided global movement deliberately applies the same target to every
  // part, while the order of records follows dependency-safe assembly steps.
  return orderedParts.reduce(
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
