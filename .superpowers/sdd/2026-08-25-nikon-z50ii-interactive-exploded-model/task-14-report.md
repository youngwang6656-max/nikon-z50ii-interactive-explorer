# Task 14 Report — Visibility, Cutaway, Lighting, and Fitted Views

## Outcome

Implemented reversible part visibility and ghosting, a movable signed X/Y/Z cutaway plane, studio/inspection lighting presets, and six camera views fitted to the current visible assembly bounds. The existing `PartDisplayController` now delegates to one `VisibilityController`, so visibility, ghost, clipping, and inspection reflection effects share one material owner and cannot overwrite each other's source references.

Implementation commit: `885d66c` (`feat: add Z50II inspection and lighting tools`).

## RED / GREEN evidence

1. Baseline: `scripts/pnpm.ps1 test` passed 15 files / 95 tests before Task 14 changes.
2. Added `visibilityController.test.ts`, `cutawayController.test.ts`, and `lightingController.test.ts` before their production modules. The RED run failed with three expected missing-module errors.
3. Extended camera and display tests before implementation. They failed because OrbitControls retained the old fixed target and ghost opacity was still `0.24` instead of `0.18`.
4. The first GREEN run passed the five focused controller/display/camera files with 13 tests. The integrated create-app run passed six files / 17 tests and the production TypeScript/build gate.
5. Screenshot QA exposed an overly dominant cutaway helper. A new focused assertion failed because the helper material was opaque/depth-writing; the minimal fix made it translucent, non-depth-writing, and visually bounded. The focused cutaway/lighting suite then passed 2/2.
6. Full E2E initially caught one compatibility regression: Task 11 timed out while locating the established accessible name `切换当前部件透明度`. The root cause was the Task 14 visual relabel changing that accessible contract. Restoring the prior aria-label while retaining the visible “幽灵” label and `ghost-selected` hook made the rebuilt full suite pass 4/4.

## Design and lifecycle decisions

- `VisibilityController` snapshots exact visibility flags and original material assignments. Hide/show and isolate/clear restore prior flags instead of assuming `true`.
- Ghost, cutaway, and inspection effects are recomposed from the original assignment into controller-owned clones. Shared GLTF materials are never mutated; unghost/disable/studio/dispose restores the exact original reference and disposes each owned clone. Ghost opacity is exactly `0.18`, with transparency enabled and depth writes disabled while metalness and roughness remain inherited from the clone.
- `PartDisplayController` remains the part-ID-facing owner used by selection, outline, axis-handle, guided, and free-disassembly flows; it delegates material/visibility work instead of competing with a second controller.
- `CutawayController` owns one `Plane`, one visible translucent `PlaneHelper`, renderer local-clipping state, axis and signed offset. Disable/dispose removes clipping from every affected clone, restores renderer state, removes the helper, and disposes owned helper resources.
- `LightingController` hides and later restores the viewer's prior lights, owns a key/fill/rim plus ambient rig, retains the asynchronously supplied HDR environment, enables soft key shadows, and applies exposure `1.0` for studio and `1.15` for inspection. Inspection raises ambient fill while lowering environment/reflection intensity and floor-shadow opacity; studio restores normal material references.
- `CameraPresetTween` optionally derives a sphere from visible geometry, accounts for vertical and horizontal field of view/aspect ratio, updates the OrbitControls target to the visible-bounds center, and fits front, rear, left, right, top, and three-quarter views. Existing fixed-offset behavior remains available when no bounds source is supplied.
- The inspector exposes `hide-selected`, `isolate-selected`, `ghost-selected`, `visibility-reset`, `cutaway-toggle`, `cutaway-axis`, signed `cutaway-offset`, `lighting-preset`, and six camera-preset hooks. Mobile targets retain the existing 44 px minimum.

## Browser evidence and visual inspection

`tests/e2e/task14-inspection-tools.spec.ts` ran against the rebuilt production bundle in real Chrome. It exercised all six camera buttons, ghost/isolate/reset, cutaway axis/offset/toggle, inspection/studio switching, and verified zero page/console errors.

- `task-14-camera-front.png` — front preset centered and fully fitted without viewport clipping.
- `task-14-ghost-isolate.png` — selected front shell isolated and rendered with the `0.18` ghost treatment while its cyan selection outline remains intact.
- `task-14-cutaway.png` — three-quarter view with a visible, translucent, bounded X clipping-plane helper and the clipped shell exposing the interior.
- `task-14-inspection-lighting.png` — cutaway disabled; inspection lighting independently shows darker reflections, reduced shadow weight, and readable internal edges.

All four 1440 × 960 screenshots were inspected at original resolution. Full E2E regenerated Task 11–13 evidence as a runner side effect; those eight unrelated files were restored exactly before commit.

## Final verification

- `scripts/pnpm.ps1 check` — 18 files / 101 tests passed; `tsc --noEmit` passed; Vite production build passed.
- `scripts/pnpm.ps1 test:e2e` — 4/4 real-Chrome suites passed against the final rebuilt bundle.
- `git diff --cached --check` — clean before the implementation commit.

The bundled Node directory was prepended to `PATH` for pnpm child scripts in this shell. Vite continues to emit the pre-existing advisory that the main Three.js chunk exceeds 500 kB; it does not fail the build. The in-app live-browser runtime was blocked by a Windows sandbox ACL setup error, so interactive correctness used the project's real-Chrome E2E runner and visual QA used the generated original-resolution screenshots.

## Independent review Round 1

The Round 1 package identified four state/lifecycle defects and two camera-test gaps. Each defect was verified against the current implementation before changes.

### RED evidence

- Added a real `SelectionController` + `VisibilityController` regression for hide → unchanged select → visibility reset. The selected part ID remained stable while the outline array stayed empty; the desired reset helper was absent (`resetVisibilityAndRestoreSelection is not a function`).
- Added combined ghost + inspection + cutaway coverage with a source material already carrying one clipping plane. The first owned ghost clone returned `clippingPlanes: null` instead of preserving the source plane.
- Changed the lighting fixture's floor shadow opacity from the default-like `0.32` to `0.47`. Studio construction returned `0.32`, proving that preset code overwrote the captured source value.
- Attached disposal listeners to all three owned directional lights and installed controlled key-shadow `map`/`mapPass` targets. Double controller disposal produced zero light and render-target disposal calls.
- The combined RED run was 3 files with 4 failed / 5 passed tests, with each failure matching one review finding.

### Fixes and focused GREEN evidence

- Visibility reset now restores visibility, explicitly reselects the unchanged selected part so `SelectionController.select()` recomputes effective visibility and the outline, and only then refreshes inspector/action state. `createApp.test.ts`: 5/5 passed.
- Material recomposition now copies every pre-existing clipping plane into owned ghost/inspection clones and appends the Task 14 plane without mutating the source array. Disabling cutaway while ghost/inspection remains active recomposes the clone with only the original planes; removing all effects restores the exact original material and clipping-array reference. Visibility/display/cutaway: 3 files / 9 tests passed.
- Studio uses each captured `ShadowMaterial.opacity`; inspection applies `min(originalOpacity, 0.16)`, so it never makes an already softer source shadow darker. Lighting teardown traverses the owned rig and calls `dispose()` on every light; Three.js `DirectionalLight.dispose()` releases its shadow `map` and `mapPass`. Lighting: 2/2 passed, including idempotent double disposal.
- Camera tests project all eight visible box corners through front, rear, left, right, top, and three-quarter cameras at aspect ratios `0.4`, `1`, and `2.4`; every corner remains inside NDC and every camera direction matches its preset. Camera: 7/7 passed.
- Complete focused review set: 7 files / 32 tests passed.

### Rebuilt browser and final evidence

- Task 14 E2E now clicks every one of the six camera buttons and observes the real application root transition `data-camera-tween-active=true → false` for each preset. The focused rebuilt Chrome run passed 1/1.
- `scripts/pnpm.ps1 check`: 18 files / 107 tests passed; TypeScript and the production Vite build passed.
- Rebuilt `scripts/pnpm.ps1 test:e2e`: 4/4 Chrome suites passed. The runner-regenerated Task 11–13 screenshots were restored exactly afterward.
- The four updated Task 14 screenshots were inspected again at 1440 × 960. Front fit remains centered, ghost/isolate retains the cyan selected outline, the cutaway helper remains bounded and translucent, and inspection lighting remains independently readable.
