# Task 7 — Modules 06–08 and Complete 100-Part Catalog

## Result

Task 7 adds exactly 40 selectable roots: 10 EVF/top/flash parts, 12 rear
LCD/control parts, and 18 I/O/flex/fastener parts. Together with Modules 01–05,
the scene now contains exactly 100 globally unique stable IDs with module counts
`8/20/12/12/8/10/12/18`.

The final teaching graph is a contiguous 40-operation timeline across all 100
parts. Every integer from 1 through 40 is represented, every dependency points
to a strictly earlier operation, and the graph is acyclic. The earlier Task-5/6
step values were therefore renumbered without changing their stable IDs or
geometry. Independent fasteners, doors, and controls share operations where
appropriate; covers expose cable/shield operations, those expose boards, the
mount stack exposes shutter/sensor parts, and the main chassis is operation 40.

## TDD evidence

The final-catalog assertion was created before the builders and run against the
60-part Task-6 base. Its intended RED result was:

```text
AssertionError: ('06_evf_top_flash', 0, 10)
```

Additional focused assertions subsequently produced RED failures for flash and
LCD opening sign, routed-flex metadata, assembled BVH contacts, and hinge sweep
clearance. The tests drove the final physical origins, connector placement,
shell interfaces, flex paths, fastener seats, and folded-flash architecture.

Review round 1 added a strict, complete removal-motion regression before any
geometry fixes. Against `a64c3d2`, it failed on the reviewer-reproduced EVF,
flash, LCD arm/pivot, I/O board, sensor/port flex, washer, cable-clamp, and
legacy power-board paths. Free mode removes only each root's transitive
dependency closure and treats all other roots as blockers; guided mode moves
every root in a shared operation simultaneously. Both modes sample the full
declared distance at no more than 0.5 mm spacing. This remained RED while the
restored high-detail front shell exposed additional real service obstructions,
then went GREEN only after the physical corridors and dependencies were fixed.

Final GREEN output includes:

```text
Control-module catalog passed: 100 unique selectable roots across 8 modules
Exterior assertion passed: 28 parts, envelope 127.500 x 94.850 x 67.350 mm
Exterior detail contract passed: export_nodes=180, bad_determinants=0,
  evf_max_turn_deg=13.14, evf_crown_drop_mm=0.447, evf_shoulder_slope_deg=53.00
Internal assertion passed: 12 imaging + 12 mainboard + 8 power/storage = 32; catalog=60
Internal geometry passed: selectable_intersections=0, task6_pairs_checked=495/496,
  retained_pairs=896, sweeps=8 clear
Internal rebuild idempotence passed: objects=628, meshes=619, task_parts=32,
  task_nodes=258, task_meshes=258, orphan_task_meshes=0
Build save guard passed: invalid catalog preserved the existing artifact byte-for-byte
Exterior assertion accepted a synthetic future-module part
Z50II scene validation passed
Removal-motion audit passed: free_roots=100, free_samples=5234,
  guided_groups=18, guided_samples=1126, max_spacing_mm=0.5
Blender runner exit-code smoke passed: failure=1 success=0
```

## Geometry and integration

- The EVF contains a hollow rail housing with three baffles, a separate OLED
  display/carrier/socket, a rear eyepiece/mask, and a 16-knurl diopter wheel.
- The hot shoe has two steel rails, retention lips, rear bridge, insulating
  contact plate, and five distinct contacts. Its legacy shell land was shortened
  and moved rearward to preserve the full flash opening/removal path.
- The flash is a shallow folded cassette above the EVF crown, with an open
  perimeter frame, separate reflector/diffuser/transverse tube, and a common
  rear hinge axis. A negative-X rotation lifts it from closed through `-72°`.
- The rear shell is hollow and seats the closed frame/panel/cover-glass stack.
  A nonselectable `Z50II_LCD_SCREEN_PIVOT` Empty is located at the physical
  hinge axis `(49.6, 35.15, -2.0) mm`. Frame `07-002`, panel `07-003`, glass
  `07-004`, and screen-side outer arm `07-006` share that parent/origin and
  explicit `rear-lcd-screen` motion metadata without changing closed assembly
  transforms. Body-side inner arm `07-005` remains stationary. Menu, playback,
  delete, four-way pad, and OK controls have real bores and receiving seats.
- The port group distinguishes a symmetric Type-C shell, trapezoidal Type-D
  HDMI shell, and two cylindrical 3.5 mm jack forms. All align with their shell
  tunnels/doors and seat on the I/O daughterboard.
- Top, rear, sensor, and port flexes each use five or more routed points, at
  least two bends, and explicit end connectors. The antenna, washer set, and
  cable clamp are separate roots.
- Six uniquely named screws use the same linked root mesh datablock, while
  retaining individual heads, cross slots, seats, bilingual metadata, and
  removal axes.
- The fixed 23.5 x 15.7 mm sensor remains `hasIBIS=false`; no lens geometry was
  introduced.
- The high-detail front shell keeps its five-station shoulder loft and a
  watertight single-cutter Fn-bore construction. Narrow full-depth service
  channels align to the measured daughterboard/connectors, battery/card bay,
  and EVF display while preserving the LCD-hinge cheek. The hollow EVF crown is
  a 1.7 mm open arch rather than a solid block.

## Verification metrics

- Task-7 assembled coverage: 3,180 new/new plus new/retained selectable-root
  pairs, with zero non-allowlisted evaluated BVH intersections.
- The global contact contract was reduced from 104 broad/pre-emptive entries to
  60 currently observed intentional interfaces (`32` legacy + `28` Task 7).
  Every retained entry is documented and the tests fail if any exception is
  unused. No broad LCD arm/shell exception remains.
- Complete motion coverage is `100` free roots / `5,234` samples and `18`
  guided multi-root operations / `1,126` samples at `<=0.5 mm`, with zero
  failures.
- LCD sweep samples: `-15/-30/-45/-60/-75/-90/-105°`, all clear.
- Flash sweep samples: `-12/-24/-36/-48/-60/-72°`, all clear; the open head
  also has a clear sampled `+Z` removal path.
- All Task-7 export nodes have finite positive world determinants.
- Rebuilding Modules 06–08 twice preserves object/mesh signatures, linked screw
  mesh identity, and zero orphan `Z50II*` meshes.
- The legacy Task-6 service sweep is explicitly future-module-safe (Modules
  01–05), while the Task-7 test supplies complete cross-module coverage.
- Side-cover handedness is protected by evaluated seat proximity. `02-005`
  requires `08-012/014`: selected distances are `7.780/7.053 mm`, versus
  `102.402/102.349 mm` for the opposite pair. `02-006` requires `08-011/013`:
  `6.248/4.990 mm`, versus `96.233/96.159 mm` opposite.
- Exactly the five legacy catalog roots `01-001` through `05-001` omit the
  Blender `parentId` property; all other parents resolve to existing IDs and no
  root stores `''`. Steps span exactly `1..40` with every integer represented,
  strict-earlier dependencies, and no cycle.
- `scripts/run-blender.ps1` injects `--python-exit-code 1` for every invocation.
  A deliberate Python exception returns `1`; the success smoke returns `0`.
- Fresh source artifact: `9,412,813` bytes, UTC
  `2026-08-26T14:41:03.7665504Z`, SHA-256
  `F43F1DE63183DFDB1BB4340AB640CC44154AE23BA67CA228502B19A179698B80`.

## Visual QA

Temporary 900 x 700 assembled three-quarter, rear, metadata-driven exploded,
and `-75°` LCD-open renders were generated and inspected at original resolution. The assembled view
showed the folded flash cassette and hot-shoe stack seated above the EVF crown,
the port doors/openings aligned, and the lens-free mount preserved. The rear view
showed the LCD layers, hinge hardware, control seats, routed flexes, and rear
fasteners. The exploded view exposed the shell/chassis split, boards, sensor,
LCD stack, flex routing, connector group, washers, and fasteners without a gross
layout inversion. The LCD-open view showed frame, panel, glass, and outer arm
moving as one rigid group around the physical pivot while the inner arm remained
with the body. The temporary render directory and helper script were removed.

## Files

- `blender/build_master.py`
- `blender/z50ii/modules/evf_top_flash.py`
- `blender/z50ii/modules/rear_lcd_controls.py`
- `blender/z50ii/modules/io_flex_fasteners.py`
- `blender/z50ii/modules/chassis_front.py`
- `blender/z50ii/modules/outer_shell_controls.py`
- `blender/z50ii/modules/mount_shutter_sensor.py`
- `blender/z50ii/modules/mainboard_thermal.py`
- `blender/z50ii/modules/power_storage.py`
- `blender/tests/assert_control_modules.py`
- `blender/tests/assert_removal_motion.py`
- `blender/tests/root_contact_contract.py`
- `blender/tests/assert_exterior_modules.py`
- `blender/tests/assert_exterior_detail_contract.py`
- `blender/tests/assert_internal_modules.py`
- `blender/tests/assert_internal_geometry.py`
- `blender/z50ii/metadata.py`
- `scripts/run-blender.ps1`
- `scripts/tests/assert-run-blender-exit-code.ps1`
- `.superpowers/sdd/2026-08-25-nikon-z50ii-interactive-exploded-model/task-7-report.md`

## Limitations

The assembly is an evidence-led procedural teaching reconstruction, not Nikon
production CAD, unpublished dimensions, manufacturing tolerances, or an
official repair sequence. Fine PCB traces, solder joints, molded texture,
production labels, weather seals, and small hinge springs remain simplified.
The folded flash cassette is engineered for a deterministic clear teaching
motion rather than claiming Nikon's exact internal linkage. The master artifact
was rebuilt for verification but remains untracked and is excluded from the fix
commit; procedural sources remain authoritative. Review-round fixes are recorded
in the separate commit titled `fix: close Task 7 removal and kinematic regressions`.
