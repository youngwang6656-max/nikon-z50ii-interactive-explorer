"""Audit every declared removal path in free and guided disassembly modes."""

from __future__ import annotations

from itertools import combinations
from math import ceil
from pathlib import Path
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


BLENDER_ROOT = Path(__file__).resolve().parents[1]
if str(BLENDER_ROOT) not in sys.path:
    sys.path.insert(0, str(BLENDER_ROOT))
TESTS_ROOT = Path(__file__).resolve().parent
if str(TESTS_ROOT) not in sys.path:
    sys.path.insert(0, str(TESTS_ROOT))

from root_contact_contract import ALLOWED_ROOT_CONTACTS

MAX_SAMPLE_SPACING = 0.00025
parts = {obj["partId"]: obj for obj in bpy.data.objects if obj.get("partId")}
assert len(parts) == 100
depsgraph = bpy.context.evaluated_depsgraph_get()


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


_geometry_cache = {}
_stationary_bvh_cache = {}


def root_geometry(root):
    if root.name in _geometry_cache:
        return _geometry_cache[root.name]
    vertices = []
    polygons = []
    for obj in root_meshes(root):
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            offset = len(vertices)
            vertices.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
            polygons.extend(
                tuple(offset + index for index in polygon.vertices)
                for polygon in mesh.polygons
            )
        finally:
            evaluated.to_mesh_clear()
    assert vertices and polygons, root["partId"]
    minimum = Vector(tuple(min(point[axis] for point in vertices) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in vertices) for axis in range(3)))
    value = vertices, polygons, minimum, maximum
    _geometry_cache[root.name] = value
    return value


def translated_bounds(root, offset):
    _vertices, _polygons, minimum, maximum = root_geometry(root)
    return minimum + offset, maximum + offset


def bounds_overlap(first, second):
    first_min, first_max = first
    second_min, second_max = second
    return all(
        first_max[axis] >= second_min[axis]
        and first_min[axis] <= second_max[axis]
        for axis in range(3)
    )


def translated_bvh(root, offset):
    vertices, polygons, _minimum, _maximum = root_geometry(root)
    return BVHTree.FromPolygons(
        [vertex + offset for vertex in vertices],
        polygons,
        all_triangles=False,
        epsilon=0.0,
    )


def stationary_bvh(root):
    if root.name not in _stationary_bvh_cache:
        _stationary_bvh_cache[root.name] = translated_bvh(root, Vector())
    return _stationary_bvh_cache[root.name]


def roots_overlap(first, first_offset, second, second_offset=Vector()):
    if not bounds_overlap(
        translated_bounds(first, first_offset),
        translated_bounds(second, second_offset),
    ):
        return False
    first_tree = translated_bvh(first, first_offset)
    second_tree = (
        stationary_bvh(second)
        if second_offset.length_squared == 0.0
        else translated_bvh(second, second_offset)
    )
    return bool(first_tree.overlap(second_tree))


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


def sample_count(roots):
    maximum_distance = max(float(root["explodeDistance"]) for root in roots)
    return max(1, ceil(maximum_distance / MAX_SAMPLE_SPACING))


assembled_contacts = {
    frozenset((first_id, second_id))
    for first_id, second_id in combinations(sorted(parts), 2)
    if roots_overlap(parts[first_id], Vector(), parts[second_id])
}
unexpected_assembled_contacts = assembled_contacts - set(ALLOWED_ROOT_CONTACTS)
unobserved_allowed_contacts = set(ALLOWED_ROOT_CONTACTS) - assembled_contacts
assert not unexpected_assembled_contacts, (
    "undocumented assembled root contacts: "
    f"{sorted(tuple(sorted(pair)) for pair in unexpected_assembled_contacts)}"
)
assert not unobserved_allowed_contacts, (
    "pre-emptive root-contact exceptions: "
    f"{sorted(tuple(sorted(pair)) for pair in unobserved_allowed_contacts)}"
)


free_failures = {}
free_samples = 0
for part_id in sorted(parts):
    moving = parts[part_id]
    removed = dependency_closure(moving) | {part_id}
    blockers = [parts[other_id] for other_id in sorted(parts) if other_id not in removed]
    count = sample_count((moving,))
    axis = Vector(moving["explodeAxis"])
    released_contacts = set()
    for index in range(1, count + 1):
        offset = axis * float(moving["explodeDistance"]) * index / count
        free_samples += 1
        moving_bounds = translated_bounds(moving, offset)
        moving_tree = None
        for blocker in blockers:
            blocker_id = blocker["partId"]
            pair = frozenset((part_id, blocker_id))
            if not bounds_overlap(moving_bounds, translated_bounds(blocker, Vector())):
                if pair in ALLOWED_ROOT_CONTACTS:
                    released_contacts.add(pair)
                continue
            if moving_tree is None:
                moving_tree = translated_bvh(moving, offset)
            overlaps = bool(moving_tree.overlap(stationary_bvh(blocker)))
            if pair in ALLOWED_ROOT_CONTACTS and pair not in released_contacts:
                if not overlaps:
                    released_contacts.add(pair)
                    continue
                if index < count:
                    continue
            if overlaps:
                free_failures[part_id] = (
                    round(offset.length * 1000.0, 2),
                    blocker_id,
                )
                break
        if part_id in free_failures:
            break


guided_failures = {}
guided_samples = 0
for step in range(1, 41):
    moving_roots = sorted(
        (root for root in parts.values() if root["step"] == step),
        key=lambda root: root["partId"],
    )
    if len(moving_roots) < 2:
        continue
    blockers = sorted(
        (root for root in parts.values() if root["step"] > step),
        key=lambda root: root["partId"],
    )
    count = sample_count(moving_roots)
    released_contacts = set()
    for index in range(1, count + 1):
        fraction = index / count
        offsets = {
            root["partId"]: Vector(root["explodeAxis"])
            * float(root["explodeDistance"])
            * fraction
            for root in moving_roots
        }
        guided_samples += 1
        moving_trees = {}
        for moving in moving_roots:
            moving_id = moving["partId"]
            moving_bounds = translated_bounds(moving, offsets[moving_id])
            for blocker in blockers:
                blocker_id = blocker["partId"]
                pair = frozenset((moving_id, blocker_id))
                if not bounds_overlap(
                    moving_bounds, translated_bounds(blocker, Vector())
                ):
                    if pair in ALLOWED_ROOT_CONTACTS:
                        released_contacts.add(pair)
                    continue
                if moving_id not in moving_trees:
                    moving_trees[moving_id] = translated_bvh(
                        moving, offsets[moving_id]
                    )
                overlaps = bool(moving_trees[moving_id].overlap(stationary_bvh(blocker)))
                if pair in ALLOWED_ROOT_CONTACTS and pair not in released_contacts:
                    if not overlaps:
                        released_contacts.add(pair)
                        continue
                    if index < count:
                        continue
                if overlaps:
                    guided_failures.setdefault(step, []).append(
                        (
                            round(fraction, 4),
                            moving_id,
                            blocker_id,
                        )
                    )
                    break
        for first, second in combinations(moving_roots, 2):
            first_id = first["partId"]
            second_id = second["partId"]
            pair = frozenset((first_id, second_id))
            overlaps = roots_overlap(
                first,
                offsets[first_id],
                second,
                offsets[second_id],
            )
            if pair in ALLOWED_ROOT_CONTACTS and pair not in released_contacts:
                if not overlaps:
                    released_contacts.add(pair)
                    continue
                if index < count:
                    continue
            if overlaps:
                guided_failures.setdefault(step, []).append(
                    (round(fraction, 4), first_id, second_id)
                )
        if step in guided_failures:
            break


assert not free_failures and not guided_failures, (
    f"declared removal paths blocked; free={free_failures}; guided={guided_failures}"
)
print(
    "Removal-motion audit passed: "
    f"free_roots={len(parts)}, free_samples={free_samples}, "
    f"guided_groups={sum(1 for step in range(1, 41) if sum(root['step'] == step for root in parts.values()) > 1)}, "
    f"guided_samples={guided_samples}, max_spacing_mm={MAX_SAMPLE_SPACING * 1000.0:.2f}"
)
