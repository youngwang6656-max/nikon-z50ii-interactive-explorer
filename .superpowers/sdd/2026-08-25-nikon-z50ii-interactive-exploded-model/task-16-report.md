# Task 16 Report: Independent Review Fixes and Final Offline Release

## Outcome

All six findings from the first Task 16 independent review, the Round-2 sensor-rendering P2, and the Round-3 Memory B/rear-curtain removal regression were reproduced with focused failing tests, corrected, and verified through a fresh complete pipeline plus independent reruns. The final package remains fully offline and contains exactly the seven required delivery classes.

Final archive from the definitive post-acceptance double run:

- `release/Z50II-Explorer.zip`: **55,762,243 bytes**
- SHA-256: `45dc7aedf375a4a131701e2c94045273a91d985d5e4855f88f2d4804a6328bb2`
- 64 nonempty file entries with normalized paths, fixed `2000-01-01 00:00:00` ZIP timestamps, zeroed external attributes, and deterministic ordering
- exact top-level classes: `acceptance.md`, `dist`, `README.md`, `renders`, `start-viewer.ps1`, `textures`, `z50ii_master.blend`
- packaged manifest: schema 1, 8 unique modules, 100 unique parts
- packaged models: exact manifest URL correspondence to 8 high and 8 low GLBs

## Review findings resolved test-first

1. **Cold/isolated E2E reliability.** Camera helpers now wait for four stable animation frames after the transition boundary and never require a transient tween flag. Recovery waits until all eight module rows are terminal before checking 7/8 and retrying. The former heavy workflow is split into bounded exact-reassembly, interaction/visual, and recovery tests under a justified 120-second suite timeout.
2. **Whole-assembly exactness.** The application publishes the sorted local transform basis for every loaded part. Chrome and Edge capture all 100 entries, validate 16 finite matrix elements per part, execute guided 0→1→0, and require the complete serialized transform state to match exactly.
3. **Deep package rejection.** Packaging now rejects duplicate/empty module IDs, duplicate/empty part IDs, unknown part modules, unsafe or mismatched manifest URLs, missing/empty JS/CSS/textures/HDR/Draco assets, missing named renders, and any high/low set other than exact 8+8 nonempty GLBs. Behavioral tests prove duplicate module, duplicate part, URL mismatch, empty JS, and missing low GLB are all rejected.
4. **Byte-reproducible ZIP.** `Compress-Archive` was replaced with deterministic `ZipArchive` creation using normalized entry paths, fixed metadata, and stable input ordering. Both the fixture and production archive produce identical SHA-256 values across consecutive identical-input runs.
5. **Browser clipping.** The exported mesh/material trace identified `Z50II-03-009_sensor_package.001` and `Z50II-03-010_sensor_cover_glass.001` as `sensor_glass`, while the actual white block was the shutter curtain geometry masking the cover glass. Both curtains are now parked together above the aperture in the assembled inspection pose, and a deterministic spectral cover-glass texture plus restrained physical material preserves blue/green/magenta interference cues. The objective guard counts RGB≥250 pixels against active rendered pixels and independently measures the largest four-neighbor near-white component. The final full run measured Chrome `0.025243287606987925` / `363 px` and Edge `0.025248795583219047` / `363 px`, below the `0.06` / `512 px` limits; both component bounds were `(576,363)–(585,480)`, outside the sensor. The reviewed `2,333 px` sensor block is gone.
6. **Standalone documented commands.** `scripts/pnpm.ps1` independently locates the bundled Node runtime, prepends bundled Node plus repository `node_modules/.bin`, and needs no global `node`, `pnpm`, or `npx`. With PATH reduced to Windows system directories, the documented command reported Node `v24.19.0` and completed the production build.
7. **Removal-motion regression and build contract.** Memory B remains in its original board position and keeps the physically correct board-normal `-Y` service direction, but its declared lift is now 10 mm: enough to clear the 1.25 mm package/PCB interface and stop before the rear-curtain envelope. No collision exception or dependency shortcut was added. `scripts/build-all.ps1` now runs the unchanged deep internal-geometry assertion and the removal-motion assertion immediately after scene validation and before rendering/export; the controlled workflow test proves the exact order and stops at the injected removal failure.

## Focused RED → GREEN evidence

- Fresh-PATH wrapper RED: `'node' is not recognized`; GREEN: `v24.19.0` plus successful build.
- Exact-transform RED: the all-part transform attribute was absent; GREEN: 100 parts × 16 finite elements and exact 0→1→0 equality.
- Material RED: the exported `Z50II DX Sensor` alias retained its original bright material; GREEN: calibrated sensor plus stricter mount/shield roughness, color, and environment response.
- Visual-guard Round-1 RED: active-pixel clipping `0.094166` exceeded `0.08`; the aggregate ratio was tightened to `0.06`.
- Visual-guard Round-2 RED: the committed baseline passed the aggregate ratio while retaining one `2,333 px` near-white component over `(449,338)–(500,401)`. The new four-neighbor guard failed the intermediate fixes at `2,343`, `796`, then `635` pixels against its `512 px` cap. GREEN after tracing and fully retracting the rear curtain: `363 px` in installed Chrome and Edge, with blue/green/magenta glass detail visible at original resolution.
- Sensor-material RED: the generated texture did not contain independent blue-, green-, and magenta-dominant texels; GREEN: the 24×8 spectral texture proves all three channels and remains non-clipping in both browsers.
- Curtain-geometry RED: the rear curtain crossed the sensor aperture; GREEN: every curtain mesh clears the central aperture and both groups park in the upper cassette while retaining separate exploded-mode Y planes.
- Removal-motion RED on the generated master: `free={'Z50II-04-004': (11.25, 'Z50II-03-007')}` and `guided={23: [(0.5147, 'Z50II-04-004', 'Z50II-03-007')]}`. GREEN after the 10 mm service-lift correction: `free_roots=100`, `free_samples=10420`, `guided_groups=18`, `guided_samples=2252`, `max_spacing_mm=0.25`. The distance contract independently failed against the old 22 mm master before passing on the rebuild.
- Build-workflow RED: the exact-order behavioral test reported both geometry stages missing. GREEN: both stages appear after validation, and an injected `assert_removal_motion.py` exit 23 stops the pipeline after exactly four commands.
- ZIP RED: two `Compress-Archive` runs produced different hashes, and a later deep check exposed PowerShell-version-dependent path sorting; GREEN fixture runs now both produce ordinally ordered SHA-256 `5b96f9ed8c627ac2ff06af7813240d5f3a69472f041e5c6b1498ef13672a556d` at 7,294 bytes.
- Adversarial package fixtures that previously passed are now rejected for duplicate IDs, mismatched URLs, empty JS, and incomplete GLBs.

## One-command build

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-all.ps1
```

Fresh final result: **exit 0** in the mandated fail-fast order.

- Blender 4.5.12 LTS master build and scene validation: pass
- internal geometry: 0 selectable intersections; 495/496 Task-6 pairs plus 896 retained pairs checked; eight service sweeps clear
- removal motion: 100 free roots / 10,420 samples and 18 guided groups / 2,252 samples clear at ≤0.25 mm spacing
- HDR: 1024×512, 128 samples
- reference renders: 1600×1200, Cycles 128 samples; assembled 120.82 s, exploded 121.33 s
- Blender reassembly maximum matrix delta: `1.192e-07`; exact restore assertion pass
- exports: 16 GLBs, 8 modules, 100 aligned parts, 10 decals, shared textures, enforced high/low policy
- unit tests: 20 files / 122 tests
- production build: 48 modules transformed
- installed Chrome+Edge acceptance: 30/30 in 3.2 minutes

## Independent final verification

Every command below was rerun after the final visual hardening and one-command rebuild:

| Verification | Result |
|---|---|
| `validate_scene.py` | exit 0; `Z50II scene validation passed` |
| `blender/tests/assert_internal_geometry.py` | exit 0; selectable intersections 0; 495/496 Task-6 pairs, 896 retained pairs, eight service sweeps clear |
| `blender/tests/assert_removal_motion.py` | exit 0; 100 free roots / 10,420 samples; 18 guided groups / 2,252 samples; spacing ≤0.25 mm |
| `blender/tests/assert_internal_modules.py` | exit 0; 12 imaging + 12 mainboard + 8 power/storage = 32; catalog 60 |
| `blender/tests/assert_exports.py` | exit 0; 16 GLBs, 8 modules, 100 aligned parts, 10 decals |
| `scripts/pnpm.ps1 test` | exit 0; 20 files / 122 tests |
| `scripts/pnpm.ps1 build` | exit 0; 48 modules transformed |
| isolated Chrome `viewer.spec.ts` | 3/3; version 152.0.7977.64; clipping `0.025375234521575984`; largest component `363 px` |
| isolated Edge `viewer.spec.ts` | 3/3; version 151.0.4129.107; clipping `0.025366185455782155`; largest component `363 px` |
| full Chrome+Edge | 30/30 in 3.2 minutes; Chrome `0.025243287606987925` / `363 px`; Edge `0.025248795583219047` / `363 px` |
| `assert-release-workflow.ps1` | exit 0; deterministic fixture plus all adversarial and fail-fast branches |
| fresh-PATH documented wrapper/build | Node `v24.19.0`; build exit 0 |
| packaged launcher | HTTP 200; Nikon title found; listener `python`; Node absent from PATH |
| `git diff --check` | exit 0; no whitespace errors |

The Vite warning for a main JavaScript chunk above 500 kB is non-blocking and does not affect offline behavior.

## Runtime and performance evidence

Exact versions: Blender 4.5.12 LTS (`84afd5f785f7`), Chrome 152.0.7977.64, Edge 151.0.4129.107, Node 24.19.0, pnpm 11.19.0, PowerShell 7.6.4 (release scripts also exercised by Windows PowerShell 5.1), Python 3.13.5, Three.js 0.185.1, Playwright 1.62.1, Vite 8.2.2, Vitest 4.1.10, TypeScript 7.0.2.

The final `artifacts/validation/performance.json` uses installed browser channels, Intel Arc / D3D11, 1920×1080, high quality, and three repetitions:

| Browser | Triangles | Decoded textures | Initial preload | All modules | Orbit FPS | Minimum exploded FPS |
|---|---:|---:|---:|---:|---:|---:|
| Chrome | 223,099 | 314,573,568 B | 1,172.839 ms | 827.993 ms | 40.161 | 29.940 |
| Edge | 223,099 | 314,573,568 B | 811.571 ms | 1,034.635 ms | 59.880 | 39.841 |

## Offline package and launcher

The production ZIP was generated twice after the final acceptance update, and both size and SHA-256 were identical. Direct archive inspection confirmed 64 nonempty entries, fixed wall-clock timestamps, deterministic normalized ordering, seven exact delivery classes, schema 1, 8 unique modules, 100 unique parts, and 8+8 models whose paths exactly match the manifest.

The staged launcher was started hidden with PATH restricted to `C:\Windows\System32;C:\Windows;C:\Users\WangYan\miniconda3`. It used `C:\Users\WangYan\miniconda3\python.exe`, opened `127.0.0.1:4173`, returned HTTP 200 with the Nikon Z50II title, and ran a `python` listener. The owned launcher/listener processes were stopped after the probe.

## Original-resolution visual review

- Blender assembled/exploded references (1600×1200): recognizable body and traceable exploded structure, distinct rubber/plastic/metal/glass/PCB materials, controlled studio light, and contact shadows.
- Browser baseline and canvas (880×684): mount rings and chassis surfaces retain tonal steps; the sensor cover glass visibly retains blue, green, and magenta surface bands without a white rectangle. The active-pixel guard is not diluted by the black background, and the connected-component guard independently rejects a local clipped block.
- Final assembled/exploded/recovery evidence (1440×900): complete UI and 100-part tree are readable, the fitted explosion remains in frame, and recovery shows 8/8 modules with retry count 1.

## Exact artifact evidence

- master: 8,669,632 bytes, SHA-256 `341ecd85d13c74c9246ae7cb3d4d45f9949f1fc56b3ae5c2f53761950f71f17c`
- manifest: 77,818 bytes, SHA-256 `7913da12c60b057eb1bd94e0fab1b9ccc69a14b7170350206b7c989cfda88198`
- assembled render: 1,917,121 bytes, SHA-256 `ae91bd9d6c70fcf4a043c9450f6fefd1ed26fb04a7cd12fc6bddd990a00e6623`
- exploded render: 1,889,660 bytes, SHA-256 `f8902ff925dabf1fed85dd44239e6f19f73be1de713eb7bb827ce94c1cb1d94b`
- performance JSON: 4,858 bytes, SHA-256 `6b0221c6be93868ae0ead40053ecdbf2650f9dba97aa737b5a781e1eb0f7ed44`
- browser baseline: 169,622 bytes, SHA-256 `2538315ac70ca02ffd26eae54af00d1f51e7b7b648efd914128a93be89ca30c8`
- controlled browser canvas: 169,327 bytes, SHA-256 `60a1c5b279592216208f869e409fc4c19861ff33b7f7460b803c8196228a3902`
- full assembled browser evidence: 281,203 bytes, SHA-256 `71f74494425f2154dc0e466a11f950cad23d49fd34dab821ba887094a22e8208`
- full exploded browser evidence: 236,799 bytes, SHA-256 `3e7d5132d02d9c2b33998d879da9aab86c6bceb790164e906f8e5904c86821e8`
- `dist/`: 45 files / 35,947,288 bytes
- `artifacts/textures/`: 7 files / 18,250,632 bytes
- `artifacts/renders/`: 8 files / 7,100,360 bytes

This remains a public-information reference reconstruction, not Nikon OEM CAD, manufacturing data, repair instruction, or a safety reference. The lens is deferred; only the camera-body Z mount is delivered. High quality decodes about 300 MiB of texture data, so constrained GPUs should use Auto or Low. Offline viewing requires Python 3.8+.

The implementation plan and progress file were not modified.
