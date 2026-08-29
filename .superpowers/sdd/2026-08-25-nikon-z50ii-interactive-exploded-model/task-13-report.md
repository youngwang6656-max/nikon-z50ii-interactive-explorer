# Task 13 Report — Constrained Free Disassembly and Undo

## Outcome

Implemented a free disassembly mode alongside the guided teaching timeline. A selected visible part can be dragged only along its manifest world/glTF axis, edited with an accessible numeric range, undone as one move, cancelled exactly, or reset with the complete assembly. Missing dependencies block outward movement at zero while still allowing an already-displaced part to return toward assembly. Guided mode remains authoritative and cancels any active free drag before crossing the mode boundary.

## RED / GREEN evidence

1. Added `tests/unit/axisDragController.test.ts` before the controller module. The first run failed with `Cannot find module '../../src/viewer/axisDragController'`.
2. Implemented the projection helpers and controller. Focused tests then exposed two deliberately strict test assumptions (floating-point parent inversion and a coplanar Three.js ray); the tests were corrected to assert the intended behavior independently.
3. Added pointer-capture, multi-pointer, handle visibility/orientation/scaling, and disposal cases. They failed because canvas ownership and the handle did not yet exist, then passed after the minimal lifecycle/handle implementation.
4. Added Ctrl/Command+Z edit-safety and inspector dependency/progress model tests. They failed on missing `handleUndoShortcut`, `progressValue`, and `missingDependencies`, then passed after implementation.
5. Added a create-app integration test for free move history, undo, reset, and free→guided cancellation. It failed because the app did not own an axis controller, then passed after wiring the controller and free-state publisher.
6. A lifecycle audit found that public `cancel()` could restore state/orbit while retaining a controller-owned pointer capture. A regression assertion failed (`releasePointerCapture(13)` missing); the root cause was the release path living only in pointer-event handlers. Moving capture release into `end()`/`cancel()` made the focused controller and app suites pass.
7. Fix round 1 added regressions for direction-aware reverse dragging, exact camera-axis degeneracy, parented-camera world up, real `Raycaster` handle exclusion, silent drag abort, one-publication competing producers, range coalescing/cancel, guided-mode disabling, and test-ID ownership. The interrupted implementation was recovered against reviewed commit `4b1ba90` and all focused tests passed.
8. A final browser audit added two more RED cases. A no-op range handoff after an active canvas drag initially left the aborted 67% preview visible instead of restoring 0%; a dependency-blocked range request initially left its UI at the requested value instead of the accepted value. The range transaction now records whether an axis snapshot must be restored, and the inspector rereads the synchronously published authoritative state before updating its value/label. Both cases passed in the rebuilt real-Chrome suite.

Focused result: 22/22 axis/assembly tests passed. Full unit result: 95/95 tests passed; the final verification commands are recorded below.

## Drag math and transform contract

- Manifest `explodeAxis` is treated as a normalized world/glTF direction and `explodeDistance` as metres.
- For axis **a** and camera view direction **v**, the drag-plane normal is `normalize(v - a(a·v))`. An exact camera-on-axis view is rejected before pointer capture or OrbitControls mutation because screen-space projection is underdetermined. For valid views, camera up is derived from the camera's world quaternion; the pure normal helper retains projected-up and least-aligned-world-basis fallbacks for finite, unit, axis-perpendicular results.
- The plane passes through the selected part's current world position. Pointer rays are intersected with it; parallel/off-plane rays return no intersection and leave state/orbit unchanged.
- Progress is `clamp01(startProgress + ((hit - startHit) · a) / explodeDistance)`.
- Preview updates reuse the pointer-down progress/history snapshot. They change only the selected progress value and never append history. `end()` appends exactly one `{partId, from, to}` record; a no-op appends none; `cancel()` restores the complete pointer-down state.
- Existing `GuidedPartTransforms` remains the sole geometry transform owner. It applies the resulting world-space translation through transformed/nested parents while preserving exact captured local basis matrices. The regression test covers translated, rotated, non-uniformly scaled nesting and verifies world-axis travel plus exact local rotation/scale basis restoration.

## Lifecycle and interaction behavior

- Dependency permission is checked before object lookup, ray-plane work, pointer capture, state publication, geometry mutation, or OrbitControls mutation. A dependency-locked part at zero returns the exact ordered `missingPartIds`; a locked part above zero may begin a reverse drag but cannot exceed its pointer-down progress unless its prerequisites become complete.
- OrbitControls is disabled only after a valid ray-plane start and is restored to its prior value on end, cancel, pointer cancel, lost capture, Escape, disposal, and free→guided mode switch.
- Only primary left-button gestures can start; secondary/additional pointers cannot update or end the active drag.
- Pointer capture is owned only for a valid active gesture and is released by the controller's terminal methods.
- The cyan bidirectional handle is a separate scene object, not part of the pickable assembly root. Its line and arrow meshes have disabled raycasts, world-axis orientation, camera-distance/viewport responsive scale, and owned geometry/material disposal. It is hidden in guided mode and for unselected, hidden, or dependency-locked-at-zero parts; it remains available to reverse a locked part already above zero.
- Late module mounting reapplies exact transforms and refreshes the handle. App disposal marks the app disposed before asynchronous work can republish, then cancels/releases the controller before viewer teardown.
- `abort()` is intentionally silent: it releases capture, restores OrbitControls, and returns the pointer-down snapshot without publishing. Range, global explode, undo, reset, and guided-mode transitions consume that snapshot and perform one authoritative final publication, so later pointer events are inert and cannot overwrite the competing command.

## Inspector, commands, and modes

- The actual labelled `input[type="range"]` owns `data-testid="part-progress"`, numeric 0–1000 values, and `aria-valuetext`; the adjacent `data-testid="part-progress-live"` output is `aria-live`. The input is disabled outside free mode.
- Pointer, keyboard, change, blur, cancel, mode-switch, and disposal paths share one range gesture transaction. Preview events never append history, a completed continuous gesture appends at most one move, Escape restores the exact start snapshot, and blocked requests immediately snap the input and live label back to accepted state.
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
- active free drag handed to the range, including a no-op handoff, without stale pointer publication;
- continuous range previews coalesced into one undo record, exact Escape restoration, blocked-range authoritative snapback, and stale range completion ignored after global explode;
- 390×844 responsive layout, no horizontal overflow, and 44 px minimum free/undo/reset/range controls;
- zero page errors and zero console errors.

Evidence files:

- `task-13-free-drag-desktop.png`
- `task-13-locked-dependency.png`
- `task-13-mobile-free-controls.png`

The existing Task 11 and Task 12 real-Chrome suites were rerun after the inspector range compatibility work and both passed unchanged.

## Verification commands

- `scripts/pnpm.ps1 test -- tests/unit/axisDragController.test.ts tests/unit/assemblyState.test.ts` — 2 files, 22 tests passed.
- `scripts/pnpm.ps1 check` — 15 files, 95 tests passed; TypeScript passed; Vite production build passed.
- `scripts/pnpm.ps1 test:e2e` — 3/3 real-Chrome tests passed against the final rebuilt bundle.

The bundled runtime's `node` directory must be on `PATH` when invoking the pnpm wrapper in this shell; equivalent direct bundled-Node commands were used during iterative RED/GREEN runs.

## Fix round 2 — Atomic guided-to-free transition

- RED: the active-playback regression captured the pending RAF, current assembly progress, selected-part matrix, and root publication count. Guided→free expected one additional publication but received two (`expected 14, received 15`), proving that `cancelGuidedPlayback()` published before the mode handler published again.
- GREEN: guided motion now has one internal non-publishing stop path. It pauses the sequence, cancels the camera tween and scheduled frame, clears frame timing, advances an animation generation, and returns a cloned authoritative guided assembly snapshot. Guided→free clears incompatible history, switches mode/inspector/timeline hooks, and publishes that snapshot once synchronously.
- Every scheduled RAF closure captures its generation. A callback captured before cancellation or a mode transition returns before changing frame ownership, assembly, geometry, root attributes, or publication count. The regression manually invokes both the pre-transition callback and the pre-public-cancel callback to prove they are inert.
- Public `cancelGuidedPlayback()` reuses the non-publishing stop path and then calls `publishSequence()` exactly once, preserving its external contract. Guided global explode also uses the stop path so a queued playback/camera frame cannot republish after the command.
- Final gates: focused `tests/unit/createApp.test.ts` passed 4/4; `scripts/pnpm.ps1 check` passed 95/95 tests, TypeScript, and the production build; the three real-Chrome suites passed. Windows denied the runner's otherwise unused fixed port 4175 with `EACCES`, so the same runner/config were temporarily pointed at 4176 for the browser gate and restored immediately afterward with no tracked diff.

## Concerns

- Vite continues to report the pre-existing advisory that the main minified chunk exceeds 500 kB. This does not fail the build and is unrelated to Task 13 behavior.
- The exact camera-on-axis case deliberately declines to start a drag; the user can orbit slightly or use the inspector range. This is the graceful policy chosen for the otherwise underdetermined screen projection.
- No remaining functional, lifecycle, accessibility, transform, or browser concerns were observed for Task 13.
