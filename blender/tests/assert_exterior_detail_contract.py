"""Assert review-round exterior construction and silhouette-detail behavior."""

import bmesh
import bpy
from math import acos, atan2, degrees, isfinite
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


def _ray_hits(
    obj: bpy.types.Object,
    origin_world: tuple[float, float, float],
    direction_world: tuple[float, float, float],
    distance_mm: float,
) -> bool:
    """Probe evaluated geometry with a short world-space ray."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    inverse = evaluated.matrix_world.inverted()
    origin_local = inverse @ Vector(origin_world)
    direction_local = (inverse.to_3x3() @ Vector(direction_world)).normalized()
    hit, location, _normal, _index = evaluated.ray_cast(origin_local, direction_local)
    if not hit:
        return False
    return (evaluated.matrix_world @ location - Vector(origin_world)).length <= distance_mm / 1000.0


def _ring_width_mm(obj: bpy.types.Object, z_mm: float, tolerance_mm: float = 0.08) -> float:
    points = [
        obj.matrix_world @ vertex.co
        for vertex in obj.data.vertices
        if abs((obj.matrix_world @ vertex.co).z * 1000.0 - z_mm) <= tolerance_mm
    ]
    assert points, f"{obj.name} has no geometric profile near Z={z_mm:.1f} mm"
    return (max(point.x for point in points) - min(point.x for point in points)) * 1000.0


def _maximum_profile_turn_degrees(obj: bpy.types.Object, y_mm: float) -> float:
    """Measure angular faceting along the upper X/Z silhouette at a Y station."""
    candidates = []
    for vertex in obj.data.vertices:
        point = obj.matrix_world @ vertex.co
        if abs(point.y * 1000.0 - y_mm) <= 0.20 and point.z * 1000.0 >= 39.0:
            candidates.append((point.x * 1000.0, point.z * 1000.0))
    points = sorted({(round(x, 3), round(z, 3)) for x, z in candidates})
    clusters = []
    for point in points:
        if not clusters or point[0] - clusters[-1][-1][0] > 0.75:
            clusters.append([point])
        else:
            clusters[-1].append(point)
    envelope = [
        (sum(point[0] for point in cluster) / len(cluster), max(point[1] for point in cluster))
        for cluster in clusters
    ]
    upper = []
    for x, z in envelope:
        if not upper or z > upper[-1][1] - 2.0:
            upper.append((x, z))
    turns = []
    for first, middle, last in zip(upper, upper[1:], upper[2:]):
        incoming = Vector((middle[0] - first[0], middle[1] - first[1]))
        outgoing = Vector((last[0] - middle[0], last[1] - middle[1]))
        if incoming.length > 0.05 and outgoing.length > 0.05:
            cosine = max(-1.0, min(1.0, incoming.normalized().dot(outgoing.normalized())))
            turns.append(degrees(acos(cosine)))
    assert turns, f"{obj.name} lacks a measurable upper silhouette at Y={y_mm:.1f} mm"
    return max(turns)


def _evaluated_evf_crown_metrics(
    obj: bpy.types.Object, y_mm: float
) -> tuple[float, float, float]:
    """Measure the rendered front crown, not source-profile bookkeeping."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        candidates = []
        for vertex in mesh.vertices:
            point = evaluated.matrix_world @ vertex.co
            if abs(point.y * 1000.0 - y_mm) <= 2.50 and point.z * 1000.0 >= 36.0:
                candidates.append((point.x * 1000.0, point.z * 1000.0))
    finally:
        evaluated.to_mesh_clear()

    points = sorted({(round(x, 3), round(z, 3)) for x, z in candidates})
    assert points, "EVF evaluated crown profile is empty"
    minimum_sample_x = points[0][0]
    buckets = {}
    for point in points:
        bucket = int((point[0] - minimum_sample_x) / 0.50)
        buckets.setdefault(bucket, []).append(point)
    envelope = [
        (sum(point[0] for point in bucket) / len(bucket), max(point[1] for point in bucket))
        for _index, bucket in sorted(buckets.items())
    ]
    assert len(envelope) >= 20, "EVF evaluated crown has too few geometric samples"

    def interpolate_z(x_target: float) -> float:
        for left, right in zip(envelope, envelope[1:]):
            if left[0] <= x_target <= right[0]:
                fraction = (x_target - left[0]) / (right[0] - left[0])
                return left[1] + fraction * (right[1] - left[1])
        raise AssertionError(f"EVF crown does not span X={x_target:.2f} mm")

    minimum_x = min(point[0] for point in points)
    maximum_x = max(point[0] for point in points)
    base_z = min(point[1] for point in points)
    crown_z = max(point[1] for point in envelope)
    width = maximum_x - minimum_x
    height = crown_z - base_z
    center_x = (minimum_x + maximum_x) / 2.0
    crown_drop = crown_z - min(
        interpolate_z(center_x - width * 0.20),
        interpolate_z(center_x + width * 0.20),
    )
    shoulder_angles = []
    for edge, sign in ((minimum_x, 1.0), (maximum_x, -1.0)):
        lower_x = edge + sign * width * 0.02
        upper_x = edge + sign * width * 0.16
        run = abs(upper_x - lower_x)
        rise = interpolate_z(upper_x) - interpolate_z(lower_x)
        shoulder_angles.append(degrees(atan2(rise, run)))
    return width / height, crown_drop, min(shoulder_angles)


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
exterior_collections = tuple(
    bpy.data.collections[module_id]
    for module_id in ("01_chassis_front", "02_outer_shell_controls")
)
exportable_types = {"MESH", "CURVE", "SURFACE", "META", "FONT", "ARMATURE", "EMPTY"}
export_objects = {
    obj for collection in exterior_collections for obj in collection.all_objects
    if obj.type in exportable_types
}
bad_determinants = {
    obj.name: obj.matrix_world.determinant()
    for obj in export_objects
    if not isfinite(obj.matrix_world.determinant()) or obj.matrix_world.determinant() <= 1.0e-9
}

assert len(grip_rubber.data.vertices) >= 480, "grip loft needs at least ten 48-point stations"
assert all(polygon.use_smooth for polygon in grip_rubber.data.polygons), "grip loft is not smooth shaded"
assert len(front_shell.data.vertices) >= 60, "body shoulder loft needs more cross-section stations"
assert all(polygon.use_smooth for polygon in front_shell.data.polygons), "body shell is not smooth shaded"
evf_housing = bpy.data.objects["Z50II_evf_housing"]
assert len(evf_housing.data.vertices) >= 30, "EVF loft needs more profile stations"
assert all(polygon.use_smooth for polygon in evf_housing.data.polygons), "EVF shell is not smooth shaded"

palm_width_mm = _ring_width_mm(grip_rubber, 4.0)
neck_width_mm = _ring_width_mm(grip_rubber, 30.0)
neck_ratio = neck_width_mm / palm_width_mm
evf_max_turn = _maximum_profile_turn_degrees(evf_housing, 9.0)
evf_width_height, evf_crown_drop_mm, evf_shoulder_slope_deg = _evaluated_evf_crown_metrics(
    evf_housing, 9.0
)

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
assert not _ray_hits(front_shell, (0.060, 0.030, -0.004), (-1.0, 0.0, 0.0), 13.0), (
    "rear display-hinge pocket does not pass through the shell edge"
)
assert _ray_hits(front_shell, (0.060, 0.030, 0.014), (-1.0, 0.0, 0.0), 13.0), (
    "display-hinge pocket probe lacks adjacent shell material"
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
assert not _ray_hits(bottom_shell, (-0.035, 0.017, -0.045), (0.0, 0.0, 1.0), 12.0), (
    "battery-bay opening does not pass through the bottom shell"
)
assert _ray_hits(bottom_shell, (0.000, 0.017, -0.045), (0.0, 0.0, 1.0), 12.0), (
    "battery-bay opening probe lacks adjacent bottom-shell material"
)

fn1 = bpy.data.objects["Z50II-02-016_fn1_button"]
fn2 = bpy.data.objects["Z50II-02-017_fn2_button"]
for button in (fn1, fn2):
    assert button.dimensions.z > button.dimensions.x * 1.5, f"{button.name} is not pill-shaped"
assert abs(fn1.location.x - fn2.location.x) < 0.001, "Fn buttons are not vertically aligned"
assert fn1.location.z > fn2.location.z, "Fn1 must sit above Fn2"
assert bpy.data.objects.get("Z50II_fn1_pill_seat") is not None
assert bpy.data.objects.get("Z50II_fn2_pill_seat") is not None
fn1_bore_open = not _ray_hits(front_shell, (-0.032, -0.005, 0.008), (0.0, 1.0, 0.0), 10.0)
fn1_adjacent_shell = _ray_hits(front_shell, (-0.040, -0.005, 0.008), (0.0, 1.0, 0.0), 10.0)
shutter_seat = bpy.data.objects.get("Z50II_shutter_power_receiving_seat")
assert shutter_seat is not None
assert not _ray_hits(shutter_seat, (-0.049, -0.003, 0.036), (0.0, 0.0, -1.0), 8.0), (
    "shutter/power receiving seat lacks a genuine center opening"
)
assert _ray_hits(shutter_seat, (-0.054, -0.003, 0.036), (0.0, 0.0, -1.0), 8.0), (
    "shutter/power receiving seat lacks an annular seating surface"
)

for cut_object_name in (
    "Z50II-02-001_front_shell",
    "Z50II-02-005_left_side_cover",
    "Z50II_evf_housing",
):
    cut_object = bpy.data.objects[cut_object_name]
    assert cut_object.modifiers and cut_object.modifiers[-1].type == "BEVEL", (
        f"{cut_object_name} lacks post-cut bevel treatment"
    )

assert evf_max_turn <= 18.0, (
    f"EVF crown remains visibly polygonal: maximum profile turn={evf_max_turn:.2f} degrees"
)
assert evf_width_height >= 2.55, (
    f"EVF housing is too tall/domed: evaluated width/height={evf_width_height:.3f}"
)
assert evf_crown_drop_mm <= 0.55, (
    f"EVF crown is not flat enough: central 40% drop={evf_crown_drop_mm:.3f} mm"
)
assert 38.0 <= evf_shoulder_slope_deg <= 65.0, (
    f"EVF shoulder slope is not controlled: minimum={evf_shoulder_slope_deg:.2f} degrees"
)
assert neck_ratio >= 0.82, (
    f"grip shoulder neck is too narrow/bulbous: neck={neck_width_mm:.2f} mm, "
    f"palm={palm_width_mm:.2f} mm, ratio={neck_ratio:.3f}"
)
assert fn1_bore_open, "Fn1 bore does not pass through the front shell"
assert fn1_adjacent_shell, "Fn1 bore probe lacks adjacent front-shell material"
assert not bad_determinants, (
    f"all {len(export_objects)} exterior export nodes must have finite positive determinant; "
    f"bad={len(bad_determinants)}: {bad_determinants}"
)

print(
    "Exterior detail contract passed: "
    f"export_nodes={len(export_objects)}, bad_determinants={len(bad_determinants)}, "
    f"grip_neck_ratio={neck_ratio:.3f}, evf_max_turn_deg={evf_max_turn:.2f}, "
    f"evf_width_height={evf_width_height:.3f}, evf_crown_drop_mm={evf_crown_drop_mm:.3f}, "
    f"evf_shoulder_slope_deg={evf_shoulder_slope_deg:.2f}"
)
