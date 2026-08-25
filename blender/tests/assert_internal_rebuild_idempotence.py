"""Task 6 builders must not leak objects or mesh datablocks across rebuilds."""

from pathlib import Path
import sys

import bpy

BLENDER_ROOT = Path(__file__).resolve().parents[1]
if str(BLENDER_ROOT) not in sys.path:
    sys.path.insert(0, str(BLENDER_ROOT))

from z50ii.modules.mainboard_thermal import build_mainboard_thermal
from z50ii.modules.mount_shutter_sensor import build_mount_shutter_sensor
from z50ii.modules.power_storage import build_power_storage


MODULES = {"03_mount_shutter_sensor", "04_mainboard_thermal", "05_power_storage"}


def signature():
    task_objects = [obj for obj in bpy.data.objects if obj.get("moduleId") in MODULES]
    all_task_nodes = {
        obj for module_id in MODULES for obj in bpy.data.collections[module_id].all_objects
    }
    task_meshes = {obj.data for obj in all_task_nodes if obj.type == "MESH"}
    orphan_task_meshes = [
        mesh
        for mesh in bpy.data.meshes
        if mesh.users == 0 and mesh.name.startswith("Z50II")
    ]
    return {
        "objects": len(bpy.data.objects),
        "meshes": len(bpy.data.meshes),
        "task_parts": len(task_objects),
        "task_nodes": len(all_task_nodes),
        "task_meshes": len(task_meshes),
        "orphan_task_meshes": len(orphan_task_meshes),
    }


baseline = signature()
assert baseline["task_parts"] == 32
assert baseline["orphan_task_meshes"] == 0

for cycle in range(2):
    build_mount_shutter_sensor()
    build_mainboard_thermal()
    build_power_storage()
    actual = signature()
    assert actual == baseline, f"rebuild {cycle + 1} changed datablock signature: {baseline} -> {actual}"

print(f"Internal rebuild idempotence passed: {baseline}")
