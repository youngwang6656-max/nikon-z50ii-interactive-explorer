"""Focused structural validation for a Z50II master Blender scene."""

from pathlib import Path
import sys

import bpy
from mathutils import Vector


BLENDER_ROOT = Path(__file__).resolve().parent
if str(BLENDER_ROOT) not in sys.path:
    sys.path.insert(0, str(BLENDER_ROOT))

from z50ii.constants import MODULE_COLLECTIONS, STUDIO_WORLD_NAME


def validate_scene() -> None:
    actual = {collection.name for collection in bpy.data.collections}
    missing = set(MODULE_COLLECTIONS) - actual
    assert not missing, f"missing collections: {missing}"
    assert bpy.context.scene.unit_settings.system == "METRIC"
    assert abs(bpy.context.scene.unit_settings.scale_length - 1.0) < 1e-9
    assert bpy.data.worlds.get(STUDIO_WORLD_NAME) is not None

    roots = [obj for obj in bpy.data.objects if obj.get("partId")]
    assert len(roots) == 100, f"expected 100 stable parts, found {len(roots)}"
    part_ids = [str(obj["partId"]) for obj in roots]
    assert len(part_ids) == len(set(part_ids)), "duplicate stable partId values"
    parts = {str(obj["partId"]): obj for obj in roots}
    assert {str(obj["moduleId"]) for obj in roots} == set(MODULE_COLLECTIONS)
    assert {int(obj["step"]) for obj in roots} == set(range(1, 41))

    required = {
        "partId",
        "moduleId",
        "nameZh",
        "nameEn",
        "descriptionZh",
        "descriptionEn",
        "step",
        "explodeAxis",
        "explodeDistance",
        "dependsOn",
        "isReferenceGeometry",
    }
    for obj in roots:
        missing_properties = required - set(obj.keys())
        assert not missing_properties, f"{obj['partId']} lacks metadata: {sorted(missing_properties)}"
        assert obj.name in bpy.data.collections[str(obj["moduleId"])].all_objects
        assert abs(Vector(obj["explodeAxis"]).length - 1.0) < 1e-6
        assert float(obj["explodeDistance"]) > 0.0
        if obj.get("parentId"):
            assert str(obj["parentId"]) in parts
        for dependency in obj["dependsOn"]:
            dependency = str(dependency)
            assert dependency in parts, f"{obj['partId']} has missing dependency {dependency}"
            assert int(parts[dependency]["step"]) < int(obj["step"]), (
                f"dependency {dependency} must strictly precede {obj['partId']}"
            )

    for image in bpy.data.images:
        if image.source == "FILE" and image.filepath:
            assert image.filepath.startswith("//"), f"texture path must remain relative: {image.filepath}"


if __name__ == "__main__":
    validate_scene()
    print("Z50II scene validation passed")
