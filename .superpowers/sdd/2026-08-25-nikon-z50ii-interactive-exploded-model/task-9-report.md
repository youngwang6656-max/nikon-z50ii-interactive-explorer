# Task 9 Report: Modular GLB and Manifest Export

## Outcome

Task 9 exports the 100-part Nikon Z50II reference reconstruction from the shared-origin master scene into the browser asset contract:

- 8 high-detail GLBs
- 8 low-detail GLBs
- 1 schema-version-1 assembly manifest
- exactly 100 stable part IDs in 8 stable module IDs
- 40 contiguous guided steps
- Draco-compressed glTF 2.0 geometry
- Task 1 parser coverage against the actual generated manifest

## RED evidence

### Export contract RED

Command:

```powershell
scripts/run-blender.ps1 --background --factory-startup --python blender/tests/assert_exports.py
```

Result: **exit 1**, before the exporter existed. The assertion opened `artifacts/z50ii_master.blend`, confirmed its 100-part catalog, then failed for the intended reason:

```text
AssertionError: missing 16 modular GLB exports:
public\assets\models\high\01_chassis_front.glb ...
public\assets\models\low\08_io_flex_fasteners.glb
```

### Full-manifest Task 1 parser RED

After extending `tests/unit/manifest.test.ts` to import the production manifest, `public/assembly-manifest.json` was temporarily moved to the adjacent `assembly-manifest.json.tdd-red` path, the unit test was run, and the manifest was restored in a `finally` block.

Command:

```powershell
scripts/pnpm.ps1 test -- tests/unit/manifest.test.ts
```

Result: **exit 1**, intended missing-production-artifact failure:

```text
Cannot find module '../../public/assembly-manifest.json'
```

## Implementation

`blender/export_modules.py` now:

- validates the master scene before export;
- constructs an isolated temporary scene for each module and quality level;
- duplicates module objects and mesh data so export processing never mutates the authored master;
- applies rotation and scale while preserving node/world origins;
- triangulates every exported mesh;
- exports custom properties as node extras while removing Chinese/English display strings from GLBs and retaining stable `partId` extras;
- uses Blender's glTF +Y-up conversion and the required manifest vector conversion `[x, z, -y]` rounded to six decimals;
- converts authored explode distances through explicit millimetres-to-metres conversion;
- applies a `0.38` low-detail decimation ratio only above 2,000 evaluated triangles;
- protects decals, glass, flex cables, control legends/labels, and fastener families from low-detail decimation;
- exports GLB with Draco level 6, materials, UVs, normals, and tangents;
- writes deterministic modules, parts sorted by `(step, partId)`, and numeric steps 1 through 40.

`blender/validate_scene.py` now rejects incomplete metadata, duplicate IDs, wrong module membership, non-unit axes, missing/late dependencies, missing steps, and non-relative file texture paths.

Only `01_chassis_front` and `02_outer_shell_controls` have `preload: true`. The product disclaimer states in both languages that internal structures are reference reconstruction rather than Nikon manufacturer CAD.

## GREEN evidence

### Export

Command:

```powershell
scripts/run-blender.ps1 --background artifacts/z50ii_master.blend --python blender/export_modules.py
```

Result: **exit 0**.

```text
INFO Draco mesh compression is available
Exported 16 GLBs and 100 manifest parts
```

### Blender import and contract assertion

Command:

```powershell
scripts/run-blender.ps1 --background --factory-startup --python blender/tests/assert_exports.py
```

Result: **exit 0**.

```text
Modular export assertions passed: 16 GLBs, 8 modules, 100 aligned parts, 40 steps
```

The assertion reads every GLB JSON chunk, requires `KHR_draco_mesh_compression` on every mesh primitive, imports every GLB into a factory-empty Blender scene, and compares its stable IDs and part-node world origins with the master catalog.

### Task 1 manifest parser

The bundled Node directory and repository `node_modules/.bin` were prepended to the child PATH, as required on this Windows host.

Command:

```powershell
scripts/pnpm.ps1 test -- tests/unit/manifest.test.ts
```

Result: **exit 0**.

```text
Test Files  1 passed (1)
Tests       6 passed (6)
```

The sixth test parses `public/assembly-manifest.json` through `parseManifest` and asserts 8 modules, 100 parts, and contiguous steps 1..40.

### Scene validation

Command:

```powershell
scripts/run-blender.ps1 --background artifacts/z50ii_master.blend --python blender/validate_scene.py
```

Result: **exit 0**.

```text
Z50II scene validation passed
```

## Export metrics and Draco evidence

Triangle counts come from each GLB primitive's index accessor (`count / 3`). Draco evidence comes from `extensionsUsed` and every primitive's extension map.

| Quality | Module | Bytes | Triangles | Draco |
|---|---|---:|---:|:---:|
| high | 01_chassis_front | 943,188 | 22,812 | yes |
| high | 02_outer_shell_controls | 18,502,676 | 64,319 | yes |
| high | 03_mount_shutter_sensor | 18,543,644 | 21,812 | yes |
| high | 04_mainboard_thermal | 10,134,192 | 27,036 | yes |
| high | 05_power_storage | 9,248,084 | 13,816 | yes |
| high | 06_evf_top_flash | 9,800,432 | 15,916 | yes |
| high | 07_rear_lcd_controls | 9,111,036 | 21,160 | yes |
| high | 08_io_flex_fasteners | 1,066,776 | 36,208 | yes |
| low | 01_chassis_front | 937,368 | 17,732 | yes |
| low | 02_outer_shell_controls | 18,449,148 | 44,398 | yes |
| low | 03_mount_shutter_sensor | 18,539,924 | 18,002 | yes |
| low | 04_mainboard_thermal | 10,134,352 | 27,036 | yes |
| low | 05_power_storage | 9,248,240 | 13,816 | yes |
| low | 06_evf_top_flash | 9,800,796 | 15,916 | yes |
| low | 07_rear_lcd_controls | 9,100,344 | 14,810 | yes |
| low | 08_io_flex_fasteners | 1,061,848 | 33,668 | yes |

Totals:

| Quality | Bytes | Triangles |
|---|---:|---:|
| high | 77,350,028 | 223,079 |
| low | 77,272,020 | 185,378 |

The low export has 37,701 fewer triangles (16.9%). Some module byte sizes remain similar because the GLBs preserve and embed authored PBR texture assets; decimation is intentionally restricted to dense, non-protected objects.

## Catalog, axis, dependency, and alignment validation

The export assertion verifies:

- exactly 16 contract GLBs and no extra GLBs under `public/assets/models`;
- 8 sorted module records with exact module IDs;
- exactly 100 unique part IDs matching the master scene;
- parts sorted by step then `partId`;
- numeric guided steps exactly `1..40` with each part represented once;
- only modules 01 and 02 preload;
- all module asset URLs are browser-relative POSIX paths with no scheme, absolute root, backslash, or `..` escape;
- exact basis anchors `X -> X`, Blender `Y -> glTF -Z`, and Blender `Z -> glTF Y`;
- every manifest explode axis remains unit length;
- explode distances match the authored values after millimetre-to-metre conversion;
- every dependency exists, the graph is acyclic, and every dependency step strictly precedes its dependent;
- all 16 GLBs import successfully;
- each imported module has exactly its expected part IDs;
- every imported part node preserves the corresponding master-scene world origin at six-decimal metre precision;
- display metadata remains manifest-only rather than leaking into GLB node extras.

## Files

Created:

- `blender/export_modules.py`
- `blender/tests/assert_exports.py`
- `public/assembly-manifest.json`
- `public/assets/models/high/*.glb` (8)
- `public/assets/models/low/*.glb` (8)
- `.superpowers/sdd/2026-08-25-nikon-z50ii-interactive-exploded-model/task-9-report.md`

Modified:

- `blender/validate_scene.py`
- `tests/unit/manifest.test.ts`

Added as the authorized master deliverable:

- `artifacts/z50ii_master.blend`

## Self-review

- The exporter operates on duplicated scenes/data and removes all temporary datablocks after each module.
- Stable browser identity is data-driven (`partId` extras plus manifest), not derived from mutable Blender object names.
- The axis test has literal basis-vector anchors so the expected conversion is independent of the model data.
- The manifest order and URLs are deterministic.
- High geometry is not decimated; low decimation is thresholded and protected by semantic object/material/ancestor tokens.
- The integration test validates the serialized GLB documents and imported results, not exporter implementation text.
- `git diff --check` reports no whitespace errors (only the repository's Windows LF-to-CRLF warning).

## Concerns

1. Blender's importer prints a non-fatal cache-write warning for `C:\Users\WangYan\AppData\Roaming\Blender Foundation` under the restricted sandbox. The import assertion still exits 0 and all GLBs decode correctly.
2. A broader `scripts/pnpm.ps1 check` run passes all 14 tests and TypeScript, then fails only because the base commit has no `index.html` Vite entry. `git ls-tree 9be0d0b` confirms `index.html` was already absent, and Task 9 does not include frontend scaffolding.
3. Embedded Task 8 PBR maps dominate GLB size, so low-detail files mainly reduce triangles rather than bytes. This preserves the requested materials and texture assets; future delivery optimization could deduplicate external textures if the browser loading contract is expanded.
