"""Procedural module 02: profiled Z50II-like exterior skins and controls."""

from __future__ import annotations

from math import cos, pi, radians, sin

import bpy
from mathutils import Matrix

from z50ii.constants import mm
from z50ii.geometry import cylinder, rounded_box, torus
from z50ii.materials import assign_material, get_material
from z50ii.metadata import attach_part_metadata


MODULE_ID = "02_outer_shell_controls"


PART_META = {
    "Z50II-02-001": ("", "前壳", "Front shell", 8, (0, -1, 0), 55, ("Z50II-02-003",)),
    "Z50II-02-002": ("Z50II-02-001", "握柄橡胶", "Grip rubber", 9, (0, -1, 0), 38, ("Z50II-02-001", "Z50II-02-006")),
    "Z50II-02-003": ("Z50II-02-001", "顶壳", "Top shell", 7, (0, 0, 1), 42, ("Z50II-02-005", "Z50II-02-006")),
    "Z50II-02-004": ("Z50II-02-001", "底壳", "Bottom shell", 4, (0, 0, -1), 35, ("Z50II-02-007",)),
    "Z50II-02-005": ("Z50II-02-001", "左侧盖", "Left side cover", 5, (1, 0, 0), 30, ("Z50II-02-004", "Z50II-02-008", "Z50II-02-009")),
    "Z50II-02-006": ("Z50II-02-001", "右握柄盖", "Right grip cover", 6, (-1, 0, 0), 34, ("Z50II-02-004",)),
    "Z50II-02-007": ("Z50II-02-004", "电池舱门", "Battery door", 1, (0, 0, -1), 24, ()),
    "Z50II-02-008": ("Z50II-02-005", "上接口舱门", "Upper port door", 2, (1, 0, 0), 22, ()),
    "Z50II-02-009": ("Z50II-02-005", "下接口舱门", "Lower port door", 3, (1, 0, 0), 22, ()),
    "Z50II-02-010": ("Z50II-02-002", "快门释放按钮", "Shutter-release button", 12, (0, 0, 1), 18, ("Z50II-02-002",)),
    "Z50II-02-011": ("Z50II-02-010", "电源环", "Power collar", 13, (0, 0, 1), 18, ("Z50II-02-010",)),
    "Z50II-02-012": ("Z50II-02-002", "前指令拨轮", "Front command dial", 14, (-1, 0, 0), 20, ("Z50II-02-002",)),
    "Z50II-02-013": ("Z50II-02-003", "后指令拨轮", "Rear command dial", 15, (-1, 0, 0), 20, ("Z50II-02-003",)),
    "Z50II-02-014": ("Z50II-02-003", "模式拨盘", "Mode dial", 16, (0, 0, 1), 22, ("Z50II-02-003",)),
    "Z50II-02-015": ("Z50II-02-003", "照片／视频选择器", "Photo/video selector", 17, (0, 1, 0), 18, ("Z50II-02-003",)),
    "Z50II-02-016": ("Z50II-02-001", "Fn1按钮", "Fn1 button", 18, (0, -1, 0), 16, ("Z50II-02-001",)),
    "Z50II-02-017": ("Z50II-02-001", "Fn2按钮", "Fn2 button", 19, (0, -1, 0), 16, ("Z50II-02-016",)),
    "Z50II-02-018": ("Z50II-02-001", "镜头释放按钮", "Lens-release button", 20, (0, -1, 0), 16, ("Z50II-02-001",)),
    "Z50II-02-019": ("Z50II-02-005", "左肩带环", "Left strap lug", 10, (1, 0, 0), 24, ("Z50II-02-005",)),
    "Z50II-02-020": ("Z50II-02-006", "右肩带环", "Right strap lug", 11, (-1, 0, 0), 24, ("Z50II-02-006",)),
}


def _clear(collection: bpy.types.Collection) -> None:
    for obj in tuple(collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def _move_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for existing in tuple(obj.users_collection):
        existing.objects.unlink(obj)
    collection.objects.link(obj)


def _parent(child: bpy.types.Object, parent: bpy.types.Object) -> bpy.types.Object:
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()
    return child


def _mesh_object(name, vertices_mm, faces, collection, material) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata([tuple(mm(value) for value in vertex) for vertex in vertices_mm], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    assign_material(obj, material)
    return obj


def _solidify(obj: bpy.types.Object, thickness_mm: float) -> None:
    modifier = obj.modifiers.new(name="Shell thickness", type="SOLIDIFY")
    modifier.thickness = mm(thickness_mm)
    modifier.offset = -1.0
    modifier.use_even_offset = True


def _bevel(obj: bpy.types.Object, width_mm: float, segments: int = 3) -> None:
    modifier = obj.modifiers.new(name="Controlled edge soften", type="BEVEL")
    modifier.width = mm(width_mm)
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    if hasattr(modifier, "harden_normals"):
        modifier.harden_normals = True


def _profile_shell_y(
    name: str,
    profiles: tuple[tuple[float, tuple[tuple[float, float], ...]], ...],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    *,
    thickness_mm: float,
    bevel_mm: float,
    cap_front: bool = True,
    cap_back: bool = False,
) -> bpy.types.Object:
    """Loft matched X/Z profiles along Y as a thin, potentially open-back skin."""
    count = len(profiles[0][1])
    if any(len(outline) != count for _, outline in profiles):
        raise ValueError("Loft profiles must have matching vertex counts")
    vertices = [(x, y, z) for y, outline in profiles for x, z in outline]
    faces = []
    for section in range(len(profiles) - 1):
        start = section * count
        following = (section + 1) * count
        for index in range(count):
            nxt = (index + 1) % count
            faces.append((start + index, start + nxt, following + nxt, following + index))
    if cap_front:
        faces.append(tuple(reversed(range(count))))
    if cap_back:
        base = (len(profiles) - 1) * count
        faces.append(tuple(base + index for index in range(count)))
    obj = _mesh_object(name, vertices, faces, collection, material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    _solidify(obj, thickness_mm)
    _bevel(obj, bevel_mm)
    return obj


def _loft_grip_skin(name, collection, material) -> bpy.types.Object:
    levels = (
        (-38.0, 53.0, -14.0, 15.0, 13.0),
        (-34.0, 53.4, -14.5, 15.5, 15.0),
        (-28.0, 54.0, -15.0, 15.8, 17.0),
        (-20.0, 54.8, -15.2, 15.6, 17.6),
        (-11.0, 55.5, -14.9, 15.0, 17.9),
        (-3.0, 55.9, -14.3, 14.6, 17.7),
        (4.0, 56.0, -13.5, 14.5, 17.0),
        (11.0, 55.7, -12.4, 14.5, 15.8),
        (17.0, 55.2, -10.8, 14.6, 14.3),
        (22.0, 54.3, -8.7, 14.5, 12.5),
        (26.0, 53.0, -6.3, 14.0, 10.3),
        (30.0, 50.7, -3.0, 12.0, 7.2),
        (32.0, 49.0, -1.0, 11.5, 5.3),
    )
    segments = 64
    vertices = []
    for z, center_x, center_y, radius_x, radius_y in levels:
        for index in range(segments):
            angle = 2.0 * pi * index / segments
            vertices.append(
                (
                    center_x + radius_x * cos(angle),
                    center_y + radius_y * sin(angle),
                    z,
                )
            )
    faces = []
    for level in range(len(levels) - 1):
        start = level * segments
        following = (level + 1) * segments
        for index in range(segments):
            nxt = (index + 1) % segments
            faces.append((start + index, start + nxt, following + nxt, following + index))
    obj = _mesh_object(name, vertices, faces, collection, material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    _solidify(obj, 1.8)
    _bevel(obj, 0.7, 2)
    return obj


def _pill_prism_y(
    name,
    width_mm,
    height_mm,
    depth_mm,
    location_mm,
    collection,
    material,
    *,
    segments=12,
    bevel_mm=0.3,
):
    radius = width_mm / 2.0
    straight = height_mm / 2.0 - radius
    outline = []
    for index in range(segments + 1):
        angle = pi * index / segments
        outline.append((radius * cos(angle), straight + radius * sin(angle)))
    for index in range(segments + 1):
        angle = pi + pi * index / segments
        outline.append((radius * cos(angle), -straight + radius * sin(angle)))
    half_depth = depth_mm / 2.0
    count = len(outline)
    vertices = [(x, -half_depth, z) for x, z in outline]
    vertices += [(x, half_depth, z) for x, z in outline]
    faces = [tuple(reversed(range(count))), tuple(count + index for index in range(count))]
    faces += [
        (index, (index + 1) % count, count + (index + 1) % count, count + index)
        for index in range(count)
    ]
    obj = _mesh_object(name, vertices, faces, collection, material)
    obj.location = tuple(mm(value) for value in location_mm)
    if bevel_mm > 0:
        _bevel(obj, bevel_mm, 3)
    return obj


def _pill_cut(target, name, width_mm, height_mm, depth_mm, location_mm, collection):
    x, y, z = location_mm
    straight = max(0.0, (height_mm - width_mm) / 2.0)
    _box_cut(target, f"{name}_web", (width_mm, depth_mm, height_mm - width_mm), location_mm)
    for suffix, z_offset in (("upper", straight), ("lower", -straight)):
        _round_cut(
            target,
            f"{name}_{suffix}",
            width_mm / 2.0,
            depth_mm,
            (x, y, z + z_offset),
            (90, 0, 0),
        )


def _pill_seat(name, width_mm, height_mm, location_mm, collection, material, parent):
    seat = _pill_prism_y(name, width_mm, height_mm, 0.55, location_mm, collection, material, bevel_mm=0.3)
    _pill_cut(
        seat,
        f"{name}_inner",
        width_mm - 1.1,
        height_mm - 1.1,
        2.0,
        location_mm,
        collection,
    )
    _post_cut_finish(seat, 0.22)
    return _parent(seat, parent)


def _mirror_export_hierarchy_x(collection: bpy.types.Collection) -> None:
    """Reflect every export node across X and bake meshes to proper transforms."""
    reflection = Matrix.Diagonal((-1.0, 1.0, 1.0, 1.0))
    objects = list(collection.all_objects)
    parents = {obj: obj.parent if obj.parent in objects else None for obj in objects}
    source_world = {obj: obj.matrix_world.copy() for obj in objects}

    # Work in world space so a child is reflected exactly once, independent of
    # its parent's transform. Re-parenting below restores the logical hierarchy.
    for obj in objects:
        obj.parent = None
        obj.matrix_world = source_world[obj]

    for obj in objects:
        obj.matrix_world = reflection @ source_world[obj]
        if obj.type in {"MESH", "CURVE", "SURFACE", "META", "FONT", "ARMATURE"}:
            bpy.ops.object.select_all(action="DESELECT")
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        else:
            # An empty has no geometry into which a reflection can be baked.
            # Conjugating its basis preserves the reflected anchor position and
            # yields a proper coordinate frame for downstream decal projection.
            obj.matrix_world = obj.matrix_world @ reflection

    reflected_world = {obj: obj.matrix_world.copy() for obj in objects}
    for obj in objects:
        parent = parents[obj]
        if parent is not None:
            obj.parent = parent
            obj.matrix_parent_inverse = parent.matrix_world.inverted()
            obj.matrix_world = reflected_world[obj]
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def _side_panel(name, x_center, thickness, outline_yz, collection, material, bevel_mm=0.6):
    half = thickness / 2.0
    count = len(outline_yz)
    vertices = [(x_center - half, y, z) for y, z in outline_yz]
    vertices += [(x_center + half, y, z) for y, z in outline_yz]
    faces = [tuple(reversed(range(count))), tuple(count + index for index in range(count))]
    faces += [
        (index, (index + 1) % count, count + (index + 1) % count, count + index)
        for index in range(count)
    ]
    obj = _mesh_object(name, vertices, faces, collection, material)
    _bevel(obj, bevel_mm)
    return obj


def _bottom_plate(name, outline_xy, z_center, thickness, collection, material):
    half = thickness / 2.0
    count = len(outline_xy)
    vertices = [(x, y, z_center - half) for x, y in outline_xy]
    vertices += [(x, y, z_center + half) for x, y in outline_xy]
    faces = [tuple(reversed(range(count))), tuple(count + index for index in range(count))]
    faces += [
        (index, (index + 1) % count, count + (index + 1) % count, count + index)
        for index in range(count)
    ]
    obj = _mesh_object(name, vertices, faces, collection, material)
    _bevel(obj, 0.9)
    return obj


def _boolean_difference(target: bpy.types.Object, cutter: bpy.types.Object, name: str) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    for existing in tuple(target.modifiers):
        bpy.ops.object.modifier_apply(modifier=existing.name)
    modifier = target.modifiers.new(name=name, type="BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.solver = "EXACT"
    modifier.object = cutter
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def _round_cut(target, name, radius_mm, depth_mm, location_mm, rotation_deg):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=96,
        radius=mm(radius_mm),
        depth=mm(depth_mm),
        location=tuple(mm(value) for value in location_mm),
        rotation=tuple(radians(value) for value in rotation_deg),
    )
    cutter = bpy.context.active_object
    cutter.name = name
    _boolean_difference(target, cutter, f"{name}_difference")


def _box_cut(target, name, size_mm, location_mm):
    bpy.ops.mesh.primitive_cube_add(location=tuple(mm(value) for value in location_mm))
    cutter = bpy.context.active_object
    cutter.name = name
    cutter.dimensions = tuple(mm(value) for value in size_mm)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _boolean_difference(target, cutter, f"{name}_difference")


def _post_cut_finish(obj: bpy.types.Object, width_mm: float = 0.35) -> None:
    _bevel(obj, width_mm, 3)
    if isinstance(obj.data, bpy.types.Mesh):
        for polygon in obj.data.polygons:
            polygon.use_smooth = True


def _decal_anchor(name, role, location_mm, size_mm, collection, parent):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "CUBE"
    obj.empty_display_size = mm(size_mm)
    obj.location = tuple(mm(value) for value in location_mm)
    obj.hide_render = True
    obj["decalTargetTask"] = 8
    obj["decalRole"] = role
    obj["decalProjection"] = "front_shell_uv"
    collection.objects.link(obj)
    return _parent(obj, parent)


def _knurl_z(parent, prefix, center, radius, z, collection, material, count=24):
    for index in range(count):
        angle = 2.0 * pi * index / count
        tooth = rounded_box(
            f"{prefix}{index:02d}",
            (1.2, 2.4, 1.1),
            (center[0] + radius * cos(angle), center[1] + radius * sin(angle), z),
            0.25,
            collection,
            material,
        )
        tooth.rotation_euler[2] = angle
        _parent(tooth, parent)


def _knurl_x(parent, prefix, x, center_yz, radius, collection, material, count=18):
    for index in range(count):
        angle = 2.0 * pi * index / count
        tooth = rounded_box(
            f"{prefix}{index:02d}",
            (1.0, 1.2, 2.0),
            (x, center_yz[0] + radius * cos(angle), center_yz[1] + radius * sin(angle)),
            0.2,
            collection,
            material,
        )
        tooth.rotation_euler[0] = -angle
        _parent(tooth, parent)


def _annotate(obj: bpy.types.Object, part_id: str, description_zh: str, description_en: str):
    parent_id, name_zh, name_en, step, axis, distance, dependencies = PART_META[part_id]
    return attach_part_metadata(
        obj,
        part_id=part_id,
        module_id=MODULE_ID,
        parent_id=parent_id,
        name_zh=name_zh,
        name_en=name_en,
        description_zh=description_zh,
        description_en=description_en,
        step=step,
        explode_axis=axis,
        explode_distance_mm=distance,
        depends_on=dependencies,
        is_reference_geometry=True,
    )


def build_outer_shell_controls() -> list[bpy.types.Object]:
    collection = bpy.data.collections[MODULE_ID]
    _clear(collection)

    shell = get_material("Z50II Black Shell", (0.018, 0.021, 0.024, 1), metallic=0.08, roughness=0.48)
    edge = get_material("Z50II Charcoal Shell", (0.035, 0.039, 0.043, 1), metallic=0.06, roughness=0.52)
    rubber = get_material("Z50II Grip Rubber", (0.012, 0.014, 0.016, 1), metallic=0.0, roughness=0.83)
    control = get_material("Z50II Controls", (0.025, 0.028, 0.031, 1), metallic=0.16, roughness=0.38)
    metal = get_material("Z50II Exterior Metal", (0.32, 0.35, 0.38, 1), metallic=0.92, roughness=0.24)
    glass = get_material("Z50II Dark Glass", (0.004, 0.010, 0.014, 1), metallic=0.2, roughness=0.11)
    red = get_material("Z50II Red Accent", (0.45, 0.01, 0.014, 1), metallic=0.0, roughness=0.34)

    body_outline = (
        (-55.0, -29.0), (-55.0, 15.0), (-54.0, 22.0), (-51.0, 28.0),
        (-46.0, 32.0), (-38.0, 34.0), (-28.0, 34.5), (-24.0, 37.0),
        (-21.0, 39.0), (14.0, 39.0), (18.0, 36.0), (20.0, 34.0),
        (35.0, 34.0), (42.0, 32.0), (48.0, 28.0), (52.0, 22.0),
        (53.0, 14.0), (53.0, -18.0), (51.0, -25.0), (47.0, -31.0),
        (40.0, -34.0), (32.0, -36.0), (-43.0, -36.0), (-50.0, -34.0),
    )
    body_profile_2 = tuple((x * 0.998, z + (0.15 if z > 30 else 0.0)) for x, z in body_outline)
    body_profile_3 = tuple((x * 0.995, z + (0.35 if z > 30 else 0.0)) for x, z in body_outline)
    body_profile_4 = tuple((x * 0.990, z + (0.55 if z > 30 else 0.0)) for x, z in body_outline)
    rear_outline = tuple((x * 0.985, z + (0.75 if z > 25 else 0.0)) for x, z in body_outline)
    front_shell = _profile_shell_y(
        "Z50II-02-001_front_shell",
        (
            (0.0, body_outline),
            (7.0, body_profile_2),
            (16.0, body_profile_3),
            (25.0, body_profile_4),
            (32.0, rear_outline),
        ),
        collection,
        shell,
        thickness_mm=1.8,
        bevel_mm=0.9,
        cap_front=True,
        cap_back=False,
    )
    # The shell cut clears the complete selectable mount assembly. The actual
    # 55 mm optical opening remains defined by the Task-6 ring's 27.5 mm inner
    # radius, not by a second exterior torus embedded in the shell.
    _round_cut(front_shell, "reserved_z_mount_opening_55mm", 30.15, 7.0, (0, 1.5, 0), (90, 0, 0))
    # Continue the bottom-shell bay through the lower skirt so the battery and
    # card have a real vertical service path after the door is removed. Source
    # +X is photographer-right after the final handedness reflection.
    _box_cut(front_shell, "battery_card_vertical_chute", (33.0, 28.0, 48.0), (35.0, 17.0, -16.0))
    _pill_cut(front_shell, "fn1_pill_bore", 5.9, 9.9, 20.0, (35, 0.6, 8), collection)
    _pill_cut(front_shell, "fn2_pill_bore", 5.7, 9.5, 20.0, (35, 0.6, -3.5), collection)
    _round_cut(front_shell, "lens_release_bore", 3.6, 5.0, (34.5, 0.6, 7), (90, 0, 0))
    _box_cut(front_shell, "rear_display_hinge_pocket", (7.0, 7.0, 25.0), (-53.0, 30.0, -4.0))
    _post_cut_finish(front_shell, 0.45)

    seat_angles = (55, 125, 235, 305)
    seat_radius = 32.0
    first_angle = radians(seat_angles[0])
    mount_lip = rounded_box(
        "Z50II_mount_interface_lip",
        (3.0, 0.40, 5.2),
        (seat_radius * cos(first_angle), -0.55, seat_radius * sin(first_angle)),
        0.45,
        collection,
        metal,
    )
    mount_lip.rotation_euler[1] = -first_angle
    mount_lip["mountRole"] = "recessed_seat"
    mount_lip["continuousRing"] = False
    _parent(mount_lip, front_shell)
    for index, angle_degrees in enumerate(seat_angles[1:], start=2):
        angle = radians(angle_degrees)
        pad = rounded_box(
            f"Z50II_mount_recessed_seat_{index}",
            (3.0, 0.40, 5.2),
            (seat_radius * cos(angle), -0.55, seat_radius * sin(angle)),
            0.45,
            collection,
            metal,
        )
        pad.rotation_euler[1] = -angle
        _parent(pad, front_shell)
    for suffix, size, location in (
        ("top", (86, 1.8, 3.0), (-3, 32.3, 29)),
        ("bottom", (88, 1.8, 3.0), (-3, 32.3, -31)),
        ("left", (3.0, 1.8, 57), (-47, 32.3, -1)),
        ("right", (3.0, 1.8, 57), (41, 32.3, -1)),
    ):
        _parent(rounded_box(f"Z50II_rear_interface_flange_{suffix}", size, location, 0.6, collection, edge), front_shell)
    display_pocket = rounded_box(
        "Z50II_display_hinge_pocket_reveal",
        (1.4, 5.0, 22.0),
        (-51.8, 29.4, -4.0),
        0.35,
        collection,
        glass,
    )
    _parent(display_pocket, front_shell)
    _parent(rounded_box("Z50II_display_hinge_upper_land", (7, 4, 3), (-50, 29.5, 10), 0.7, collection, edge), front_shell)
    _parent(rounded_box("Z50II_display_hinge_lower_land", (7, 4, 3), (-50, 29.5, -18), 0.7, collection, edge), front_shell)
    for index, angle in enumerate((35, 145, 215, 325)):
        x = 33.0 * cos(radians(angle))
        z = 33.0 * sin(radians(angle))
        boss = cylinder(f"Z50II_front_mount_boss_{index + 1}", 2.8, 3.2, (x, 3.0, z), (90, 0, 0), collection, edge, vertices=32)
        _parent(boss, front_shell)
    _pill_seat("Z50II_fn1_pill_seat", 6.7, 10.7, (35, -0.55, 8), collection, edge, front_shell)
    _pill_seat("Z50II_fn2_pill_seat", 6.5, 10.3, (35, -0.55, -3.5), collection, edge, front_shell)
    _parent(torus("Z50II_lens_release_seat", 4.1, 0.45, (34.5, -0.55, 7), (90, 0, 0), collection, edge), front_shell)
    _decal_anchor("Z50II_brand_decal_anchor", "brand", (-18, -0.8, 27), 8.0, collection, front_shell)
    _decal_anchor("Z50II_model_decal_anchor", "model", (-41, -0.8, -27), 4.0, collection, front_shell)
    _annotate(front_shell, "Z50II-02-001", "带开放后部、内翻边和55毫米卡口开口的薄壁外壳参考重建。", "Thin open-back reference shell with inner flanges and a 55 mm mount opening.")

    grip_rubber = _loft_grip_skin("Z50II-02-002_grip_rubber", collection, rubber)
    _round_cut(grip_rubber, "shutter_power_seat_cut", 6.6, 4.5, (49, -3, 30.8), (0, 0, 0))
    _post_cut_finish(grip_rubber, 0.4)
    shutter_seat = torus(
        "Z50II_shutter_power_receiving_seat",
        5.1,
        0.8,
        (49, -3, 30.4),
        (0, 0, 0),
        collection,
        edge,
    )
    _parent(shutter_seat, grip_rubber)
    _parent(
        cylinder(
            "Z50II_shutter_power_seat_floor",
            4.3,
            0.7,
            (49, -3, 29.9),
            (0, 0, 0),
            collection,
            control,
            vertices=64,
        ),
        grip_rubber,
    )
    _annotate(grip_rubber, "Z50II-02-002", "带收腰和掌托过渡的1.8毫米中空握柄蒙皮参考件。", "Hollow 1.8 mm grip skin with undercut and palm-support transitions.")

    deck_front = ((-50, 30), (-39, 36), (-27, 38), (28, 38), (45, 35), (52, 30))
    deck_rear = ((-49, 30), (-38, 35), (-26, 37), (28, 37), (44, 34), (50, 30))
    top_shell = _profile_shell_y(
        "Z50II-02-003_top_shell",
        (
            (2.0, deck_front),
            (9.0, deck_front),
            (17.0, deck_front),
            (24.0, tuple((x * 0.995, z - 0.25) for x, z in deck_front)),
            (31.0, deck_rear),
        ),
        collection,
        shell,
        thickness_mm=1.8,
        bevel_mm=0.8,
        cap_front=True,
        cap_back=True,
    )
    evf_crown_shape = (
        (-1.00, 0.00), (-0.99, 0.10), (-0.97, 0.18), (-0.93, 0.26),
        (-0.88, 0.36), (-0.82, 0.46), (-0.75, 0.56), (-0.68, 0.66),
        (-0.60, 0.76), (-0.52, 0.85), (-0.48, 0.90), (-0.44, 0.943),
        (-0.40, 0.975), (-0.36, 0.991), (-0.31, 0.998), (-0.25, 1.00),
        (-0.18, 1.00), (0.00, 1.00), (0.18, 1.00), (0.25, 1.00),
        (0.31, 0.998), (0.36, 0.991), (0.40, 0.975), (0.44, 0.943),
        (0.48, 0.90), (0.52, 0.85),
        (0.60, 0.76), (0.68, 0.66), (0.75, 0.56), (0.82, 0.46),
        (0.88, 0.36), (0.93, 0.26), (0.97, 0.18), (0.99, 0.10),
        (1.00, 0.00),
    )

    def evf_profile(center_x, width, crown_z):
        height = crown_z - 37.0
        return tuple(
            (center_x + width * 0.5 * x_fraction, 37.0 + height * z_fraction)
            for x_fraction, z_fraction in evf_crown_shape
        )

    evf = _profile_shell_y(
        "Z50II_evf_housing",
        (
            (9.0, evf_profile(-3.5, 45.0, 54.2)),
            (10.5, evf_profile(-3.5, 45.0, 54.2)),
            (15.0, evf_profile(-3.5, 44.5, 54.6)),
            (21.0, evf_profile(-3.5, 43.5, 54.8)),
            (27.0, evf_profile(-3.5, 42.0, 54.0)),
            (32.5, evf_profile(-3.5, 39.0, 52.8)),
            (34.0, evf_profile(-3.5, 39.0, 52.8)),
        ),
        collection,
        shell,
        thickness_mm=1.7,
        bevel_mm=0.75,
        cap_front=True,
        cap_back=True,
    )
    _box_cut(evf, "evf_viewing_aperture", (17.0, 5.0, 8.0), (-5, 33.2, 45))
    _post_cut_finish(evf, 0.4)
    _parent(evf, top_shell)
    _parent(rounded_box("Z50II_evf_eyepiece_glass", (15, 0.8, 6.5), (-5, 32.0, 45), 1.4, collection, glass), top_shell)
    _parent(rounded_box("Z50II_hot_shoe_land", (15, 13, 1.3), (-4, 22, 38.6), 0.35, collection, metal), top_shell)
    _annotate(top_shell, "Z50II-02-003", "带斜肩、复合EVF隆起与热靴安装面的薄壁顶壳参考件。", "Thin profiled top shell with sloped shoulders, compound EVF hump, and hot-shoe land.")

    bottom_shell = _bottom_plate(
        "Z50II-02-004_bottom_shell",
        ((-51, 2), (44, 2), (53, 8), (52, 29), (42, 33), (-47, 32), (-54, 25), (-54, 8)),
        -39.0,
        2.0,
        collection,
        edge,
    )
    _box_cut(bottom_shell, "battery_bay_opening", (33.0, 26.0, 5.0), (35.0, 17.0, -39.0))
    _box_cut(bottom_shell, "battery_bay_hinge_clearance", (4.0, 21.0, 5.0), (20.5, 17.0, -39.0))
    _box_cut(bottom_shell, "battery_bay_latch_clearance", (4.0, 5.0, 5.0), (49.5, 27.5, -39.0))
    _post_cut_finish(bottom_shell, 0.35)
    _parent(rounded_box("Z50II_bottom_front_transition", (92, 5, 3.0), (-2, 3, -37.1), 1.2, collection, shell), bottom_shell)
    battery_reveal = rounded_box(
        "Z50II_battery_bay_reveal",
        (33.0, 1.2, 1.0),
        (35.0, 4.3, -38.4),
        0.3,
        collection,
        edge,
    )
    _parent(battery_reveal, bottom_shell)
    for suffix, size, location in (
        ("rear", (33.0, 1.2, 1.0), (35.0, 29.7, -38.4)),
        ("hinge", (1.2, 24.0, 1.0), (18.8, 17.0, -38.4)),
        ("latch", (1.2, 22.0, 1.0), (51.2, 16.0, -38.4)),
    ):
        _parent(rounded_box(f"Z50II_battery_bay_reveal_{suffix}", size, location, 0.3, collection, edge), bottom_shell)
    _annotate(bottom_shell, "Z50II-02-004", "带收窄前后过渡和电池舱安装面的2毫米底部蒙皮。", "Two-millimetre base skin with tapered transitions and battery-door land.")

    left_outline = ((3, -27), (29, -26), (32, -18), (32, 20), (27, 29), (7, 30), (2, 22))
    left_cover = _side_panel("Z50II-02-005_left_side_cover", -55.2, 1.8, left_outline, collection, shell, 0.75)
    _box_cut(left_cover, "upper_port_door_opening", (5, 13.2, 16.2), (-55.2, 16, 10))
    _box_cut(left_cover, "lower_port_door_opening", (5, 13.2, 17.2), (-55.2, 16, -10))
    _post_cut_finish(left_cover, 0.35)
    _annotate(left_cover, "Z50II-02-005", "带真实贯通门洞、止口和后接口翻边的左侧薄壁盖板。", "Thin left cover with through door openings, reveals, and rear connector flange.")

    right_cover = _profile_shell_y(
        "Z50II-02-006_right_grip_cover",
        ((3.0, ((49, -31), (64, -28), (68, -18), (68, 20), (59, 29), (49, 26))),
         (30.0, ((48, -30), (61, -27), (66, -17), (66, 19), (58, 28), (48, 25)))),
        collection,
        shell,
        thickness_mm=1.8,
        bevel_mm=0.8,
        cap_front=False,
        cap_back=False,
    )
    _annotate(right_cover, "Z50II-02-006", "与收腰握柄连续过渡的开放式右侧薄壁盖板。", "Open thin right-side cover flowing into the undercut grip.")

    battery_door = _bottom_plate(
        "Z50II-02-007_battery_door",
        ((23, 5), (49, 6), (51, 27), (45, 30), (23, 29), (20, 24), (20, 9)),
        -39.4,
        1.2,
        collection,
        edge,
    )
    _box_cut(battery_door, "battery_door_latch_notch", (5, 3, 4), (46, 27.8, -40))
    _post_cut_finish(battery_door, 0.3)
    _parent(cylinder("Z50II_battery_door_hinge", 1.2, 18, (21, 17, -38.8), (90, 0, 0), collection, metal, vertices=24), battery_door)
    _annotate(battery_door, "Z50II-02-007", "嵌入底壳止口并具有铰轴和锁扣缺口的参考舱门。", "Inset reference battery door with hinge barrel and latch notch.")

    upper_door = _side_panel("Z50II-02-008_upper_port_door", -56.15, 1.1, ((10, 3), (22, 3), (22, 17), (10, 17)), collection, rubber, 0.45)
    _box_cut(upper_door, "upper_port_latch_notch", (3, 3, 3), (-56.2, 21.5, 10))
    _post_cut_finish(upper_door, 0.25)
    _parent(cylinder("Z50II_upper_port_hinge", 0.9, 8, (-56.1, 9.5, 10), (0, 0, 0), collection, rubber, vertices=24), upper_door)
    _annotate(upper_door, "Z50II-02-008", "嵌入上接口门洞并带铰链与锁扣缺口的柔性门。", "Flexible door seated in the upper port opening with hinge and latch reveal.")

    lower_door = _side_panel("Z50II-02-009_lower_port_door", -56.15, 1.1, ((10, -18), (22, -18), (22, -3), (10, -3)), collection, rubber, 0.45)
    _box_cut(lower_door, "lower_port_latch_notch", (3, 3, 3), (-56.2, 21.5, -10))
    _post_cut_finish(lower_door, 0.25)
    _parent(cylinder("Z50II_lower_port_hinge", 0.9, 8, (-56.1, 9.5, -10), (0, 0, 0), collection, rubber, vertices=24), lower_door)
    _annotate(lower_door, "Z50II-02-009", "嵌入下接口门洞并带铰链与锁扣缺口的柔性门。", "Flexible door seated in the lower port opening with hinge and latch reveal.")

    shutter = cylinder("Z50II-02-010_shutter_button", 4.1, 2.2, (49, -3, 32), (0, 0, 0), collection, metal, vertices=64)
    _annotate(shutter, "Z50II-02-010", "嵌入握柄顶肩凹座的快门释放按钮参考件。", "Reference shutter release seated in the grip-shoulder pocket.")

    collar = torus("Z50II-02-011_power_collar", 5.4, 0.95, (49, -3, 31.2), (0, 0, 0), collection, control)
    lever = rounded_box("Z50II_power_collar_lever", (1.5, 5.0, 1.4), (54.2, -3, 31.8), 0.35, collection, control)
    lever.rotation_euler[2] = radians(-18)
    _parent(lever, collar)
    _parent(rounded_box("Z50II_power_collar_red_index", (0.9, 1.8, 0.7), (55.0, -3, 32.3), 0.2, collection, red), collar)
    _annotate(collar, "Z50II-02-011", "带外伸拨杆和红色索引的快门同轴电源环。", "Shutter-coaxial power collar with projecting lever and red index.")

    front_dial = cylinder("Z50II-02-012_front_command_dial", 6.0, 3.6, (47, -9, 22), (0, 90, 0), collection, control, vertices=48)
    _knurl_x(front_dial, "Z50II_front_dial_knurl_", 48.9, (-9, 22), 6.0, collection, control)
    _annotate(front_dial, "Z50II-02-012", "带周向齿槽并嵌入前握柄凹位的指令拨轮。", "Knurled command dial recessed into the front grip pocket.")

    rear_dial = cylinder("Z50II-02-013_rear_command_dial", 5.8, 3.6, (40, 28.15, 29), (0, 90, 0), collection, control, vertices=48)
    _knurl_x(rear_dial, "Z50II_rear_dial_knurl_", 41.9, (28.15, 29), 5.8, collection, control)
    _annotate(rear_dial, "Z50II-02-013", "带可见齿槽并半嵌于后肩的指令拨轮。", "Visibly knurled command dial partially recessed into the rear shoulder.")

    mode_dial = cylinder("Z50II-02-014_mode_dial", 9.2, 2.8, (-35, 18, 39), (0, 0, 0), collection, control, vertices=64)
    _knurl_z(mode_dial, "Z50II_mode_dial_knurl_", (-35, 18), 9.2, 39.4, collection, control, 24)
    _annotate(mode_dial, "Z50II-02-014", "带24个周向防滑齿的顶部模式拨盘参考件。", "Reference top mode dial with 24 visible circumferential knurls.")

    selector = cylinder("Z50II-02-015_photo_video_selector", 4.3, 1.5, (30, 33.6, 25), (90, 0, 0), collection, control, vertices=48)
    selector_lever = rounded_box("Z50II_photo_video_selector_lever", (1.5, 2.0, 6.0), (33.7, 33.55, 25), 0.4, collection, control)
    selector_lever.rotation_euler[1] = radians(-18)
    _parent(selector_lever, selector)
    _annotate(selector, "Z50II-02-015", "嵌入机背凹座并带径向拨杆的照片／视频选择器。", "Rear recessed photo/video selector with a radial lever.")

    fn1 = _pill_prism_y(
        "Z50II-02-016_fn1_button",
        4.8,
        8.8,
        1.7,
        (35, -0.85, 8),
        collection,
        control,
        segments=16,
        bevel_mm=0.35,
    )
    _annotate(fn1, "Z50II-02-016", "位于独立前壳沉孔中的Fn1功能按钮。", "Fn1 function button seated in a dedicated front-shell bore.")
    fn2 = _pill_prism_y(
        "Z50II-02-017_fn2_button",
        4.6,
        8.4,
        1.7,
        (35, -0.85, -3.5),
        collection,
        control,
        segments=16,
        bevel_mm=0.35,
    )
    _annotate(fn2, "Z50II-02-017", "位于独立前壳沉孔中的Fn2功能按钮。", "Fn2 function button seated in a dedicated front-shell bore.")
    lens_release = cylinder("Z50II-02-018_lens_release_button", 3.3, 1.9, (34.5, -0.8, 7), (90, 0, 0), collection, control, vertices=48)
    _annotate(lens_release, "Z50II-02-018", "预留Z卡口旁沉孔中的镜头释放按钮；本期不含镜头。", "Lens-release button in a mount-side bore; no lens is included.")

    left_lug = torus("Z50II-02-019_left_strap_lug", 4.0, 1.2, (-55.8, 11, 20), (0, 90, 0), collection, metal)
    _annotate(left_lug, "Z50II-02-019", "具有贯通眼孔的左侧金属肩带环参考件。", "Reference left metal strap eyelet with a true open hole.")
    right_lug = torus("Z50II-02-020_right_strap_lug", 4.0, 1.2, (68.8, 11, 20), (0, 90, 0), collection, metal)
    _annotate(right_lug, "Z50II-02-020", "具有贯通眼孔的右侧金属肩带环参考件。", "Reference right metal strap eyelet with a true open hole.")

    _mirror_export_hierarchy_x(collection)

    return [
        front_shell, grip_rubber, top_shell, bottom_shell, left_cover, right_cover,
        battery_door, upper_door, lower_door, shutter, collar, front_dial, rear_dial,
        mode_dial, selector, fn1, fn2, lens_release, left_lug, right_lug,
    ]


build = build_outer_shell_controls
