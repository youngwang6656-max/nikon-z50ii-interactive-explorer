"""Procedural module 04: layered electronics, shielding, and thermal path."""

from __future__ import annotations

import bpy

from z50ii.geometry import cylinder, panel, rounded_box
from z50ii.materials import get_material
from z50ii.metadata import attach_part_metadata


MODULE_ID = "04_mainboard_thermal"

PART_META = {
    "Z50II-04-001": ("", "主电路板", "Main PCB", 59, (0, 1, 0), 38, ("Z50II-04-006", "Z50II-04-007", "Z50II-04-008", "Z50II-04-009", "Z50II-04-012")),
    "Z50II-04-002": ("Z50II-04-001", "影像处理器封装", "Processor package", 54, (0, -1, 0), 24, ("Z50II-04-006", "Z50II-04-008")),
    "Z50II-04-003": ("Z50II-04-001", "存储器封装A", "Memory package A", 55, (0, -1, 0), 22, ("Z50II-04-006",)),
    "Z50II-04-004": ("Z50II-04-001", "存储器封装B", "Memory package B", 56, (0, -1, 0), 22, ("Z50II-04-006",)),
    "Z50II-04-005": ("Z50II-04-001", "电源管理元件组", "Power-management cluster", 57, (1, 0, 0), 24, ("Z50II-04-006",)),
    "Z50II-04-006": ("Z50II-04-001", "前部EMI屏蔽罩", "Front EMI shield", 48, (0, -1, 0), 32, ("Z50II-02-001",)),
    "Z50II-04-007": ("Z50II-04-001", "后部EMI屏蔽罩", "Rear EMI shield", 49, (0, 1, 0), 34, ("Z50II-02-003",)),
    "Z50II-04-008": ("Z50II-04-002", "导热垫", "Thermal pad", 51, (0, -1, 0), 20, ("Z50II-04-009",)),
    "Z50II-04-009": ("Z50II-04-001", "导热扩散片", "Heat spreader", 50, (0, -1, 0), 26, ("Z50II-04-006",)),
    "Z50II-04-010": ("Z50II-04-001", "次级控制电路板", "Secondary control PCB", 58, (0, 1, 0), 28, ("Z50II-04-007", "Z50II-04-011")),
    "Z50II-04-011": ("Z50II-04-010", "射频屏蔽罩", "RF shield can", 52, (0, 1, 0), 22, ("Z50II-04-007",)),
    "Z50II-04-012": ("Z50II-04-001", "排线连接器组", "Flex-connector bank", 53, (0, 1, 0), 20, ("Z50II-04-007",)),
}


def _clear(collection: bpy.types.Collection) -> None:
    for obj in tuple(collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def _parent(child: bpy.types.Object, parent: bpy.types.Object) -> bpy.types.Object:
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()
    return child


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


def _board_outline(width=48.0, height=51.0):
    half_w = width / 2.0
    half_h = height / 2.0
    return (
        (-half_w + 4.0, -half_h),
        (half_w - 4.0, -half_h),
        (half_w, -half_h + 5.0),
        (half_w, half_h - 7.0),
        (half_w - 6.0, half_h),
        (-half_w + 5.0, half_h),
        (-half_w, half_h - 5.0),
        (-half_w, -half_h + 4.0),
    )


def _package(name, size, location, collection, body_material, pad_material):
    root = rounded_box(name, size, location, 0.45, collection, body_material)
    pin_count = 6
    x0 = location[0] - size[0] * 0.38
    spacing = size[0] * 0.76 / (pin_count - 1)
    for index in range(pin_count):
        x = x0 + index * spacing
        _parent(rounded_box(f"{name}_lead_front_{index + 1}", (0.65, 0.22, 0.55), (x, location[1] - size[1] / 2 - 0.10, location[2] - size[2] / 2 + 0.8), 0.10, collection, pad_material), root)
        _parent(rounded_box(f"{name}_lead_rear_{index + 1}", (0.65, 0.22, 0.55), (x, location[1] - size[1] / 2 - 0.10, location[2] + size[2] / 2 - 0.8), 0.10, collection, pad_material), root)
    return root


def _pressed_shield(name, width, height, y, collection, material):
    root = panel(name, _board_outline(width, height), 0.42, (0, y, 0), (0, 0, 0), collection, material)
    for suffix, size, location in (
        ("top_rib", (width - 9.0, 0.75, 1.3), (0, y - 0.45, height / 2 - 3.0)),
        ("bottom_rib", (width - 9.0, 0.75, 1.3), (0, y - 0.45, -height / 2 + 3.0)),
        ("left_rib", (1.3, 0.75, height - 10.0), (-width / 2 + 3.0, y - 0.45, 0)),
        ("right_rib", (1.3, 0.75, height - 12.0), (width / 2 - 3.0, y - 0.45, 0)),
    ):
        _parent(rounded_box(f"{name}_{suffix}", size, location, 0.25, collection, material), root)
    for index, x in enumerate((-13.0, -6.5, 0.0, 6.5, 13.0), start=1):
        _parent(rounded_box(f"{name}_vent_{index}", (3.5, 0.50, 0.8), (x, y - 0.35, 17.0), 0.20, collection, material), root)
    return root


def build_mainboard_thermal() -> list[bpy.types.Object]:
    collection = bpy.data.collections[MODULE_ID]
    _clear(collection)

    board_mat = get_material("Z50II Main PCB", (0.025, 0.155, 0.085, 1), metallic=0.08, roughness=0.46)
    secondary_mat = get_material("Z50II Secondary PCB", (0.035, 0.20, 0.12, 1), metallic=0.08, roughness=0.44)
    package_mat = get_material("Z50II IC Packages", (0.015, 0.018, 0.020, 1), metallic=0.16, roughness=0.38)
    copper = get_material("Z50II Copper Pads", (0.64, 0.32, 0.08, 1), metallic=0.90, roughness=0.24)
    shield_mat = get_material("Z50II EMI Shield", (0.38, 0.40, 0.42, 1), metallic=0.92, roughness=0.30)
    spreader_mat = get_material("Z50II Heat Spreader", (0.48, 0.31, 0.18, 1), metallic=0.88, roughness=0.28)
    pad_mat = get_material("Z50II Thermal Pad", (0.16, 0.34, 0.46, 1), metallic=0.0, roughness=0.72)
    connector_mat = get_material("Z50II Flex Connectors", (0.72, 0.61, 0.18, 1), metallic=0.38, roughness=0.34)

    main_pcb = panel("Z50II-04-001_main_pcb", _board_outline(), 1.0, (0, 22.5, 0), (0, 0, 0), collection, board_mat)
    for index, (x, z) in enumerate(((-19, -20), (18, -18), (-18, 19), (17, 18)), start=1):
        _parent(cylinder(f"Z50II_main_pcb_mount_pad_{index}", 2.1, 0.18, (x, 21.91, z), (90, 0, 0), collection, copper, vertices=32), main_pcb)
    for row, z in enumerate((-20.0, 20.0), start=1):
        for column, x in enumerate((-13.5, -9.0, -4.5, 0.0, 4.5, 9.0, 13.5), start=1):
            _parent(rounded_box(f"Z50II_main_pcb_passive_{row}_{column}", (2.2, 0.55, 0.9), (x, 21.68, z), 0.18, collection, package_mat), main_pcb)
    _annotate(main_pcb, "Z50II-04-001", "1.0毫米厚多层轮廓主板，带安装焊盘和可读的贴片元件带。", "One-millimetre multi-layer profiled main board with mounting pads and readable surface-component rows.")

    processor = _package("Z50II-04-002_processor_package", (13.0, 1.55, 13.0), (-3.0, 20.9, 3.0), collection, package_mat, copper)
    _parent(rounded_box("Z50II_processor_heat_cap", (9.0, 0.35, 9.0), (-3.0, 20.0, 3.0), 0.35, collection, spreader_mat), processor)
    _annotate(processor, "Z50II-04-002", "位于导热通道后方的影像处理封装，带引脚和导热顶盖。", "Image-processor package behind the thermal path, with visible leads and a heat cap.")

    memory_a = _package("Z50II-04-003_memory_package_a", (9.5, 1.25, 7.0), (-15.0, 20.98, 10.0), collection, package_mat, copper)
    _annotate(memory_a, "Z50II-04-003", "处理器一侧的独立存储器封装A，用于教学分层。", "Separate memory package A beside the processor for readable teaching-layer separation.")
    memory_b = _package("Z50II-04-004_memory_package_b", (9.5, 1.25, 7.0), (9.0, 20.98, 13.0), collection, package_mat, copper)
    _annotate(memory_b, "Z50II-04-004", "与A封装分离布置的存储器封装B。", "Memory package B positioned separately from package A.")

    power_cluster = _package("Z50II-04-005_power_management_cluster", (7.0, 1.35, 6.0), (14.0, 20.9, -10.0), collection, package_mat, copper)
    for index, (x, z) in enumerate(((9.0, -15.0), (14.0, -16.0), (19.0, -14.0)), start=1):
        _parent(cylinder(f"Z50II_power_cluster_inductor_{index}", 2.0, 1.4, (x, 20.85, z), (90, 0, 0), collection, package_mat, vertices=32), power_cluster)
    for index, x in enumerate((9.5, 12.5, 15.5, 18.5), start=1):
        _parent(rounded_box(f"Z50II_power_cluster_capacitor_{index}", (1.2, 1.0, 2.4), (x, 20.9, -6.0), 0.25, collection, copper), power_cluster)
    _annotate(power_cluster, "Z50II-04-005", "由控制封装、电感和电容组成的可读电源管理簇。", "Readable power-management cluster of controller package, inductors, and capacitors.")

    front_shield = _pressed_shield("Z50II-04-006_front_emi_shield", 43.0, 46.0, 17.9, collection, shield_mat)
    _annotate(front_shield, "Z50II-04-006", "位于元件前方的冲压式EMI屏蔽罩，带周边加强筋和通风细节。", "Pressed front EMI shield ahead of the components, with perimeter ribs and vent detail.")

    rear_shield = _pressed_shield("Z50II-04-007_rear_emi_shield", 45.0, 47.0, 25.8, collection, shield_mat)
    _annotate(rear_shield, "Z50II-04-007", "与主板保持间隔的独立后部EMI屏蔽罩。", "Independent rear EMI shield separated from the main board.")

    heat_spreader = rounded_box("Z50II-04-009_heat_spreader", (17.0, 0.58, 17.0), (-3.0, 19.15, 3.0), 0.55, collection, spreader_mat)
    for suffix, size, location in (
        ("upper_fin", (23.0, 0.42, 2.0), (-1.0, 19.15, 12.0)),
        ("lower_fin", (23.0, 0.42, 2.0), (-1.0, 19.15, -6.0)),
        ("bridge", (2.0, 0.42, 16.0), (10.0, 19.15, 3.0)),
    ):
        _parent(rounded_box(f"Z50II_heat_spreader_{suffix}", size, location, 0.28, collection, spreader_mat), heat_spreader)
    _annotate(heat_spreader, "Z50II-04-009", "位于前屏蔽罩与导热垫之间的铜色扩散片和延伸翼片。", "Copper-toned spreader with extension fins between front shield and thermal pad.")

    thermal_pad = rounded_box("Z50II-04-008_thermal_pad", (12.0, 0.72, 12.0), (-3.0, 19.85, 3.0), 0.45, collection, pad_mat)
    thermal_pad["role"] = "detachable thermal interface"
    _annotate(thermal_pad, "Z50II-04-008", "与扩散片和处理器均分离的柔性导热界面垫。", "Flexible thermal interface pad physically separated from both spreader and processor.")

    secondary_pcb = panel(
        "Z50II-04-010_secondary_control_pcb",
        ((-7.0, -15.0), (6.0, -15.0), (8.0, -12.0), (8.0, 12.0), (5.0, 15.0), (-7.0, 15.0)),
        0.9,
        (-30.0, 22.7, 0),
        (0, 0, 0),
        collection,
        secondary_mat,
    )
    for index, z in enumerate((-10.5, -5.0, 0.5, 6.0, 11.5), start=1):
        _parent(rounded_box(f"Z50II_secondary_pcb_component_{index}", (3.8, 0.85, 2.1), (-31.5, 22.0, z), 0.30, collection, package_mat), secondary_pcb)
    _annotate(secondary_pcb, "Z50II-04-010", "主板侧边的狭长轮廓控制板，带独立贴片元件。", "Narrow profiled control board beside the main PCB with separate surface packages.")

    rf_shield = rounded_box("Z50II-04-011_rf_shield_can", (10.0, 1.15, 12.0), (-30.0, 24.4, 7.0), 0.65, collection, shield_mat)
    for index, z in enumerate((2.8, 7.0, 11.2), start=1):
        _parent(rounded_box(f"Z50II_rf_shield_seam_{index}", (7.5, 0.20, 0.35), (-30.0, 23.72, z), 0.10, collection, shield_mat), rf_shield)
    _annotate(rf_shield, "Z50II-04-011", "覆盖次级控制板局部的独立折边射频屏蔽罩。", "Separate folded RF shield can covering a local region of the secondary board.")

    connector_bank = rounded_box("Z50II-04-012_flex_connector_bank", (8.0, 1.1, 2.5), (-16.0, 24.0, -17.0), 0.35, collection, connector_mat)
    for index, (x, z) in enumerate(((-7.0, -17.0), (2.0, -18.5), (12.0, -17.0), (18.0, -10.0)), start=2):
        connector = rounded_box(f"Z50II_flex_connector_{index}", (8.0, 1.1, 2.5), (x, 24.0, z), 0.35, collection, connector_mat)
        _parent(connector, connector_bank)
        _parent(rounded_box(f"Z50II_flex_connector_latch_{index}", (6.5, 0.45, 0.8), (x, 24.75, z), 0.18, collection, package_mat), connector_bank)
    _parent(rounded_box("Z50II_flex_connector_latch_1", (6.5, 0.45, 0.8), (-16.0, 24.75, -17.0), 0.18, collection, package_mat), connector_bank)
    _annotate(connector_bank, "Z50II-04-012", "五个具有独立锁扣的排线连接器外壳，用于教学识别接口位置。", "Five flex-connector housings with separate latches for readable interface routing.")

    return [
        main_pcb,
        processor,
        memory_a,
        memory_b,
        power_cluster,
        front_shield,
        rear_shield,
        thermal_pad,
        heat_spreader,
        secondary_pcb,
        rf_shield,
        connector_bank,
    ]


build = build_mainboard_thermal
