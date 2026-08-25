"""Procedural module 01: reference-level chassis and front support geometry."""

from __future__ import annotations

import bpy

from z50ii.constants import mm
from z50ii.geometry import cylinder, rounded_box, torus
from z50ii.materials import get_material
from z50ii.metadata import attach_part_metadata


MODULE_ID = "01_chassis_front"


def _clear(collection: bpy.types.Collection) -> None:
    for obj in tuple(collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def _parent(child: bpy.types.Object, parent: bpy.types.Object) -> bpy.types.Object:
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()
    return child


def _apply_round_cut(
    target: bpy.types.Object,
    *,
    name: str,
    radius_mm: float,
    depth_mm: float,
    location_mm: tuple[float, float, float],
) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    for modifier in tuple(target.modifiers):
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=96,
        radius=mm(radius_mm),
        depth=mm(depth_mm),
        location=tuple(mm(value) for value in location_mm),
        rotation=(1.5707963267948966, 0.0, 0.0),
    )
    cutter = bpy.context.active_object
    cutter.name = name
    modifier = target.modifiers.new(name=f"{name}_difference", type="BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.solver = "EXACT"
    modifier.object = cutter
    bpy.context.view_layer.objects.active = target
    target.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def _metadata(
    obj: bpy.types.Object,
    *,
    part_id: str,
    parent_id: str,
    name_zh: str,
    name_en: str,
    description_zh: str,
    description_en: str,
    step: int,
    axis: tuple[float, float, float],
    distance_mm: float,
    depends_on: tuple[str, ...],
) -> bpy.types.Object:
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
        explode_distance_mm=distance_mm,
        depends_on=depends_on,
        is_reference_geometry=True,
    )


def build_chassis_front() -> list[bpy.types.Object]:
    """Build eight selectable chassis parts around the reserved mount origin."""
    collection = bpy.data.collections[MODULE_ID]
    _clear(collection)

    magnesium = get_material(
        "Z50II Magnesium Alloy",
        (0.16, 0.17, 0.18, 1.0),
        metallic=0.72,
        roughness=0.38,
    )
    dark_metal = get_material(
        "Z50II Dark Structural Metal",
        (0.055, 0.06, 0.065, 1.0),
        metallic=0.8,
        roughness=0.31,
    )
    stainless = get_material(
        "Z50II Stainless Hardware",
        (0.46, 0.49, 0.52, 1.0),
        metallic=0.92,
        roughness=0.24,
    )

    chassis = rounded_box(
        "Z50II-01-001_magnesium_chassis",
        (92.0, 2.5, 61.0),
        (-2.0, 12.5, -3.0),
        1.2,
        collection,
        magnesium,
    )
    _apply_round_cut(
        chassis,
        name="chassis_mount_clearance",
        radius_mm=27.5,
        depth_mm=8.0,
        location_mm=(0.0, 12.5, 0.0),
    )
    _metadata(
        chassis,
        part_id="Z50II-01-001",
        parent_id="",
        name_zh="镁合金主机架",
        name_en="Magnesium chassis",
        description_zh="围绕卡口原点建立的参考级承力骨架，不代表原厂制造尺寸。",
        description_en="Reference load-bearing frame around the mount origin; not manufacturer-dimensional data.",
        step=35,
        axis=(0.0, 1.0, 0.0),
        distance_mm=42.0,
        depends_on=("Z50II-01-003", "Z50II-01-005", "Z50II-01-007", "Z50II-01-008"),
    )

    front_frame = rounded_box(
        "Z50II-01-002_front_inner_frame",
        (75.0, 2.0, 55.0),
        (-1.5, 7.5, -1.0),
        0.9,
        collection,
        dark_metal,
    )
    _apply_round_cut(
        front_frame,
        name="front_frame_mount_clearance",
        radius_mm=27.5,
        depth_mm=7.0,
        location_mm=(0.0, 7.5, 0.0),
    )
    _metadata(
        front_frame,
        part_id="Z50II-01-002",
        parent_id="Z50II-01-001",
        name_zh="前部内框",
        name_en="Front inner frame",
        description_zh="支撑前壳与卡口区域的参考级薄壁内框。",
        description_en="Reference thin-wall inner frame supporting the front shell and mount region.",
        step=33,
        axis=(0.0, -1.0, 0.0),
        distance_mm=32.0,
        depends_on=("Z50II-01-004",),
    )

    grip_frame = rounded_box(
        "Z50II-01-003_grip_inner_frame",
        (18.0, 22.0, 52.0),
        (51.0, 8.0, -7.0),
        1.0,
        collection,
        magnesium,
    )
    _metadata(
        grip_frame,
        part_id="Z50II-01-003",
        parent_id="Z50II-01-001",
        name_zh="握柄内框",
        name_en="Grip inner frame",
        description_zh="保持握柄轮廓和载荷路径的参考级内框。",
        description_en="Reference inner frame maintaining the grip silhouette and load path.",
        step=29,
        axis=(1.0, 0.0, 0.0),
        distance_mm=35.0,
        depends_on=("Z50II-02-002", "Z50II-02-006"),
    )

    mount_plate = torus(
        "Z50II-01-004_mount_support_plate",
        30.4,
        1.2,
        (0.0, 4.8, 0.0),
        (90.0, 0.0, 0.0),
        collection,
        stainless,
    )
    _metadata(
        mount_plate,
        part_id="Z50II-01-004",
        parent_id="Z50II-01-002",
        name_zh="卡口支撑板",
        name_en="Mount support plate",
        description_zh="环绕55毫米预留内开口的参考级卡口支撑件。",
        description_en="Reference mount support surrounding the reserved 55 mm inner opening.",
        step=32,
        axis=(0.0, -1.0, 0.0),
        distance_mm=30.0,
        depends_on=("Z50II-02-001",),
    )

    sensor_top = rounded_box(
        "Z50II-01-005_sensor_rail_frame",
        (38.0, 1.6, 2.5),
        (-1.0, 15.0, 18.0),
        0.5,
        collection,
        dark_metal,
    )
    for suffix, size, location in (
        ("bottom", (38.0, 1.6, 2.5), (-1.0, 15.0, -18.0)),
        ("left", (2.5, 1.6, 33.5), (-20.0, 15.0, 0.0)),
        ("right", (2.5, 1.6, 33.5), (18.0, 15.0, 0.0)),
    ):
        _parent(
            rounded_box(
                f"Z50II-01-005_sensor_rail_{suffix}",
                size,
                location,
                0.5,
                collection,
                dark_metal,
            ),
            sensor_top,
        )
    _metadata(
        sensor_top,
        part_id="Z50II-01-005",
        parent_id="Z50II-01-001",
        name_zh="传感器导轨框",
        name_en="Sensor rail frame",
        description_zh="为后续传感器模块保留位置的四边参考导轨。",
        description_en="Four-sided reference rail reserving the later sensor-module position.",
        step=34,
        axis=(0.0, 1.0, 0.0),
        distance_mm=34.0,
        depends_on=("Z50II-01-002",),
    )

    bottom_plate = rounded_box(
        "Z50II-01-006_bottom_reinforcement_plate",
        (78.0, 18.0, 1.8),
        (1.0, 15.0, -33.2),
        0.6,
        collection,
        magnesium,
    )
    _metadata(
        bottom_plate,
        part_id="Z50II-01-006",
        parent_id="Z50II-01-001",
        name_zh="底部加强板",
        name_en="Bottom reinforcement plate",
        description_zh="连接底壳和主机架的参考级薄壁加强板。",
        description_en="Reference thin-wall reinforcement joining the base shell and chassis.",
        step=30,
        axis=(0.0, 0.0, -1.0),
        distance_mm=28.0,
        depends_on=("Z50II-02-004", "Z50II-02-007"),
    )

    tripod_socket = cylinder(
        "Z50II-01-007_tripod_socket",
        5.0,
        6.0,
        (-4.0, 15.0, -34.0),
        (0.0, 0.0, 0.0),
        collection,
        stainless,
        vertices=48,
    )
    _metadata(
        tripod_socket,
        part_id="Z50II-01-007",
        parent_id="Z50II-01-006",
        name_zh="三脚架接口座",
        name_en="Tripod socket",
        description_zh="底部三脚架连接位置的参考级金属接口座。",
        description_en="Reference metal socket at the published camera tripod-interface region.",
        step=31,
        axis=(0.0, 0.0, -1.0),
        distance_mm=22.0,
        depends_on=("Z50II-01-006",),
    )

    left_reinforcement = rounded_box(
        "Z50II-01-008_strap_lug_reinforcement_pair",
        (3.0, 8.0, 13.0),
        (-52.5, 11.0, 20.0),
        0.7,
        collection,
        dark_metal,
    )
    _parent(
        rounded_box(
            "Z50II-01-008_strap_lug_reinforcement_right",
            (3.0, 8.0, 13.0),
            (55.0, 11.0, 20.0),
            0.7,
            collection,
            dark_metal,
        ),
        left_reinforcement,
    )
    _metadata(
        left_reinforcement,
        part_id="Z50II-01-008",
        parent_id="Z50II-01-001",
        name_zh="肩带环加强件（成对）",
        name_en="Strap-lug reinforcement pair",
        description_zh="左右肩带环载荷位置的成对参考级加强件。",
        description_en="Paired reference reinforcements at the left and right strap-lug load points.",
        step=28,
        axis=(0.0, 1.0, 0.0),
        distance_mm=24.0,
        depends_on=("Z50II-02-019", "Z50II-02-020"),
    )

    return [
        chassis,
        front_frame,
        grip_frame,
        mount_plate,
        sensor_top,
        bottom_plate,
        tripod_socket,
        left_reinforcement,
    ]


build = build_chassis_front
