# Task 11 Report: Assembly Tree, Picking, and Part Inspector

## Outcome

Implemented the first complete user-facing selection and inspection flow on top of the existing modular renderer and loader. The app now renders all eight manifest modules and all 100 parts in a searchable bilingual tree, safely loads initially unloaded modules on demand, synchronizes tree and canvas selection through the shared cyan `OutlinePass`, and presents a bilingual inspector with reversible view commands.

## RED / GREEN

### RED

Added focused unit suites before production files:

- `tests/unit/selectionController.test.ts`
- `tests/unit/selectionUi.test.ts`

The first focused run failed because `src/viewer/selectionController.ts`, `src/ui/assemblyTree.ts`, and `src/ui/inspector.ts` did not exist. This was the expected feature-missing failure. One fixture assertion initially used the compact two-part validation fixture; it was corrected to use the production 100-part manifest before judging the search behavior.

### GREEN

Focused tests pass for:

- nearest visible mesh and nearest `partId` ancestor resolution;
- hidden-intersection rejection;
- empty-pick selection clearing;
- reuse of the existing `OutlinePass.selectedObjects` array;
- selected mesh material identity and opacity preservation;
- pointer-listener cleanup and idempotent disposal;
- 100-row search by part ID, Chinese name, and English name;
- bilingual inspector data, dependency names, and current `AssemblyState` percentage.

Final full check: **7 test files, 37 tests passed**, followed by TypeScript checking and production Vite build.

## Implemented Behavior

### Selection controller

- Raycasts only against the loaded `assemblyRoot` and accepts visible `Mesh` hits.
- Walks upward to the nearest tagged `partId`, including nested part roots.
- Writes selection to the one shared cyan `OutlinePass` without replacing or mutating mesh materials.
- Treats pointer movement above five pixels as orbit interaction, not a pick.
- Clears only selection on an empty click.
- Focuses robustly from a world-space bounding sphere and updates the OrbitControls target.
- Removes its two owned pointer listeners and clears outline state on disposal.

### Assembly tree and loading

- Renders eight module groups and 100 actionable part buttons.
- Uses Chinese names first and English names second.
- Searches case-insensitively across `partId`, `nameZh`, and `nameEn`.
- Publishes idle/loading/ready/failed module state and error text.
- Uses the required `data-testid="load-all-modules"` and `data-testid="part-<partId>"` hooks.
- Loads an unloaded part's module before selection and focus.
- Routes preload, selection load, and load-all through a single per-module mount promise. This prevents duplicate roots and preserves the loader/viewer ownership boundary.
- Cancels stale async selection requests and safely disposes late decoded roots after app disposal.
- Shows live loaded-module count and disables load-all at 8 / 8.

### Inspector and view commands

- Shows part ID, Chinese and English names/descriptions, reconstruction badge, disassembly step, bilingual dependency names, and current explode percentage from `AssemblyState`.
- Provides required test IDs: `part-name-zh`, `dependency-warning`, and `part-progress`.
- Provides focus, hide, isolate, transparency, and reset-selection controls with Chinese accessible labels.
- Hide/isolate/transparency are toggles and reapply consistently when later modules load.
- View commands do not mutate assembly progress. Transparency snapshots are restored on toggle and app disposal.
- Reset selection leaves assembly and view progress unchanged.

### Two-way UI and accessibility

- Tree selection loads, selects, outlines, focuses, expands its module, and populates the inspector.
- Canvas picking selects the matching tree row, expands its module, and populates the inspector.
- `/` focuses and selects the search field when focus is outside an editor.
- `Escape` clears selection when focus is outside an editor; neither shortcut hijacks text input.
- Actionable rows and inspector controls are native buttons with visible focus rings and Chinese `aria-label` values.
- Canvas/view and timeline regions retain Chinese accessible labels.
- Desktop, tablet, and mobile grid layouts remain responsive; the mobile layout has no horizontal overflow.

## Browser Evidence (real `dist` served at 127.0.0.1:4173)

- Initial preload: modules 01 and 02 reached **已加载**.
- Tree selection `Z50II-01-004`: inspector showed **卡口支撑板**, `0%`, and three bilingual dependencies.
- Search `传感器`: six visible matches across ID/name fields.
- Initially unloaded selection `Z50II-03-009`: module 03 changed to **已加载** and inspector showed **固定式DX传感器封装**, `0%`.
- Load all: progress reached **8 / 8** and all eight module statuses read **已加载**.
- Inspector toggles: hide `true → false`, isolate `true → false`, transparency `true → false`; part progress remained `0%` before and after.
- Keyboard: `/` focused the input with `aria-label="搜索相机部件"`; Escape clears selection even while search owns focus, while `/` still does not hijack text editing.
- Physical canvas click after clearing selection picked **快门前帘** and selected tree row `Z50II-03-006`.
- Mobile viewport: 390 × 844; canvas 375 × 489.5 CSS pixels; no horizontal document overflow; unloaded sensor selection remained functional.
- Browser console: **0 errors**.

Superseded screenshots from the original implementation round:

- `task-11-desktop.png` (1440 × 900 desktop inspection state)
- `task-11-mobile.png` (390 × 844 mobile top/tree state)

## Self-review

- Verified every loaded root has exactly one owner: unmounted late roots are disposed by the coordinator/loader, while mounted roots remain viewer-owned.
- Verified selection does not mutate materials; only the explicit transparency command changes render material state, using snapshots for restoration.
- Verified selection epochs prevent a slow unloaded-tree request from overwriting a newer canvas or tree selection.
- Verified controller/UI/global listeners are removed by their owning disposer.
- Verified visibility state is applied to exact-part meshes, avoiding a hidden parent group unintentionally suppressing an isolated nested part.
- Verified all task acceptance test IDs and 100 production manifest rows are present in the served bundle.

## Concerns / follow-up

- The existing renderer emits Three.js deprecation warnings for `RGBELoader` and `PCFSoftShadowMap`, plus a GPU shader precision warning. These predate Task 11 and no console errors occurred.
- Vite reports the existing main Three.js bundle above 500 kB. Code splitting is outside Task 11 scope.
- Task 14 is expected to expand persistence and richer semantics for hide/isolate/transparency; Task 11 deliberately keeps these commands local, reversible, and assembly-progress-neutral.

## Fix Round 1 (reviewed base `8608731`)

### Review findings resolved

- Moved hide, isolate, and transparency ownership into `PartDisplayController`. Transparency now assigns per-mesh material clones, so a shared GLTF material cannot leak opacity/depth-write changes to sibling parts. Toggle-off and disposal restore the exact original assignment and dispose each owned clone once; shared textures remain referenced and are never disposed by this controller.
- Preserved hidden snapshots while isolation is active, restored them when isolation ends or selection moves, and reapplied the active snapshot when later modules mount. Inspector pressed states follow the reconciled display state.
- Kept a canvas-selected row visible when an unrelated search filter is active.
- Made Escape clear selection even when the search input owns focus; `/` remains inactive in editing targets.
- Hardened pointer picking around `pointerId`, primary-pointer ownership, maximum travel across the whole gesture, pointer capture/release, `pointercancel`, `lostpointercapture`, multi-pointer interference, and idempotent listener cleanup. Cancelled or dragged gestures never pick.
- Added Chinese accessible names to both module `details` and its actionable `summary`, including live load/error state.
- Raised dense instrumentation and inspector text to a verified minimum of 10 px while retaining the compact layout.
- Added sensor-role calibration for both physical and standard GLTF material fallbacks. The assembled white plane was traced to the nested cover-glass layer; final desktop evidence isolates the exact sensor package, which is readable as a dark cyan plate with its gold edge connector rather than an overexposed featureless face.

### Regression and lifecycle evidence

- Focused command: five suites, **16 / 16 tests passed**.
- Full command: ten suites, **47 / 47 tests passed**, followed by `tsc --noEmit` and the production Vite build.
- Transparency regression checks a material shared by two meshes, exact assignment restoration, one-time clone disposal, shared-texture identity, and zero texture disposal. Active cloned assignments are also restored exactly once during idempotent controller disposal.
- Isolation regression mutates the live part index after isolation starts, then verifies the newly mounted part is hidden and all parts restore correctly when isolation ends.
- Selection-controller disposal removes all five owned pointer listeners and releases any active capture. No new document, canvas, display-controller, material, texture, or module-root lifecycle leak was found.

### Real-browser smoke and visual QA

The final smoke ran against the built `dist` with the system Chrome executable and an externally managed Vite preview:

- Playwright: **1 / 1 passed in 9.2 s**, exit code 0.
- Covered active-search canvas selection, Escape from focused search, looped drag rejection, hide/isolate/selection reconciliation, transparency restoration, isolation surviving load-all, all eight module states, minimum font sizing, mobile overflow, inspector actions, timeline accessible naming, and zero page/console errors.
- `task-11-fix1-desktop.png` (1440 × 900): all modules loaded, exact sensor package isolated and readable, inspector actions visible, timeline visible.
- `task-11-fix1-mobile.png` (390 × 844): mobile inspector text and all five actions readable with no horizontal overflow.
- `task-11-fix1-mobile-timeline.png` (390 × 844): the same inspector/actions plus the labelled sticky timeline in the mobile viewport.

These Fix Round 1 images replace the stale `task-11-desktop.png` and `task-11-mobile.png` evidence for review.

### Environment note

The first repository wrapper invocation failed before tests because bundled `pnpm.cmd` could not resolve `node`; prepending the bundled Node directory resolved it. On this managed Windows host, Playwright's owned `webServer` mode reports the test `ok` but hangs while tearing down the Vite child process. Playwright documents that graceful SIGINT/SIGTERM shutdown is ignored on Windows. Running the same CLI test against a separately started preview exits normally with **1 passed**; the preview was then stopped and the temporary external-server config removed. The existing Vite bundle-size warning remains unchanged.

## Fix Round 2 (reviewed commit `f62e768`)

### Multi-pointer gesture invalidation

- Reproduced the reviewer sequence before implementation: pointer 1 down, pointer 2 down/move/up, pointer 1 up called the intersection/pick path once.
- Added a direct regression for that exact sequence plus a clean pointer 3 down/up recovery click. The RED assertion reported one unexpected intersection; the GREEN assertion reports zero intersections for the multi-pointer gesture and exactly one for the later clean click.
- `SelectionController` now tracks every pressed and captured pointer ID for the whole gesture. Any additional or non-primary pointer invalidates the click candidate immediately.
- Secondary pointers are captured as direct canvas-owned pointers so their up/cancel transitions remain observable. `pointerup`, `pointercancel`, and unexpected `lostpointercapture` each clear only their exact pointer; click eligibility resets only after all tracked pointers are gone.
- Disposal releases every still-owned capture before clearing gesture state. The existing drag-distance and idempotent listener-disposal behavior remains intact.

### Portable, terminating E2E entry point

- Removed the absolute Windows Chrome executable and Playwright-owned `webServer` from `playwright.config.ts`.
- Browser launch now uses Playwright's portable installed-Chrome channel resolution. A nonstandard installation can be selected with the documented `PLAYWRIGHT_EXECUTABLE_PATH` environment variable.
- `pnpm test:e2e` now runs `scripts/run-e2e.mjs`. The harness validates exclusive ownership of `127.0.0.1:4175`, starts Vite as a direct Node child without a shell, waits for an HTTP-ready response, runs the Playwright CLI without a configured web server, and stops the exact child PID in `finally` and signal paths. A bounded force-kill fallback fails the command if the owned process cannot be stopped.
- The committed command ran twice consecutively with exit code 0: **1 / 1 passed** in 9.7 s with preview PID 25384 stopped, then **1 / 1 passed** in 9.3 s with preview PID 46556 stopped. The second run's exclusive bind proves the first left no listener; a final independent bind printed `PORT_4175_FREE`, and neither PID remained.

### Verification

- Focused pointer suite: **7 / 7 passed**.
- Full check: ten suites, **48 / 48 passed**, followed by `tsc --noEmit` and the production Vite build.
- Existing Vite main-chunk size warning remains the only build concern and predates this fix round.

## Fix Round 3 (reviewed commit `d0b364c`)

### Non-left secondary-pointer invalidation

- Added the exact primary-left plus secondary-right/barrel regression for both `pointerup` and `pointercancel` endings. Before implementation, each variant reached the intersection/pick path once.
- Reordered `pointerdown` handling so an already-active click gesture records, captures, and invalidates on any additional pointer before applying the primary/left candidate filter. The additional pointer's button value no longer lets it bypass gesture invalidation.
- A click candidate can still begin only from a single primary left-button pointer. A standalone right-click remains outside selection tracking, is not captured, is not picked, and is not `preventDefault`-consumed, preserving OrbitControls right-button behavior.
- Both invalidated variants recover after all pointers end: the next clean primary-left click picks exactly once.

### Verification

- Focused pointer suite: **9 / 9 passed**.
- Full check: ten suites, **50 / 50 passed**, followed by `tsc --noEmit` and the production Vite build.
- The pre-existing Vite main-chunk size warning remains unchanged.
