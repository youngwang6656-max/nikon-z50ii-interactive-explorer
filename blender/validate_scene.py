"""Focused structural validation for a Z50II master Blender scene."""

from pathlib import Path
import sys

import bpy


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


if __name__ == "__main__":
    validate_scene()
    print("Z50II scene validation passed")
