"""Containment-aware physical contract for the rear-LCD hinge."""

from __future__ import annotations

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


PIVOT_CENTER_MM = Vector((49.6, 35.15, -2.0))
PIN_INTERVAL_MM = (-19.0, 15.0)
INNER_INTERVALS_MM = ((-17.0, -8.0), (4.0, 13.0))
OUTER_INTERVALS_MM = ((-7.6, 3.6),)
PIN_RADIUS_MM = 1.45
BORE_RADIUS_MM = 1.65
INNER_OUTER_RADIUS_MM = 3.0
OUTER_OUTER_RADIUS_MM = 2.8
RADIAL_TOLERANCE_MM = 0.03
INTERVAL_TOLERANCE_MM = 0.11
MIN_RADIAL_CLEARANCE_MM = 0.15
MAX_RADIAL_CLEARANCE_MM = 0.25
AXIAL_GAP_MM = 0.40
AXIAL_GAP_TOLERANCE_MM = 0.11
PIN_END_CLEARANCE_MM = 2.0


parts = {obj["partId"]: obj for obj in bpy.data.objects if obj.get("partId")}
inner = parts["Z50II-07-005"]
outer = parts["Z50II-07-006"]
pin = parts["Z50II-07-007"]
depsgraph = bpy.context.evaluated_depsgraph_get()


def evaluated_geometry(obj):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        vertices = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
        polygons = [tuple(polygon.vertices) for polygon in mesh.polygons]
        return vertices, polygons
    finally:
        evaluated.to_mesh_clear()


def object_bvh(obj):
    vertices, polygons = evaluated_geometry(obj)
    return BVHTree.FromPolygons(vertices, polygons, all_triangles=False, epsilon=0.0)


def objects_overlap(first, second):
    return bool(object_bvh(first).overlap(object_bvh(second)))


def ray_hit_distance_mm(obj, origin_mm, direction, max_distance_mm=50.0):
    evaluated = obj.evaluated_get(depsgraph)
    inverse = evaluated.matrix_world.inverted()
    origin_world = Vector(origin_mm) / 1000.0
    direction_world = Vector(direction).normalized()
    hit, location, _normal, _face = evaluated.ray_cast(
        inverse @ origin_world,
        (inverse.to_3x3() @ direction_world).normalized(),
        distance=max_distance_mm / 1000.0,
    )
    if not hit:
        return None
    return ((evaluated.matrix_world @ location) - origin_world).length * 1000.0


def radial_inner_radius_mm(obj, z_mm, direction):
    origin = Vector((PIVOT_CENTER_MM.x, PIVOT_CENTER_MM.y, z_mm))
    return ray_hit_distance_mm(obj, origin, direction, 5.0)


def radial_outer_radius_mm(obj, z_mm, direction):
    direction = Vector(direction).normalized()
    origin = Vector((PIVOT_CENTER_MM.x, PIVOT_CENTER_MM.y, z_mm)) + direction * 5.0
    hit_distance = ray_hit_distance_mm(obj, origin, -direction, 10.0)
    assert hit_distance is not None
    return 5.0 - hit_distance


def measured_knuckle_intervals_mm(obj):
    step = 0.1
    start = -20.0
    samples = []
    for index in range(360):
        z_mm = start + (index + 0.5) * step
        hit = radial_inner_radius_mm(obj, z_mm, (1.0, 0.0, 0.0))
        samples.append((z_mm, hit is not None and hit <= 4.0))
    groups = []
    active = []
    for z_mm, occupied in samples:
        if occupied:
            active.append(z_mm)
        elif active:
            groups.append((active[0] - step / 2.0, active[-1] + step / 2.0))
            active = []
    if active:
        groups.append((active[0] - step / 2.0, active[-1] + step / 2.0))
    return tuple(groups)


def assert_intervals(actual, expected):
    assert len(actual) == len(expected), (actual, expected)
    for actual_span, expected_span in zip(actual, expected):
        assert all(
            abs(actual_value - expected_value) <= INTERVAL_TOLERANCE_MM
            for actual_value, expected_value in zip(actual_span, expected_span)
        ), (actual, expected)


def assert_closed_manifold_solid(obj):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        assert all(edge.is_manifold for edge in bm.edges), obj.name
        assert abs(bm.calc_volume(signed=True)) > 1.0e-9, obj.name
    finally:
        bm.free()
        evaluated.to_mesh_clear()


# The single pin is a real, closed solid with the specified radius and axial
# end clearances.  Unlike an annular knuckle it must block the center axis.
assert len([obj for obj in (pin, *pin.children_recursive) if obj.type == "MESH"]) == 1
assert_closed_manifold_solid(pin)
pin_bottom_hit = ray_hit_distance_mm(
    pin,
    (PIVOT_CENTER_MM.x, PIVOT_CENTER_MM.y, -25.0),
    (0.0, 0.0, 1.0),
)
pin_top_hit = ray_hit_distance_mm(
    pin,
    (PIVOT_CENTER_MM.x, PIVOT_CENTER_MM.y, 21.0),
    (0.0, 0.0, -1.0),
)
assert abs((-25.0 + pin_bottom_hit) - PIN_INTERVAL_MM[0]) <= 0.02
assert abs((21.0 - pin_top_hit) - PIN_INTERVAL_MM[1]) <= 0.02
for direction in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0)):
    measured = radial_inner_radius_mm(pin, PIVOT_CENTER_MM.z, direction)
    assert abs(measured - PIN_RADIUS_MM) <= RADIAL_TOLERANCE_MM, measured


# Arm roots must be annular at every declared knuckle segment.  A ray along
# the center axis detects the old capped-solid containment even when surfaces
# are nested without crossing and a conventional BVH overlap returns empty.
for arm in (inner, outer):
    assert_closed_manifold_solid(arm)
    axial_hit = ray_hit_distance_mm(
        arm,
        (PIVOT_CENTER_MM.x, PIVOT_CENTER_MM.y, -25.0),
        (0.0, 0.0, 1.0),
    )
    assert axial_hit is None, f"{arm['partId']} blocks its nominal hinge bore"

inner_intervals = measured_knuckle_intervals_mm(inner)
outer_intervals = measured_knuckle_intervals_mm(outer)
assert_intervals(inner_intervals, INNER_INTERVALS_MM)
assert_intervals(outer_intervals, OUTER_INTERVALS_MM)

directions = ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0))
for arm, intervals, expected_outer_radius in (
    (inner, INNER_INTERVALS_MM, INNER_OUTER_RADIUS_MM),
    (outer, OUTER_INTERVALS_MM, OUTER_OUTER_RADIUS_MM),
):
    for lower, upper in intervals:
        sample_z = (lower + upper) / 2.0
        bore_samples = [radial_inner_radius_mm(arm, sample_z, direction) for direction in directions]
        outer_samples = [radial_outer_radius_mm(arm, sample_z, direction) for direction in directions]
        assert all(sample is not None for sample in bore_samples)
        assert all(abs(sample - BORE_RADIUS_MM) <= RADIAL_TOLERANCE_MM for sample in bore_samples), bore_samples
        assert all(
            abs(sample - expected_outer_radius) <= RADIAL_TOLERANCE_MM
            for sample in outer_samples
        ), outer_samples

radial_clearance = BORE_RADIUS_MM - PIN_RADIUS_MM
assert MIN_RADIAL_CLEARANCE_MM <= radial_clearance <= MAX_RADIAL_CLEARANCE_MM
lower_gap = OUTER_INTERVALS_MM[0][0] - INNER_INTERVALS_MM[0][1]
upper_gap = INNER_INTERVALS_MM[1][0] - OUTER_INTERVALS_MM[0][1]
assert abs(lower_gap - AXIAL_GAP_MM) <= AXIAL_GAP_TOLERANCE_MM
assert abs(upper_gap - AXIAL_GAP_MM) <= AXIAL_GAP_TOLERANCE_MM
assert abs((INNER_INTERVALS_MM[0][0] - PIN_INTERVAL_MM[0]) - PIN_END_CLEARANCE_MM) <= 0.02
assert abs((PIN_INTERVAL_MM[1] - INNER_INTERVALS_MM[1][1]) - PIN_END_CLEARANCE_MM) <= 0.02


# Webs may merge into their own annular shell only.  They must not touch the
# other arm's knuckle or enter the pin envelope.
for owner, other, expected_attachment_count in ((inner, outer, 2), (outer, inner, 1)):
    owned_children = [
        child
        for child in owner.children_recursive
        if child.type == "MESH" and child.get("hingeOwnerPartId") == owner["partId"]
    ]
    attachments = [child for child in owned_children if child.get("knuckleAttachment") is True]
    assert len(attachments) == expected_attachment_count, (owner["partId"], [child.name for child in attachments])
    assert all(objects_overlap(owner, child) for child in attachments)
    assert all(not objects_overlap(other, child) for child in owned_children)
    assert all(not objects_overlap(pin, child) for child in owned_children)

assert not objects_overlap(inner, outer)
assert not objects_overlap(inner, pin)
assert not objects_overlap(outer, pin)

print(
    "LCD hinge geometry passed: "
    f"pin_radius_mm={PIN_RADIUS_MM:.2f}, bore_radius_mm={BORE_RADIUS_MM:.2f}, "
    f"radial_clearance_mm={radial_clearance:.2f}, inner_intervals_mm={inner_intervals}, "
    f"outer_intervals_mm={outer_intervals}, axial_gaps_mm=({lower_gap:.2f}, {upper_gap:.2f})"
)
