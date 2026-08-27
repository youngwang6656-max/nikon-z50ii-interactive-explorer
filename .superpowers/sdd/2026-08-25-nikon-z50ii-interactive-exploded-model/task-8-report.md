# Task 8 — PBR Materials, Studio Lighting, and Reference Renders

## Result

Task 8 adds a canonical one-Principled-BSDF material system for the complete
100-part model, deterministic exterior/internal surface maps, a UV decal atlas
and ten flush decal planes, a neutral cyclorama with a three-area-light rig, a
1024 × 512 Radiance environment, and 1600 × 1200 assembled/exploded Cycles
references. The reference renderer uses 128 samples, adaptive sampling,
denoising, AgX Medium High Contrast, and the calibrated `-4.5 EV` exposure.

The recovered implementation was rebuilt and checked against every Task 4–7
Blender regression. Thirteen diagnostic/iteration renders were deleted after
QA; only the two required final PNGs remain. The regenerated editable source
`artifacts/z50ii_master.blend` is intentionally untracked for Task 16 packaging.

## RED evidence

The original implementer's initial RED terminal output was not retained when
the recovery handoff occurred. The recovery therefore reproduced the intended
pre-feature failure without changing or saving the master: it opened the
rebuilt blend, removed the twelve required materials and all lights in memory,
then ran the exact Task 8 assertion.

```powershell
scripts/run-blender.ps1 --background artifacts/z50ii_master.blend --python-expr "import bpy, runpy; names={'body_black','grip_rubber','mount_metal','brushed_shield','pcb_green','pcb_black','sensor_glass','display_glass','flex_amber','button_black','white_decal','red_accent'}; [bpy.data.materials.remove(material, do_unlink=True) for material in list(bpy.data.materials) if material.name in names]; [bpy.data.objects.remove(obj, do_unlink=True) for obj in list(bpy.data.objects) if obj.type == 'LIGHT']; runpy.run_path(r'blender/tests/assert_materials_lighting.py')"
```

Result: exit `1`, as required.

```text
AssertionError: missing Task 8 materials: ['body_black', 'brushed_shield',
'button_black', 'display_glass', 'flex_amber', 'grip_rubber', 'mount_metal',
'pcb_black', 'pcb_green', 'red_accent', 'sensor_glass', 'white_decal']
```

## GREEN evidence

Fresh master rebuild:

```powershell
scripts/run-blender.ps1 --background --factory-startup --python blender/build_master.py
```

Result: exit `0`; Blender saved `artifacts/z50ii_master.blend`.

Task 8 acceptance:

```powershell
scripts/run-blender.ps1 --background artifacts/z50ii_master.blend --python blender/tests/assert_materials_lighting.py
```

Result: exit `0`.

```text
assembled-studio.png QA: p01=0.0112, p999=0.8995,
  clip>=0.98=0.019427%, spread95-05=0.6516
exploded-studio.png QA: p01=0.0337, p999=0.8805,
  clip>=0.98=0.013333%, spread95-05=0.5872
Task 8 materials/lighting assertion passed
```

Environment generation and decoded-file QA:

```powershell
scripts/run-blender.ps1 --background --factory-startup --python blender/render_environment.py
scripts/run-blender.ps1 --background --factory-startup --python-expr 'import bpy, math; img=bpy.data.images.load(r"C:\Users\WangYan\Documents\ChatGPT\爆炸图\.worktrees\z50ii-interactive-model\public\assets\environment\studio-neutral-1k.hdr", check_existing=False); values=list(img.pixels); rgb=values[0::4]+values[1::4]+values[2::4]; print("HDR decoded QA: size", tuple(img.size), "channels", img.channels, "min_rgb", round(min(rgb),6), "max_rgb", round(max(rgb),6), "finite", all(math.isfinite(v) for v in rgb))'
```

Result: both exit `0`; the HDR reports `(1024, 512)`, four decoded channels,
finite RGB values, decoded minimum `0.164062`, and decoded maximum `18.125`.
The generator reports its analytic envelope as `0.055–18.0` before RGBE
quantization and adds valid Radiance RLE scanlines.

## Task 4–7 regression evidence

The complete prior-task test set was run sequentially against the fresh master:

```powershell
$tests = @(
  'blender/tests/assert_builder_kernel.py',
  'blender/tests/assert_exterior_modules.py',
  'blender/tests/assert_exterior_future_compatible.py',
  'blender/tests/assert_exterior_detail_contract.py',
  'blender/tests/assert_internal_modules.py',
  'blender/tests/assert_internal_geometry.py',
  'blender/tests/assert_internal_rebuild_idempotence.py',
  'blender/tests/assert_build_save_guard.py',
  'blender/tests/assert_control_modules.py',
  'blender/tests/assert_lcd_hinge_geometry.py',
  'blender/tests/assert_removal_motion.py',
  'blender/validate_scene.py'
)
foreach ($test in $tests) {
  scripts/run-blender.ps1 --background artifacts/z50ii_master.blend --python $test
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

Result: exit `0`; all twelve checks passed. Key results:

```text
Exterior assertion passed: 28 parts, envelope 127.500 x 94.850 x 67.350 mm
Exterior detail contract passed: export_nodes=180, bad_determinants=0
Internal assertion passed: 12 imaging + 12 mainboard + 8 power/storage = 32; catalog=60
Internal geometry passed: selectable_intersections=0, task6_pairs_checked=495/496,
  retained_pairs=896, sweeps=8 clear
Internal rebuild idempotence passed: objects=648, meshes=636,
  task_parts=32, task_nodes=258, task_meshes=258, orphan_task_meshes=0
Build save guard passed: invalid catalog preserved the existing artifact byte-for-byte
LCD kinematic sweep passed: angles=-1..-105, increment_deg=1, exemptions=0
Control-module catalog passed: 100 unique selectable roots across 8 modules
LCD hinge geometry passed: pin_radius_mm=1.45, bore_radius_mm=1.65,
  radial_clearance_mm=0.20, axial_gaps_mm=(0.40, 0.40)
Removal-motion audit passed: free_roots=100, free_samples=10468,
  guided_groups=18, guided_samples=2252, max_spacing_mm=0.25
Z50II scene validation passed
```

## Image and asset QA

Both reference PNGs were inspected at their original 1600 × 1200 resolution.
The assembled view retains readable black-plastic form, rubber/paint contrast,
bright metal rings, dark coated glass, crisp legends, and floor contact shadow.
The exploded view keeps shell layers, boards, flexes, shield metal, mount parts,
and internal contact shadows legible without clipped highlights or gross pose
inversion. The Task 8 assertion independently decodes every PNG, verifies
finite pixels and dimensions, measures the luminance distributions above, and
enforces `p999 < 0.95` plus clipped fraction `< 0.05%`.

Final artifact inventory:

| Artifact | Dimensions | Bytes | SHA-256 |
|---|---:|---:|---|
| `artifacts/renders/assembled-studio.png` | 1600 × 1200 | 1,926,093 | `E0FD172EC2F29810F6392C78205AD5C7FDD972CFD37138A65054F7A7B90FEDC6` |
| `artifacts/renders/exploded-studio.png` | 1600 × 1200 | 1,885,084 | `B2871DEF048863260ABDDE0F5751F43D60D6527A6BED7D09DA9A4976D0640DEF` |
| `public/assets/environment/studio-neutral-1k.hdr` | 1024 × 512 | 2,117,753 | `AEA5262EE252FFAEE33F00921F1A1E115121928D1304B8C0C2608C6FCDEB22F9` |

Texture assertions passed for the six editable PNG sources and identical public
PNG copies: four exterior 2048 × 2048 normal/roughness maps, one internal
1024 × 1024 roughness map, and one 2048 × 1024 decal atlas. Six matching public
WebP files also exist and decode through Blender during the build.

## Implementation and files

- `blender/z50ii/materials.py`: canonical material roles, single-Principled
  node graphs, deterministic texture/atlas generation, texture wiring, decal
  UVs, 0.05 mm decal offsets, legacy-role mapping, and assembled transforms.
- `blender/z50ii/studio_lighting.py`: cyclorama, key/fill/rim area lights, AgX
  defaults, reference render metadata, and neutral world setup.
- `blender/z50ii/scene.py`: calls the material and studio setup after all eight
  module builders so the saved 100-part master contains the Task 8 system.
- `blender/render_environment.py`: deterministic equirectangular Radiance RGBE
  writer with valid 1024-pixel RLE scanlines.
- `blender/render_reference.py`: assembled/exploded Cycles render configuration,
  HDR world, metadata-driven explode, decal motion, and exact transform restore.
- `blender/tests/assert_materials_lighting.py`: materials, glTF-safe node shape,
  complete assignment, textures, decals, light rig, transforms, HDR/PNG parsing,
  dimensions, finite values, contrast, and clipping assertions.
- `artifacts/textures/`: six editable PNG source maps.
- `public/assets/textures/`: six PNG copies and six browser-ready WebP files.
- `public/assets/environment/studio-neutral-1k.hdr`.
- `artifacts/renders/assembled-studio.png`.
- `artifacts/renders/exploded-studio.png`.
- `.superpowers/sdd/2026-08-25-nikon-z50ii-interactive-exploded-model/task-8-report.md`.

## Self-review

- The Task 8 test has a controlled RED reproduction and a fresh GREEN run.
- The build integration is explicit; no module geometry or metadata is
  restructured, and all Task 4–7 behavioral/geometry checks remain green.
- Every required material has exactly one Principled BSDF and glTF-safe role
  metadata; every renderable mesh has a material.
- Required baseline roughness, metallic, transmission, coat, and rubber bump
  values are present. Exterior maps are 2K; the internal map is 1K.
- Decal labels, atlas UV orientation, surface normals, atlas path, and exact
  0.05 mm offset are assertion-covered.
- The three area lights have the specified energy ordering and roles; final
  rendering uses Cycles, 128 samples, denoising, the HDR, and AgX.
- The exploded renderer snapshots and restores every selectable root and decal;
  existing Task 7 transform/motion contracts remain green.
- `git diff --check` reports no whitespace errors (only the repository's normal
  Windows line-ending conversion warnings).
- Diagnostic images were restricted to names containing `-diag-` or `-iter-`;
  all 13 were removed, and the final render directory contains only the two
  required PNGs.

## Concerns and limitations

- The normal/roughness maps are deterministic generated texture maps rather
  than the output of a Blender Cycles bake pass. They are editable, tileable,
  correctly sized, wired through relative `//textures/` paths, and pass all
  export-facing assertions, but a reviewer interpreting “baked” as requiring
  `bpy.ops.object.bake` may request a later provenance change.
- Sensor glass has the required low roughness, transmission/coat response, and
  a subtle cyan base tint, but the current glTF-core graph does not implement a
  separate procedural cyan-to-magenta angle ramp. Adding a non-core view-angle
  shader would conflict with the strict single-Principled/glTF-safe contract;
  an exporter-supported iridescence extension could be considered later.
- The procedural model and marks are evidence-led teaching assets, not Nikon
  production CAD, official artwork, manufacturing textures, or a repair manual.
- The two final renders were preserved from the completed calibration run and
  verified rather than rerendered during recovery, avoiding an unnecessary
  multi-hour Cycles rerender. The environment and master were regenerated and
  the PNG contents were checked bytewise, visually, and quantitatively.
