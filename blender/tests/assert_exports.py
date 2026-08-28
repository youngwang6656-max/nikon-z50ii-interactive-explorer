"""Integration assertions for the modular browser export contract."""

from __future__ import annotations

import json
import math
from pathlib import Path, PurePosixPath
import re
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
PUBLIC_ASSETS = (ROOT / "public" / "assets").resolve()
PROTECTED_TOKENS = (
    "decal",
    "glass",
    "legend",
    "label",
    "text",
    "flex",
    "cable",
    "screw",
    "washer",
    "fastener",
    "bolt",
    "nut",
)
FASTENER_IDS = {f"Z50II-08-{index:03d}" for index in range(11, 18)}


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


def normalized_name(value: str) -> str:
    return re.sub(r"\.\d{3}$", "", value)


def source_owner_id(obj: bpy.types.Object) -> str | None:
    current = obj
    while current is not None:
        if current.get("partId"):
            return str(current["partId"])
        if current.get("attachedPartId"):
            return str(current["attachedPartId"])
        current = current.parent
    return None


def source_materials(obj: bpy.types.Object) -> tuple[str, ...]:
    used = {polygon.material_index for polygon in obj.data.polygons}
    return tuple(
        sorted(
            material.name
            for index, material in enumerate(obj.data.materials)
            if index in used and material is not None
        )
    )


def source_triangle_count(obj: bpy.types.Object) -> int:
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    try:
        mesh.calc_loop_triangles()
        return len(mesh.loop_triangles)
    finally:
        evaluated.to_mesh_clear()


def load_master_contract() -> tuple[
    dict[str, dict[str, Any]],
    dict[str, tuple[float, float, float]],
    dict[str, dict[tuple[str, str, tuple[str, ...]], int]],
    set[str],
]:
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

    owned_meshes = {module_id: {} for module_id in MODULE_IDS}
    decal_labels: set[str] = set()
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        owner_id = source_owner_id(obj)
        if owner_id not in catalog:
            continue
        module_id = catalog[owner_id]["moduleId"]
        signature = (normalized_name(obj.name), owner_id, source_materials(obj))
        assert signature not in owned_meshes[module_id], f"duplicate master mesh signature: {signature}"
        owned_meshes[module_id][signature] = source_triangle_count(obj)
        if obj.get("decalLabel"):
            decal_labels.add(str(obj["decalLabel"]))
    assert len(decal_labels) == 10, f"expected ten authored decal labels, found {sorted(decal_labels)}"
    return catalog, origins, owned_meshes, decal_labels


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


def node_owner_id(document: dict[str, Any], node_index: int, parents: dict[int, int]) -> str | None:
    current_index: int | None = node_index
    while current_index is not None:
        extras = document["nodes"][current_index].get("extras", {})
        if extras.get("partId"):
            return str(extras["partId"])
        if extras.get("attachedPartId"):
            return str(extras["attachedPartId"])
        current_index = parents.get(current_index)
    return None


def serialized_meshes(
    document: dict[str, Any],
) -> tuple[dict[tuple[str, str, tuple[str, ...]], int], set[str]]:
    parents = {
        child_index: parent_index
        for parent_index, node in enumerate(document["nodes"])
        for child_index in node.get("children", [])
    }
    result: dict[tuple[str, str, tuple[str, ...]], int] = {}
    labels: set[str] = set()
    for node_index, node in enumerate(document["nodes"]):
        if "mesh" not in node:
            continue
        owner_id = node_owner_id(document, node_index, parents)
        assert owner_id, f"serialized mesh has no selectable owner: {node['name']}"
        mesh = document["meshes"][node["mesh"]]
        materials = tuple(
            sorted(
                {
                    document["materials"][primitive["material"]]["name"]
                    for primitive in mesh["primitives"]
                    if "material" in primitive
                }
            )
        )
        signature = (normalized_name(node["name"]), owner_id, materials)
        assert signature not in result, f"duplicate serialized mesh signature: {signature}"
        result[signature] = sum(
            int(document["accessors"][primitive["indices"]]["count"]) // 3
            for primitive in mesh["primitives"]
        )
        if node.get("extras", {}).get("decalLabel"):
            labels.add(str(node["extras"]["decalLabel"]))
    return result, labels


def is_protected(signature: tuple[str, str, tuple[str, ...]]) -> bool:
    name, owner_id, materials = signature
    text = " ".join((name, *materials)).lower()
    return owner_id in FASTENER_IDS or any(token in text for token in PROTECTED_TOKENS)


def assert_packed_binary_has_no_orphans(document: dict[str, Any], path: Path) -> None:
    ranges = sorted(
        (
            int(view.get("byteOffset", 0)),
            int(view.get("byteOffset", 0)) + int(view["byteLength"]),
        )
        for view in document.get("bufferViews", [])
    )
    cursor = 0
    for start, end in ranges:
        assert 0 <= start - cursor <= 3, f"orphaned GLB buffer payload in {path}: {cursor}..{start}"
        cursor = end
    assert 0 <= int(document["buffers"][0]["byteLength"]) - cursor <= 3, (
        f"orphaned GLB buffer tail in {path}"
    )


catalog, master_origins, expected_meshes, expected_decal_labels = load_master_contract()
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

serialized_decal_labels: set[str] = set()
for decal_module_id in ("02_outer_shell_controls", "03_mount_shutter_sensor", "07_rear_lcd_controls"):
    decal_document = glb_json(
        ROOT / "public" / "assets" / "models" / "high" / f"{decal_module_id}.glb"
    )
    _decal_meshes, module_decal_labels = serialized_meshes(decal_document)
    serialized_decal_labels.update(module_decal_labels)
assert serialized_decal_labels == expected_decal_labels, (
    f"authored decal nodes are missing from GLBs: {sorted(expected_decal_labels - serialized_decal_labels)}"
)

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

serialized_by_quality: dict[str, dict[str, dict[tuple[str, str, tuple[str, ...]], int]]] = {
    quality: {} for quality in QUALITY_LEVELS
}
referenced_images: list[Path] = []
for quality in QUALITY_LEVELS:
    for module_id in MODULE_IDS:
        glb_path = ROOT / "public" / "assets" / "models" / quality / f"{module_id}.glb"
        document = glb_json(glb_path)
        assert "KHR_draco_mesh_compression" in document.get("extensionsUsed", []), f"Draco absent: {glb_path}"
        primitives = [primitive for mesh in document.get("meshes", []) for primitive in mesh.get("primitives", [])]
        assert primitives and all(
            "KHR_draco_mesh_compression" in primitive.get("extensions", {}) for primitive in primitives
        ), f"not every mesh primitive is Draco-compressed: {glb_path}"
        actual_meshes, decal_labels = serialized_meshes(document)
        assert set(actual_meshes) == set(expected_meshes[module_id]), (
            f"{quality}/{module_id}.glb owned mesh/material signatures differ: "
            f"missing={sorted(set(expected_meshes[module_id]) - set(actual_meshes))}, "
            f"extra={sorted(set(actual_meshes) - set(expected_meshes[module_id]))}"
        )
        if quality == "high":
            triangle_differences = {
                signature: (expected_meshes[module_id][signature], actual_meshes[signature])
                for signature in actual_meshes
                if actual_meshes[signature] != expected_meshes[module_id][signature]
            }
            assert all(abs(expected - actual) <= 1 for expected, actual in triangle_differences.values()), (
                f"high/{module_id}.glb does not preserve authored per-node triangle counts: "
                f"{triangle_differences}"
            )
        serialized_by_quality[quality][module_id] = actual_meshes
        if module_id in {"02_outer_shell_controls", "03_mount_shutter_sensor", "07_rear_lcd_controls"}:
            expected_module_labels = {
                signature[0].removeprefix("Z50II_Decal_")
                for signature in expected_meshes[module_id]
                if signature[0].startswith("Z50II_Decal_")
            }
            assert decal_labels == expected_module_labels

        for image_record in document.get("images", []):
            assert "bufferView" not in image_record, f"embedded image remains in {glb_path}"
            uri = image_record.get("uri")
            assert isinstance(uri, str) and uri and not uri.startswith("data:"), f"image URI absent in {glb_path}"
            parsed = urlsplit(uri)
            assert not parsed.scheme and not parsed.netloc and "\\" not in uri
            assert not PurePosixPath(parsed.path).is_absolute()
            resolved = (glb_path.parent / Path(*PurePosixPath(parsed.path).parts)).resolve()
            assert resolved.is_relative_to(PUBLIC_ASSETS), f"image URI escapes public assets: {uri}"
            assert resolved.is_file(), f"image URI does not resolve offline: {uri}"
            referenced_images.append(resolved)
        assert_packed_binary_has_no_orphans(document, glb_path)
        reset_scene()
        result = bpy.ops.import_scene.gltf(filepath=str(glb_path))
        assert result == {"FINISHED"}, f"failed to import {glb_path}"
        loaded_images = [image for image in bpy.data.images if image.source == "FILE"]
        assert len(loaded_images) == len(document.get("images", [])), (
            f"{glb_path} did not load every external material image"
        )
        assert all(
            Path(bpy.path.abspath(image.filepath)).is_file() and image.size[0] > 0 and image.size[1] > 0
            for image in loaded_images
        ), (
            f"{glb_path} contains an unresolved external material image"
        )
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

assert expected_decal_labels == {"Nikon", "Z50II", "MENU", "DISP", "ISO", "MODE", "USB", "HDMI", "MIC", "SENSOR"}
assert len(referenced_images) > len(set(referenced_images)), "module textures were not shared across GLBs"
assert all(path.parent == ROOT / "public" / "assets" / "textures" for path in set(referenced_images))

protected_dense_samples = []
for module_id in MODULE_IDS:
    high_meshes = serialized_by_quality["high"][module_id]
    low_meshes = serialized_by_quality["low"][module_id]
    assert set(high_meshes) == set(low_meshes)
    for signature, high_triangles in high_meshes.items():
        low_triangles = low_meshes[signature]
        if is_protected(signature):
            assert low_triangles == high_triangles, f"protected mesh was decimated: {signature}"
            if high_triangles > 2000:
                protected_dense_samples.append(signature)
        elif high_triangles > 2000:
            ratio = low_triangles / high_triangles
            assert abs(ratio - 0.38) <= 0.005, f"wrong low-detail ratio {ratio:.4f}: {signature}"
        else:
            assert low_triangles == high_triangles, f"mesh at/below threshold was decimated: {signature}"
assert protected_dense_samples, "policy coverage requires a protected mesh above 2,000 triangles"

print(
    "Modular export assertions passed: 16 GLBs, 8 modules, 100 aligned parts, "
    "10 decals, shared textures, and enforced high/low policy"
)
