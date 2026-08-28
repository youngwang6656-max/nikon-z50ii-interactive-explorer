"""Export the Z50II master scene as eight high/low modular GLBs and a manifest."""

from __future__ import annotations

import json
from pathlib import Path
import sys
from typing import Any, Iterable

import bpy


BLENDER_ROOT = Path(__file__).resolve().parent
ROOT = BLENDER_ROOT.parent
if str(BLENDER_ROOT) not in sys.path:
    sys.path.insert(0, str(BLENDER_ROOT))

from validate_scene import validate_scene
from z50ii.constants import MM, MODULE_COLLECTIONS


MODEL_ROOT = ROOT / "public" / "assets" / "models"
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


def duplicate_module_scene(module_id: str, quality: str) -> tuple[bpy.types.Scene, list[bpy.types.Object]]:
    source_collection = bpy.data.collections[module_id]
    export_scene = bpy.data.scenes.new(f"EXPORT_{quality}_{module_id}")
    export_collection = bpy.data.collections.new(f"EXPORT_COLLECTION_{quality}_{module_id}")
    export_scene.collection.children.link(export_collection)

    copies: dict[bpy.types.Object, bpy.types.Object] = {}
    for source in source_collection.all_objects:
        duplicate = source.copy()
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

    previous_scene = bpy.context.window.scene
    bpy.context.window.scene = export_scene
    try:
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
    finally:
        bpy.context.window.scene = previous_scene

    return export_scene, list(copies.values())


def remove_export_scene(scene: bpy.types.Scene, objects: list[bpy.types.Object]) -> None:
    collections = list(scene.collection.children)
    meshes = {obj.data for obj in objects if obj.type == "MESH" and obj.data is not None}
    bpy.data.scenes.remove(scene)
    for obj in objects:
        if obj.name in bpy.data.objects:
            bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in meshes:
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for collection in collections:
        if collection.users == 0:
            bpy.data.collections.remove(collection)


def export_module(module_id: str, quality: str) -> dict[str, Any]:
    output_path = MODEL_ROOT / quality / f"{module_id}.glb"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    export_scene, objects = duplicate_module_scene(module_id, quality)
    previous_scene = bpy.context.window.scene
    try:
        bpy.context.window.scene = export_scene
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
        return {
            "moduleId": module_id,
            "quality": quality,
            "bytes": output_path.stat().st_size,
            "evaluatedTriangles": before_triangles,
        }
    finally:
        bpy.context.window.scene = previous_scene
        remove_export_scene(export_scene, objects)


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
