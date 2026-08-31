# Task 16 Report: Independent Review Fixes and Final Offline Release

## Outcome

All six findings from the first Task 16 independent review and the remaining Round-2 sensor-rendering P2 were reproduced with focused failing tests, corrected, and verified through a fresh complete pipeline plus independent reruns. The final package remains fully offline and contains exactly the seven required delivery classes.

Final archive from the definitive post-acceptance double run:

- `release/Z50II-Explorer.zip`: **55,679,179 bytes**
- SHA-256: `7f45df375ff506e7dac1d53e5f8f856d0ab77e45f669f437d7fc236f358f790a`
- 64 nonempty file entries with normalized paths, fixed `2000-01-01 00:00:00` ZIP timestamps, zeroed external attributes, and deterministic ordering
- exact top-level classes: `acceptance.md`, `dist`, `README.md`, `renders`, `start-viewer.ps1`, `textures`, `z50ii_master.blend`
- packaged manifest: schema 1, 8 unique modules, 100 unique parts
- packaged models: exact manifest URL correspondence to 8 high and 8 low GLBs

## Review findings resolved test-first

1. **Cold/isolated E2E reliability.** Camera helpers now wait for four stable animation frames after the transition boundary and never require a transient tween flag. Recovery waits until all eight module rows are terminal before checking 7/8 and retrying. The former heavy workflow is split into bounded exact-reassembly, interaction/visual, and recovery tests under a justified 120-second suite timeout.
2. **Whole-assembly exactness.** The application publishes the sorted local transform basis for every loaded part. Chrome and Edge capture all 100 entries, validate 16 finite matrix elements per part, execute guided 0→1→0, and require the complete serialized transform state to match exactly.
3. **Deep package rejection.** Packaging now rejects duplicate/empty module IDs, duplicate/empty part IDs, unknown part modules, unsafe or mismatched manifest URLs, missing/empty JS/CSS/textures/HDR/Draco assets, missing named renders, and any high/low set other than exact 8+8 nonempty GLBs. Behavioral tests prove duplicate module, duplicate part, URL mismatch, empty JS, and missing low GLB are all rejected.
4. **Byte-reproducible ZIP.** `Compress-Archive` was replaced with deterministic `ZipArchive` creation using normalized entry paths, fixed metadata, and stable input ordering. Both the fixture and production archive produce identical SHA-256 values across consecutive identical-input runs.
5. **Browser clipping.** The exported mesh/material trace identified `Z50II-03-009_sensor_package.001` and `Z50II-03-010_sensor_cover_glass.001` as `sensor_glass`, while the actual white block was the shutter curtain geometry masking the cover glass. Both curtains are now parked together above the aperture in the assembled inspection pose, and a deterministic spectral cover-glass texture plus restrained physical material preserves blue/green/magenta interference cues. The objective guard counts RGB≥250 pixels against active rendered pixels and independently measures the largest four-neighbor near-white component. The final full run measured Chrome `0.02521835981007093` / `363 px` and Edge `0.025221316761446913` / `363 px`, below the `0.06` / `512 px` limits; both component bounds were `(576,363)–(585,480)`, outside the sensor. The reviewed `2,333 px` sensor block is gone.
6. **Standalone documented commands.** `scripts/pnpm.ps1` independently locates the bundled Node runtime, prepends bundled Node plus repository `node_modules/.bin`, and needs no global `node`, `pnpm`, or `npx`. With PATH reduced to Windows system directories, the documented command reported Node `v24.19.0` and completed the production build.

## Focused RED → GREEN evidence

- Fresh-PATH wrapper RED: `'node' is not recognized`; GREEN: `v24.19.0` plus successful build.
- Exact-transform RED: the all-part transform attribute was absent; GREEN: 100 parts × 16 finite elements and exact 0→1→0 equality.
- Material RED: the exported `Z50II DX Sensor` alias retained its original bright material; GREEN: calibrated sensor plus stricter mount/shield roughness, color, and environment response.
- Visual-guard Round-1 RED: active-pixel clipping `0.094166` exceeded `0.08`; the aggregate ratio was tightened to `0.06`.
- Visual-guard Round-2 RED: the committed baseline passed the aggregate ratio while retaining one `2,333 px` near-white component over `(449,338)–(500,401)`. The new four-neighbor guard failed the intermediate fixes at `2,343`, `796`, then `635` pixels against its `512 px` cap. GREEN after tracing and fully retracting the rear curtain: `363 px` in installed Chrome and Edge, with blue/green/magenta glass detail visible at original resolution.
- Sensor-material RED: the generated texture did not contain independent blue-, green-, and magenta-dominant texels; GREEN: the 24×8 spectral texture proves all three channels and remains non-clipping in both browsers.
- Curtain-geometry RED: the rear curtain crossed the sensor aperture; GREEN: every curtain mesh clears the central aperture and both groups park in the upper cassette while retaining separate exploded-mode Y planes.
- ZIP RED: two `Compress-Archive` runs produced different hashes, and a later deep check exposed PowerShell-version-dependent path sorting; GREEN fixture runs now both produce ordinally ordered SHA-256 `5b96f9ed8c627ac2ff06af7813240d5f3a69472f041e5c6b1498ef13672a556d` at 7,294 bytes.
- Adversarial package fixtures that previously passed are now rejected for duplicate IDs, mismatched URLs, empty JS, and incomplete GLBs.

## One-command build

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-all.ps1
```

Fresh final result: **exit 0** in the mandated fail-fast order.

- Blender 4.5.12 LTS master build and scene validation: pass
- HDR: 1024×512, 128 samples
- reference renders: 1600×1200, Cycles 128 samples; assembled 127.99 s, exploded 128.43 s
- Blender reassembly maximum matrix delta: `1.192e-07`; exact restore assertion pass
- exports: 16 GLBs, 8 modules, 100 aligned parts, 10 decals, shared textures, enforced high/low policy
- unit tests: 20 files / 122 tests
- production build: 48 modules transformed
- installed Chrome+Edge acceptance: 30/30 in 3.8 minutes

## Independent final verification

Every command below was rerun after the final visual hardening and one-command rebuild:

| Verification | Result |
|---|---|
| `validate_scene.py` | exit 0; `Z50II scene validation passed` |
| `blender/tests/assert_exports.py` | exit 0; 16 GLBs, 8 modules, 100 aligned parts, 10 decals |
| `scripts/pnpm.ps1 test` | exit 0; 20 files / 122 tests |
| `scripts/pnpm.ps1 build` | exit 0; 48 modules transformed |
| isolated Chrome `viewer.spec.ts` | 3/3; version 152.0.7977.64; clipping `0.025329815303430078`; largest component `363 px` |
| isolated Edge `viewer.spec.ts` | 3/3; version 151.0.4129.107; clipping `0.025243583580532074`; largest component `363 px` |
| full independent Chrome+Edge | 30/30 in 3.8 minutes; Chrome `0.02521835981007093` / `363 px`; Edge `0.025221316761446913` / `363 px` |
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
| Chrome | 223,099 | 314,573,568 B | 1,092.761 ms | 1,211.154 ms | 30.030 | 23.923 |
| Edge | 223,099 | 314,573,568 B | 953.629 ms | 1,134.866 ms | 59.880 | 23.981 |

## Offline package and launcher

The production ZIP was generated twice after the final acceptance update, and both size and SHA-256 were identical. Direct archive inspection confirmed 64 nonempty entries, fixed wall-clock timestamps, deterministic normalized ordering, seven exact delivery classes, schema 1, 8 unique modules, 100 unique parts, and 8+8 models whose paths exactly match the manifest.

The staged launcher was started hidden with PATH restricted to `C:\Windows\System32;C:\Windows;C:\Users\WangYan\miniconda3`. It used `C:\Users\WangYan\miniconda3\python.exe`, opened `127.0.0.1:4173`, returned HTTP 200 with the Nikon Z50II title, and ran a `python` listener. The owned launcher/listener processes were stopped after the probe.

## Original-resolution visual review

- Blender assembled/exploded references (1600×1200): recognizable body and traceable exploded structure, distinct rubber/plastic/metal/glass/PCB materials, controlled studio light, and contact shadows.
- Browser baseline and canvas (880×684): mount rings and chassis surfaces retain tonal steps; the sensor cover glass visibly retains blue, green, and magenta surface bands without a white rectangle. The active-pixel guard is not diluted by the black background, and the connected-component guard independently rejects a local clipped block.
- Final assembled/exploded/recovery evidence (1440×900): complete UI and 100-part tree are readable, the fitted explosion remains in frame, and recovery shows 8/8 modules with retry count 1.

## Exact artifact evidence

- master: 8,669,632 bytes, SHA-256 `fe44e343befe432c67cf3cb09211e0431ebeaf097a00108a33607c4e20026e40`
- manifest: 77,819 bytes, SHA-256 `5acd185c7256f404bb817d9504843d190b13be7a9ff6326f66c81aac09faaa25`
- assembled render: 1,917,124 bytes, SHA-256 `11d5b69ac7e1c67fc605ac095c791edf02df2f53d1160fd0452190d5cb59a894`
- exploded render: 1,888,368 bytes, SHA-256 `de65821a8f7d2ea44110a60de17d1e7965eb9c39f396f408851c1a55ab6ff235`
- performance JSON: 4,868 bytes, SHA-256 `4570630ad9f56309761617ddd94b531f43bdb0653b02c930f52a56b2ad403da4`
- browser baseline: 169,622 bytes, SHA-256 `2538315ac70ca02ffd26eae54af00d1f51e7b7b648efd914128a93be89ca30c8`
- controlled browser canvas: 169,478 bytes, SHA-256 `c6b2334e6c6340d431b96f3fa6da2dd2ea14308f816dda435f20a91ac9b02936`
- full assembled browser evidence: 280,824 bytes, SHA-256 `7d501e549f150c2411cf70283d928611f8e524f721757694474f606a91f35e20`
- `dist/`: 45 files / 35,947,665 bytes
- `artifacts/textures/`: 7 files / 18,250,632 bytes
- `artifacts/renders/`: 8 files / 7,099,071 bytes

This remains a public-information reference reconstruction, not Nikon OEM CAD, manufacturing data, repair instruction, or a safety reference. The lens is deferred; only the camera-body Z mount is delivered. High quality decodes about 300 MiB of texture data, so constrained GPUs should use Auto or Low. Offline viewing requires Python 3.8+.

The implementation plan and progress file were not modified.
