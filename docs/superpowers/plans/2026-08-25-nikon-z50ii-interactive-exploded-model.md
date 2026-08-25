# Nikon Z50II Interactive Exploded Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a high-fidelity Nikon Z50II body model with 100 selectable parts, a Blender source scene, modular GLB exports, and an offline browser viewer supporting guided and constrained free disassembly.

**Architecture:** `z50ii_master.blend` is the sole geometry and material source. Eight Blender Collections export to high- and low-detail GLBs plus one validated `assembly-manifest.json`; a Vite/TypeScript/Three.js application loads those modules and drives both interaction modes from the same manifest contract.

**Tech Stack:** Blender 4.5.12 LTS and Blender Python; Node.js 24.19.0; pnpm 11.19.0; TypeScript 7.0.2; Vite 8.2.2; Three.js 0.185.1; Vitest 4.1.10; Playwright 1.62.1; HTML/CSS.

**Spec:** `docs/superpowers/specs/2026-08-25-nikon-z50ii-interactive-exploded-model-design.md`

## Global Constraints

- Model only the Nikon Z50II body in this release; reserve the Z-mount attachment origin and electrical-contact interface for a later lens module.
- Use Nikon's published 127 × 96.8 × 66.5 mm body envelope, DX sensor format, Z mount, and 3.2-inch vari-angle display as external dimensional anchors.
- Treat internal geometry as teardown-reference-grade, not manufacturer CAD or repair-authoritative data.
- Deliver approximately 70–100 selectable objects; this plan fixes the release catalog at exactly 100 stable part IDs.
- Export eight independently loadable modules, each with high- and low-detail GLBs sharing one world origin.
- Use Chinese primary labels and English secondary labels.
- Support guided disassembly and constrained free disassembly from one dependency graph; do not add rigid-body physics.
- Use PBR materials, ACES tone mapping, a generated HDR studio environment, soft shadows, and an inspection-light preset.
- Deliver a local offline package; no public deployment is in scope.
- Target Chrome and Edge desktop browsers with hardware-accelerated WebGL2; record measured performance rather than claiming identical results on all hardware.
- Do not add IBIS geometry: the Z50II sensor module is fixed in this reference model.
- Do not redistribute Nikon manuals or product photography; store citations and derived measurement notes only.

---

## File Structure

```text
.
├── .editorconfig
├── .gitignore
├── README.md
├── index.html
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── scripts/
│   ├── install-blender.ps1
│   ├── pnpm.ps1
│   ├── run-blender.ps1
│   ├── build-all.ps1
│   ├── start-viewer.ps1
│   └── package-release.ps1
├── references/z50ii/
│   └── reference-map.md
├── blender/
│   ├── build_master.py
│   ├── export_modules.py
│   ├── render_reference.py
│   ├── render_environment.py
│   ├── validate_scene.py
│   ├── z50ii/
│   │   ├── constants.py
│   │   ├── geometry.py
│   │   ├── materials.py
│   │   ├── metadata.py
│   │   ├── scene.py
│   │   ├── studio_lighting.py
│   │   └── modules/
│   │       ├── chassis_front.py
│   │       ├── outer_shell_controls.py
│   │       ├── mount_shutter_sensor.py
│   │       ├── mainboard_thermal.py
│   │       ├── power_storage.py
│   │       ├── evf_top_flash.py
│   │       ├── rear_lcd_controls.py
│   │       └── io_flex_fasteners.py
│   └── tests/
│       ├── assert_builder_kernel.py
│       ├── assert_exterior_modules.py
│       ├── assert_internal_modules.py
│       ├── assert_control_modules.py
│       ├── assert_materials_lighting.py
│       └── assert_exports.py
├── artifacts/
│   ├── z50ii_master.blend
│   ├── textures/
│   ├── renders/
│   └── validation/
├── public/
│   ├── assembly-manifest.json
│   └── assets/
│       ├── draco/
│       ├── environment/studio-neutral-1k.hdr
│       ├── models/high/
│       ├── models/low/
│       └── textures/
├── src/
│   ├── main.ts
│   ├── styles/app.css
│   ├── app/createApp.ts
│   ├── domain/manifest.ts
│   ├── domain/assemblyState.ts
│   ├── domain/guidedSequence.ts
│   ├── viewer/createRenderer.ts
│   ├── viewer/moduleLoader.ts
│   ├── viewer/selectionController.ts
│   ├── viewer/axisDragController.ts
│   ├── viewer/visibilityController.ts
│   ├── viewer/cutawayController.ts
│   ├── viewer/lightingController.ts
│   ├── viewer/qualityController.ts
│   ├── ui/appShell.ts
│   ├── ui/assemblyTree.ts
│   ├── ui/inspector.ts
│   └── ui/timeline.ts
├── tests/
│   ├── fixtures/assembly-manifest.valid.json
│   ├── unit/manifest.test.ts
│   ├── unit/assemblyState.test.ts
│   ├── unit/guidedSequence.test.ts
│   ├── unit/moduleLoader.test.ts
│   ├── unit/axisDragController.test.ts
│   ├── unit/visibilityController.test.ts
│   └── e2e/viewer.spec.ts
└── release/
    └── Z50II-Explorer.zip
```

`tools/blender-4.5.12-windows-x64/` and downloaded source documents are local execution dependencies and stay untracked. Generated `.blend`, GLB, textures, HDR, reference renders, and the final ZIP are deliverables retained in the workspace; source scripts remain the reproducible authority.

---

### Task 1: Web Toolchain and Manifest Contract

**Files:**
- Create: `.editorconfig`
- Create: `.gitignore`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `scripts/pnpm.ps1`
- Create: `src/domain/manifest.ts`
- Create: `tests/fixtures/assembly-manifest.valid.json`
- Test: `tests/unit/manifest.test.ts`

**Interfaces:**
- Consumes: the fields approved in the design specification.
- Produces: `parseManifest(raw: unknown): AssemblyManifest`, `validateManifest(raw: unknown): ValidationIssue[]`, and the shared `AssemblyManifest`, `ModuleManifest`, `PartManifest`, `DisassemblyStep`, and `Vec3` types.

- [ ] **Step 1: Add pinned web tooling**

Create `package.json` with these exact scripts and versions:

```json
{
  "name": "nikon-z50ii-explorer",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "check": "vitest run && tsc --noEmit && vite build"
  },
  "dependencies": {
    "three": "0.185.1"
  },
  "devDependencies": {
    "@playwright/test": "1.62.1",
    "@types/three": "0.185.4",
    "typescript": "7.0.2",
    "vite": "8.2.2",
    "vitest": "4.1.10"
  }
}
```

Add strict TypeScript configuration with `target: ES2023`, `moduleResolution: Bundler`, `noUncheckedIndexedAccess: true`, and `exactOptionalPropertyTypes: true`. Configure Vite with `base: './'` so the production bundle can be served from any local folder.

Use these exact configuration files:

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
export default defineConfig({ base: './', server: { host: '127.0.0.1' } });
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['tests/unit/**/*.test.ts'] } });
```

Use UTF-8, final newlines, two spaces for web files, four spaces for Python, and these ignore entries:

```ini
root = true

[*]
charset = utf-8
end_of_line = crlf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.py]
indent_size = 4

[*.md]
trim_trailing_whitespace = false
```

```text
node_modules/
dist/
tools/
references/vendor/
*.blend1
*.blend2
test-results/
playwright-report/
release/Z50II-Explorer/
```

- [ ] **Step 2: Install dependencies and lock them**

Run:

```powershell
& 'C:\Users\WangYan\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd' install
```

Expected: `pnpm-lock.yaml` is created and all pinned packages resolve.

Create `scripts/pnpm.ps1` so later tasks do not depend on a system-wide pnpm installation:

```powershell
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$PnpmArgs)
$pnpmExe = 'C:\Users\WangYan\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'
if (-not (Test-Path -LiteralPath $pnpmExe)) { throw 'Bundled pnpm runtime was not found.' }
& $pnpmExe @PnpmArgs
exit $LASTEXITCODE
```

- [ ] **Step 3: Write the failing manifest tests**

Create this valid two-module fixture:

```json
{
  "schemaVersion": 1,
  "product": {
    "name": "Nikon Z50II",
    "disclaimerZh": "参考级内部结构，非 Nikon 原厂 CAD",
    "disclaimerEn": "Reference-grade internals; not Nikon manufacturer CAD"
  },
  "modules": [
    {
      "moduleId": "01_chassis_front",
      "nameZh": "承力骨架",
      "nameEn": "Chassis",
      "urls": { "high": "assets/models/high/01.glb", "low": "assets/models/low/01.glb" },
      "preload": true
    },
    {
      "moduleId": "02_outer_shell_controls",
      "nameZh": "外壳",
      "nameEn": "Outer shell",
      "urls": { "high": "assets/models/high/02.glb", "low": "assets/models/low/02.glb" },
      "preload": true
    }
  ],
  "parts": [
    {
      "partId": "Z50II-02-001",
      "moduleId": "02_outer_shell_controls",
      "parentId": null,
      "nameZh": "后盖",
      "nameEn": "Rear cover",
      "descriptionZh": "外部后盖",
      "descriptionEn": "External rear cover",
      "step": 1,
      "explodeAxis": [0, 0, 1],
      "explodeDistance": 0.04,
      "dependsOn": [],
      "isReferenceGeometry": false
    },
    {
      "partId": "Z50II-01-001",
      "moduleId": "01_chassis_front",
      "parentId": null,
      "nameZh": "承力骨架",
      "nameEn": "Main chassis",
      "descriptionZh": "内部承力结构",
      "descriptionEn": "Internal structural frame",
      "step": 2,
      "explodeAxis": [1, 0, 0],
      "explodeDistance": 0.03,
      "dependsOn": ["Z50II-02-001"],
      "isReferenceGeometry": true
    }
  ],
  "steps": [
    { "step": 1, "titleZh": "移除后盖", "titleEn": "Remove rear cover", "partIds": ["Z50II-02-001"], "cameraPreset": "rear" },
    { "step": 2, "titleZh": "移除骨架", "titleEn": "Remove chassis", "partIds": ["Z50II-01-001"], "cameraPreset": "three-quarter" }
  ]
}
```

Then test successful parsing plus duplicate-ID, missing dependency, non-unit axis, and cyclic-dependency failures:

```ts
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/assembly-manifest.valid.json';
import { parseManifest, validateManifest } from '../../src/domain/manifest';

describe('manifest contract', () => {
  it('parses the valid fixture', () => {
    const manifest = parseManifest(fixture);
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.parts).toHaveLength(2);
  });

  it.each(['duplicate-id', 'missing-dependency', 'non-unit-axis', 'dependency-cycle'])
  ('rejects %s', (kind) => {
    const broken = structuredClone(fixture);
    const first = broken.parts[0]!;
    const second = broken.parts[1]!;
    if (kind === 'duplicate-id') second.partId = first.partId;
    if (kind === 'missing-dependency') second.dependsOn = ['missing'];
    if (kind === 'non-unit-axis') first.explodeAxis = [2, 0, 0];
    if (kind === 'dependency-cycle') {
      first.dependsOn = [second.partId];
      second.dependsOn = [first.partId];
    }
    expect(validateManifest(broken).map((issue) => issue.code)).toContain(kind);
  });
});
```

- [ ] **Step 4: Run the tests and confirm the expected failure**

Run: `scripts/pnpm.ps1 test -- tests/unit/manifest.test.ts`

Expected: FAIL because `src/domain/manifest.ts` does not exist.

- [ ] **Step 5: Implement the manifest types and validator**

Define the contract with these exact core shapes:

```ts
export type Vec3 = readonly [number, number, number];
export type QualityLevel = 'high' | 'low';

export interface ModuleManifest {
  moduleId: string;
  nameZh: string;
  nameEn: string;
  urls: Record<QualityLevel, string>;
  preload: boolean;
}

export interface PartManifest {
  partId: string;
  moduleId: string;
  parentId: string | null;
  nameZh: string;
  nameEn: string;
  descriptionZh: string;
  descriptionEn: string;
  step: number;
  explodeAxis: Vec3;
  explodeDistance: number;
  dependsOn: string[];
  isReferenceGeometry: boolean;
}

export interface DisassemblyStep {
  step: number;
  titleZh: string;
  titleEn: string;
  partIds: string[];
  cameraPreset: string;
}

export interface AssemblyManifest {
  schemaVersion: 1;
  product: { name: 'Nikon Z50II'; disclaimerZh: string; disclaimerEn: string };
  modules: ModuleManifest[];
  parts: PartManifest[];
  steps: DisassemblyStep[];
}

export interface ValidationIssue {
  code: 'shape' | 'duplicate-id' | 'missing-dependency' | 'non-unit-axis' | 'dependency-cycle';
  path: string;
  message: string;
}
```

Implement structural checks, a `Math.abs(length - 1) <= 1e-4` axis check, reference checks, and depth-first cycle detection. `parseManifest` must throw one `Error` containing every issue message instead of silently repairing input.

- [ ] **Step 6: Run type checking and tests**

Run: `scripts/pnpm.ps1 test -- tests/unit/manifest.test.ts`

Expected: PASS, 5 test cases.

Run: `scripts/pnpm.ps1 exec tsc --noEmit`

Expected: PASS with no diagnostics.

- [ ] **Step 7: Commit the contract**

```powershell
git add .editorconfig .gitignore package.json pnpm-lock.yaml tsconfig.json vite.config.ts vitest.config.ts scripts/pnpm.ps1 src/domain/manifest.ts tests/fixtures/assembly-manifest.valid.json tests/unit/manifest.test.ts
git commit -m "feat: define Z50II assembly manifest contract"
```

---

### Task 2: Assembly State and Dependency Engine

**Files:**
- Create: `src/domain/assemblyState.ts`
- Test: `tests/unit/assemblyState.test.ts`

**Interfaces:**
- Consumes: `AssemblyManifest`, `PartManifest`, and `Vec3` from Task 1.
- Produces: `createAssemblyState`, `canMovePart`, `setPartProgress`, `setGlobalExplode`, `undoLastMove`, `resetAssembly`, and `getPartOffset`.

- [ ] **Step 1: Write failing state-engine tests**

```ts
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/assembly-manifest.valid.json';
import {
  canMovePart, createAssemblyState, getPartOffset,
  resetAssembly, setGlobalExplode, setPartProgress, undoLastMove,
} from '../../src/domain/assemblyState';
import { parseManifest } from '../../src/domain/manifest';

const manifest = parseManifest(fixture);

describe('assembly state', () => {
  it('blocks a dependent part until prerequisites are fully removed', () => {
    let state = createAssemblyState(manifest);
    const first = manifest.parts[0]!;
    const second = manifest.parts[1]!;
    expect(canMovePart(state, second.partId).allowed).toBe(false);
    state = setPartProgress(state, first.partId, 1);
    expect(canMovePart(state, second.partId).allowed).toBe(true);
  });

  it('clamps progress and converts it to an offset', () => {
    const part = manifest.parts[0]!;
    const state = setPartProgress(createAssemblyState(manifest), part.partId, 2);
    expect(state.progress[part.partId]).toBe(1);
    expect(getPartOffset(state, part.partId)).toEqual([
      part.explodeAxis[0] * part.explodeDistance,
      part.explodeAxis[1] * part.explodeDistance,
      part.explodeAxis[2] * part.explodeDistance,
    ]);
  });

  it('supports global explode, undo, and reset', () => {
    const exploded = setGlobalExplode(createAssemblyState(manifest), 0.5);
    expect(Object.values(exploded.progress).every((value) => value === 0.5)).toBe(true);
    expect(undoLastMove(exploded).progress).not.toEqual(exploded.progress);
    expect(Object.values(resetAssembly(exploded).progress).every((value) => value === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `scripts/pnpm.ps1 test -- tests/unit/assemblyState.test.ts`

Expected: FAIL because `assemblyState.ts` does not exist.

- [ ] **Step 3: Implement immutable assembly state**

Use this public state shape:

```ts
export interface MoveRecord { partId: string; from: number; to: number }
export interface AssemblyState {
  manifest: AssemblyManifest;
  progress: Record<string, number>;
  history: MoveRecord[];
}
export interface MovePermission { allowed: boolean; missingPartIds: string[] }
```

`setPartProgress` must clamp to `[0, 1]`, reject forward movement when prerequisites are incomplete, permit return movement at any time, and append one history record only when the value changes. `setGlobalExplode` applies steps in ascending order when opening and descending order when closing so dependencies remain valid.

- [ ] **Step 4: Run unit tests and type checking**

Run: `scripts/pnpm.ps1 test -- tests/unit/assemblyState.test.ts`

Run: `scripts/pnpm.ps1 exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit the state engine**

```powershell
git add src/domain/assemblyState.ts tests/unit/assemblyState.test.ts
git commit -m "feat: add constrained assembly state engine"
```

---

### Task 3: Blender Runtime and Reference Evidence Map

**Files:**
- Modify: `.gitignore`
- Create: `scripts/install-blender.ps1`
- Create: `scripts/run-blender.ps1`
- Create: `references/z50ii/reference-map.md`

**Interfaces:**
- Consumes: official Nikon product, user-manual, and self-service-repair URLs from the design spec.
- Produces: a verified local Blender 4.5.12 executable and a source-to-feature reference map used by every modeling task.

- [ ] **Step 1: Add the Blender bootstrap script**

Create a non-system, workspace-local installer that downloads the official portable ZIP and checksum file, compares SHA-256, and extracts only after validation:

```powershell
$ErrorActionPreference = 'Stop'
$version = '4.5.12'
$toolsRoot = Join-Path $PSScriptRoot '..\tools'
$archive = Join-Path $toolsRoot "blender-$version-windows-x64.zip"
$checksumFile = Join-Path $toolsRoot "blender-$version.sha256"
$installDir = Join-Path $toolsRoot "blender-$version-windows-x64"
$base = "https://download.blender.org/release/Blender4.5"

New-Item -ItemType Directory -Force -Path $toolsRoot | Out-Null
Invoke-WebRequest "$base/blender-$version-windows-x64.zip" -OutFile $archive
Invoke-WebRequest "$base/blender-$version.sha256" -OutFile $checksumFile
$expected = (Select-String -Path $checksumFile -Pattern "blender-$version-windows-x64.zip").Line.Split(' ')[0].Trim()
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
if ($actual -ne $expected.ToLowerInvariant()) { throw "Blender archive checksum mismatch" }
Expand-Archive -LiteralPath $archive -DestinationPath $toolsRoot -Force
& (Join-Path $installDir 'blender.exe') --version
```

Add `/tools/`, `/references/vendor/`, and Blender backup files (`*.blend1`, `*.blend2`) to `.gitignore`.

- [ ] **Step 2: Run the bootstrap with network approval**

Run: `powershell -ExecutionPolicy Bypass -File scripts/install-blender.ps1`

Expected: output begins with `Blender 4.5.12` and `tools/blender-4.5.12-windows-x64/blender.exe` exists. Do not install system-wide.

- [ ] **Step 3: Add one stable Blender runner**

`scripts/run-blender.ps1` must resolve the portable executable and pass all remaining arguments unchanged:

```powershell
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$BlenderArgs)
$blender = Join-Path $PSScriptRoot '..\tools\blender-4.5.12-windows-x64\blender.exe'
if (-not (Test-Path -LiteralPath $blender)) { throw 'Run scripts/install-blender.ps1 first.' }
& $blender @BlenderArgs
exit $LASTEXITCODE
```

- [ ] **Step 4: Write the reference evidence map**

Use the official Nikon Self Service Repair page in a browser, accept the displayed repair-manual agreement, and save the downloaded PDF only as `references/vendor/Z50II-repair-manual.pdf`. Record its source URL, download date, and `Get-FileHash -Algorithm SHA256` result in the evidence map; do not add the PDF to Git. Use the official product page and user manual the same way for externally visible controls and dimensions.

Then create `references/z50ii/reference-map.md` with a table containing `Feature`, `Source URL`, `Observed value`, `Model use`, and `Confidence`. Include these concrete rows: body envelope `127 × 96.8 × 66.5 mm`; sensor active area `23.5 × 15.7 mm`; 3.2-inch vari-angle monitor; Z mount; EN-EL25a battery; UHS-II SD slot; front/rear/top/side control placement; port types; shell-removal order; main-board location; sensor/shutter order. Mark any geometry inferred rather than directly visible as `reference reconstruction`.

- [ ] **Step 5: Verify references and commit**

Run: `rg -n "127 × 96.8 × 66.5|23.5 × 15.7|reference reconstruction" references/z50ii/reference-map.md`

Expected: all three patterns are present.

```powershell
git add .gitignore scripts/install-blender.ps1 scripts/run-blender.ps1 references/z50ii/reference-map.md
git commit -m "build: add Blender runtime and Z50II evidence map"
```

---

### Task 4: Blender Builder Kernel

**Files:**
- Create: `blender/z50ii/constants.py`
- Create: `blender/z50ii/geometry.py`
- Create: `blender/z50ii/materials.py`
- Create: `blender/z50ii/metadata.py`
- Create: `blender/z50ii/scene.py`
- Create: `blender/build_master.py`
- Create: `blender/validate_scene.py`
- Test: `blender/tests/assert_builder_kernel.py`

**Interfaces:**
- Consumes: Blender 4.5.12 and the evidence map.
- Produces: `mm`, primitive/build helpers, stable collection creation, material lookup, part metadata attachment, and `build_scene(output_path: Path)`.

- [ ] **Step 1: Write the failing builder-kernel assertion**

```python
import bpy

EXPECTED = {
    '01_chassis_front', '02_outer_shell_controls', '03_mount_shutter_sensor',
    '04_mainboard_thermal', '05_power_storage', '06_evf_top_flash',
    '07_rear_lcd_controls', '08_io_flex_fasteners',
}
actual = {collection.name for collection in bpy.data.collections}
assert EXPECTED <= actual, f'missing collections: {EXPECTED - actual}'
assert bpy.context.scene.unit_settings.system == 'METRIC'
assert abs(bpy.context.scene.unit_settings.scale_length - 1.0) < 1e-9
assert bpy.data.worlds.get('Z50II_StudioWorld') is not None
```

- [ ] **Step 2: Run the assertion and verify failure**

Run:

```powershell
scripts/run-blender.ps1 --background --factory-startup --python blender/tests/assert_builder_kernel.py
```

Expected: FAIL with missing Collections.

- [ ] **Step 3: Implement shared constants and geometry helpers**

Use Blender meters internally and millimeters at call sites:

```python
MM = 0.001
BODY_WIDTH_MM = 127.0
BODY_HEIGHT_MM = 96.8
BODY_DEPTH_MM = 66.5

def mm(value: float) -> float:
    return value * MM
```

Implement these exact helper signatures in `geometry.py`:

```python
def rounded_box(name, size_mm, location_mm, bevel_mm, collection, material): ...
def cylinder(name, radius_mm, depth_mm, location_mm, rotation_deg, collection, material, vertices=64): ...
def torus(name, major_radius_mm, minor_radius_mm, location_mm, rotation_deg, collection, material): ...
def panel(name, outline_mm, thickness_mm, location_mm, rotation_deg, collection, material): ...
def flex_cable(name, points_mm, width_mm, thickness_mm, collection, material): ...
def fastener(name, location_mm, rotation_deg, collection, material, head_mm=3.0, length_mm=5.0): ...
```

Every helper must apply transforms, add a weighted-normal-safe bevel, set smooth shading where appropriate, and return the created `bpy.types.Object`.

- [ ] **Step 4: Implement metadata and scene initialization**

`attach_part_metadata` must reject duplicate IDs before writing custom properties:

```python
def attach_part_metadata(obj, *, part_id, module_id, parent_id, name_zh, name_en,
                         description_zh, description_en, step, explode_axis,
                         explode_distance_mm, depends_on, is_reference_geometry): ...
```

`initialize_scene()` must clear the factory scene, set metric units, create the eight Collections, define a neutral World named `Z50II_StudioWorld`, set the coordinate convention `+X right, +Y rear, +Z up`, and add an Empty named `Z50II_LENS_MOUNT_ORIGIN` at the Z-mount center.

- [ ] **Step 5: Build and save the empty master scene**

`build_master.py` must call `initialize_scene()`, call each module builder if present, and save to `artifacts/z50ii_master.blend`. Run:

```powershell
scripts/run-blender.ps1 --background --factory-startup --python blender/build_master.py
scripts/run-blender.ps1 --background artifacts/z50ii_master.blend --python blender/tests/assert_builder_kernel.py
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit the builder kernel**

```powershell
git add blender/build_master.py blender/validate_scene.py blender/z50ii/constants.py blender/z50ii/geometry.py blender/z50ii/materials.py blender/z50ii/metadata.py blender/z50ii/scene.py blender/tests/assert_builder_kernel.py
git commit -m "feat: add procedural Blender builder kernel"
```

---

### Task 5: Exterior Modules 01–02

**Files:**
- Create: `blender/z50ii/modules/chassis_front.py`
- Create: `blender/z50ii/modules/outer_shell_controls.py`
- Test: `blender/tests/assert_exterior_modules.py`
- Modify: `blender/build_master.py`

**Interfaces:**
- Consumes: Task 4 geometry/material/metadata helpers.
- Produces: `build_chassis_front()` with 8 parts and `build_outer_shell_controls()` with 20 parts.

- [ ] **Step 1: Write the failing exterior catalog assertion**

Assert exactly these 28 IDs exist and have metadata, nonzero dimensions, and the expected module ID:

```python
EXPECTED = {
 'Z50II-01-001','Z50II-01-002','Z50II-01-003','Z50II-01-004',
 'Z50II-01-005','Z50II-01-006','Z50II-01-007','Z50II-01-008',
 'Z50II-02-001','Z50II-02-002','Z50II-02-003','Z50II-02-004',
 'Z50II-02-005','Z50II-02-006','Z50II-02-007','Z50II-02-008',
 'Z50II-02-009','Z50II-02-010','Z50II-02-011','Z50II-02-012',
 'Z50II-02-013','Z50II-02-014','Z50II-02-015','Z50II-02-016',
 'Z50II-02-017','Z50II-02-018','Z50II-02-019','Z50II-02-020',
}
actual = {obj.get('partId') for obj in bpy.data.objects if obj.get('partId')}
assert EXPECTED <= actual
```

Also assert the complete visible body bounding box stays within ±2 mm of 127 × 96.8 × 66.5 mm after excluding exploded transforms.

- [ ] **Step 2: Run the exterior assertion and verify failure**

Run the builder followed by `assert_exterior_modules.py`.

Expected: FAIL listing all 28 missing part IDs.

- [ ] **Step 3: Model module 01**

Create these eight named parts: magnesium chassis, front inner frame, grip inner frame, mount support plate, sensor rail frame, bottom reinforcement plate, tripod socket, and paired strap-lug reinforcement. Use shell thicknesses between 1.2 and 2.5 mm, bevels between 0.3 and 1.2 mm, and a 55 mm inner opening around the reserved mount origin. Assign steps 28–35 and inward-to-outward dependency links.

- [ ] **Step 4: Model module 02**

Create these twenty named parts: front shell, grip rubber, top shell, bottom shell, left side cover, right grip cover, battery door, upper port door, lower port door, shutter button, power collar, front command dial, rear command dial, mode dial, photo/video selector, Fn1, Fn2, lens-release button, left strap lug, and right strap lug. Use silhouette-forming rounded boxes plus boolean cuts for the mount, EVF, display hinge, doors, and controls; keep the total outer envelope within the test tolerance.

- [ ] **Step 5: Add labels, axes, and dependencies**

Use Chinese/English names for every part. Exterior panels move outward along their local surface normals; buttons and dials move along their insertion axes. Set the first visible removal steps to doors, bottom shell, side covers, rear/top/front shells, then the rubber and remaining controls.

- [ ] **Step 6: Rebuild, render six silhouette views, and run the assertion**

Run:

```powershell
scripts/run-blender.ps1 --background --factory-startup --python blender/build_master.py
scripts/run-blender.ps1 --background artifacts/z50ii_master.blend --python blender/tests/assert_exterior_modules.py
```

Expected: PASS with 28 exterior IDs and dimensional tolerance met. Render front, rear, left, right, top, and three-quarter preview PNGs into `artifacts/renders/silhouette/` and compare against the evidence map before committing.

- [ ] **Step 7: Commit exterior modules**

```powershell
git add blender/build_master.py blender/z50ii/modules/chassis_front.py blender/z50ii/modules/outer_shell_controls.py blender/tests/assert_exterior_modules.py artifacts/renders/silhouette
git commit -m "feat: model Z50II chassis and exterior controls"
```

---

### Task 6: Core Internal Modules 03–05

**Files:**
- Create: `blender/z50ii/modules/mount_shutter_sensor.py`
- Create: `blender/z50ii/modules/mainboard_thermal.py`
- Create: `blender/z50ii/modules/power_storage.py`
- Test: `blender/tests/assert_internal_modules.py`
- Modify: `blender/build_master.py`

**Interfaces:**
- Consumes: Task 4 helpers and the Task 5 chassis coordinate system.
- Produces: 32 internal parts, bringing the scene catalog to 60 parts.

- [ ] **Step 1: Write the failing internal-module assertion**

Assert twelve `Z50II-03-*`, twelve `Z50II-04-*`, and eight `Z50II-05-*` IDs, plus these physical invariants:

```python
sensor = bpy.data.objects['Z50II-03-009_sensor_package']
assert abs(sensor.dimensions.x - 0.0235) < 0.0005
assert abs(sensor.dimensions.z - 0.0157) < 0.0005
assert 'IBIS' not in ' '.join(obj.name.upper() for obj in bpy.data.objects)
assert bpy.data.objects['Z50II-03-001_mount_ring'].location.y < sensor.location.y
```

- [ ] **Step 2: Run the assertion and verify failure**

Expected: FAIL because internal module objects are absent.

- [ ] **Step 3: Model module 03 with 12 parts**

Create: mount ring, mount gasket, contact block, contact-pin bank, mount spacer, shutter front curtain, shutter rear curtain, shutter frame, fixed sensor package, sensor cover glass, sensor PCB, and dust shield. Use the 23.5 × 15.7 mm active sensor anchor, place the two shutter curtains between mount and sensor, and use physically separate but tightly aligned components. Assign ordered steps so the ring/gasket/spacer precede the shutter and sensor stack.

- [ ] **Step 4: Model module 04 with 12 parts**

Create: main PCB, processor package, memory package A, memory package B, power-management cluster, front EMI shield, rear EMI shield, thermal pad, heat spreader, secondary control PCB, RF shield can, and flex-connector bank. Use a 0.8–1.2 mm PCB thickness, clearly readable component heights, and shield/thermal layers that detach before the board.

- [ ] **Step 5: Model module 05 with 8 parts**

Create: EN-EL25a battery shell, battery cradle, battery contacts, power board, UHS-II SD slot, SD card, bottom-door latch, and power flex cable. Treat the battery as a removable product-shaped component and the SD card as an illustrative removable object; label both accordingly.

- [ ] **Step 6: Verify catalog, fixed-sensor design, and dependencies**

Run builder plus `assert_internal_modules.py`.

Expected: PASS with 60 total parts, a fixed sensor, correct sensor dimensions, and no dependency that requires an inner component before its cover or shield.

- [ ] **Step 7: Commit core internals**

```powershell
git add blender/build_master.py blender/z50ii/modules/mount_shutter_sensor.py blender/z50ii/modules/mainboard_thermal.py blender/z50ii/modules/power_storage.py blender/tests/assert_internal_modules.py
git commit -m "feat: model Z50II imaging electronics and power modules"
```

---

### Task 7: Modules 06–08 and the 100-Part Catalog

**Files:**
- Create: `blender/z50ii/modules/evf_top_flash.py`
- Create: `blender/z50ii/modules/rear_lcd_controls.py`
- Create: `blender/z50ii/modules/io_flex_fasteners.py`
- Test: `blender/tests/assert_control_modules.py`
- Modify: `blender/build_master.py`

**Interfaces:**
- Consumes: Task 4 helpers and Tasks 5–6 assembly coordinates.
- Produces: 40 parts and the complete 100-part scene catalog.

- [ ] **Step 1: Write the failing final-catalog assertion**

Assert exact module counts and global uniqueness:

```python
expected_counts = {
 '01_chassis_front': 8, '02_outer_shell_controls': 20,
 '03_mount_shutter_sensor': 12, '04_mainboard_thermal': 12,
 '05_power_storage': 8, '06_evf_top_flash': 10,
 '07_rear_lcd_controls': 12, '08_io_flex_fasteners': 18,
}
for module_id, count in expected_counts.items():
    objects = [obj for obj in bpy.data.objects if obj.get('moduleId') == module_id]
    assert len(objects) == count, (module_id, len(objects), count)
ids = [obj['partId'] for obj in bpy.data.objects if obj.get('partId')]
assert len(ids) == len(set(ids)) == 100
```

- [ ] **Step 2: Model module 06 with 10 parts**

Create: EVF housing, EVF display, EVF eyepiece lens, diopter wheel, hot-shoe rails, hot-shoe contact plate, flash outer head, flash reflector, flash hinge, and top-control PCB. Provide a hinge-centered flash removal path and layered EVF glass/display geometry.

- [ ] **Step 3: Model module 07 with 12 parts**

Create: rear shell, LCD frame, LCD panel, LCD cover glass, inner hinge arm, outer hinge arm, hinge pivot, menu button, playback button, delete button, direction pad, and OK button. Construct the screen in its closed position but keep pivot origins usable for a later display-open animation.

- [ ] **Step 4: Model module 08 with 18 parts**

Create: USB-C port, micro-HDMI port, microphone jack, headphone/remote jack, I/O daughterboard, Wi-Fi/Bluetooth antenna, top flex cable, rear flex cable, sensor flex cable, port flex cable, upper-left screw, upper-right screw, rear-left screw, rear-right screw, bottom-left screw, bottom-right screw, washer set, and cable clamp. Use linked mesh data for repeated fasteners while preserving unique object names and IDs.

- [ ] **Step 5: Assign the complete拆解 graph**

Set steps 1–40 so six named screws and doors release the rear/bottom/side covers; covers expose flex cables and shields; cables/shields expose PCBs; mount stack exposes shutter/sensor; chassis parts are last. Verify every non-root part has a meaningful axis and every prerequisite belongs to an earlier step.

- [ ] **Step 6: Rebuild and validate the 100-part scene**

Run builder plus `assert_control_modules.py` and `blender/validate_scene.py`.

Expected: PASS; exactly 100 unique part IDs, 8 module counts match, axes have unit length, explode distances are positive, and the dependency graph is acyclic.

- [ ] **Step 7: Commit the final geometry catalog**

```powershell
git add blender/build_master.py blender/z50ii/modules/evf_top_flash.py blender/z50ii/modules/rear_lcd_controls.py blender/z50ii/modules/io_flex_fasteners.py blender/tests/assert_control_modules.py
git commit -m "feat: complete 100-part Z50II model catalog"
```

---

### Task 8: PBR Materials, Studio Lighting, and Reference Renders

**Files:**
- Modify: `blender/z50ii/materials.py`
- Create: `blender/z50ii/studio_lighting.py`
- Create: `blender/render_reference.py`
- Create: `blender/render_environment.py`
- Test: `blender/tests/assert_materials_lighting.py`
- Create: `public/assets/textures/`
- Create: `artifacts/textures/`
- Create: `public/assets/environment/studio-neutral-1k.hdr`
- Create: `artifacts/renders/assembled-studio.png`
- Create: `artifacts/renders/exploded-studio.png`

**Interfaces:**
- Consumes: the complete 100-part model.
- Produces: glTF-compatible PBR materials, baked texture maps, a 1024 × 512 HDR environment, and Cycles reference images.

- [ ] **Step 1: Write failing material and lighting assertions**

Assert these material keys exist: `body_black`, `grip_rubber`, `mount_metal`, `brushed_shield`, `pcb_green`, `pcb_black`, `sensor_glass`, `display_glass`, `flex_amber`, `button_black`, `white_decal`, and `red_accent`. Assert every mesh has a material, `body_black` uses Principled BSDF, the Cycles scene uses AgX color management for source renders, and three studio area lights exist.

- [ ] **Step 2: Run the assertion and verify failure**

Expected: FAIL listing missing materials and lights.

- [ ] **Step 3: Implement glTF-safe PBR materials**

Build every material around one Principled BSDF. Use these baseline values before visual calibration: body roughness `0.48`, rubber roughness `0.72` with procedural bump strength `0.16`, mount metallic `1.0` and roughness `0.22`, brushed shield metallic `0.9` and roughness `0.38`, glass transmission `0.12` with coat weight `0.35`, and sensor glass low roughness with subtle cyan/magenta view-dependent tint. Bake non-exportable procedural bump and roughness into 2K maps for exterior surfaces and 1K maps for internal parts. Store editable/baked source maps in `artifacts/textures/`, set Blender image paths relative to `//textures/`, and copy browser-ready WebP/PNG versions to `public/assets/textures/`.

- [ ] **Step 4: Add decals and micro-surface detail**

Create an atlas containing the `Nikon`, `Z50II`, button legends, mode-dial markings, port icons, and sensor warning mark. Use UV-mapped decal planes or baked texture layers positioned flush to the surface; prevent z-fighting with a 0.05 mm offset. Keep marks crisp at the closest inspection camera distance.

- [ ] **Step 5: Build the Cycles studio and HDR environment**

Use a large soft key at front-left, a lower-energy fill at front-right, a narrow rim light behind, and a neutral cyclorama. `render_environment.py` must render an equirectangular 1024 × 512 Radiance HDR named `studio-neutral-1k.hdr`; `render_reference.py` must render 1600 × 1200 assembled and exploded PNGs at 128 Cycles samples with denoising.

- [ ] **Step 6: Render, inspect, and calibrate one variable per iteration**

Run:

```powershell
scripts/run-blender.ps1 --background --factory-startup --python blender/build_master.py
scripts/run-blender.ps1 --background artifacts/z50ii_master.blend --python blender/render_environment.py
scripts/run-blender.ps1 --background artifacts/z50ii_master.blend --python blender/render_reference.py
scripts/run-blender.ps1 --background artifacts/z50ii_master.blend --python blender/tests/assert_materials_lighting.py
```

Expected: both PNGs and HDR exist, the assertion passes, metal/rubber/plastic/glass remain visually distinct, highlights are not clipped, and interior contact shadows are readable. Inspect both PNGs at original resolution before accepting.

- [ ] **Step 7: Commit material sources and visual references**

```powershell
git add blender/z50ii/materials.py blender/z50ii/studio_lighting.py blender/render_reference.py blender/render_environment.py blender/tests/assert_materials_lighting.py artifacts/textures public/assets/textures public/assets/environment artifacts/renders
git commit -m "feat: add realistic Z50II PBR materials and studio light"
```

---

### Task 9: Modular GLB and Manifest Export

**Files:**
- Create: `blender/export_modules.py`
- Modify: `blender/validate_scene.py`
- Test: `blender/tests/assert_exports.py`
- Create: `public/assembly-manifest.json`
- Create: `public/assets/models/high/*.glb`
- Create: `public/assets/models/low/*.glb`
- Update: `artifacts/z50ii_master.blend`

**Interfaces:**
- Consumes: Blender objects and custom properties from Tasks 4–8.
- Produces: eight high-detail GLBs, eight low-detail GLBs, and one Task-1-compatible manifest.

- [ ] **Step 1: Write the failing export assertion**

The assertion must require sixteen GLBs, eight module records, exactly 100 parts, schema version `1`, unit-length glTF axes, all relative asset paths, and no dependency cycle. It must also import each GLB into a temporary Blender scene and confirm the part IDs listed for that module are present.

- [ ] **Step 2: Run the export assertion and verify failure**

Expected: FAIL because export files do not exist.

- [ ] **Step 3: Implement Blender-to-glTF axis and metadata conversion**

Use the exact conversion from Blender Z-up to glTF Y-up:

```python
def blender_axis_to_gltf(axis):
    x, y, z = axis
    return [round(x, 6), round(z, 6), round(-y, 6)]
```

Convert millimeter explode distances to meters. Preserve `partId` in glTF node extras and write Chinese/English display metadata only to the manifest.

- [ ] **Step 4: Export high and low modules**

For each top-level Collection, duplicate to a temporary export scene, apply transforms, triangulate, and export with custom properties and Draco compression enabled. High detail preserves authored geometry; low detail applies a decimation ratio of `0.38` only to objects with more than 2,000 triangles and never decimates decals, glass, flex cables, control legends, or fasteners below 200 triangles.

- [ ] **Step 5: Write the assembly manifest**

Sort modules by module ID, parts by `step` then `partId`, and steps numerically. Set only modules 01 and 02 to `preload: true`. Include the product disclaimer that internal structures are reference reconstruction and not manufacturer CAD.

- [ ] **Step 6: Run export and validation**

```powershell
scripts/run-blender.ps1 --background artifacts/z50ii_master.blend --python blender/export_modules.py
scripts/run-blender.ps1 --background --factory-startup --python blender/tests/assert_exports.py
scripts/pnpm.ps1 test -- tests/unit/manifest.test.ts
```

Expected: all commands pass; 16 GLBs and one manifest exist; each module aligns at the shared origin.

- [ ] **Step 7: Commit export pipeline and deliverable assets**

```powershell
git add blender/export_modules.py blender/validate_scene.py blender/tests/assert_exports.py artifacts/z50ii_master.blend public/assembly-manifest.json public/assets/models
git commit -m "feat: export modular Z50II GLBs and assembly manifest"
```

---

### Task 10: Three.js Renderer and Modular Loader

**Files:**
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/app/createApp.ts`
- Create: `src/viewer/createRenderer.ts`
- Create: `src/viewer/moduleLoader.ts`
- Create: `src/ui/appShell.ts`
- Create: `src/styles/app.css`
- Create: `public/assets/draco/`
- Test: `tests/unit/moduleLoader.test.ts`

**Interfaces:**
- Consumes: `AssemblyManifest` and module URLs from Task 9.
- Produces: `createViewer(container)`, `ModuleLoader.load(moduleId, quality)`, `ModuleLoader.retry(moduleId)`, and a mounted application shell.

- [ ] **Step 1: Write failing loader tests**

Inject a loader function so tests do not require WebGL:

```ts
import { expect, it, vi } from 'vitest';
import fixture from '../fixtures/assembly-manifest.valid.json';
import { parseManifest } from '../../src/domain/manifest';
import { ModuleLoader } from '../../src/viewer/moduleLoader';

const manifest = parseManifest(fixture);

it('deduplicates concurrent requests and records failures for retry', async () => {
  let calls = 0;
  const fetcher = vi.fn(async () => {
    calls += 1;
    if (calls === 1) throw new Error('network');
    return { scene: { name: 'module' } } as never;
  });
  const loader = new ModuleLoader(manifest, fetcher);
  await expect(loader.load('01_chassis_front', 'high')).rejects.toThrow('network');
  await expect(loader.retry('01_chassis_front')).resolves.toBeDefined();
  expect(calls).toBe(2);
});
```

- [ ] **Step 2: Run the test and verify failure**

Expected: FAIL because `ModuleLoader` does not exist.

- [ ] **Step 3: Implement the physical renderer**

Create a `WebGLRenderer` with antialiasing, `SRGBColorSpace`, `ACESFilmicToneMapping`, pixel ratio capped at `2`, `PCFSoftShadowMap`, a perspective camera, OrbitControls damping, PMREM environment processing, and a root `Group` named `Z50II_ASSEMBLY`. Route rendering through `EffectComposer` with `RenderPass`, `GTAOPass`, and one shared `OutlinePass`. Load `studio-neutral-1k.hdr` with `RGBELoader` and expose a fallback neutral `RoomEnvironment`.

- [ ] **Step 4: Implement module loading and progress state**

Copy Three.js's pinned Draco decoder files from `node_modules/three/examples/jsm/libs/draco/gltf/` into `public/assets/draco/`. Use `GLTFLoader` with `DRACOLoader.setDecoderPath(new URL('assets/draco/', import.meta.env.BASE_URL).toString())` and a per-`moduleId:quality` promise cache. Keep states `idle | loading | ready | failed`; retain the error string and retry count. On success, index every Object3D with a `partId` extra and reject the module if its expected manifest parts are missing.

- [ ] **Step 5: Add the minimal app shell**

Create semantic regions for assembly tree, 3D canvas, inspector, and timeline. Display the required “参考级内部结构，非 Nikon 原厂 CAD” notice in the inspector footer. Initialize the renderer and preload modules 01 and 02.

- [ ] **Step 6: Test and build**

Run: `scripts/pnpm.ps1 test -- tests/unit/moduleLoader.test.ts`

Run: `scripts/pnpm.ps1 build`

Expected: PASS and `dist/index.html` exists with relative asset URLs.

- [ ] **Step 7: Commit renderer foundation**

```powershell
git add index.html src/main.ts src/app/createApp.ts src/viewer/createRenderer.ts src/viewer/moduleLoader.ts src/ui/appShell.ts src/styles/app.css public/assets/draco tests/unit/moduleLoader.test.ts
git commit -m "feat: add modular Three.js Z50II viewer"
```

---

### Task 11: Assembly Tree, Picking, and Part Inspector

**Files:**
- Create: `src/viewer/selectionController.ts`
- Create: `src/ui/assemblyTree.ts`
- Create: `src/ui/inspector.ts`
- Modify: `src/app/createApp.ts`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: loaded Object3D-to-part index and manifest parts.
- Produces: `SelectionController.select(partId | null)`, `pick(clientX, clientY)`, tree search/filter, isolate/hide commands, and synchronized inspector content.

- [ ] **Step 1: Add selection behavior with a replaceable highlight material**

Use raycasting against visible loaded meshes, walk ancestors until a `partId` is found, and highlight the selected part through the shared cyan `OutlinePass`. Never replace or mutate the selected object's material.

- [ ] **Step 2: Build the searchable assembly tree**

Group parts by eight modules, render Chinese name first and English name second, expose module load/error status, add a `data-testid="load-all-modules"` button, and add a search input matching `partId`, `nameZh`, or `nameEn`. Each part row uses `data-testid="part-<partId>"`. Clicking an unloaded part loads its module before selection.

- [ ] **Step 3: Build the inspector**

Show part ID, Chinese/English names, description, reconstruction badge, step number, dependency names, and current explode percentage. Include buttons for focus, hide, isolate, transparency, and reset selection. Use `data-testid="part-name-zh"`, `data-testid="dependency-warning"`, and `data-testid="part-progress"` for acceptance tests.

- [ ] **Step 4: Wire two-way synchronization**

Tree selection must select and focus the mesh; canvas picking must expand the correct tree module and populate the inspector. Clicking empty canvas clears selection without resetting assembly state.

- [ ] **Step 5: Add keyboard and accessibility behavior**

Use buttons for all actionable rows, visible focus rings, `Escape` to clear selection, `/` to focus search, and Chinese `aria-label` values for timeline and view controls.

- [ ] **Step 6: Build and manually smoke-test**

Run: `scripts/pnpm.ps1 build`; serve `dist`; verify selection from both tree and canvas, search for `传感器`, and inspect at least one unloaded module.

- [ ] **Step 7: Commit selection UI**

```powershell
git add src/viewer/selectionController.ts src/ui/assemblyTree.ts src/ui/inspector.ts src/app/createApp.ts src/styles/app.css
git commit -m "feat: add Z50II part selection and inspector"
```

---

### Task 12: Guided Disassembly Timeline

**Files:**
- Create: `src/domain/guidedSequence.ts`
- Create: `src/ui/timeline.ts`
- Modify: `src/app/createApp.ts`
- Test: `tests/unit/guidedSequence.test.ts`

**Interfaces:**
- Consumes: `AssemblyState`, manifest steps, and Object3D part index.
- Produces: `GuidedSequence.play`, `pause`, `next`, `previous`, `seek`, and `tick`; timeline UI and global explode slider.

- [ ] **Step 1: Write failing sequence tests**

```ts
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/assembly-manifest.valid.json';
import { createAssemblyState } from '../../src/domain/assemblyState';
import { GuidedSequence } from '../../src/domain/guidedSequence';
import { parseManifest } from '../../src/domain/manifest';

const manifest = parseManifest(fixture);

describe('guided sequence', () => {
it('seeks monotonically through steps and can reverse to assembled state', () => {
  const sequence = new GuidedSequence(manifest, createAssemblyState(manifest));
  sequence.seek(1);
  expect(sequence.snapshot().normalizedTime).toBe(1);
  expect(Object.values(sequence.snapshot().assembly.progress).every((p) => p === 1)).toBe(true);
  sequence.seek(0);
  expect(Object.values(sequence.snapshot().assembly.progress).every((p) => p === 0)).toBe(true);
});

it('pauses without advancing and clamps seek values', () => {
  const sequence = new GuidedSequence(manifest, createAssemblyState(manifest));
  sequence.play(); sequence.pause(); sequence.tick(5000);
  expect(sequence.snapshot().normalizedTime).toBe(0);
  sequence.seek(3);
  expect(sequence.snapshot().normalizedTime).toBe(1);
});
});
```

- [ ] **Step 2: Run the test and verify failure**

Expected: FAIL because `GuidedSequence` does not exist.

- [ ] **Step 3: Implement deterministic step interpolation**

Map normalized time onto ordered manifest steps. Within a step, animate its `partIds` with cubic ease-in-out; completed steps stay at progress `1`, future steps at `0`. Reverse seeking must apply the same mapping without violating dependency order.

- [ ] **Step 4: Build timeline controls**

Add mode selector, play/pause, previous/next, step title, elapsed step count, time slider, and full-explode slider. Use `data-testid="mode-guided"`, `data-testid="guided-play"`, and `data-testid="guided-progress"`; expose the aggregate normalized state as `data-assembly-progress` on the application root. Disable free-drag handles while guided playback is active.

- [ ] **Step 5: Apply offsets and camera presets**

On each animation frame, compute offsets through `getPartOffset` and update the selected Object3D group from its stored assembled transform. On step changes, tween the camera to the named preset while preserving OrbitControls target.

- [ ] **Step 6: Run tests and build**

Run: `scripts/pnpm.ps1 test -- tests/unit/guidedSequence.test.ts`

Run: `scripts/pnpm.ps1 build`

Expected: PASS; a complete forward and reverse sequence returns every object to its exact assembled matrix.

- [ ] **Step 7: Commit guided mode**

```powershell
git add src/domain/guidedSequence.ts src/ui/timeline.ts src/app/createApp.ts tests/unit/guidedSequence.test.ts
git commit -m "feat: add guided Z50II disassembly timeline"
```

---

### Task 13: Constrained Free Disassembly and Undo

**Files:**
- Create: `src/viewer/axisDragController.ts`
- Modify: `src/app/createApp.ts`
- Modify: `src/ui/inspector.ts`
- Test: `tests/unit/axisDragController.test.ts`

**Interfaces:**
- Consumes: selected part, its manifest axis/distance, camera rays, and Task 2 dependency engine.
- Produces: `AxisDragController.begin`, `update`, `end`, `cancel`; numeric progress slider; undo and reset commands.

- [ ] **Step 1: Write failing projection and dependency tests**

Test the pure projection helper:

```ts
import { expect, it } from 'vitest';
import { progressFromDistance, projectDeltaToAxis } from '../../src/viewer/axisDragController';

it('projects pointer travel onto the configured axis', () => {
expect(projectDeltaToAxis([3, 4, 0], [1, 0, 0])).toBe(3);
expect(progressFromDistance(75, 50)).toBe(1);
expect(progressFromDistance(-10, 50)).toBe(0);
});
```

Also assert dragging a locked part returns `{ allowed: false, missingPartIds: [...] }` and does not change its matrix.

- [ ] **Step 2: Run the test and verify failure**

Expected: FAIL because the controller module is absent.

- [ ] **Step 3: Implement axis-constrained pointer dragging**

At pointer-down, store the selected part's assembled matrix and choose a camera-facing drag plane containing the configured axis. Intersect pointer rays with that plane, project the delta onto the axis, divide by `explodeDistance`, clamp to `[0, 1]`, and update Task 2 state. OrbitControls must be disabled only during an active drag.

- [ ] **Step 4: Add handles and numeric control**

Display one bidirectional axis line and arrowhead at the selected part. The inspector slider identified by `data-testid="part-progress"` writes the same progress state as pointer dragging. Locked movement shows the exact Chinese names of missing prerequisites and provides tree links to those parts.

- [ ] **Step 5: Add undo, cancel, and reset behavior**

`Ctrl+Z` and `data-testid="undo-move"` invoke `undoLastMove`; `Escape` during a drag restores the pointer-down progress; `data-testid="reset-assembly"` returns all parts to zero and clears history. The free-mode switch uses `data-testid="mode-free"`. Switching to guided mode must cancel any active drag first.

- [ ] **Step 6: Run tests and build**

Run: `scripts/pnpm.ps1 test -- tests/unit/axisDragController.test.ts tests/unit/assemblyState.test.ts`

Run: `scripts/pnpm.ps1 build`

Expected: PASS; free dragging never changes rotation or scale and never exceeds configured travel.

- [ ] **Step 7: Commit free mode**

```powershell
git add src/viewer/axisDragController.ts src/app/createApp.ts src/ui/inspector.ts tests/unit/axisDragController.test.ts
git commit -m "feat: add constrained free disassembly controls"
```

---

### Task 14: Visibility, Transparency, Cutaway, and Lighting Presets

**Files:**
- Create: `src/viewer/visibilityController.ts`
- Create: `src/viewer/cutawayController.ts`
- Create: `src/viewer/lightingController.ts`
- Modify: `src/app/createApp.ts`
- Modify: `src/ui/inspector.ts`
- Test: `tests/unit/visibilityController.test.ts`

**Interfaces:**
- Consumes: loaded scene objects, material sets, renderer, and selected part.
- Produces: reversible hide/isolate/ghost operations, one movable clipping plane, studio/inspection lighting switch, and six camera presets.

- [ ] **Step 1: Write failing reversible-visibility tests**

Test that hide then show restores visibility, isolate then clear restores every prior visibility flag, and ghost then unghost restores each original material, opacity, transparency flag, and depth-write setting:

```ts
import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three';
import { expect, it } from 'vitest';
import { VisibilityController } from '../../src/viewer/visibilityController';

it('restores exact visibility and material state', () => {
  const material = new MeshStandardMaterial({ opacity: 1, transparent: false });
  const mesh = new Mesh(new BoxGeometry(), material);
  const controller = new VisibilityController([mesh]);
  controller.hide(mesh); controller.show(mesh);
  expect(mesh.visible).toBe(true);
  controller.ghost(mesh); controller.unghost(mesh);
  expect(mesh.material).toBe(material);
  expect(material.opacity).toBe(1);
  expect(material.transparent).toBe(false);
});
```

- [ ] **Step 2: Run the test and verify failure**

Expected: FAIL because `VisibilityController` does not exist.

- [ ] **Step 3: Implement visibility state snapshots**

Store original visibility and cloned material display properties in Maps keyed by Object3D UUID. Ghost mode uses opacity `0.18`, keeps metalness/roughness, disables depth write, and never mutates the source material shared by another object. Bind controls to `data-testid="hide-selected"`, `isolate-selected`, `ghost-selected`, and `visibility-reset`.

- [ ] **Step 4: Implement the cutaway controller**

Enable renderer local clipping, create one visible plane helper, and expose X/Y/Z orientation plus signed offset through `data-testid="cutaway-toggle"` and `cutaway-axis`. Disabling cutaway must remove all clipping planes from every material.

- [ ] **Step 5: Implement two lighting presets and six views**

Studio mode uses the HDR environment, key/fill/rim lights, soft shadows, exposure `1.0`, and normal materials. Inspection mode raises ambient readability, lowers reflection intensity, reduces shadow opacity, and sets exposure `1.15`. Expose the switch as `data-testid="lighting-preset"`. Add front, rear, left, right, top, and three-quarter camera presets fitted to current visible bounds.

- [ ] **Step 6: Test and build**

Run: `scripts/pnpm.ps1 test -- tests/unit/visibilityController.test.ts`

Run: `scripts/pnpm.ps1 build`

Expected: PASS; toggling every visual aid returns exact original object and material state.

- [ ] **Step 7: Commit inspection tools**

```powershell
git add src/viewer/visibilityController.ts src/viewer/cutawayController.ts src/viewer/lightingController.ts src/app/createApp.ts src/ui/inspector.ts tests/unit/visibilityController.test.ts
git commit -m "feat: add Z50II inspection and lighting tools"
```

---

### Task 15: Quality Profiles, Recovery, and Performance

**Files:**
- Create: `src/viewer/qualityController.ts`
- Modify: `src/viewer/moduleLoader.ts`
- Modify: `src/viewer/createRenderer.ts`
- Modify: `src/app/createApp.ts`
- Modify: `src/ui/assemblyTree.ts`
- Test: `tests/unit/moduleLoader.test.ts`

**Interfaces:**
- Consumes: high/low module URLs, loader states, renderer capabilities, and measured frame time.
- Produces: `high | low | auto` quality profiles, retry/fallback behavior, WebGL compatibility messaging, and a performance report.

- [ ] **Step 1: Add failing recovery and profile tests**

Add tests that auto mode selects low when median frame time exceeds `22.2 ms` over 120 frames, high when it stays below `16.7 ms`, failed modules retain their error and retry count, and missing HDR invokes the neutral RoomEnvironment without rejecting the application start:

```ts
import { expect, it } from 'vitest';
import { chooseAutoQuality } from '../../src/viewer/qualityController';

it('chooses a stable profile from 120 moving-frame samples', () => {
  expect(chooseAutoQuality(Array(120).fill(23))).toBe('low');
  expect(chooseAutoQuality(Array(120).fill(16))).toBe('high');
});
```

- [ ] **Step 2: Run the tests and verify failure**

Expected: FAIL because quality selection and fallback hooks are absent.

- [ ] **Step 3: Implement quality profiles**

High uses high GLBs, pixel ratio cap `2`, 2048 shadow maps, AO enabled, and full environment intensity. Low uses low GLBs, pixel ratio cap `1.25`, 1024 shadow maps, reduced AO samples, and identical assembly metadata. Auto starts high, samples frame time only when the camera is moving, and changes at most once every 10 seconds.

- [ ] **Step 4: Implement recoverable loading**

Show per-module progress and retry in the assembly tree; each retry button uses `data-testid="retry-<moduleId>"`. If a texture is missing, replace only the affected material with a magenta-free neutral gray fallback and record its URL. If the HDR fails, switch lighting without affecting part loading. If WebGL2 creation fails, replace the canvas with a Chinese compatibility message naming Chrome/Edge desktop as supported targets.

- [ ] **Step 5: Record geometry, texture, load, and FPS metrics**

Create `artifacts/validation/performance.json` containing browser version, GPU renderer string, viewport, quality profile, total triangles, texture bytes, initial load time, all-modules load time, median FPS during orbit, and minimum FPS during full explosion. Measure at 1920 × 1080 in both Chrome and Edge.

- [ ] **Step 6: Test and commit**

Run: `scripts/pnpm.ps1 test -- tests/unit/moduleLoader.test.ts`

Run: `scripts/pnpm.ps1 build`

Expected: PASS; high/low switching retains selection and assembly progress.

```powershell
git add src/viewer/qualityController.ts src/viewer/moduleLoader.ts src/viewer/createRenderer.ts src/app/createApp.ts src/ui/assemblyTree.ts tests/unit/moduleLoader.test.ts artifacts/validation/performance.json
git commit -m "perf: add adaptive quality and viewer recovery"
```

---

### Task 16: End-to-End QA and Offline Release Package

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/viewer.spec.ts`
- Create: `scripts/build-all.ps1`
- Create: `scripts/start-viewer.ps1`
- Create: `scripts/package-release.ps1`
- Create: `README.md`
- Create: `artifacts/validation/acceptance.md`
- Create: `release/Z50II-Explorer.zip`

**Interfaces:**
- Consumes: all Blender and web outputs.
- Produces: repeatable full build, browser acceptance tests, launch instructions, validation record, and one offline ZIP.

- [ ] **Step 1: Configure Chrome and Edge Playwright projects**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  webServer: { command: 'powershell -ExecutionPolicy Bypass -File scripts/pnpm.ps1 dev --host 127.0.0.1', port: 5173, reuseExistingServer: true },
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'chrome', use: { channel: 'chrome', viewport: { width: 1440, height: 900 } } },
    { name: 'edge', use: { channel: 'msedge', viewport: { width: 1440, height: 900 } } },
  ],
});
```

- [ ] **Step 2: Write the complete E2E acceptance test**

Test the normal workflow and recovery workflow with stable locators:

```ts
import { expect, test } from '@playwright/test';

test('loads 100 parts and supports both disassembly modes', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto('/');
  await expect(page.getByText('参考级内部结构，非 Nikon 原厂 CAD')).toBeVisible();
  await page.getByTestId('load-all-modules').click();
  await expect(page.locator('[data-testid^="part-Z50II-"]')).toHaveCount(100);

  await page.getByTestId('part-Z50II-04-001').click();
  await page.getByTestId('mode-free').click();
  await page.getByTestId('part-progress').evaluate((element: HTMLInputElement) => {
    element.value = '0.5';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.getByTestId('dependency-warning')).toContainText(/后盖|屏蔽罩/);

  await page.getByTestId('part-Z50II-03-009').click();
  await expect(page.getByTestId('part-name-zh')).toContainText('传感器');
  await page.getByTestId('mode-guided').click();
  await page.getByTestId('guided-progress').evaluate((element: HTMLInputElement) => {
    element.value = '1';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('[data-assembly-progress="1"]')).toBeVisible();
  await page.getByTestId('guided-progress').evaluate((element: HTMLInputElement) => {
    element.value = '0';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('[data-assembly-progress="0"]')).toBeVisible();

  await page.getByTestId('mode-free').click();
  await page.getByTestId('part-Z50II-08-011').click();
  const slider = page.getByTestId('part-progress');
  await slider.evaluate((element: HTMLInputElement) => {
    element.value = '0.5';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(slider).toHaveValue('0.5');
  await page.getByTestId('undo-move').click();
  await expect(slider).toHaveValue('0');

  await page.getByTestId('hide-selected').click();
  await expect(page.getByTestId('part-name-zh')).not.toBeEmpty();
  await page.getByTestId('visibility-reset').click();
  await page.getByTestId('isolate-selected').click();
  await expect(page.getByTestId('part-name-zh')).not.toBeEmpty();
  await page.getByTestId('visibility-reset').click();
  await page.getByTestId('ghost-selected').click();
  await page.getByTestId('visibility-reset').click();
  await page.getByTestId('cutaway-toggle').click();
  await page.getByTestId('cutaway-toggle').click();
  await page.getByTestId('lighting-preset').selectOption('inspection');
  await page.getByTestId('lighting-preset').selectOption('studio');
  await expect(page.locator('canvas')).toHaveScreenshot('z50ii-assembled-studio.png', { maxDiffPixelRatio: 0.02 });
  expect(consoleErrors).toEqual([]);
});

test('offers module retry after a GLB failure', async ({ page }) => {
  await page.route('**/08_io_flex_fasteners-high.glb', (route) => route.abort());
  await page.goto('/');
  await page.getByTestId('load-all-modules').click();
  await expect(page.getByTestId('retry-08_io_flex_fasteners')).toBeVisible();
});
```

- [ ] **Step 3: Run E2E tests and verify both browsers**

Run: `scripts/pnpm.ps1 test:e2e`

Expected: Chrome and Edge projects pass. Save failure traces only when a test fails; fix the cause before continuing.

- [ ] **Step 4: Add one-command full build**

`scripts/build-all.ps1` must run, in order: Blender master build, scene validation, HDR/reference renders, GLB/manifest export, Blender export validation, `scripts/pnpm.ps1 test`, `scripts/pnpm.ps1 build`, and Playwright tests. It must stop on the first nonzero exit code.

- [ ] **Step 5: Add a runtime with no Node dependency**

Create `scripts/start-viewer.ps1` that locates Python, starts `python -m http.server 4173 --directory dist`, opens `http://127.0.0.1:4173`, and prints how to stop the server. Copy this script beside the packaged `dist/` directory.

- [ ] **Step 6: Package the release**

`scripts/package-release.ps1` must create `release/Z50II-Explorer/` containing `dist/`, `start-viewer.ps1`, `z50ii_master.blend`, `textures/`, `renders/`, `README.md`, and `acceptance.md`, then create `release/Z50II-Explorer.zip`. It must refuse to package unless all required files exist.

- [ ] **Step 7: Complete visual and functional acceptance**

Inspect `assembled-studio.png`, `exploded-studio.png`, and browser screenshots at original resolution. Record every Section 12 spec criterion as `PASS` with evidence path in `artifacts/validation/acceptance.md`; record the reference-grade disclaimer and the exact Chrome/Edge versions. Run `git diff --check`, `scripts/pnpm.ps1 check`, Blender assertions, and E2E one final time.

- [ ] **Step 8: Commit the release workflow and final artifacts**

```powershell
git add playwright.config.ts tests/e2e/viewer.spec.ts scripts/build-all.ps1 scripts/start-viewer.ps1 scripts/package-release.ps1 README.md artifacts/validation release/Z50II-Explorer.zip
git commit -m "release: package Nikon Z50II interactive explorer"
```

---

## Final Verification Commands

Run these from the repository root after Task 16:

```powershell
scripts/run-blender.ps1 --background artifacts/z50ii_master.blend --python blender/validate_scene.py
scripts/run-blender.ps1 --background --factory-startup --python blender/tests/assert_exports.py
scripts/pnpm.ps1 test
scripts/pnpm.ps1 build
scripts/pnpm.ps1 test:e2e
git diff --check
git status --short
```

Expected final state: all commands pass; Blender validation reports 100 unique parts and eight modules; the web tests pass in Chrome and Edge; `release/Z50II-Explorer.zip` exists; only intentionally untracked local dependencies under ignored paths remain.

## Version Sources

- Blender 4.5.12 LTS: <https://www.blender.org/releases/4-5/>
- Three.js 0.185.1: <https://www.npmjs.com/package/three>
- Vite 8.2.2: <https://www.npmjs.com/package/vite>
- Vitest 4.1.10: <https://www.npmjs.com/package/vitest>
- TypeScript 7.0.2: <https://www.npmjs.com/package/typescript>
- Playwright 1.62.1: <https://www.npmjs.com/package/@playwright/test>
