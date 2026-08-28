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

---

## Review fix round 1/5

Commit `51430d4` was reviewed after Task 9. This fix round addresses all four findings: missing authored decals, duplicate embedded images, unenforced per-node low-detail policy, and temporary-datablock cleanup on construction failure.

### Focused RED evidence

#### Missing authored decals

Command:

```powershell
scripts/run-blender.ps1 --background --factory-startup --python blender/tests/assert_exports.py
```

Result: **exit 1** on the pre-fix GLBs:

```text
AssertionError: authored decal nodes are missing from GLBs:
['DISP', 'HDMI', 'ISO', 'MENU', 'MIC', 'MODE', 'Nikon', 'SENSOR', 'USB', 'Z50II']
```

The regression derives ownership from `partId`, `attachedPartId`, and the parent chain rather than trusting collection membership.

#### Embedded image duplication

The same assertion, before the decal-first gate was added, failed on the first module with:

```text
AssertionError: embedded image remains in public/assets/models/high/01_chassis_front.glb
```

#### Construction cleanup

Command:

```powershell
scripts/run-blender.ps1 --background --factory-startup --python blender/tests/assert_export_cleanup.py
```

Result: **exit 1** before implementation:

```text
ImportError: cannot import name 'temporary_module_scene' from 'export_modules'
```

### Fix implementation

#### Owned decal/control-legend export

Module export membership now includes every object whose nearest `partId` or `attachedPartId` owner belongs to the module, in addition to the module collection itself. This includes the ten meshes in top-level `Z50II_Decals` while preserving their parent transforms, shared origins, `decalLabel` extras, and `white_decal` material:

- module 02: Nikon, Z50II, ISO, MODE, USB, HDMI, MIC;
- module 03: SENSOR;
- module 07: MENU, DISP.

The high/low totals each increase by exactly 20 triangles (ten two-triangle decals).

#### Shared offline textures and compact GLBs

After Blender's Draco GLB export, `externalize_shared_textures` now:

1. reads image buffer views from the GLB;
2. hashes the exact exported image bytes;
3. reuses byte-identical Task 8 files under `public/assets/textures` when possible;
4. writes only three stable hash-named shared PNGs for Blender-transformed scalar maps that are not byte-identical to the authored source PNGs;
5. writes relative `../../textures/...` image URIs;
6. removes image buffer views;
7. repacks all remaining geometry buffer views contiguously with four-byte alignment;
8. remaps accessor, sparse-accessor, and Draco buffer-view references;
9. rewrites a valid glTF 2.0 GLB.

Every module remains an independently resolvable relative asset. Browsers can cache the same shared URI across module loads. Blender re-import confirms all external material images resolve to existing files with non-zero dimensions.

#### Serialized high/low policy enforcement

`assert_exports.py` now derives every owned master mesh signature as:

```text
(normalized object name, owning partId, sorted material names)
```

It compares the complete signature set for every high/low module, not only the 100 selectable roots. High nodes must preserve authored evaluated triangle counts, allowing only a one-triangle difference where the mandated Triangulate modifier removes an authored degenerate n-gon triangle. Low nodes must satisfy:

- protected decal/glass/flex/control-legend/fastener mesh: unchanged;
- unprotected high node above 2,000 triangles: low/high ratio `0.38 +/- 0.005`;
- node at or below 2,000 triangles: unchanged.

The explicit protected-above-threshold fixture is the washer family: each serialized 2,048-triangle washer remains 2,048 triangles in low detail. This makes protection regressions observable even though most decals and flex parts are below the decimation threshold.

#### Exception-safe temporary scenes

The entire scene/collection/object/mesh construction and export preparation path is now inside `temporary_module_scene`, a context manager whose `finally` cleanup runs for failures before and after `yield`. Unsupported non-geometry module object types fail explicitly.

The focused test constructs a real mesh plus an unsupported Blender `LIGHT`. The light triggers a pre-yield `TypeError`; scene, collection, object, and mesh datablock sets are identical before and after the failure.

### Exact before/after package metrics

The **before** measurements were read directly from commit `51430d4` with `git show`, parsing each GLB JSON/BIN chunk and hashing image buffer-view payloads. The **after** measurements parse the regenerated working-tree GLBs and resolve their external URIs.

| Metric | Before high | Before low | After high | After low |
|---|---:|---:|---:|---:|
| GLB bytes | 77,350,028 | 77,272,020 | 4,082,536 | 4,004,456 |
| Triangles | 223,079 | 185,378 | 223,099 | 185,398 |
| Image references | 21 embedded | 21 embedded | 24 external | 24 external |
| Referenced image bytes (with repeated module references) | 73,280,313 | 73,280,313 | 73,336,572 | 73,336,572 |
| Unique image files | 5 embedded copies per quality | 5 embedded copies per quality | 6 shared files | 6 shared files |
| Unique image bytes | 18,168,923 | 18,168,923 | 18,187,676 | 18,187,676 |
| Embedded image payload in GLBs | 73,280,313 | 73,280,313 | 0 | 0 |
| Deployable quality package (GLBs + one shared texture set) | 77,350,028 | 77,272,020 | 22,270,212 | 22,192,132 |

The 16 GLBs shrink from **154,622,048 bytes** to **8,086,992 bytes**. Including the one six-file shared texture set, the complete offline high+low package is **26,274,668 bytes**, an exact reduction of **128,347,380 bytes** from the prior duplicated 16-GLB package, while adding all ten missing decals.

Current per-module metrics:

| Quality | Module | GLB bytes | Triangles | Image refs | Draco |
|---|---|---:|---:|---:|:---:|
| high | 01_chassis_front | 386,000 | 22,812 | 1 | yes |
| high | 02_outer_shell_controls | 899,400 | 64,333 | 5 | yes |
| high | 03_mount_shutter_sensor | 376,224 | 21,814 | 6 | yes |
| high | 04_mainboard_thermal | 759,664 | 27,036 | 3 | yes |
| high | 05_power_storage | 430,048 | 13,816 | 2 | yes |
| high | 06_evf_top_flash | 425,324 | 15,916 | 3 | yes |
| high | 07_rear_lcd_controls | 296,220 | 21,164 | 3 | yes |
| high | 08_io_flex_fasteners | 509,656 | 36,208 | 1 | yes |
| low | 01_chassis_front | 380,152 | 17,732 | 1 | yes |
| low | 02_outer_shell_controls | 846,056 | 44,412 | 5 | yes |
| low | 03_mount_shutter_sensor | 372,588 | 18,004 | 6 | yes |
| low | 04_mainboard_thermal | 759,040 | 27,036 | 3 | yes |
| low | 05_power_storage | 430,220 | 13,816 | 2 | yes |
| low | 06_evf_top_flash | 425,736 | 15,916 | 3 | yes |
| low | 07_rear_lcd_controls | 285,640 | 14,814 | 3 | yes |
| low | 08_io_flex_fasteners | 505,024 | 33,668 | 1 | yes |

### GREEN evidence

#### Full modular export contract

```powershell
scripts/run-blender.ps1 --background --factory-startup --python blender/tests/assert_exports.py
```

Result: **exit 0**.

```text
Modular export assertions passed: 16 GLBs, 8 modules, 100 aligned parts,
10 decals, shared textures, and enforced high/low policy
```

This includes raw GLB validation, path-safety checks, no embedded image buffer views, no orphaned buffer bytes, Draco on every primitive, all external URIs resolved, all images loaded by Blender, complete owned mesh/material signatures, exact part IDs, and shared origins.

#### Cleanup failure path

```powershell
scripts/run-blender.ps1 --background --factory-startup --python blender/tests/assert_export_cleanup.py
```

Result: **exit 0**.

```text
Temporary export-scene construction cleanup assertion passed
```

#### Task 8 materials and decal acceptance

```powershell
scripts/run-blender.ps1 --background artifacts/z50ii_master.blend --python blender/tests/assert_materials_lighting.py
```

Result: **exit 0**.

```text
Decal host-distance QA: min=0.05000 mm, max=0.05001 mm, labels=10
Task 8 materials/lighting assertion passed
```

#### Scene and Task 1 parser

```powershell
scripts/run-blender.ps1 --background artifacts/z50ii_master.blend --python blender/validate_scene.py
scripts/pnpm.ps1 test -- tests/unit/manifest.test.ts
```

Results: **exit 0**, scene validation passed, manifest **6/6 tests passed**.

### Fix-round files

Modified:

- `blender/export_modules.py`
- `blender/tests/assert_exports.py`
- all 16 `public/assets/models/{high,low}/*.glb`
- this report

Created:

- `blender/tests/assert_export_cleanup.py`
- `public/assets/textures/glb-0f1049357ee861fd.png`
- `public/assets/textures/glb-901b6bc4f5f9377c.png`
- `public/assets/textures/glb-d67247538ceb24b2.png`

### Fix-round self-review and concerns

- No change was made to the 100 stable IDs, eight module IDs, 40 guided steps, manifest order, preload policy, axis conversion, or dependency graph.
- Node display text remains manifest-only; decal technical extras remain in GLBs.
- The three generated shared PNGs are exact byte-for-byte copies of Blender's exported scalar-map payloads and are hash-named for deterministic reuse; they are not lossy replacements.
- Relative texture URIs intentionally contain `../../textures/` but are resolved and asserted to remain inside `public/assets`; manifest model URLs continue to forbid `..`.
- The pre-existing Vite `index.html` absence and the non-fatal restricted Blender cache warning remain the only unrelated concerns noted above.
