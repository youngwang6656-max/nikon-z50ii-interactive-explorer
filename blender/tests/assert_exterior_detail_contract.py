"""Assert review-round exterior construction and silhouette-detail behavior."""

import bmesh
import bpy


def _evaluated_volume_ratio(obj: bpy.types.Object) -> float:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        bm = bmesh.new()
        bm.from_mesh(mesh)
        try:
            volume = abs(bm.calc_volume(signed=True))
        finally:
            bm.free()
    finally:
        evaluated.to_mesh_clear()
    bbox_volume = obj.dimensions.x * obj.dimensions.y * obj.dimensions.z
    return volume / bbox_volume


front_shell = bpy.data.objects["Z50II-02-001_front_shell"]
grip_rubber = bpy.data.objects["Z50II-02-002_grip_rubber"]
chassis = bpy.data.objects["Z50II-01-001_magnesium_chassis"]
left_lug = bpy.data.objects["Z50II-02-019_left_strap_lug"]
right_lug = bpy.data.objects["Z50II-02-020_right_strap_lug"]

assert _evaluated_volume_ratio(front_shell) < 0.22, "front shell is not a hollow skin"
assert _evaluated_volume_ratio(grip_rubber) < 0.28, "grip rubber is not a thin ergonomic skin"
assert _evaluated_volume_ratio(chassis) < 0.30, "main chassis is not an open frame"

assert not [obj.name for obj in bpy.data.objects if obj.type == "FONT"], (
    "floating default-font branding remains in the scene"
)
assert not [obj.name for obj in bpy.data.objects if obj.name.startswith("Z50II_grip_texture_")], (
    "raised grip strips remain instead of molded/recessed treatment"
)

for lug in (left_lug, right_lug):
    assert _evaluated_volume_ratio(lug) < 0.55, f"{lug.name} is not an open eyelet"

anchors = [obj for obj in bpy.data.objects if obj.get("decalTargetTask") == 8]
assert {obj.get("decalRole") for obj in anchors} == {"brand", "model"}, (
    "Task 8 brand/model decal anchors are incomplete"
)

assert bpy.data.objects.get("Z50II_power_collar_lever") is not None
assert bpy.data.objects.get("Z50II_photo_video_selector_lever") is not None
assert len([obj for obj in bpy.data.objects if obj.name.startswith("Z50II_mode_dial_knurl_")]) >= 16

for cut_object_name in (
    "Z50II-02-001_front_shell",
    "Z50II-02-005_left_side_cover",
    "Z50II_evf_housing",
):
    cut_object = bpy.data.objects[cut_object_name]
    assert cut_object.modifiers and cut_object.modifiers[-1].type == "BEVEL", (
        f"{cut_object_name} lacks post-cut bevel treatment"
    )

print("Exterior detail contract passed")
