# Task 12 Report: Guided Disassembly Timeline

## Outcome

Implemented the production 40-step Nikon Z50II guided disassembly sequence, responsive Chinese-first timeline, independent full-explode control, exact Object3D transform application, deterministic camera presets, late-module coordination, live inspector progress, and Task 13 playback/free-drag cancellation hooks. Task 11 selection, display, loading, and lifecycle behavior remains intact.

## RED / GREEN evidence

### Guided sequence RED

- Added `tests/unit/guidedSequence.test.ts` against `public/assembly-manifest.json`, not the compact fixture.
- The first run failed with `Cannot find module '../../src/domain/guidedSequence'`, the expected missing-feature failure.
- Coverage includes the exact step sequence `1..40`, forward/reverse/repeated seeks, cubic ease-in-out, same-step synchronization, arbitrary tick chunks, clamping, pause/play/end auto-pause, next/previous boundaries, zero/one-step manifests, mixed starting progress, and deep snapshot immutability.

### Camera, transform, and timeline RED

- `cameraPresetTween.test.ts` and `timeline.test.ts` first failed because their production modules did not exist.
- `guidedPartTransforms.test.ts` first failed because its production module did not exist.
- Added explicit exact-matrix restoration, late-module capture, no rotation/scale drift, and `matrixAutoUpdate=false` checks.

### Integration regression RED

- Extended `createApp.test.ts` before lifecycle wiring. It first failed because guided callbacks were not mounted.
- Browser E2E exposed a stale camera-only frame overwriting `data-assembly-progress="0.6"` with timeline time `0`. A focused unit regression reproduced that exact failure (`expected 0.6, received 0.75`) before the coordinator fix.
- Added a deterministic `data-camera-tween-active` state hook under RED before using it for browser evidence synchronization.

## Implemented behavior

### Deterministic sequence

- Uses the production manifest's 40 ordered steps and 100 parts.
- Maps normalized time to one active step, with cubic ease-in-out inside the step; every part in that step receives the same eased progress.
- Keeps completed steps at `1` and future steps at `0`.
- Reconciles arbitrary/mixed current states in dependency order: progress decreases run in reverse topological order before increases run in forward topological order.
- Handles finite arbitrary tick chunks deterministically, clamps seeks, ignores invalid/negative tick deltas, and auto-pauses at the end.
- `snapshot()` returns isolated, frozen progress, history, manifest arrays, dependencies, axes, steps, and part lists.

### Exact part transforms and module loading

- Every indexed Object3D captures its own exact assembled position and matrix before its first guided offset.
- Every frame derives translation from the captured assembled transform plus `getPartOffset`; no accumulated deltas are used.
- Rotation and scale are never changed.
- Progress `1 → 0` restores the exact assembled matrix elements.
- Matrix translation is updated even when `matrixAutoUpdate` is disabled.
- Guided play/seek starts shared load-all coordination. Modules that resolve later are attached through the existing owner path and immediately receive the current assembly state.

### Timeline and application state

- Chinese-first mode selector, play/pause, previous/next, bilingual step title, padded step count, guided time slider, and independent full-explode slider.
- Required hooks: `mode-guided`, `guided-play`, `guided-progress`; additional stable hooks: `guided-previous`, `guided-next`, `guided-step-title`, and `global-explode`.
- Application root publishes `data-assembly-progress`, `data-guided-playback-active`, `data-free-drag-enabled`, and deterministic camera-tween state.
- `App` exposes `guidedPlaybackActive`, `freeDragEnabled`, `guidedSequence`, and `cancelGuidedPlayback()` for Task 13.
- Inspector progress updates in place from the live `AssemblyState`, preserving Task 11 action state and avoiding full inspector reconstruction on every frame.
- One owned animation-frame scheduler services guided playback and camera tweening; pending work is cancelled/neutralized safely on pause, user orbit, global explode, and disposal.

### Camera presets

- Uses meter-scale offsets for front, rear, left, right, top, bottom, and three-quarter presets around the unchanged OrbitControls target.
- Cubic tweening is deterministic for arbitrary tick chunks.
- A replacement preset starts from the current camera position.
- OrbitControls `start` cancels active tweening without stealing the user's orbit.
- Reduced-motion mode applies the destination immediately.
- Disposal removes the controls listener and makes later starts inert.

## Browser verification and evidence

The committed E2E runs against built `dist` through `scripts/run-e2e.mjs` and system Chrome:

- Task 11 regression and Task 12 guided timeline both passed in the same run.
- Initial preload remained `2 / 8`; first guided step triggered safe loading to `8 / 8`.
- Next moved root progress to `0.025` and count to `01 / 40`.
- Full forward seek reached root progress `1`, count `40 / 40`, and selected-part progress `100%`.
- Reverse seek returned root and selected-part progress to `0` / `0%`.
- Independent full-explode slider reached `0.6` / `60%` and returned to `0` / `0%` despite a previously scheduled camera frame.
- Play/pause toggled the Chinese accessible name and the playback/free-drag state hooks.
- Desktop visual QA waited for the camera tween's deterministic completion and shows visible exploded offsets across the loaded 100-part model.
- Mobile 390 × 844 timeline remained usable with both sliders and all controls visible; document width did not exceed the viewport.
- Browser/page console errors: `0`.

Evidence:

- `task-12-desktop-exploded.png` (1440 × 900)
- `task-12-mobile-timeline.png` (390 × 844)

## Verification

- Focused guided/lifecycle suites: 5 files, 18 tests passed during implementation.
- Exact transform and deep snapshot regression suites passed after their RED runs.
- Production TypeScript check and Vite build passed.
- Task 12 focused E2E passed after visual synchronization.
- Final `scripts/pnpm.ps1 check`: **14 / 14 test files and 66 / 66 tests passed**, followed by `tsc --noEmit` and the production Vite build.
- Final `scripts/pnpm.ps1 test:e2e`: **2 / 2 passed** (Task 11 regression plus Task 12), and the owned preview process stopped cleanly.

## Concerns / follow-up

- Vite retains the pre-existing warning that the main Three.js bundle exceeds 500 kB; code splitting is outside Task 12 scope.
- The E2E runner reports the existing `NO_COLOR`/`FORCE_COLOR` environment warning from Node. It does not affect browser behavior.
- Task 13 can consume the exposed free-drag/playback/cancel hooks; free-drag handles themselves are intentionally not introduced in Task 12.
