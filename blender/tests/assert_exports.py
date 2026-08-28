"""Integration assertions for the modular browser export contract."""

from __future__ import annotations

import json
import math
from pathlib import Path, PurePosixPath
import struct
from typing import Any
from urllib.parse import urlsplit

import bpy


ROOT = Path(__file__).resolve().parents[2]
MASTER_BLEND = ROOT / "artifacts" / "z50ii_master.blend"
MANIFEST_PATH = ROOT / "public" / "assembly-manifest.json"
MODULE_IDS = (
    "01_chassis_front",
    "02_outer_shell_controls",
    "03_mount_shutter_sensor",
    "04_mainboard_thermal",
    "05_power_storage",
    "06_evf_top_flash",
    "07_rear_lcd_controls",
    "08_io_flex_fasteners",
)
QUALITY_LEVELS = ("high", "low")


def blender_axis_to_gltf(axis: Any) -> list[float]:
    x, y, z = axis
    return [round(float(x), 6), round(float(z), 6), round(-float(y), 6)]


def assert_relative_asset_path(value: str) -> None:
    parsed = urlsplit(value)
    assert not parsed.scheme and not parsed.netloc, f"asset URL must be relative: {value}"
    path = PurePosixPath(parsed.path)
    assert not path.is_absolute(), f"asset URL must be relative: {value}"
    assert ".." not in path.parts, f"asset URL cannot escape public/: {value}"
    assert "\\" not in value, f"asset URL must use browser separators: {value}"


def assert_acyclic(parts: list[dict[str, Any]]) -> None:
    dependencies = {part["partId"]: part["dependsOn"] for part in parts}
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(part_id: str) -> None:
        if part_id in visited:
            return
        assert part_id not in visiting, f"dependency cycle includes {part_id}"
        visiting.add(part_id)
        for dependency in dependencies[part_id]:
            assert dependency in dependencies, f"{part_id} has missing dependency {dependency}"
            visit(dependency)
        visiting.remove(part_id)
        visited.add(part_id)

    for part_id in dependencies:
        visit(part_id)


def load_master_catalog() -> tuple[dict[str, dict[str, Any]], dict[str, tuple[float, float, float]]]:
    assert MASTER_BLEND.is_file(), f"missing master scene: {MASTER_BLEND}"
    bpy.ops.wm.open_mainfile(filepath=str(MASTER_BLEND), load_ui=False)
    roots = [obj for obj in bpy.data.objects if obj.get("partId")]
    assert len(roots) == 100, f"master scene must contain 100 parts, found {len(roots)}"

    catalog: dict[str, dict[str, Any]] = {}
    origins: dict[str, tuple[float, float, float]] = {}
    for obj in roots:
        part_id = str(obj["partId"])
        assert part_id not in catalog, f"duplicate master partId: {part_id}"
        catalog[part_id] = {
            "moduleId": str(obj["moduleId"]),
            "parentId": str(obj["parentId"]) if obj.get("parentId") else None,
            "step": int(obj["step"]),
            "explodeAxis": blender_axis_to_gltf(obj["explodeAxis"]),
            "explodeDistance": round(float(obj["explodeDistance"]), 6),
            "dependsOn": [str(value) for value in obj["dependsOn"]],
        }
        origins[part_id] = tuple(round(float(value), 6) for value in obj.matrix_world.translation)
    return catalog, origins


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def imported_part_roots() -> dict[str, bpy.types.Object]:
    result: dict[str, bpy.types.Object] = {}
    for obj in bpy.data.objects:
        part_id = obj.get("partId")
        if part_id:
            part_id = str(part_id)
            assert part_id not in result, f"duplicate imported partId: {part_id}"
            result[part_id] = obj
    return result


def glb_json(path: Path) -> dict[str, Any]:
    with path.open("rb") as handle:
        magic, version, _length = struct.unpack("<4sII", handle.read(12))
        assert magic == b"glTF" and version == 2, f"not a glTF 2 GLB: {path}"
        chunk_length, chunk_type = struct.unpack("<I4s", handle.read(8))
        assert chunk_type == b"JSON", f"first GLB chunk is not JSON: {path}"
        return json.loads(handle.read(chunk_length).decode("utf-8"))


catalog, master_origins = load_master_catalog()
assert blender_axis_to_gltf((1.0, 0.0, 0.0)) == [1.0, 0.0, -0.0]
assert blender_axis_to_gltf((0.0, 1.0, 0.0)) == [0.0, 0.0, -1.0]
assert blender_axis_to_gltf((0.0, 0.0, 1.0)) == [0.0, 1.0, -0.0]
expected_exports = [
    ROOT / "public" / "assets" / "models" / quality / f"{module_id}.glb"
    for quality in QUALITY_LEVELS
    for module_id in MODULE_IDS
]
missing_exports = [str(path.relative_to(ROOT)) for path in expected_exports if not path.is_file()]
assert not missing_exports, f"missing 16 modular GLB exports: {missing_exports}"
actual_exports = sorted((ROOT / "public" / "assets" / "models").glob("*/*.glb"))
assert actual_exports == sorted(expected_exports), "model directory must contain exactly the 16 contract GLBs"
assert MANIFEST_PATH.is_file(), f"missing assembly manifest: {MANIFEST_PATH.relative_to(ROOT)}"

manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
assert manifest["schemaVersion"] == 1
assert manifest["product"]["name"] == "Nikon Z50II"
assert "reference" in manifest["product"]["disclaimerEn"].lower()
assert "manufacturer cad" in manifest["product"]["disclaimerEn"].lower()

modules = manifest["modules"]
parts = manifest["parts"]
steps = manifest["steps"]
assert len(modules) == 8
assert [module["moduleId"] for module in modules] == list(MODULE_IDS)
assert len(parts) == 100
assert len({part["partId"] for part in parts}) == 100
assert [part["partId"] for part in parts] == [
    part["partId"] for part in sorted(parts, key=lambda value: (value["step"], value["partId"]))
]
assert [step["step"] for step in steps] == list(range(1, 41))
assert {module["moduleId"] for module in modules if module["preload"]} == set(MODULE_IDS[:2])

for module in modules:
    for quality in QUALITY_LEVELS:
        assert_relative_asset_path(module["urls"][quality])
        expected_url = f"assets/models/{quality}/{module['moduleId']}.glb"
        assert module["urls"][quality] == expected_url

manifest_by_id = {part["partId"]: part for part in parts}
assert set(manifest_by_id) == set(catalog)
for part_id, expected in catalog.items():
    part = manifest_by_id[part_id]
    for key in ("moduleId", "parentId", "step", "explodeAxis", "explodeDistance", "dependsOn"):
        assert part[key] == expected[key], f"{part_id} has wrong {key}: {part[key]} != {expected[key]}"
    assert math.isclose(math.dist(part["explodeAxis"], (0.0, 0.0, 0.0)), 1.0, abs_tol=1e-5)
    for dependency in part["dependsOn"]:
        assert manifest_by_id[dependency]["step"] < part["step"], (
            f"dependency {dependency} must strictly precede {part_id}"
        )

assert_acyclic(parts)

step_part_ids = []
for step in steps:
    expected_ids = [part["partId"] for part in parts if part["step"] == step["step"]]
    assert step["partIds"] == expected_ids, f"step {step['step']} part order/catalog mismatch"
    step_part_ids.extend(step["partIds"])
assert step_part_ids == [part["partId"] for part in parts]

for quality in QUALITY_LEVELS:
    for module_id in MODULE_IDS:
        glb_path = ROOT / "public" / "assets" / "models" / quality / f"{module_id}.glb"
        document = glb_json(glb_path)
        assert "KHR_draco_mesh_compression" in document.get("extensionsUsed", []), f"Draco absent: {glb_path}"
        primitives = [primitive for mesh in document.get("meshes", []) for primitive in mesh.get("primitives", [])]
        assert primitives and all(
            "KHR_draco_mesh_compression" in primitive.get("extensions", {}) for primitive in primitives
        ), f"not every mesh primitive is Draco-compressed: {glb_path}"
        reset_scene()
        result = bpy.ops.import_scene.gltf(filepath=str(glb_path))
        assert result == {"FINISHED"}, f"failed to import {glb_path}"
        imported = imported_part_roots()
        expected_ids = {part_id for part_id, value in catalog.items() if value["moduleId"] == module_id}
        assert set(imported) == expected_ids, (
            f"{quality}/{module_id}.glb part IDs differ: "
            f"missing={sorted(expected_ids - set(imported))}, extra={sorted(set(imported) - expected_ids)}"
        )
        for part_id, obj in imported.items():
            for display_key in ("nameZh", "nameEn", "descriptionZh", "descriptionEn"):
                assert obj.get(display_key) is None, f"{display_key} leaked into GLB node extras for {part_id}"
            actual_origin = tuple(round(float(value), 6) for value in obj.matrix_world.translation)
            assert actual_origin == master_origins[part_id], (
                f"{quality}/{module_id}.glb lost shared-origin alignment for {part_id}: "
                f"{actual_origin} != {master_origins[part_id]}"
            )

print("Modular export assertions passed: 16 GLBs, 8 modules, 100 aligned parts, 40 steps")
