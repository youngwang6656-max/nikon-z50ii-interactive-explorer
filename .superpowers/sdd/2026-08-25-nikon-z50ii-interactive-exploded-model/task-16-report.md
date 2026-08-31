# Task 16 Report: Independent Review Fixes and Final Offline Release

## Outcome

All six findings from the Task 16 independent review were reproduced with focused failing tests, corrected, and verified through a fresh complete pipeline plus independent reruns. The final package remains fully offline and contains exactly the seven required delivery classes.

Final archive from the definitive post-report double run:

- `release/Z50II-Explorer.zip`: **55,684,458 bytes**
- SHA-256: `f69c41a473f89e3a97289690d65b0511784132d42c50adaaafac4140c1141f47`
- 64 nonempty file entries with normalized paths, fixed `2000-01-01 00:00:00` ZIP timestamps, zeroed external attributes, and deterministic ordering
- exact top-level classes: `acceptance.md`, `dist`, `README.md`, `renders`, `start-viewer.ps1`, `textures`, `z50ii_master.blend`
- packaged manifest: schema 1, 8 unique modules, 100 unique parts
- packaged models: exact manifest URL correspondence to 8 high and 8 low GLBs

## Review findings resolved test-first

1. **Cold/isolated E2E reliability.** Camera helpers now wait for four stable animation frames after the transition boundary and never require a transient tween flag. Recovery waits until all eight module rows are terminal before checking 7/8 and retrying. The former heavy workflow is split into bounded exact-reassembly, interaction/visual, and recovery tests under a justified 120-second suite timeout.
2. **Whole-assembly exactness.** The application publishes the sorted local transform basis for every loaded part. Chrome and Edge capture all 100 entries, validate 16 finite matrix elements per part, execute guided 0→1→0, and require the complete serialized transform state to match exactly.
3. **Deep package rejection.** Packaging now rejects duplicate/empty module IDs, duplicate/empty part IDs, unknown part modules, unsafe or mismatched manifest URLs, missing/empty JS/CSS/textures/HDR/Draco assets, missing named renders, and any high/low set other than exact 8+8 nonempty GLBs. Behavioral tests prove duplicate module, duplicate part, URL mismatch, empty JS, and missing low GLB are all rejected.
4. **Byte-reproducible ZIP.** `Compress-Archive` was replaced with deterministic `ZipArchive` creation using normalized entry paths, fixed metadata, and stable input ordering. Both the fixture and production archive produce identical SHA-256 values across consecutive identical-input runs.
5. **Browser clipping.** The studio exposure and reflective material calibration now preserve mount/metal surface cues and recognize the exported DX-sensor material alias. The objective guard counts RGB≥250 pixels against active rendered pixels (RGB max >32), so the black background cannot dilute the result. The final full run measured Chrome `0.049914` and Edge `0.050023`, both below the hard `0.06` ceiling. The final baseline and evidence were inspected at original resolution before acceptance.
6. **Standalone documented commands.** `scripts/pnpm.ps1` independently locates the bundled Node runtime, prepends bundled Node plus repository `node_modules/.bin`, and needs no global `node`, `pnpm`, or `npx`. With PATH reduced to Windows system directories, the documented command reported Node `v24.19.0` and completed the production build.

## Focused RED → GREEN evidence

- Fresh-PATH wrapper RED: `'node' is not recognized`; GREEN: `v24.19.0` plus successful build.
- Exact-transform RED: the all-part transform attribute was absent; GREEN: 100 parts × 16 finite elements and exact 0→1→0 equality.
- Material RED: the exported `Z50II DX Sensor` alias retained its original bright material; GREEN: calibrated sensor plus stricter mount/shield roughness, color, and environment response.
- Visual-guard RED: active-pixel clipping `0.094166` exceeded `0.08`; GREEN after material correction: about `0.050`, with the final ceiling tightened to `0.06`.
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
- reference renders: 1600×1200, Cycles 128 samples; assembled 118.89 s, exploded 128.72 s
- Blender reassembly maximum matrix delta: `1.192e-07`; exact restore assertion pass
- exports: 16 GLBs, 8 modules, 100 aligned parts, 10 decals, shared textures, enforced high/low policy
- unit tests: 20 files / 122 tests
- production build: 48 modules transformed
- installed Chrome+Edge acceptance: 30/30 in about 3.0 minutes

## Independent final verification

Every command below was rerun after the final visual hardening and one-command rebuild:

| Verification | Result |
|---|---|
| `validate_scene.py` | exit 0; `Z50II scene validation passed` |
| `blender/tests/assert_exports.py` | exit 0; 16 GLBs, 8 modules, 100 aligned parts, 10 decals |
| `scripts/pnpm.ps1 test` | exit 0; 20 files / 122 tests |
| `scripts/pnpm.ps1 build` | exit 0; 48 modules transformed |
| isolated Chrome `viewer.spec.ts` | 3/3; version 152.0.7977.64; clipping `0.050011` |
| isolated Edge `viewer.spec.ts` | 3/3; version 151.0.4129.107; clipping `0.050114` |
| full independent Chrome+Edge | 30/30 in about 3.7 minutes; clipping `0.049914` / `0.050023` |
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
| Chrome | 223,099 | 314,572,800 B | 1,329.733 ms | 1,277.505 ms | 30.030 | 23.923 |
| Edge | 223,099 | 314,572,800 B | 988.116 ms | 786.248 ms | 59.880 | 29.940 |

## Offline package and launcher

The production ZIP was generated twice after the final acceptance update, and both size and SHA-256 were identical. Direct archive inspection confirmed 64 nonempty entries, fixed wall-clock timestamps, deterministic normalized ordering, seven exact delivery classes, schema 1, 8 unique modules, 100 unique parts, and 8+8 models whose paths exactly match the manifest.

The staged launcher was started hidden with PATH restricted to `C:\Windows\System32;C:\Windows;C:\Users\WangYan\miniconda3`. It used `C:\Users\WangYan\miniconda3\python.exe`, opened `127.0.0.1:4173`, returned HTTP 200 with the Nikon Z50II title, and ran a `python` listener. The owned launcher/listener processes were stopped after the probe.

## Original-resolution visual review

- Blender assembled/exploded references (1600×1200): recognizable body and traceable exploded structure, distinct rubber/plastic/metal/glass/PCB materials, controlled studio light, and contact shadows.
- Browser baseline and canvas (880×684): mount rings and chassis surfaces retain tonal steps; the active-pixel clipping guard is not diluted by the black background.
- Final assembled/exploded/recovery evidence (1440×900): complete UI and 100-part tree are readable, the fitted explosion remains in frame, and recovery shows 8/8 modules with retry count 1.

## Exact artifact evidence

- master: 8,669,632 bytes, SHA-256 `a158e4d871fcb9fb61709cbee51013bf136c1f1021c9d66b183179671471961d`
- manifest: 77,819 bytes, SHA-256 `5acd185c7256f404bb817d9504843d190b13be7a9ff6326f66c81aac09faaa25`
- assembled render: 1,931,329 bytes, SHA-256 `6e31af32c422aab73fdb9695eb55795c1e5379fc48c94a716e1a64b5848f21eb`
- exploded render: 1,890,548 bytes, SHA-256 `0ab7d77c93bb5c21974be391302a375357b5f29cceffa7dbf4a0f8717d26e32e`
- performance JSON: 4,871 bytes, SHA-256 `3f7e259486d14ce871a5dd187c75f6c845a1f679dfc4636ae408abdcd7c350ba`
- browser baseline: 165,895 bytes, SHA-256 `be8b0f1ba61fea094a203742917e118f03ddbb827974130ded44010f4b2eb9ee`
- `dist/`: 45 files / 35,946,533 bytes
- `artifacts/textures/`: 7 files / 18,250,632 bytes
- `artifacts/renders/`: 8 files / 7,115,456 bytes

This remains a public-information reference reconstruction, not Nikon OEM CAD, manufacturing data, repair instruction, or a safety reference. The lens is deferred; only the camera-body Z mount is delivered. High quality decodes about 300 MiB of texture data, so constrained GPUs should use Auto or Low. Offline viewing requires Python 3.8+.

The implementation plan and progress file were not modified.
