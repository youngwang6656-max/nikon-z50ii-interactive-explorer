"""Focused failure-path regression for temporary modular export scenes."""

from __future__ import annotations

from pathlib import Path
import sys

import bpy


BLENDER_ROOT = Path(__file__).resolve().parents[1]
if str(BLENDER_ROOT) not in sys.path:
    sys.path.insert(0, str(BLENDER_ROOT))

from export_modules import temporary_module_scene


bpy.ops.wm.read_factory_settings(use_empty=True)
source_collection = bpy.data.collections.new("TEST_failure_cleanup")
bpy.context.scene.collection.children.link(source_collection)

mesh = bpy.data.meshes.new("TEST_cleanup_mesh")
mesh.from_pydata([(0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0)], [], [(0, 1, 2)])
mesh_object = bpy.data.objects.new("TEST_cleanup_mesh_object", mesh)
source_collection.objects.link(mesh_object)

light_data = bpy.data.lights.new("TEST_cleanup_light_data", type="POINT")
light_object = bpy.data.objects.new("TEST_cleanup_unsupported_light", light_data)
source_collection.objects.link(light_object)

before = {
    "scenes": set(bpy.data.scenes),
    "collections": set(bpy.data.collections),
    "objects": set(bpy.data.objects),
    "meshes": set(bpy.data.meshes),
}
try:
    with temporary_module_scene(source_collection.name, "high"):
        raise AssertionError("unsupported source object should fail during construction")
except TypeError as error:
    assert "unsupported module object type" in str(error)
else:
    raise AssertionError("temporary scene construction unexpectedly accepted a LIGHT")

assert set(bpy.data.scenes) == before["scenes"], "temporary scene leaked after construction failure"
assert set(bpy.data.collections) == before["collections"], "temporary collection leaked after construction failure"
assert set(bpy.data.objects) == before["objects"], "temporary object leaked after construction failure"
assert set(bpy.data.meshes) == before["meshes"], "temporary mesh datablock leaked after construction failure"

print("Temporary export-scene construction cleanup assertion passed")
