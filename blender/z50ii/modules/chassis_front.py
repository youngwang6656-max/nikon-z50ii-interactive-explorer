"""Procedural module 01: open reference chassis, ribs, cages, and lands."""

from __future__ import annotations

from math import radians

import bpy

from z50ii.geometry import cylinder, rounded_box, torus
from z50ii.materials import get_material
from z50ii.metadata import attach_part_metadata


MODULE_ID = "01_chassis_front"


PART_META = {
    "Z50II-01-001": ("", "镁合金主机架", "Magnesium chassis", 35, (0, 1, 0), 42, ("Z50II-01-003", "Z50II-01-005", "Z50II-01-007", "Z50II-01-008")),
    "Z50II-01-002": ("Z50II-01-001", "前部内框", "Front inner frame", 33, (0, -1, 0), 32, ("Z50II-01-004",)),
    "Z50II-01-003": ("Z50II-01-001", "握柄内框", "Grip inner frame", 29, (1, 0, 0), 35, ("Z50II-02-002", "Z50II-02-006")),
    "Z50II-01-004": ("Z50II-01-002", "卡口支撑板", "Mount support plate", 32, (0, -1, 0), 30, ("Z50II-02-001",)),
    "Z50II-01-005": ("Z50II-01-001", "传感器导轨框", "Sensor rail frame", 34, (0, 1, 0), 34, ("Z50II-01-002",)),
    "Z50II-01-006": ("Z50II-01-001", "底部加强板", "Bottom reinforcement plate", 30, (0, 0, -1), 28, ("Z50II-02-004", "Z50II-02-007")),
    "Z50II-01-007": ("Z50II-01-006", "三脚架接口座", "Tripod socket", 31, (0, 0, -1), 22, ("Z50II-01-006",)),
    "Z50II-01-008": ("Z50II-01-001", "肩带环加强件（成对）", "Strap-lug reinforcement pair", 28, (0, 1, 0), 24, ("Z50II-02-019", "Z50II-02-020")),
}


def _clear(collection: bpy.types.Collection) -> None:
    for obj in tuple(collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def _parent(child: bpy.types.Object, parent: bpy.types.Object) -> bpy.types.Object:
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()
    return child


def _rail(name, size, location, bevel, collection, material, parent, rotation_z=0.0):
    obj = rounded_box(name, size, location, bevel, collection, material)
    obj.rotation_euler[2] = radians(rotation_z)
    return _parent(obj, parent)


def _annotate(obj, part_id, description_zh, description_en):
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


def build_chassis_front() -> list[bpy.types.Object]:
    collection = bpy.data.collections[MODULE_ID]
    _clear(collection)

    magnesium = get_material("Z50II Magnesium Alloy", (0.14, 0.15, 0.16, 1), metallic=0.74, roughness=0.39)
    dark = get_material("Z50II Dark Structural Metal", (0.04, 0.045, 0.05, 1), metallic=0.82, roughness=0.34)
    stainless = get_material("Z50II Stainless Hardware", (0.43, 0.46, 0.49, 1), metallic=0.93, roughness=0.24)

    # The stable chassis object is the mount-centered ring; the remaining
    # cage members are logical children. Its 27.5 mm inner radius preserves
    # the required 55 mm opening without a solid plate behind future internals.
    chassis = torus("Z50II-01-001_magnesium_chassis", 28.8, 1.3, (0, 12.5, 0), (90, 0, 0), collection, magnesium)
    for suffix, size, location in (
        ("top_rail", (82, 2.4, 2.5), (-2, 12.5, 29.5)),
        ("bottom_rail", (82, 2.4, 2.5), (-2, 12.5, -30.5)),
        ("left_upright", (2.5, 2.4, 58), (-43, 12.5, -0.5)),
        ("right_upright", (2.5, 2.4, 58), (39, 12.5, -0.5)),
    ):
        _rail(f"Z50II_chassis_{suffix}", size, location, 0.7, collection, magnesium, chassis)
    _rail("Z50II_chassis_upper_left_web", (30, 2.0, 2.0), (-30, 12.4, 21), 0.5, collection, magnesium, chassis, 35)
    _rail("Z50II_chassis_upper_right_web", (28, 2.0, 2.0), (27, 12.4, 21), 0.5, collection, magnesium, chassis, -35)
    _rail("Z50II_chassis_lower_left_web", (28, 2.0, 2.0), (-29, 12.4, -22), 0.5, collection, magnesium, chassis, -35)
    _rail("Z50II_chassis_lower_right_web", (26, 2.0, 2.0), (27, 12.4, -22), 0.5, collection, magnesium, chassis, 35)
    for index, angle in enumerate((45, 135, 225, 315)):
        x = 34.0 * __import__("math").cos(radians(angle))
        z = 34.0 * __import__("math").sin(radians(angle))
        _parent(cylinder(f"Z50II_chassis_mount_boss_{index + 1}", 3.0, 3.0, (x, 12.5, z), (90, 0, 0), collection, magnesium, vertices=32), chassis)
    _annotate(chassis, "Z50II-01-001", "围绕55毫米卡口开口布置的开放式环梁、边梁、斜撑和安装柱参考机架。", "Open reference chassis of mount ring, perimeter rails, diagonal webs, and bosses around the 55 mm opening.")

    front_frame = torus("Z50II-01-002_front_inner_frame", 28.6, 1.1, (0, 7.5, 0), (90, 0, 0), collection, dark)
    for index, (x, z) in enumerate(((-34, 20), (34, 20), (-34, -20), (34, -20))):
        _rail(f"Z50II_front_frame_tab_{index + 1}", (10, 1.8, 3), (x, 7.5, z), 0.45, collection, dark, front_frame)
    _annotate(front_frame, "Z50II-01-002", "由环形薄壁梁和四个壳体安装耳组成的开放前内框。", "Open front inner frame made from a thin ring beam and four shell-mount tabs.")

    grip_frame = rounded_box("Z50II-01-003_grip_inner_frame", (2.5, 3.0, 49), (45, 7, -6), 0.7, collection, magnesium)
    _rail("Z50II_grip_cage_front_outer", (2.5, 3.0, 46), (60, -5, -7), 0.7, collection, magnesium, grip_frame)
    _rail("Z50II_grip_cage_rear_outer", (2.5, 3.0, 45), (59, 18, -7), 0.7, collection, magnesium, grip_frame)
    for index, (z, y, angle) in enumerate(((18, 0, -10), (5, -2, -6), (-10, -1, 4), (-25, 3, 9))):
        _rail(f"Z50II_grip_cage_crossmember_{index + 1}", (17, 2.2, 2.2), (52.5, y, z), 0.5, collection, magnesium, grip_frame, angle)
    _rail("Z50II_grip_cage_palm_web", (2.0, 20, 32), (63, 1, -7), 0.6, collection, magnesium, grip_frame)
    _annotate(grip_frame, "Z50II-01-003", "由纵梁、横梁和掌托薄壁网组成的开放握柄笼架。", "Open grip cage formed by longitudinal rails, cross-members, and a thin palm web.")

    mount_plate = torus("Z50II-01-004_mount_support_plate", 29.1, 1.6, (0, 4.8, 0), (90, 0, 0), collection, stainless)
    for index, angle in enumerate((0, 90, 180, 270)):
        x = 31.5 * __import__("math").cos(radians(angle))
        z = 31.5 * __import__("math").sin(radians(angle))
        _parent(cylinder(f"Z50II_mount_plate_land_{index + 1}", 2.6, 1.8, (x, 4.8, z), (90, 0, 0), collection, stainless, vertices=32), mount_plate)
    _annotate(mount_plate, "Z50II-01-004", "围绕预留卡口原点的环形支撑板和四个紧固安装面。", "Annular support and four fastening lands around the reserved mount origin.")

    sensor_top = rounded_box("Z50II-01-005_sensor_rail_frame", (38, 1.6, 2.5), (-1, 15, 18), 0.5, collection, dark)
    for suffix, size, location in (
        ("bottom", (38, 1.6, 2.5), (-1, 15, -18)),
        ("left", (2.5, 1.6, 33.5), (-20, 15, 0)),
        ("right", (2.5, 1.6, 33.5), (18, 15, 0)),
    ):
        _rail(f"Z50II-01-005_sensor_rail_{suffix}", size, location, 0.5, collection, dark, sensor_top)
    for x, z in ((-20, 18), (18, 18), (-20, -18), (18, -18)):
        _parent(cylinder(f"Z50II_sensor_rail_boss_{x}_{z}", 2.2, 2.0, (x, 15, z), (90, 0, 0), collection, dark, vertices=24), sensor_top)
    _annotate(sensor_top, "Z50II-01-005", "为后续传感器模块保留空间的四边导轨和角部安装柱。", "Four-sided rail with corner bosses reserving the later sensor-module volume.")

    bottom_plate = rounded_box("Z50II-01-006_bottom_reinforcement_plate", (78, 18, 1.8), (1, 15, -33.2), 0.6, collection, magnesium)
    for x in (-31, 27):
        _rail(f"Z50II_bottom_plate_longitudinal_rib_{x}", (2.0, 16, 2.4), (x, 15, -31.8), 0.45, collection, magnesium, bottom_plate)
    for x in (-18, 12, 28):
        _rail(f"Z50II_bottom_plate_cross_rib_{x}", (18, 2.0, 2.4), (x, 15, -31.8), 0.45, collection, magnesium, bottom_plate)
    _annotate(bottom_plate, "Z50II-01-006", "带冲压式纵横加强筋和三脚架安装区的1.8毫米底部加强板。", "1.8 mm base reinforcement with formed longitudinal/cross ribs and tripod land.")

    tripod_socket = cylinder("Z50II-01-007_tripod_socket", 5.0, 6.0, (-4, 15, -34), (0, 0, 0), collection, stainless, vertices=48)
    _parent(torus("Z50II_tripod_socket_land", 7.2, 1.2, (-4, 15, -31.6), (0, 0, 0), collection, magnesium), tripod_socket)
    for angle in (0, 90, 180, 270):
        x = -4 + 10 * __import__("math").cos(radians(angle))
        y = 15 + 6 * __import__("math").sin(radians(angle))
        web = rounded_box(f"Z50II_tripod_socket_web_{angle}", (8, 2.0, 2.0), (x, y, -31.8), 0.45, collection, magnesium)
        web.rotation_euler[2] = radians(angle)
        _parent(web, tripod_socket)
    _annotate(tripod_socket, "Z50II-01-007", "由金属接口、环形安装面与四向加强肋组成的参考三脚架座。", "Reference tripod socket with metal insert, annular land, and four reinforcing webs.")

    left_reinforcement = rounded_box("Z50II-01-008_strap_lug_reinforcement_pair", (2.5, 7, 12), (-52.5, 11, 20), 0.65, collection, dark)
    _parent(rounded_box("Z50II-01-008_strap_lug_reinforcement_right", (2.5, 7, 12), (61.5, 11, 20), 0.65, collection, dark), left_reinforcement)
    _rail("Z50II_strap_reinforcement_left_web", (13, 2, 2), (-47, 11, 15), 0.45, collection, dark, left_reinforcement, -30)
    _rail("Z50II_strap_reinforcement_right_web", (13, 2, 2), (56, 11, 15), 0.45, collection, dark, left_reinforcement, 30)
    _annotate(left_reinforcement, "Z50II-01-008", "左右肩带眼载荷位置的成对安装柱与斜撑参考件。", "Paired reference mounting posts and diagonal webs at the strap-eyelet load paths.")

    return [chassis, front_frame, grip_frame, mount_plate, sensor_top, bottom_plate, tripod_socket, left_reinforcement]


build = build_chassis_front
