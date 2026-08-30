# Task 16 Report: End-to-End QA and Offline Release

## Outcome

Task 16 completes the Nikon Z50II interactive explorer with a reproducible one-command build, installed Chrome/Edge acceptance coverage, a Python-only offline launcher, and a validated release archive.

Final delivery:

- `release/Z50II-Explorer.zip`: **55,682,412 bytes**
- SHA-256: `7259921fbfa2a7e96c169f60c013c0b9cddea198373cbf3e96ef1871cea5ff40`
- archive: 65 entries and exactly the seven delivery classes `acceptance.md`, `dist`, `README.md`, `renders`, `start-viewer.ps1`, `textures`, `z50ii_master.blend`
- packaged manifest: schema 1, 8 modules, 100 parts, 100 unique `partId` values
- packaged models: 8 high-detail and 8 low-detail GLBs

## Test-first evidence

### Release workflow RED -> GREEN

The behavioral contract test initially failed because the required release scripts did not exist. It then exercised a complete temporary fixture and proved exact staging/archive classes, 8+8 GLBs, rejection of a missing low-detail GLB, exact nine-stage build order, local Node/PATH provisioning, and fail-fast behavior.

Packaging the real production manifest in Windows PowerShell 5.1 exposed another RED: `Get-Content -Raw` decoded UTF-8 without BOM as the local ANSI code page and `ConvertFrom-Json` failed on Chinese fields. The fixture was strengthened with Chinese names written as UTF-8 without BOM and reproduced the same failure. `package-release.ps1` now reads the manifest with `System.IO.File.ReadAllText(..., Encoding.UTF8)`.

Fresh GREEN command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/tests/assert-release-workflow.ps1
```

Result: **exit 0**, `Release workflow behavioral tests passed.` The controlled incomplete-package and render-failure branches both returned nonzero as required.

### Browser workflow RED -> GREEN

The final normal workflow first reached the intended visual assertion and failed because the required assembled baseline was absent. The actual canvas was inspected at original 880x684 resolution before accepting `tests/e2e/__screenshots__/z50ii-assembled-studio.png`; no blind snapshot update was used.

The final browser tests cover, in both installed desktop browsers:

- 8 modules and exactly 100 selectable parts;
- reference-grade/non-OEM-CAD disclaimer;
- dependency lock with a constrained no-move assertion;
- selection and exact selected-part transform basis;
- free-axis movement, undo, and reset;
- guided progress 0 -> 1 -> 0 with exact reassembly;
- hide, ghost, isolate, visibility reset, X cutaway, and studio/inspection lighting;
- an intentionally aborted module-08 request, retained 7/8 state, one retry, recovery to 8/8, and 100 parts;
- zero unexpected page or console errors in the normal and recovery flows.

The original exploded browser capture was readable but too tightly framed. The test now fits the 3/4 preset after full explosion and waits for the camera tween boundary before capturing; the focused Chrome rerun passed unchanged application code and the corrected 1440x900 image contains the full assembly.

## One-command build

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-all.ps1
```

Result: **exit 0**. It ran the mandated order and stopped on nonzero errors:

1. Blender master build
2. scene validation
3. HDR environment render
4. assembled/exploded reference renders
5. GLB/manifest export
6. Blender export assertions
7. unit tests
8. production web build
9. installed Chrome+Edge Playwright tests

The build script explicitly prepends the bundled Node 24.19.0 runtime and repository `node_modules/.bin`; it does not depend on global Node tooling.

One-command evidence:

- Blender master and scene validation: pass
- HDR: 1024x512, 128 samples
- reference renders: 1600x1200, Cycles 128 samples; assembled 117.82 s, exploded 120.22 s
- reassembly: maximum matrix delta `1.192e-07`, exact restore assertion pass
- exports: `16 GLBs, 8 modules, 100 aligned parts, 10 decals, shared textures, and enforced high/low policy`
- unit: 20 files / 122 tests
- E2E: 28/28, about 3.7 minutes

The requested pre-build artifact cleanup was evaluated but not forced after the environment rejected the recursive deletion safety boundary. The deterministic build completed successfully over the relevant generated outputs without widening deletion scope.

## Independent final verification

All commands were rerun independently after the one-command build:

| Command | Result |
|---|---|
| `scripts/run-blender.ps1 --background artifacts/z50ii_master.blend --python blender/validate_scene.py` | exit 0; `Z50II scene validation passed` |
| `scripts/run-blender.ps1 --background --factory-startup --python blender/tests/assert_exports.py` | exit 0; 16 GLBs, 8 modules, 100 aligned parts, 10 decals, shared textures, enforced high/low policy |
| `scripts/pnpm.ps1 test` | exit 0; 20 files / 122 tests |
| `scripts/pnpm.ps1 build` | exit 0; 48 modules transformed |
| `scripts/pnpm.ps1 test:e2e` | exit 0; 28/28 in about 3.6 minutes |
| `scripts/tests/assert-release-workflow.ps1` | exit 0; all behavioral contracts passed |
| `git diff --check` | exit 0; no whitespace errors (Windows line-ending advisories only) |

The only production-build advisory is Vite's non-blocking warning for a JavaScript chunk larger than 500 kB.

## Runtime and performance evidence

Exact final versions:

| Component | Version |
|---|---|
| Blender | 4.5.12 LTS, build hash `84afd5f785f7`, built 2026-07-21 |
| Chrome | 152.0.7977.64 |
| Edge | 151.0.4129.107 |
| Node.js | 24.19.0 |
| pnpm | 11.19.0 |
| PowerShell | 7.6.4; release script also verified under Windows PowerShell 5.1 |
| Python | 3.13.5 detected; launcher minimum 3.8 |
| Three.js | 0.185.1 |
| Playwright | 1.62.1 |
| TypeScript | 7.0.2 |
| Vite | 8.2.2 |
| Vitest | 4.1.10 |

`artifacts/validation/performance.json` records Intel Arc / D3D11 runs at 1920x1080 and high quality. Both browsers render 223,099 triangles and decode 314,572,800 texture bytes. Chrome measured 1,460.642 ms initial preload, 1,204.863 ms all modules, 40.000 orbit FPS, and 29.851 minimum exploded FPS. Edge measured 1,087.366 ms initial preload, 1,139.909 ms all modules, 59.880 orbit FPS, and 30.030 minimum exploded FPS.

## Offline package and launcher verification

`scripts/package-release.ps1` independently expanded and validated the archive after compression. A second ZIP inspection opened the archive directly and confirmed:

- 65 entries;
- seven exact top-level delivery classes;
- schema version 1;
- 8 modules;
- 100 parts and 100 unique IDs;
- 8 high and 8 low GLBs;
- archive size and SHA-256 exactly matching the outcome above.

The packaged launcher was started hidden with `-NoOpen`. It located `C:\Users\WangYan\miniconda3\python.exe`, served packaged `dist/` on `127.0.0.1:4173`, and returned HTTP 200 with the Nikon Z50II title. The listener process was `python`; Node was not required. The exact launcher and listener processes were stopped after the probe.

## Original-resolution visual review

- `artifacts/renders/assembled-studio.png` (1600x1200): recognizable Z50II proportions, readable mount/sensor/chassis layers, controlled metal highlights, distinct rubber/plastic/glass/PCB materials, and natural contact shadows.
- `artifacts/renders/exploded-studio.png` (1600x1200): shell, chassis, mount, electronics, display/EVF, and interface layers remain separated and traceable without losing assembly context.
- `tests/e2e/__screenshots__/z50ii-assembled-studio.png` (880x684): studio canvas retains the body silhouette and internal structure on black; bright mount edges remain bounded.
- `task-16-browser-assembled.png` (1440x900): complete interactive layout, 100-part tree, selected fastener inspector, and assembled body are readable.
- `task-16-browser-exploded.png` (1440x900): all exploded components remain inside the fitted 3/4 view, with internal PCB/flex/chassis layers clearly visible.
- `task-16-browser-recovered.png` (1440x900): assembled model restored after module retry, 8/8 modules visible, and the recovered module shows retry count 1.

## Deliverable hashes and limitations

`artifacts/validation/acceptance.md` records all 14 design Section 12 criteria as PASS, exact evidence paths, tool/browser versions, performance values, and hashes/sizes for the master, manifest, renders, HDR, performance JSON, visual baseline, `dist`, textures, and render collections.

This is a reference-grade reconstruction based on public information, **not Nikon OEM CAD**, manufacturing data, repair instructions, or a safety reference. The lens remains explicitly deferred; only the camera-body Z mount is delivered. High-quality decoded textures use about 300 MiB, so constrained GPUs should use Auto or Low quality. Offline viewing requires Python 3.8 or newer; rebuilding requires the repository Blender/runtime/dependencies.

## Files

Created:

- `tests/e2e/viewer.spec.ts`
- `tests/e2e/__screenshots__/z50ii-assembled-studio.png`
- `scripts/build-all.ps1`
- `scripts/start-viewer.ps1`
- `scripts/package-release.ps1`
- `scripts/tests/assert-release-workflow.ps1`
- `README.md`
- `artifacts/validation/acceptance.md`
- `release/Z50II-Explorer/`
- `release/Z50II-Explorer.zip`
- final assembled/exploded/recovery browser evidence images
- this report

Modified:

- `playwright.config.ts`
- regenerated deterministic master, Blender renders, performance evidence, and high/low GLB deliverables

The implementation plan and progress file were not modified.
