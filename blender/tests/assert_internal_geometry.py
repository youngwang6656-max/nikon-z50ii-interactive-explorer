"""Geometry/contact/path contract for the Task 6 internal reconstruction."""

from itertools import combinations
from math import ceil, cos, radians, sin

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


depsgraph = bpy.context.evaluated_depsgraph_get()
parts = {obj["partId"]: obj for obj in bpy.data.objects if obj.get("partId")}

# Deliberate assembly interfaces are checked numerically below. No triangle
# interpenetration is permitted across selectable roots, even at those joints.
ALLOWED_CROSS_ROOT_INTERSECTIONS = set()
CONTACT_GAP_TOLERANCES_MM = {
    "package_to_pcb": (0.02, 0.10),
    "lead_to_pcb": (0.00, 0.03),
    "shield_to_spreader": (0.02, 0.10),
    "spreader_to_pad": (0.00, 0.03),
    "pad_to_cap": (0.00, 0.05),
    "cap_to_processor": (0.00, 0.05),
    "battery_terminal_to_spring": (0.02, 0.10),
    "card_to_cage": (0.20, 0.80),
}


def selectable_root(obj):
    current = obj
    while current is not None:
        if current.get("partId"):
            return current
        current = current.parent
    return None


def root_meshes(root):
    return [
        obj
        for obj in bpy.data.objects
        if obj.type == "MESH" and selectable_root(obj) == root
    ]


def evaluated_geometry(obj, offset=Vector((0.0, 0.0, 0.0))):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        vertices = [evaluated.matrix_world @ vertex.co + offset for vertex in mesh.vertices]
        polygons = [tuple(polygon.vertices) for polygon in mesh.polygons]
        return vertices, polygons
    finally:
        evaluated.to_mesh_clear()


_bvh_cache = {}


def object_bvh(obj, offset=Vector((0.0, 0.0, 0.0))):
    key = (obj.name, tuple(round(value, 9) for value in offset))
    if key not in _bvh_cache:
        vertices, polygons = evaluated_geometry(obj, offset)
        _bvh_cache[key] = BVHTree.FromPolygons(
            vertices, polygons, all_triangles=False, epsilon=0.0
        )
    return _bvh_cache[key]


def intersecting_submesh_pairs(first_root, second_root, first_offset=Vector((0.0, 0.0, 0.0))):
    collisions = []
    for first in root_meshes(first_root):
        for second in root_meshes(second_root):
            overlaps = object_bvh(first, first_offset).overlap(object_bvh(second))
            if overlaps:
                collisions.append((first.name, second.name, len(overlaps)))
    return collisions


def evaluated_bounds(obj):
    vertices, _polygons = evaluated_geometry(obj)
    minimum = Vector(tuple(min(point[index] for point in vertices) for index in range(3)))
    maximum = Vector(tuple(max(point[index] for point in vertices) for index in range(3)))
    return minimum, maximum


def gap_y(front_obj, rear_obj):
    return (evaluated_bounds(rear_obj)[0].y - evaluated_bounds(front_obj)[1].y) * 1000.0


def dependency_closure(part):
    result = set()
    pending = list(part["dependsOn"])
    while pending:
        part_id = pending.pop()
        if part_id in result:
            continue
        result.add(part_id)
        pending.extend(parts[part_id]["dependsOn"])
    return result


def sweep_collisions(part_id, obstruction_ids):
    moving = parts[part_id]
    axis = Vector(moving["explodeAxis"])
    distance = moving["explodeDistance"]
    sample_count = max(2, ceil(distance / 0.005))
    collisions = []
    for index in range(sample_count + 1):
        offset = axis * distance * index / sample_count
        for obstruction_id in obstruction_ids:
            overlaps = intersecting_submesh_pairs(moving, parts[obstruction_id], offset)
            if overlaps:
                collisions.append((round(offset.length * 1000.0, 2), obstruction_id, overlaps[:3]))
    return collisions


# All cross-module assembled geometry must be free of triangle intersections.
internal_ids = sorted(
    part_id for part_id in parts if part_id.startswith(("Z50II-03", "Z50II-04", "Z50II-05"))
)
retained_ids = sorted(
    part_id for part_id in parts if part_id.startswith(("Z50II-01", "Z50II-02"))
)
cross_pairs = [
    (first, second)
    for first in internal_ids
    for second in retained_ids
] + [
    (first, second)
    for first, second in combinations(internal_ids, 2)
    if parts[first]["moduleId"] != parts[second]["moduleId"]
]
cross_intersections = {}
for first_id, second_id in cross_pairs:
    pair = frozenset((first_id, second_id))
    if pair in ALLOWED_CROSS_ROOT_INTERSECTIONS:
        continue
    overlaps = intersecting_submesh_pairs(parts[first_id], parts[second_id])
    if overlaps:
        cross_intersections[(first_id, second_id)] = overlaps
assert not cross_intersections, f"cross-module root interpenetration: {cross_intersections}"

# Tight internal fits are also nonintersecting and have explicit clearance.
for first_id, second_id in (
    ("Z50II-05-001", "Z50II-05-002"),
    ("Z50II-05-001", "Z50II-05-003"),
    ("Z50II-05-006", "Z50II-05-005"),
    ("Z50II-04-002", "Z50II-04-008"),
    ("Z50II-04-008", "Z50II-04-009"),
):
    overlaps = intersecting_submesh_pairs(parts[first_id], parts[second_id])
    assert not overlaps, f"{first_id}/{second_id} interpenetrate: {overlaps}"

# Battery and card remain door-removable while their fixed carriers may require
# the bottom shell. Sweep every <=5 mm along the declared removal axes.
for consumable_id in ("Z50II-05-001", "Z50II-05-006"):
    assert "Z50II-02-007" in dependency_closure(parts[consumable_id])
    assert "Z50II-02-004" not in dependency_closure(parts[consumable_id])
for service_id in ("Z50II-05-002", "Z50II-05-003", "Z50II-05-004", "Z50II-05-005", "Z50II-05-007", "Z50II-05-008"):
    assert "Z50II-02-004" in dependency_closure(parts[service_id])

power_storage_ids = tuple(f"Z50II-05-{index:03d}" for index in range(1, 9))
for moving_id in power_storage_ids:
    removed = dependency_closure(parts[moving_id]) | {moving_id}
    obstructions = [part_id for part_id in parts if part_id not in removed]
    collisions = sweep_collisions(moving_id, obstructions)
    assert not collisions, f"{moving_id} declared-axis sweep is obstructed: {collisions[:12]}"

# The Task-5 object is a discontinuous recessed seat, while the selectable
# Task-6 object is the only continuous mount ring left after removal.
seat = bpy.data.objects["Z50II_mount_interface_lip"]
mount_ring = parts["Z50II-03-001"]
assert seat["mountRole"] == "recessed_seat" and seat["continuousRing"] is False


def radial_ray_hits(obj, radius_mm, sample_count=16):
    evaluated = obj.evaluated_get(depsgraph)
    inverse = evaluated.matrix_world.inverted()
    hits = 0
    for index in range(sample_count):
        angle = radians(index * 360.0 / sample_count)
        origin_world = Vector((radius_mm * cos(angle) / 1000.0, -0.006, radius_mm * sin(angle) / 1000.0))
        direction_world = Vector((0.0, 1.0, 0.0))
        origin_local = inverse @ origin_world
        direction_local = (inverse.to_3x3() @ direction_world).normalized()
        hit, location, _normal, _face = evaluated.ray_cast(origin_local, direction_local)
        if hit and (evaluated.matrix_world @ location - origin_world).length <= 0.012:
            hits += 1
    return hits


def radial_root_hits(root, radius_mm, sample_count=16):
    hits = 0
    for index in range(sample_count):
        angle = radians(index * 360.0 / sample_count)
        origin = Vector((radius_mm * cos(angle) / 1000.0, -0.006, radius_mm * sin(angle) / 1000.0))
        direction = Vector((0.0, 1.0, 0.0))
        if any(object_bvh(obj).ray_cast(origin, direction, 0.012)[0] is not None for obj in root_meshes(root)):
            hits += 1
    return hits


seat_hits = radial_ray_hits(seat, 29.0)
ring_hits = radial_ray_hits(mount_ring, 28.8)
residual_ring_hits = radial_root_hits(parts["Z50II-02-001"], 29.0)
assert seat_hits <= 6, f"Task-5 seat remains a duplicate continuous ring: {seat_hits}/16 rays"
assert ring_hits >= 14, f"selectable mount ring is not continuous: {ring_hits}/16 rays"
assert residual_ring_hits == 0, f"residual Task-5 mount geometry crosses {residual_ring_hits}/16 rays"

# PCB packages and their leads seat at the board face within explicit tolerances.
pcb_front_y = evaluated_bounds(parts["Z50II-04-001"])[0].y
package_gaps = {}
lead_gaps = {}
for part_id in ("Z50II-04-002", "Z50II-04-003", "Z50II-04-004", "Z50II-04-005"):
    package = parts[part_id]
    package_gaps[part_id] = (pcb_front_y - evaluated_bounds(package)[1].y) * 1000.0
    leads = [obj for obj in root_meshes(package) if "_lead_" in obj.name]
    lead_gaps[part_id] = [
        (pcb_front_y - evaluated_bounds(lead)[1].y) * 1000.0 for lead in leads
    ]
low, high = CONTACT_GAP_TOLERANCES_MM["package_to_pcb"]
assert all(low <= gap <= high for gap in package_gaps.values()), package_gaps
low, high = CONTACT_GAP_TOLERANCES_MM["lead_to_pcb"]
assert all(low <= gap <= high for gaps in lead_gaps.values() for gap in gaps), lead_gaps

front_shield = parts["Z50II-04-006"]
spreader = parts["Z50II-04-009"]
pad = parts["Z50II-04-008"]
heat_cap = bpy.data.objects["Z50II_processor_heat_cap"]
processor = parts["Z50II-04-002"]
thermal_gaps = {
    "shield_to_spreader": gap_y(front_shield, spreader),
    "spreader_to_pad": gap_y(spreader, pad),
    "pad_to_cap": gap_y(pad, heat_cap),
    "cap_to_processor": gap_y(heat_cap, processor),
}
for interface, gap in thermal_gaps.items():
    low, high = CONTACT_GAP_TOLERANCES_MM[interface]
    assert low <= gap <= high, f"{interface} gap={gap:.3f} mm outside {low}-{high}"

# Battery terminals face the spring bank; the SD card floats inside all four
# cage boundaries rather than cutting through rails/roof/bridge.
terminal = bpy.data.objects["Z50II_battery_terminal_3"]
spring = bpy.data.objects["Z50II_battery_spring_contact_3"]
terminal_gap = gap_y(terminal, spring)
low, high = CONTACT_GAP_TOLERANCES_MM["battery_terminal_to_spring"]
assert low <= terminal_gap <= high, f"battery terminal/contact gap={terminal_gap:.3f} mm"
for index in range(1, 6):
    terminal_center = bpy.data.objects[f"Z50II_battery_terminal_{index}"].matrix_world.translation
    spring_name = "Z50II-05-003_battery_contacts" if index == 1 else f"Z50II_battery_spring_contact_{index}"
    spring_center = bpy.data.objects[spring_name].matrix_world.translation
    assert abs(terminal_center.x - spring_center.x) <= 1.0e-5
    assert abs(terminal_center.z - spring_center.z) <= 1.0e-5

card_min, card_max = evaluated_bounds(parts["Z50II-05-006"])
left_min, left_max = evaluated_bounds(bpy.data.objects["Z50II_sd_slot_left_rail"])
right_min, right_max = evaluated_bounds(bpy.data.objects["Z50II_sd_slot_right_rail"])
roof_min, roof_max = evaluated_bounds(bpy.data.objects["Z50II_sd_slot_roof"])
bridge_min, bridge_max = evaluated_bounds(bpy.data.objects["Z50II_sd_slot_lower_bridge"])
card_clearances = {
    "left": (card_min.x - left_max.x) * 1000.0,
    "right": (right_min.x - card_max.x) * 1000.0,
    "roof": (roof_min.z - card_max.z) * 1000.0,
    "bridge": (card_min.z - bridge_max.z) * 1000.0,
}
low, high = CONTACT_GAP_TOLERANCES_MM["card_to_cage"]
assert all(low <= gap <= high for gap in card_clearances.values()), card_clearances

print(
    "Internal geometry passed: cross_intersections=0, sweeps=8 clear, "
    f"package_gaps_mm={package_gaps}, thermal_gaps_mm={thermal_gaps}, "
    f"terminal_gap_mm={terminal_gap:.3f}, card_clearances_mm={card_clearances}"
)
