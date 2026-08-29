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

## Fix Round 1 (reviewed commit `72af768`)

### Deterministic playback endpoint

- Reproduced the partition bug with 4,000 one-millisecond ticks: normalized time stopped at `0.9999999999999176` and playback remained active while one 4,000 ms tick ended exactly.
- Guided playback now keeps integer microseconds as its timing authority and derives normalized time from that state. One large chunk and thousands of 1 ms chunks produce identical snapshots, exact normalized time `1`, and exact auto-pause.

### History boundary semantics

- Guided sequence construction and replacement now clear incoming free-mode history.
- Guided seek/play continue from a history-free absolute state; the full-explode control also clears the transition records generated while applying its uniform target.
- `undoLastMove` therefore cannot cross a guided/global mode boundary and replay an unrelated prior transition.

### Authoritative interaction mode and atomic global-to-play

- `guided` and `free` are now application state, not cosmetic select text. The root publishes `data-interaction-mode`.
- Free mode pauses guided playback, enables `freeDragEnabled`, and disables play, previous, next, and guided seek controls. The independent global-explode slider remains enabled.
- Guided mode owns those controls and keeps `freeDragEnabled=false` even while paused. Direct stale callbacks are guarded by the same application mode.
- Play reconciles the current published playhead into a valid guided assembly state before starting. A uniform global state at `0.6` changes atomically to guided time `0.6`: root, geometry, assembly state, inspector, and timeline agree before the first animation frame, whose delta is reset to zero.

### World-space transform correction

- Replaced local-axis translation with assembled-world transform records.
- New and replacement indexed roots capture exact assembled local and world matrices. Late nested roots reconstruct their assembled world matrix through recorded assembled ancestors, even when those ancestors are currently exploded.
- Indexed roots are processed by object depth. Each desired world transform is converted through the current parent-world inverse; nested tagged roots therefore receive independent manifest offsets instead of inheriting and double-counting tagged-parent displacement.
- Ordinary untagged descendants continue to follow their indexed host naturally.
- Rotated/non-uniformly scaled parents, nested tagged parent/child roots, ordinary descendants, late roots, high/low object replacement, `matrixAutoUpdate=false`, unchanged quaternion/scale, and exact reverse matrix restoration are covered by focused tests.

### Mobile and evidence hygiene

- Mobile timeline select, buttons, and sliders now expose at least 44 px interaction heights without horizontal overflow.
- Browser coverage exercises free/guided disabled-state transitions, atomic global→Play, forward/reverse, keyboard regression through Task 11, and mobile target measurements.
- Restored Task 11 desktop and mobile-timeline evidence byte-for-byte from base `2b3f4c6` (Git blob hashes `1f363d411b174bfcd2140fdaf343732bd2615e87` and `725181fafda944d6e701528d1d125f160696ce73`). Task 12 no longer retains rewritten prior-task evidence.

### Fix-round verification

- Focused sequence/transform/lifecycle/timeline suites: **4 / 4 files, 20 / 20 tests passed**.
- Full `check`: **14 / 14 files, 71 / 71 tests passed**, followed by TypeScript and production Vite build.
- Focused Task 12 browser test passed after the interaction-mode expectation was aligned with the authoritative contract.
- Final full browser regression: **2 / 2 passed** (Task 11 plus Task 12), with zero browser/page console errors and clean owned-preview shutdown.
- After that E2E regenerated prior screenshots, both Task 11 images were restored again and their Git object hashes matched base `2b3f4c6` exactly.

## Fix Round 2 (reviewed commit `55e2e34`)

### Partition-invariant fractional timing

- Reproduced the remaining per-call quantization bug: one `tick(16.6667)` recorded 16,667 µs, while two `tick(8.33335)` calls recorded 16,666 µs. Repeating `tick(0.6666665)` also rounded every call upward and could auto-pause before the true accumulated duration reached the endpoint.
- Playback now stores cumulative whole microseconds plus a fractional-microsecond carry. Each new delta is merged into that carry before whole-microsecond extraction, rather than rounded independently.
- Fractional carry is stabilized at `1e-9` µs precision (one femtosecond). A value within that defined precision of the next whole microsecond carries forward deterministically.
- Published normalized time includes the stabilized fraction, while the endpoint clamps to exact `1`, clears the fraction, and auto-pauses only when cumulative elapsed time reaches the duration at the defined precision.
- Seek establishes a new exact accumulator and resets prior carry. Play and pause preserve carry. Assembly-state replacement preserves timeline carry. Negative, zero, and non-finite ticks leave both whole and fractional elapsed state untouched.

### Fix-round tests

- Added the exact reviewer partition pair (`16.6667` versus `8.33335 + 8.33335`).
- Added 1,500 × `0.6666665` ms to prove playback remains active at 999.99975 ms, then reaches exact completion only after the remaining 0.00025 ms.
- Added deterministic varied partitions generated in tenths of a microsecond and compared normalized time, all part progress, and playback state at a 100 ms step boundary and the 4,000 ms endpoint.
- Added seek-reset plus pause/play/replace/invalid-delta accumulator semantics coverage.
