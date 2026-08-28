# Task 10 Report: Three.js Renderer and Modular Loader

## Outcome

Implemented the browser renderer/load foundation for the Nikon Z50II modular model on branch `codex/z50ii-interactive-model`, starting from `545412b`. The application now mounts a responsive Chinese-first technical shell, initializes a physically based Three.js renderer, preloads only modules 01 and 02, validates loaded GLBs against the assembly manifest, exposes the shared selection outline and part index needed by Task 11, and tears down owned browser/GPU resources idempotently.

## RED / GREEN

### RED 1: loader contract

Created `tests/unit/moduleLoader.test.ts` before production loader code and ran:

```powershell
scripts/pnpm.ps1 test -- tests/unit/moduleLoader.test.ts
```

Observed the expected failure:

```text
Cannot find module '../../src/viewer/moduleLoader'
Test Files 1 failed
```

The initial contract covered concurrent promise identity, cache reuse, independent `moduleId:quality` keys, state transitions, retained error messages, retry count/quality behavior, expected-part validation, duplicate part rejection, descendant-to-ancestor part resolution, and invalid module/quality input.

### RED 2: duplicate-ready retry protection

Added a regression test proving that `retry()` cannot refetch a ready module and create a second loaded root. It failed as expected with:

```text
AssertionError: expected [Function] to throw an error
```

Added the failed-state guard, then restored GREEN.

### RED 3: loader disposal

Added an idempotent resource-disposal contract for the injected/default fetcher. It failed as expected with:

```text
TypeError: loader.dispose is not a function
```

Added one-shot disposal and post-disposal load rejection, then restored GREEN.

### Final GREEN

Focused verification:

```text
Test Files 1 passed (1)
Tests 10 passed (10)
```

Full repository verification:

```text
Test Files 3 passed (3)
Tests 24 passed (24)
tsc --noEmit: passed
vite build: passed
```

## Architecture

### `ModuleLoader`

- Accepts an injected `ModuleFetcher`, keeping unit tests independent of WebGL and browser networking.
- Defaults to `GLTFLoader` plus `DRACOLoader` and the pinned public decoder directory.
- Uses the requested `new URL('assets/draco/', import.meta.env.BASE_URL).toString()` expression whenever that base is directly URL-parseable, with a `document.baseURI` resolution fallback required by Vite's relative `./` base.
- Resolves model URLs from the public base before calling `GLTFLoader`, preserving standards-compliant GLB-relative external image resolution (`../../textures/...` -> `assets/textures/...`).
- Caches the exact promise by `moduleId:quality`, including fulfilled and rejected results. Concurrent and later same-key calls therefore reuse the same load/root. Only explicit retry of a failed key clears it.
- Tracks `idle | loading | ready | failed`, quality, latest error string, and retry count independently for high/low quality.
- Traverses the complete loaded `Object3D` tree, indexes every non-empty `userData.partId`, rejects duplicate IDs, and rejects a module missing any manifest-expected part.
- Exposes each loaded module's `partIndex` plus `resolvePartId(object)`, which walks to the nearest ancestor part for mesh picking in Task 11.
- Disposes Draco resources idempotently and rejects new loads after disposal.

### `createViewer`

- Creates one `WebGLRenderer` with antialiasing, `SRGBColorSpace`, ACES filmic tone mapping, device pixel ratio capped at 2, and `PCFSoftShadowMap`.
- Creates a perspective camera and damped `OrbitControls` with bounded zoom.
- Owns a `Group` named `Z50II_ASSEMBLY` and exposes the active `partIndex`.
- Routes every frame through one `EffectComposer`: `RenderPass` -> `GTAOPass` -> the single shared cyan `OutlinePass` reserved for Task 11.
- Generates an immediate neutral `RoomEnvironment` PMREM fallback, then replaces it with the PMREM-processed `studio-neutral-1k.hdr` when available.
- Uses a `ResizeObserver` (window fallback) to synchronize renderer, composer, camera, and outline resolution.
- Uses `setAnimationLoop`, stops it on disposal, disconnects resize observation, disposes controls, passes, render targets, environments, materials, textures, geometries, and the renderer, and removes its canvas. Disposal is idempotent.
- Replaces the active root per module without destroying cached alternate-quality roots. All roots ever owned by the viewer are released exactly once at final teardown, so high/low quality can be swapped safely.

### Application shell and startup

- Semantic regions: `nav` assembly tree, `main` 3D viewport, `aside` inspector, and `footer` timeline.
- Chinese names lead; English labels and technical status metadata are secondary.
- Inspector footer displays the exact required notice: `参考级内部结构，非 Nikon 原厂 CAD`.
- No Task 11 search, picking, selection, inspector actions, load-all button, or timeline controls were introduced early.
- Startup parses `assembly-manifest.json`, mounts the shell/viewer, and loads only manifest-preload modules in the explicit allowlist `01_chassis_front` and `02_outer_shell_controls` at high quality.
- Module rows expose loading/ready/failed state without adding premature controls.
- All public runtime URLs resolve from `import.meta.env.BASE_URL` and `document.baseURI`; Vite continues to build with `base: './'`.

## Draco assets

Copied unchanged from the installed pinned `three@0.185.1` package:

```text
public/assets/draco/draco_decoder.js       512,465 bytes
public/assets/draco/draco_decoder.wasm     192,420 bytes
public/assets/draco/draco_wasm_wrapper.js   58,456 bytes
```

The production runtime requested the public WASM path and wrapper successfully.

## Build and relative-URL verification

`dist/index.html` exists and its generated entry references are relative:

```html
<script type="module" crossorigin src="./assets/index-...js"></script>
<link rel="stylesheet" crossorigin href="./assets/index-...css">
```

The built application retains relative public-base resolution (`new URL('./', document.baseURI)`) for manifest, environment, model, texture, and decoder requests.

## Asset/decode browser smoke

Served `dist` with Vite preview and launched the already installed system Chrome through Playwright in headless mode. The smoke waited for modules 01 and 02 to become ready and captured request failures, response status, console errors, and page errors.

Verified 200 responses for:

- `assembly-manifest.json`
- `assets/environment/studio-neutral-1k.hdr`
- high-quality module 01 and module 02 GLBs
- `assets/draco/draco_decoder.wasm`
- `assets/draco/draco_wasm_wrapper.js`
- all external textures requested by the two GLBs, including body normal, decal atlas, grip normal, and generated roughness textures

Observed runtime state:

```text
01_chassis_front: ready
02_outer_shell_controls: ready
03-08: idle
canvas count: 1
failed requests: 0
HTTP >= 400: 0
console errors: 0
page errors: 0
```

The first smoke exposed only the browser's implicit `/favicon.ico` 404. An inline SVG icon removed that request, and the clean result above is from the rerun.

## Responsive and visual QA

- Inspected a 1440x900 production screenshot after both preload modules reached ready.
- The first visual pass showed excessive HDR/key-light clipping. Reduced tone-map exposure, environment intensity, and direct light strength; the final pass preserves black shell/grip separation, metal highlights, and legible internal geometry in the dark technical-instrument layout.
- Checked a 390x844 viewport: document width remained exactly 390 px (no horizontal overflow), canvas measured 390x490, all four semantic regions were present, and browser console/page errors remained empty.

## Self-review

- Confirmed the branch/worktree and requested base before editing.
- Confirmed manifest scope: schema 1, 8 modules, 100 parts, 40 steps, and only modules 01/02 marked preload.
- Confirmed `Z50II_ASSEMBLY`, one shared `OutlinePass`, public `partIndex`, quality-replace behavior, and idempotent disposal.
- Confirmed decoder/model/environment URLs are relative-base safe and external GLB images resolve against the GLB URL.
- Confirmed unknown module/quality inputs fail before invoking the fetcher.
- Confirmed rejected promises remain deduplicated until explicit retry and retry preserves the failed quality.
- Confirmed duplicate part roots and missing expected parts fail the module rather than producing an incomplete index.
- Confirmed exact disclaimer text and absence of premature Task 11 controls.
- Ran `git diff --check`; no whitespace errors were found.

## Concerns

- Vite reports the standard `>500 kB` minified chunk advisory for the Three.js plus postprocessing entry (about 703 kB minified / 179 kB gzip). This is non-blocking for Task 10 and does not affect decode/runtime correctness, but code-splitting can be considered in a later performance task.
- Three 0.185.1's `DRACOLoader` source also contains import-relative decoder URL constants, so Vite emits additional hashed decoder artifacts even though the runtime explicitly uses the pinned `public/assets/draco/` files. The smoke trace confirms the public decoder path is the one requested.

## Fix Round 1: Ownership and Transactional Indexing

### Verified review findings

The review findings reproduced against commit `dfb4dc9`:

- A deferred fetch resolved after `ModuleLoader.dispose()` and returned a ready `LoadedModule`; its geometry, material, and texture emitted zero disposal events.
- `retry()` after disposal changed the failed state to `idle`, cleared its error, and incremented retry count before `load()` threw.
- A module 01 scene tagged with module 02's valid part ID resolved successfully because validation checked only duplicates and missing expected IDs.
- Viewer insertion had no collision gate and mutated root metadata, assembly membership, module ownership, and the shared part index in sequence.
- `createApp` had no dependency seam or preload completion handle, so the in-flight-disposal path could not be exercised without a real DOM/WebGL context.

### Additional RED evidence

The first fix-round loader run failed 2 of 12 tests for the expected reasons:

```text
promise resolved ... instead of rejecting
expected failed/offline/retryCount 0, received idle/null/retryCount 1
```

The identity/registry RED run failed because `ModuleMountRegistry` did not exist and because the cross-module tagged scene resolved instead of rejecting. The create-app lifecycle RED run failed both tests at `document is not defined`, proving that the production-only dependencies were still coupled.

### Implemented ownership model

- Added `disposeObjectTree()`, which walks real Three meshes, discovers geometry/material/texture resources, and uses process-local weak sets to guarantee each owned resource is disposed at most once even if defensive cleanup paths overlap.
- `ModuleLoader` now checks its disposed state when a fetch resolves. A late decoded scene is disposed and the pending promise rejects with its exact `moduleId:quality` key; the catch path does not mutate state after disposal.
- Invalid decoded scenes (duplicates, unexpected IDs, or missing IDs) are also disposed before their rejected promise is cached.
- `retry()` now checks loader liveness before reading or mutating failure state/cache.
- `createApp` exposes `preloadReady`, supports injected manifest/shell/viewer/loader factories for lifecycle tests, and disposes a resolved-but-unattached root defensively if app disposal wins the ownership race.
- If transactional viewer insertion rejects, `createApp` disposes the still-unowned root before surfacing module failure state.

### Transactional module mounting

- Added `ModuleMountRegistry` as the pure ownership/index boundary used by `createViewer`.
- It validates every incoming part ID against the active global index before mutating root metadata, mesh shadow flags, assembly children, module ownership, or part mappings.
- Same-module high/low replacement treats the current module's own mappings as replaceable, detaches the old root, and updates the shared index atomically.
- Cross-module collisions reject before mutation; removing/replacing a module can no longer erase a mapping owned by another module.
- All roots accepted during quality swaps stay owned until final teardown and are then disposed exactly once.

### Fix-round regression coverage

Focused lifecycle suites:

```text
Test Files 3 passed (3)
Tests 17 passed (17)
```

They now cover:

- deferred decode after loader/app disposal with geometry/material/texture disposal counts exactly equal to one;
- no late root attachment after app disposal;
- disposed retry state/call-count immutability;
- strict rejection of another module's tagged part ID;
- two-module part-index collision with no partial root/index/root-metadata mutation;
- reversible same-module quality replacement and one-shot teardown;
- repeated isolated `createApp` construction and disposal.

Full final check:

```text
Test Files 5 passed (5)
Tests 31 passed (31)
tsc --noEmit: passed
vite build: passed
```

### Root and nested-base runtime smoke

Served the same final `dist` through a prefix-mapped static server and opened both `/` and `/offline/z50ii/` with the existing system Chrome in headless mode. Both routes produced:

```text
01_chassis_front: ready
02_outer_shell_controls: ready
03-08: idle
required asset responses: 12 x HTTP 200
failed requests: 0
HTTP >= 400: 0
console/page errors: 0
```

At the nested route, manifest, HDR, both GLBs, Draco WASM/wrapper, and every external texture were requested under `/offline/z50ii/`, verifying the relative Vite base behavior after the lifecycle changes.

### Remaining concerns after fix round 1

No new functional concerns. The two original non-blocking build observations remain: Vite's approximately 704 kB minified / 179 kB gzip main-chunk advisory and Three's additional hashed decoder artifacts alongside the explicitly used public decoder directory.
