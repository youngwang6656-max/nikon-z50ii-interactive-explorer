# Task 13 Report — Constrained Free Disassembly and Undo

## Outcome

Implemented a free disassembly mode alongside the guided teaching timeline. A selected, unlocked, visible part can be dragged only along its manifest world/glTF axis, edited with an accessible numeric range, undone as one move, cancelled exactly, or reset with the complete assembly. Guided mode remains authoritative and cancels any active free drag before crossing the mode boundary.

## RED / GREEN evidence

1. Added `tests/unit/axisDragController.test.ts` before the controller module. The first run failed with `Cannot find module '../../src/viewer/axisDragController'`.
2. Implemented the projection helpers and controller. Focused tests then exposed two deliberately strict test assumptions (floating-point parent inversion and a coplanar Three.js ray); the tests were corrected to assert the intended behavior independently.
3. Added pointer-capture, multi-pointer, handle visibility/orientation/scaling, and disposal cases. They failed because canvas ownership and the handle did not yet exist, then passed after the minimal lifecycle/handle implementation.
4. Added Ctrl/Command+Z edit-safety and inspector dependency/progress model tests. They failed on missing `handleUndoShortcut`, `progressValue`, and `missingDependencies`, then passed after implementation.
5. Added a create-app integration test for free move history, undo, reset, and free→guided cancellation. It failed because the app did not own an axis controller, then passed after wiring the controller and free-state publisher.
6. A lifecycle audit found that public `cancel()` could restore state/orbit while retaining a controller-owned pointer capture. A regression assertion failed (`releasePointerCapture(13)` missing); the root cause was the release path living only in pointer-event handlers. Moving capture release into `end()`/`cancel()` made the focused controller and app suites pass.

Focused result: 18/18 axis/assembly tests passed. Full unit result: 91/91 tests passed before the final browser audit; the final verification command is recorded below.

## Drag math and transform contract

- Manifest `explodeAxis` is treated as a normalized world/glTF direction and `explodeDistance` as metres.
- For axis **a** and camera view direction **v**, the drag-plane normal is `normalize(v - a(a·v))`. If the view is axis-parallel, camera-up is projected the same way; if that is also degenerate, the least-aligned world basis is projected. Every selected normal is finite, unit length, and perpendicular to **a**, so the plane always contains the configured axis.
- The plane passes through the selected part's current world position. Pointer rays are intersected with it; parallel/off-plane rays return no intersection and leave state/orbit unchanged.
- Progress is `clamp01(startProgress + ((hit - startHit) · a) / explodeDistance)`.
- Preview updates reuse the pointer-down progress/history snapshot. They change only the selected progress value and never append history. `end()` appends exactly one `{partId, from, to}` record; a no-op appends none; `cancel()` restores the complete pointer-down state.
- Existing `GuidedPartTransforms` remains the sole geometry transform owner. It applies the resulting world-space translation through transformed/nested parents while preserving exact captured local basis matrices. The regression test covers translated, rotated, non-uniformly scaled nesting and verifies world-axis travel plus exact local rotation/scale basis restoration.

## Lifecycle and interaction behavior

- Dependency permission is checked before object lookup, ray-plane work, pointer capture, state publication, geometry mutation, or OrbitControls mutation. Locked begin returns the exact ordered `missingPartIds` from Task 2.
- OrbitControls is disabled only after a valid ray-plane start and is restored to its prior value on end, cancel, pointer cancel, lost capture, Escape, disposal, and free→guided mode switch.
- Only primary left-button gestures can start; secondary/additional pointers cannot update or end the active drag.
- Pointer capture is owned only for a valid active gesture and is released by the controller's terminal methods.
- The cyan bidirectional handle is a separate scene object, not part of the pickable assembly root. Its line and arrow meshes have disabled raycasts, world-axis orientation, camera-distance/viewport responsive scale, and owned geometry/material disposal. It is hidden in guided mode and for unselected, locked, or hidden parts.
- Late module mounting reapplies exact transforms and refreshes the handle. App disposal marks the app disposed before asynchronous work can republish, then cancels/releases the controller before viewer teardown.

## Inspector, commands, and modes

- `data-testid="part-progress"` remains a live-percent test surface and now contains a labelled `input[type="range"]` with numeric 0–1000 values and `aria-valuetext`; the adjacent output is `aria-live`.
- Locked warnings contain only currently missing prerequisites by their exact Chinese manifest names. Each name is a button that loads, selects, focuses, and reveals the corresponding assembly-tree part.
- `data-testid="undo-move"` and input-safe Ctrl/Command+Z call the same undo command. Inputs, textareas, selects, and contenteditable targets keep native undo behavior.
- Escape cancels an active drag before the existing selection shortcut can clear selection.
- `data-testid="reset-assembly"` cancels active input, returns all parts to exact zero in one dependency-safe state replacement, clears history, and publishes root/inspector/timeline/geometry once.
- `data-testid="mode-free"` is an explicit free-mode switch while the prior mode select/test contract remains intact. Crossing back to guided cancels active drag first and clears incompatible free history at the established guided-mode boundary.

## Real Chrome evidence

`tests/e2e/task13-free-disassembly.spec.ts` ran against the built Vite preview using real Chrome and passed. It verified:

- free-mode switch and authoritative root attributes;
- a removable `左上机壳螺钉` dragged on the canvas along its handle to non-zero progress, with its published 3×4 rotation/scale basis signature byte-for-byte unchanged before and after the real-Chrome drag;
- numeric range movement, one-step undo, Ctrl+Z input safety, Escape cancellation, and reset with cleared undo;
- locked `主电路板` drag with zero motion, an exact `影像处理器封装` warning, and a working prerequisite tree link;
- active free drag cancelled by the guided switch;
- 390×844 responsive layout, no horizontal overflow, and 44 px minimum free/undo/reset/range controls;
- zero page errors and zero console errors.

Evidence files:

- `task-13-free-drag-desktop.png`
- `task-13-locked-dependency.png`
- `task-13-mobile-free-controls.png`

The existing Task 11 and Task 12 real-Chrome suites were rerun after the inspector range compatibility work and both passed unchanged.

## Verification commands

- `scripts/pnpm.ps1 test -- tests/unit/axisDragController.test.ts tests/unit/assemblyState.test.ts`
- `scripts/pnpm.ps1 check`
- `scripts/pnpm.ps1 test:e2e`

The bundled runtime's `node` directory must be on `PATH` when invoking the pnpm wrapper in this shell; equivalent direct bundled-Node commands were used during iterative RED/GREEN runs.

## Concerns

- Vite continues to report the pre-existing advisory that the main minified chunk exceeds 500 kB. This does not fail the build and is unrelated to Task 13 behavior.
- No functional, lifecycle, accessibility, transform, or browser concerns remain for Task 13.
