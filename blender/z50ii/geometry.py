"""Metre-native Blender primitive helpers with millimetre call-site inputs."""

from __future__ import annotations

from math import radians
from typing import Sequence

import bpy
from mathutils import Vector

from .constants import mm
from .materials import assign_material


def _rotation(rotation_deg: Sequence[float]) -> tuple[float, float, float]:
    return tuple(radians(value) for value in rotation_deg)


def _move_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for existing in tuple(obj.users_collection):
        existing.objects.unlink(obj)
    collection.objects.link(obj)


def _activate(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def _apply_scale(obj: bpy.types.Object) -> None:
    _activate(obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def _smooth(obj: bpy.types.Object) -> None:
    if isinstance(obj.data, bpy.types.Mesh):
        for polygon in obj.data.polygons:
            polygon.use_smooth = True


def _bevel(obj: bpy.types.Object, width_mm: float, *, segments: int = 3) -> None:
    if width_mm <= 0:
        return
    bevel = obj.modifiers.new(name="Edge soften", type="BEVEL")
    bevel.width = mm(width_mm)
    bevel.segments = segments
    bevel.limit_method = "ANGLE"
    if hasattr(bevel, "harden_normals"):
        bevel.harden_normals = True


def _finish(
    obj: bpy.types.Object,
    collection: bpy.types.Collection,
    material: bpy.types.Material | None,
    bevel_mm: float,
    *,
    smooth: bool = True,
) -> bpy.types.Object:
    _move_to_collection(obj, collection)
    _apply_scale(obj)
    _bevel(obj, bevel_mm)
    assign_material(obj, material)
    if smooth:
        _smooth(obj)
    return obj


def rounded_box(name, size_mm, location_mm, bevel_mm, collection, material):
    bpy.ops.mesh.primitive_cube_add(location=tuple(mm(value) for value in location_mm))
    obj = bpy.context.active_object
    obj.name = name
    obj.dimensions = tuple(mm(value) for value in size_mm)
    return _finish(obj, collection, material, bevel_mm, smooth=False)


def cylinder(name, radius_mm, depth_mm, location_mm, rotation_deg, collection, material, vertices=64):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=mm(radius_mm),
        depth=mm(depth_mm),
        location=tuple(mm(value) for value in location_mm),
        rotation=_rotation(rotation_deg),
    )
    obj = bpy.context.active_object
    obj.name = name
    return _finish(obj, collection, material, min(radius_mm * 0.15, 0.35))


def torus(name, major_radius_mm, minor_radius_mm, location_mm, rotation_deg, collection, material):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=mm(major_radius_mm),
        minor_radius=mm(minor_radius_mm),
        major_segments=64,
        minor_segments=16,
        location=tuple(mm(value) for value in location_mm),
        rotation=_rotation(rotation_deg),
    )
    obj = bpy.context.active_object
    obj.name = name
    return _finish(obj, collection, material, min(minor_radius_mm * 0.2, 0.2))


def panel(name, outline_mm, thickness_mm, location_mm, rotation_deg, collection, material):
    outline = [tuple(point[:2]) for point in outline_mm]
    if len(outline) < 3:
        raise ValueError("A panel outline needs at least three points.")
    half_thickness = mm(thickness_mm) / 2.0
    vertices = [(mm(x), -half_thickness, mm(z)) for x, z in outline]
    vertices += [(mm(x), half_thickness, mm(z)) for x, z in outline]
    count = len(outline)
    faces = [tuple(range(count)), tuple(range(count, count * 2))]
    faces += [
        (index, (index + 1) % count, (index + 1) % count + count, index + count)
        for index in range(count)
    ]
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = tuple(mm(value) for value in location_mm)
    obj.rotation_euler = _rotation(rotation_deg)
    return _finish(obj, collection, material, min(thickness_mm * 0.3, 0.25))


def flex_cable(name, points_mm, width_mm, thickness_mm, collection, material):
    points = [Vector(tuple(mm(value) for value in point)) for point in points_mm]
    if len(points) < 2:
        raise ValueError("A flex cable needs at least two points.")
    half_width = mm(width_mm) / 2.0
    half_thickness = mm(thickness_mm) / 2.0
    vertices = []
    for index, point in enumerate(points):
        tangent = (points[min(index + 1, len(points) - 1)] - points[max(index - 1, 0)]).normalized()
        sideways = tangent.cross(Vector((0.0, 0.0, 1.0)))
        if sideways.length < 1e-9:
            sideways = tangent.cross(Vector((0.0, 1.0, 0.0)))
        sideways.normalize()
        vertices.extend(
            [
                tuple(point - sideways * half_width - Vector((0.0, 0.0, half_thickness))),
                tuple(point + sideways * half_width - Vector((0.0, 0.0, half_thickness))),
                tuple(point - sideways * half_width + Vector((0.0, 0.0, half_thickness))),
                tuple(point + sideways * half_width + Vector((0.0, 0.0, half_thickness))),
            ]
        )
    faces = []
    for index in range(len(points) - 1):
        current = index * 4
        following = (index + 1) * 4
        faces.extend(
            [
                (current, following, following + 1, current + 1),
                (current + 2, current + 3, following + 3, following + 2),
                (current, current + 2, following + 2, following),
                (current + 1, following + 1, following + 3, current + 3),
            ]
        )
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    return _finish(obj, collection, material, min(thickness_mm * 0.4, 0.15), smooth=False)


def fastener(name, location_mm, rotation_deg, collection, material, head_mm=3.0, length_mm=5.0):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=32,
        radius=mm(head_mm) / 2.0,
        depth=mm(length_mm),
        location=tuple(mm(value) for value in location_mm),
        rotation=_rotation(rotation_deg),
    )
    obj = bpy.context.active_object
    obj.name = name
    return _finish(obj, collection, material, min(head_mm * 0.12, 0.25))
