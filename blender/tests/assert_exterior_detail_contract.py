"""Assert review-round exterior construction and silhouette-detail behavior."""

import bmesh
import bpy
from mathutils import Vector


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


def _world_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = Vector(tuple(min(point[index] for point in corners) for index in range(3)))
    maximum = Vector(tuple(max(point[index] for point in corners) for index in range(3)))
    return minimum, maximum


front_shell = bpy.data.objects["Z50II-02-001_front_shell"]
grip_rubber = bpy.data.objects["Z50II-02-002_grip_rubber"]
chassis = bpy.data.objects["Z50II-01-001_magnesium_chassis"]
left_lug = bpy.data.objects["Z50II-02-019_left_strap_lug"]
right_lug = bpy.data.objects["Z50II-02-020_right_strap_lug"]

grip_minimum, grip_maximum = _world_bounds(grip_rubber)
grip_center_x = (grip_minimum.x + grip_maximum.x) / 2.0
assert grip_center_x < -0.035, (
    "photographer-right grip must be at negative X and appear viewer-left from the front"
)
assert bpy.data.objects["Z50II-02-005_left_side_cover"].dimensions.x > 0.0
left_cover_minimum, left_cover_maximum = _world_bounds(
    bpy.data.objects["Z50II-02-005_left_side_cover"]
)
assert (left_cover_minimum.x + left_cover_maximum.x) / 2.0 > 0.045, (
    "photographer-left connector cover must be at positive X"
)
exterior_parts = [
    obj
    for obj in bpy.data.objects
    if obj.get("moduleId") in {"01_chassis_front", "02_outer_shell_controls"}
]
assert all(obj.matrix_world.determinant() > 0.0 for obj in exterior_parts), (
    "handedness must be baked into geometry without negative-scale export transforms"
)

assert len(grip_rubber.data.vertices) >= 480, "grip loft needs at least ten 48-point stations"
assert all(polygon.use_smooth for polygon in grip_rubber.data.polygons), "grip loft is not smooth shaded"
assert len(front_shell.data.vertices) >= 60, "body shoulder loft needs more cross-section stations"
assert all(polygon.use_smooth for polygon in front_shell.data.polygons), "body shell is not smooth shaded"
evf_housing = bpy.data.objects["Z50II_evf_housing"]
assert len(evf_housing.data.vertices) >= 30, "EVF loft needs more profile stations"
assert all(polygon.use_smooth for polygon in evf_housing.data.polygons), "EVF shell is not smooth shaded"

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

display_pocket = bpy.data.objects.get("Z50II_display_hinge_pocket_reveal")
assert display_pocket is not None and display_pocket.parent == front_shell, (
    "rear display-hinge pocket/reveal is absent"
)
battery_reveal = bpy.data.objects.get("Z50II_battery_bay_reveal")
bottom_shell = bpy.data.objects["Z50II-02-004_bottom_shell"]
battery_door = bpy.data.objects["Z50II-02-007_battery_door"]
assert battery_reveal is not None and battery_reveal.parent == bottom_shell, (
    "bottom shell lacks a genuine battery-bay opening/reveal"
)
assert bottom_shell.modifiers and bottom_shell.modifiers[-1].type == "BEVEL", (
    "battery-bay cut lacks post-boolean bevel treatment"
)
assert _world_bounds(battery_door)[1].z <= _world_bounds(bottom_shell)[1].z + 0.0006, (
    "battery door is not seated in the bottom-shell opening"
)

fn1 = bpy.data.objects["Z50II-02-016_fn1_button"]
fn2 = bpy.data.objects["Z50II-02-017_fn2_button"]
for button in (fn1, fn2):
    assert button.dimensions.z > button.dimensions.x * 1.5, f"{button.name} is not pill-shaped"
assert abs(fn1.location.x - fn2.location.x) < 0.001, "Fn buttons are not vertically aligned"
assert fn1.location.z > fn2.location.z, "Fn1 must sit above Fn2"
assert bpy.data.objects.get("Z50II_fn1_pill_seat") is not None
assert bpy.data.objects.get("Z50II_fn2_pill_seat") is not None
assert bpy.data.objects.get("Z50II_shutter_power_receiving_seat") is not None

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
