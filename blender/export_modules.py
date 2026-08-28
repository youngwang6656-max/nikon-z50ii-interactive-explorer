"""Export the Z50II master scene as eight high/low modular GLBs and a manifest."""

from __future__ import annotations

from contextlib import contextmanager
from hashlib import sha256
import json
import os
from pathlib import Path
import struct
import sys
from typing import Any, Iterable, Iterator

import bpy


BLENDER_ROOT = Path(__file__).resolve().parent
ROOT = BLENDER_ROOT.parent
if str(BLENDER_ROOT) not in sys.path:
    sys.path.insert(0, str(BLENDER_ROOT))

from validate_scene import validate_scene
from z50ii.constants import MM, MODULE_COLLECTIONS


MODEL_ROOT = ROOT / "public" / "assets" / "models"
TEXTURE_ROOT = ROOT / "public" / "assets" / "textures"
MANIFEST_PATH = ROOT / "public" / "assembly-manifest.json"
DISPLAY_PROPERTY_KEYS = ("nameZh", "nameEn", "descriptionZh", "descriptionEn")
PROTECTED_LOW_DETAIL_TOKENS = (
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
MODULE_NAMES = {
    "01_chassis_front": ("承力骨架与前部结构", "Chassis and front structure"),
    "02_outer_shell_controls": ("外壳与外部操作件", "Outer shell and external controls"),
    "03_mount_shutter_sensor": ("卡口、快门与传感器", "Mount, shutter, and sensor"),
    "04_mainboard_thermal": ("主板与散热系统", "Mainboard and thermal system"),
    "05_power_storage": ("供电与存储", "Power and storage"),
    "06_evf_top_flash": ("电子取景器与顶部闪光灯", "EVF and top flash"),
    "07_rear_lcd_controls": ("后部显示屏与操作件", "Rear LCD and controls"),
    "08_io_flex_fasteners": ("接口、排线与紧固件", "I/O, flex cables, and fasteners"),
}
CAMERA_PRESETS = {
    "01_chassis_front": "three-quarter",
    "02_outer_shell_controls": "front",
    "03_mount_shutter_sensor": "front",
    "04_mainboard_thermal": "rear",
    "05_power_storage": "bottom",
    "06_evf_top_flash": "top",
    "07_rear_lcd_controls": "rear",
    "08_io_flex_fasteners": "left",
}


def blender_axis_to_gltf(axis: Iterable[float]) -> list[float]:
    """Convert Blender +Z-up vectors to glTF +Y-up without changing length."""
    x, y, z = axis
    return [round(float(x), 6), round(float(z), 6), round(-float(y), 6)]


def millimeters_to_meters(distance_mm: float) -> float:
    return round(float(distance_mm) * 0.001, 6)


def evaluated_triangle_count(obj: bpy.types.Object, scene: bpy.types.Scene) -> int:
    assert bpy.context.scene == scene, "triangle counting requires the temporary scene to be active"
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        mesh.calc_loop_triangles()
        return len(mesh.loop_triangles)
    finally:
        evaluated.to_mesh_clear()


def is_low_detail_protected(obj: bpy.types.Object) -> bool:
    names = [obj.name.lower()]
    names.extend(material.name.lower() for material in obj.data.materials if material is not None)
    current = obj
    while current is not None:
        part_id = str(current.get("partId", ""))
        if part_id.startswith("Z50II-08-01"):
            return True
        names.append(str(current.get("detailRole", "")).lower())
        names.append(str(current.get("surfaceRole", "")).lower())
        current = current.parent
    return any(token in name for token in PROTECTED_LOW_DETAIL_TOKENS for name in names)


def source_owner_id(obj: bpy.types.Object) -> str | None:
    current = obj
    while current is not None:
        if current.get("partId"):
            return str(current["partId"])
        if current.get("attachedPartId"):
            return str(current["attachedPartId"])
        current = current.parent
    return None


def module_source_objects(module_id: str) -> list[bpy.types.Object]:
    source_collection = bpy.data.collections[module_id]
    module_part_ids = {
        str(obj["partId"])
        for obj in source_collection.all_objects
        if obj.get("partId") and str(obj.get("moduleId")) == module_id
    }
    owned = {
        obj
        for obj in bpy.data.objects
        if source_owner_id(obj) in module_part_ids
    }
    owned.update(source_collection.all_objects)
    return sorted(owned, key=lambda obj: obj.name)


def remove_export_scene(
    scene: bpy.types.Scene | None,
    objects: list[bpy.types.Object],
    collections: list[bpy.types.Collection],
) -> None:
    meshes = {obj.data for obj in objects if obj.type == "MESH" and obj.data is not None}
    if scene is not None and scene.name in bpy.data.scenes:
        bpy.data.scenes.remove(scene)
    for obj in objects:
        if obj.name in bpy.data.objects:
            bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in meshes:
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for collection in collections:
        if collection.name in bpy.data.collections and collection.users == 0:
            bpy.data.collections.remove(collection)


@contextmanager
def temporary_module_scene(
    module_id: str, quality: str
) -> Iterator[tuple[bpy.types.Scene, list[bpy.types.Object]]]:
    previous_scene = bpy.context.window.scene
    export_scene: bpy.types.Scene | None = None
    export_collections: list[bpy.types.Collection] = []
    duplicates: list[bpy.types.Object] = []
    try:
        export_scene = bpy.data.scenes.new(f"EXPORT_{quality}_{module_id}")
        export_collection = bpy.data.collections.new(f"EXPORT_COLLECTION_{quality}_{module_id}")
        export_collections.append(export_collection)
        export_scene.collection.children.link(export_collection)

        copies: dict[bpy.types.Object, bpy.types.Object] = {}
        for source in module_source_objects(module_id):
            if source.type not in {"MESH", "EMPTY"}:
                raise TypeError(f"unsupported module object type {source.type}: {source.name}")
            duplicate = source.copy()
            duplicates.append(duplicate)
            if source.type == "MESH" and source.data is not None:
                duplicate.data = source.data.copy()
            export_collection.objects.link(duplicate)
            copies[source] = duplicate

        for source, duplicate in copies.items():
            if source.parent in copies:
                duplicate.parent = copies[source.parent]
                duplicate.matrix_parent_inverse = source.matrix_parent_inverse.copy()
                duplicate.matrix_local = source.matrix_local.copy()
            else:
                duplicate.parent = None
                duplicate.matrix_world = source.matrix_world.copy()

            for key in DISPLAY_PROPERTY_KEYS:
                if key in duplicate:
                    del duplicate[key]

        bpy.context.window.scene = export_scene
        mesh_objects = [obj for obj in copies.values() if obj.type == "MESH"]
        bpy.ops.object.select_all(action="DESELECT")
        for obj in mesh_objects:
            obj.select_set(True)
        if mesh_objects:
            bpy.context.view_layer.objects.active = mesh_objects[0]
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

        for obj in mesh_objects:
            triangulate = obj.modifiers.new(name="Z50II_ExportTriangulate", type="TRIANGULATE")
            triangulate.keep_custom_normals = True

        if quality == "low":
            for obj in mesh_objects:
                triangle_count = evaluated_triangle_count(obj, export_scene)
                if triangle_count > 2000 and not is_low_detail_protected(obj):
                    decimate = obj.modifiers.new(name="Z50II_LowDetailDecimate", type="DECIMATE")
                    decimate.ratio = 0.38
                    decimate.use_collapse_triangulate = True
        yield export_scene, duplicates
    finally:
        if previous_scene.name in bpy.data.scenes:
            bpy.context.window.scene = previous_scene
        remove_export_scene(export_scene, duplicates, export_collections)


def read_glb(path: Path) -> tuple[dict[str, Any], bytes]:
    payload = path.read_bytes()
    magic, version, total_length = struct.unpack_from("<4sII", payload, 0)
    assert magic == b"glTF" and version == 2 and total_length == len(payload)
    json_length, json_type = struct.unpack_from("<I4s", payload, 12)
    assert json_type == b"JSON"
    json_start = 20
    document = json.loads(payload[json_start : json_start + json_length].decode("utf-8"))
    binary_header = json_start + json_length
    binary_length, binary_type = struct.unpack_from("<I4s", payload, binary_header)
    assert binary_type == b"BIN\x00"
    binary_start = binary_header + 8
    return document, payload[binary_start : binary_start + binary_length]


def texture_candidates_by_hash() -> dict[str, list[Path]]:
    result: dict[str, list[Path]] = {}
    for path in sorted(TEXTURE_ROOT.iterdir()):
        if path.is_file() and path.suffix.lower() in {".png", ".jpg", ".jpeg"}:
            result.setdefault(sha256(path.read_bytes()).hexdigest(), []).append(path)
    return result


def remap_buffer_view_references(document: dict[str, Any], mapping: dict[int, int]) -> None:
    for accessor in document.get("accessors", []):
        if "bufferView" in accessor:
            accessor["bufferView"] = mapping[int(accessor["bufferView"])]
        sparse = accessor.get("sparse")
        if sparse:
            sparse["indices"]["bufferView"] = mapping[int(sparse["indices"]["bufferView"])]
            sparse["values"]["bufferView"] = mapping[int(sparse["values"]["bufferView"])]
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            draco = primitive.get("extensions", {}).get("KHR_draco_mesh_compression")
            if draco:
                draco["bufferView"] = mapping[int(draco["bufferView"])]


def write_glb(path: Path, document: dict[str, Any], binary: bytes) -> None:
    json_payload = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_payload += b" " * ((-len(json_payload)) % 4)
    binary_payload = binary + b"\x00" * ((-len(binary)) % 4)
    total_length = 12 + 8 + len(json_payload) + 8 + len(binary_payload)
    path.write_bytes(
        struct.pack("<4sII", b"glTF", 2, total_length)
        + struct.pack("<I4s", len(json_payload), b"JSON")
        + json_payload
        + struct.pack("<I4s", len(binary_payload), b"BIN\x00")
        + binary_payload
    )


def externalize_shared_textures(path: Path) -> dict[str, int]:
    document, binary = read_glb(path)
    image_views = {
        int(image["bufferView"])
        for image in document.get("images", [])
        if "bufferView" in image
    }
    if not image_views:
        return {"imageReferences": len(document.get("images", [])), "externalImageBytes": 0}

    old_views = document["bufferViews"]
    candidates = texture_candidates_by_hash()
    external_bytes: set[Path] = set()
    for image in document.get("images", []):
        old_index = int(image.pop("bufferView"))
        view = old_views[old_index]
        start = int(view.get("byteOffset", 0))
        payload = binary[start : start + int(view["byteLength"])]
        digest = sha256(payload).hexdigest()
        matches = candidates.get(digest, [])
        preferred = next((candidate for candidate in matches if candidate.stem == image.get("name")), None)
        if preferred is None and matches:
            preferred = matches[0]
        if preferred is None:
            extension = {"image/png": ".png", "image/jpeg": ".jpg"}[image["mimeType"]]
            preferred = TEXTURE_ROOT / f"glb-{digest[:16]}{extension}"
            if not preferred.exists():
                preferred.write_bytes(payload)
            candidates.setdefault(digest, []).append(preferred)
        image["uri"] = Path(os.path.relpath(preferred, path.parent)).as_posix()
        external_bytes.add(preferred)

    new_binary = bytearray()
    new_views: list[dict[str, Any]] = []
    mapping: dict[int, int] = {}
    for old_index, old_view in enumerate(old_views):
        if old_index in image_views:
            continue
        while len(new_binary) % 4:
            new_binary.append(0)
        start = int(old_view.get("byteOffset", 0))
        length = int(old_view["byteLength"])
        new_view = dict(old_view)
        new_view["byteOffset"] = len(new_binary)
        mapping[old_index] = len(new_views)
        new_views.append(new_view)
        new_binary.extend(binary[start : start + length])

    document["bufferViews"] = new_views
    document["buffers"][0]["byteLength"] = len(new_binary)
    remap_buffer_view_references(document, mapping)
    write_glb(path, document, bytes(new_binary))
    return {
        "imageReferences": len(document.get("images", [])),
        "externalImageBytes": sum(texture.stat().st_size for texture in external_bytes),
    }


def export_module(module_id: str, quality: str) -> dict[str, Any]:
    output_path = MODEL_ROOT / quality / f"{module_id}.glb"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with temporary_module_scene(module_id, quality) as (export_scene, objects):
        before_triangles = sum(
            evaluated_triangle_count(obj, export_scene) for obj in objects if obj.type == "MESH"
        )
        result = bpy.ops.export_scene.gltf(
            filepath=str(output_path),
            export_format="GLB",
            use_active_scene=True,
            export_yup=True,
            export_apply=True,
            export_extras=True,
            export_materials="EXPORT",
            export_image_format="AUTO",
            export_texcoords=True,
            export_normals=True,
            export_tangents=True,
            export_animations=False,
            export_cameras=False,
            export_lights=False,
            export_morph=False,
            export_draco_mesh_compression_enable=True,
            export_draco_mesh_compression_level=6,
            check_existing=False,
        )
        assert result == {"FINISHED"}, f"glTF export failed for {quality}/{module_id}: {result}"
        assert output_path.is_file() and output_path.stat().st_size > 0
        texture_record = externalize_shared_textures(output_path)
        return {
            "moduleId": module_id,
            "quality": quality,
            "bytes": output_path.stat().st_size,
            "evaluatedTriangles": before_triangles,
            **texture_record,
        }


def part_manifest(obj: bpy.types.Object) -> dict[str, Any]:
    authored_distance_mm = float(obj["explodeDistance"]) / MM
    return {
        "partId": str(obj["partId"]),
        "moduleId": str(obj["moduleId"]),
        "parentId": str(obj["parentId"]) if obj.get("parentId") else None,
        "nameZh": str(obj["nameZh"]),
        "nameEn": str(obj["nameEn"]),
        "descriptionZh": str(obj["descriptionZh"]),
        "descriptionEn": str(obj["descriptionEn"]),
        "step": int(obj["step"]),
        "explodeAxis": blender_axis_to_gltf(obj["explodeAxis"]),
        "explodeDistance": millimeters_to_meters(authored_distance_mm),
        "dependsOn": [str(value) for value in obj["dependsOn"]],
        "isReferenceGeometry": bool(obj["isReferenceGeometry"]),
    }


def build_manifest() -> dict[str, Any]:
    parts = sorted(
        (part_manifest(obj) for obj in bpy.data.objects if obj.get("partId")),
        key=lambda part: (part["step"], part["partId"]),
    )
    modules = []
    for module_id in MODULE_COLLECTIONS:
        name_zh, name_en = MODULE_NAMES[module_id]
        modules.append(
            {
                "moduleId": module_id,
                "nameZh": name_zh,
                "nameEn": name_en,
                "urls": {
                    "high": f"assets/models/high/{module_id}.glb",
                    "low": f"assets/models/low/{module_id}.glb",
                },
                "preload": module_id in MODULE_COLLECTIONS[:2],
            }
        )

    steps = []
    for step_number in range(1, 41):
        step_parts = [part for part in parts if part["step"] == step_number]
        assert step_parts, f"guided step {step_number} has no parts"
        focus = step_parts[0]
        steps.append(
            {
                "step": step_number,
                "titleZh": f"拆卸：{focus['nameZh']}",
                "titleEn": f"Remove {focus['nameEn']}",
                "partIds": [part["partId"] for part in step_parts],
                "cameraPreset": CAMERA_PRESETS[focus["moduleId"]],
            }
        )

    return {
        "schemaVersion": 1,
        "product": {
            "name": "Nikon Z50II",
            "disclaimerZh": "内部结构为参考性重建，非 Nikon 制造商原始 CAD 数据。",
            "disclaimerEn": (
                "Internal structures are reference reconstruction and not Nikon manufacturer CAD."
            ),
        },
        "modules": modules,
        "parts": parts,
        "steps": steps,
    }


def main() -> None:
    validate_scene()
    manifest = build_manifest()
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    records = []
    for quality in ("high", "low"):
        for module_id in MODULE_COLLECTIONS:
            record = export_module(module_id, quality)
            records.append(record)
            print("Z50II_EXPORT " + json.dumps(record, sort_keys=True))
    print(f"Exported {len(records)} GLBs and {len(manifest['parts'])} manifest parts")


if __name__ == "__main__":
    main()
