"""Procedural module 05: removable battery, power path, and UHS-II storage."""

from __future__ import annotations

import bpy

from z50ii.geometry import flex_cable, panel, rounded_box
from z50ii.materials import get_material
from z50ii.metadata import attach_part_metadata


MODULE_ID = "05_power_storage"

PART_META = {
    "Z50II-05-001": ("", "EN-EL25a参考电池", "EN-EL25a reference battery", 3, (0, 0, -1), 52, ("Z50II-02-007",)),
    "Z50II-05-002": ("Z50II-01-003", "电池托架", "Battery cradle", 26, (0, 0, -1), 44, ("Z50II-02-004", "Z50II-05-001", "Z50II-05-003", "Z50II-05-007")),
    "Z50II-05-003": ("Z50II-05-002", "电池弹片触点", "Battery contacts", 25, (0, 0, -1), 28, ("Z50II-02-004", "Z50II-05-001")),
    "Z50II-05-004": ("Z50II-05-002", "电源电路板", "Power board", 28, (0, 1, 0), 30, ("Z50II-02-004", "Z50II-05-002", "Z50II-05-005", "Z50II-05-008")),
    "Z50II-05-005": ("Z50II-05-002", "UHS-II SD卡槽", "UHS-II SD slot", 26, (0, 0, -1), 34, ("Z50II-02-004", "Z50II-05-006", "Z50II-05-007")),
    "Z50II-05-006": ("Z50II-05-005", "可拆卸SD卡示意件", "Illustrative removable SD card", 3, (0, 0, -1), 46, ("Z50II-02-007",)),
    "Z50II-05-007": ("Z50II-02-007", "底部舱门锁扣", "Bottom-door latch", 5, (1, 0, 0), 18, ("Z50II-02-007",)),
    "Z50II-05-008": ("Z50II-05-004", "电源排线", "Power flex cable", 27, (0, 1, 0), 26, ("Z50II-02-004", "Z50II-05-001", "Z50II-05-002", "Z50II-05-005")),
}


def _clear(collection: bpy.types.Collection) -> None:
    objects = tuple(collection.all_objects)
    mesh_data = {obj.data for obj in objects if obj.type == "MESH" and obj.data is not None}
    for obj in objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in mesh_data:
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)


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


def build_power_storage() -> list[bpy.types.Object]:
    collection = bpy.data.collections[MODULE_ID]
    _clear(collection)

    battery_mat = get_material("Z50II Battery Shell", (0.035, 0.038, 0.041, 1), metallic=0.0, roughness=0.56)
    battery_cap_mat = get_material("Z50II Battery Cap", (0.018, 0.020, 0.022, 1), metallic=0.03, roughness=0.44)
    structure = get_material("Z50II Power Cradle", (0.055, 0.062, 0.068, 1), metallic=0.10, roughness=0.52)
    gold = get_material("Z50II Power Contacts", (0.72, 0.40, 0.08, 1), metallic=0.91, roughness=0.22)
    board_mat = get_material("Z50II Power PCB", (0.028, 0.19, 0.105, 1), metallic=0.08, roughness=0.44)
    package_mat = get_material("Z50II Power Packages", (0.018, 0.021, 0.023, 1), metallic=0.12, roughness=0.38)
    slot_mat = get_material("Z50II SD Slot Metal", (0.38, 0.41, 0.44, 1), metallic=0.94, roughness=0.29)
    sd_mat = get_material("Z50II Illustrative SD Card", (0.035, 0.040, 0.045, 1), metallic=0.0, roughness=0.46)
    flex_mat = get_material("Z50II Power Flex", (0.70, 0.35, 0.045, 1), metallic=0.28, roughness=0.40)

    # Product-shaped removable reference: rounded main case, narrower keyed
    # shoulder, recessed label panel, terminal cap, and anti-slip side ribs.
    battery = rounded_box("Z50II-05-001_en_el25a_battery_shell", (19.8, 10.0, 32.0), (-35.2, 19.8, -12.0), 2.0, collection, battery_mat)
    _parent(rounded_box("Z50II_battery_keyed_shoulder", (17.3, 9.2, 3.4), (-35.2, 19.8, 4.8), 1.3, collection, battery_cap_mat), battery)
    _parent(rounded_box("Z50II_battery_label_recess", (14.0, 0.30, 17.0), (-35.2, 14.65, -11.7), 0.9, collection, battery_cap_mat), battery)
    _parent(rounded_box("Z50II_battery_terminal_cap", (13.0, 0.60, 2.0), (-35.2, 25.15, 5.4), 0.6, collection, battery_cap_mat), battery)
    for index, x in enumerate((-39.2, -37.2, -35.2, -33.2, -31.2), start=1):
        _parent(rounded_box(f"Z50II_battery_terminal_{index}", (1.10, 0.30, 0.65), (x, 25.65, 6.0), 0.14, collection, gold), battery)
    for index, z in enumerate((-23.2, -18.2, -13.2, -8.2, -3.2), start=1):
        _parent(rounded_box(f"Z50II_battery_grip_rib_{index}", (12.0, 0.30, 1.2), (-35.2, 14.65, z), 0.30, collection, battery_cap_mat), battery)
    _annotate(battery, "Z50II-05-001", "可拆卸的EN-EL25a产品外形参考件，包含定位肩、端子盖和握持筋；不表示Nikon生产尺寸。", "Removable EN-EL25a product-shaped reference with keyed shoulder, terminal cap, and grip ribs; it does not claim Nikon production dimensions.")

    # Open cradle: a thin rear wall with four guide rails and a spring stop,
    # deliberately leaving the battery volume unobstructed.
    cradle = rounded_box("Z50II-05-002_battery_cradle", (21.2, 0.80, 30.0), (-35.2, 26.8, -12.0), 0.65, collection, structure)
    for suffix, size, location in (
        ("left_front_rail", (0.8, 10.0, 33.0), (-45.7, 19.8, -12.0)),
        ("right_front_rail", (0.6, 10.0, 33.0), (-24.95, 19.8, -12.0)),
        ("left_lip", (0.8, 0.8, 33.0), (-45.7, 14.35, -12.0)),
        ("right_lip", (0.6, 0.8, 33.0), (-24.95, 14.35, -12.0)),
        ("upper_stop", (19.0, 10.0, 1.0), (-35.2, 19.8, 7.2)),
    ):
        _parent(rounded_box(f"Z50II_battery_cradle_{suffix}", size, location, 0.55, collection, structure), cradle)
    _annotate(cradle, "Z50II-05-002", "由后壁、导轨、前缘和顶部限位组成的开放式电池托架。", "Open battery cradle made from rear wall, guide rails, front lips, and an upper stop.")

    contacts = rounded_box("Z50II-05-003_battery_contacts", (1.10, 0.20, 3.0), (-39.2, 25.95, 6.0), 0.12, collection, gold)
    for index, x in enumerate((-37.2, -35.2, -33.2, -31.2), start=2):
        _parent(rounded_box(f"Z50II_battery_spring_contact_{index}", (1.10, 0.20, 3.0), (x, 25.95, 6.0), 0.12, collection, gold), contacts)
    _parent(rounded_box("Z50II_battery_contact_insulator", (12.0, 0.20, 4.5), (-35.2, 26.20, 6.0), 0.12, collection, battery_cap_mat), contacts)
    _annotate(contacts, "Z50II-05-003", "五枚分开的弹片触点与绝缘支座，位于电池托架顶部。", "Five separate spring contacts on an insulating carrier at the top of the battery cradle.")

    power_board = panel(
        "Z50II-05-004_power_board",
        ((-7.0, -9.0), (5.0, -9.0), (7.0, -7.0), (7.0, 7.0), (5.0, 9.0), (-7.0, 9.0)),
        1.0,
        (-35.0, 10.8, -18.0),
        (0, 0, 0),
        collection,
        board_mat,
    )
    for index, (x, z, size) in enumerate(((-39, -22, (3.5, 1.2, 3)), (-34, -23, (3.5, 1.4, 3)), (-30, -21, (3.0, 1.2, 3)), (-38, -15, (5, 1.3, 4)), (-31, -14, (5, 1.3, 4))), start=1):
        _parent(rounded_box(f"Z50II_power_board_package_{index}", size, (x, 9.65, z), 0.35, collection, package_mat), power_board)
    for index, x in enumerate((-40.0, -37.5, -35.0, -32.5, -30.0), start=1):
        _parent(rounded_box(f"Z50II_power_board_pad_{index}", (1.6, 0.3, 1.0), (x, 10.15, -9.5), 0.15, collection, gold), power_board)
    _annotate(power_board, "Z50II-05-004", "带键位轮廓、功率封装和连接焊盘的1.0毫米电源板。", "One-millimetre keyed power board with power packages and connector pads.")

    # A folded cage is represented by a thin back plus rails, roof, and the
    # two-row UHS-II contact bank rather than an opaque placeholder block.
    sd_slot = rounded_box("Z50II-05-005_uhs_ii_sd_slot", (23.0, 0.45, 32.8), (-35.8, 30.35, -10.0), 0.40, collection, slot_mat)
    for suffix, size, location in (
        ("left_rail", (0.8, 2.0, 31.0), (-46.95, 29.1, -10.0)),
        ("right_rail", (0.8, 2.0, 31.0), (-24.65, 29.1, -10.0)),
        ("roof", (22.4, 2.0, 0.8), (-35.8, 29.1, 6.15)),
        ("lower_bridge", (22.4, 0.5, 0.8), (-35.8, 30.1, -26.15)),
    ):
        _parent(rounded_box(f"Z50II_sd_slot_{suffix}", size, location, 0.35, collection, slot_mat), sd_slot)
    for row, z in enumerate((-21.8, -18.8), start=1):
        for column, x in enumerate((-43.8, -41.1, -38.4, -35.7, -33.0, -30.3, -27.6), start=1):
            _parent(rounded_box(f"Z50II_sd_slot_uhs_contact_{row}_{column}", (1.4, 0.30, 0.65), (x, 30.0, z), 0.12, collection, gold), sd_slot)
    _annotate(sd_slot, "Z50II-05-005", "具有折边导轨、端部桥和两排触点的UHS-II SD卡槽参考件。", "Reference UHS-II SD slot with folded rails, end bridges, and two readable contact rows.")

    sd_card = panel(
        "Z50II-05-006_sd_card",
        ((-10.2, -15.2), (10.2, -15.2), (10.2, 10.8), (5.8, 15.2), (-10.2, 15.2)),
        1.2,
        (-35.8, 28.4, -10.0),
        (0, 0, 0),
        collection,
        sd_mat,
    )
    for index, x in enumerate((-43.3, -40.8, -38.3, -35.8, -33.3, -30.8, -28.3), start=1):
        _parent(rounded_box(f"Z50II_sd_card_contact_{index}", (1.5, 0.14, 5.5), (x, 28.13, 0.2), 0.18, collection, gold), sd_card)
    _parent(rounded_box("Z50II_sd_card_lock_notch", (0.8, 0.25, 4.5), (-45.6, 28.13, -5.3), 0.15, collection, battery_cap_mat), sd_card)
    _annotate(sd_card, "Z50II-05-006", "可拆卸SD卡的示意件，仅用于表达UHS-II卡槽装卸方向，不作为随机配件声明。", "Illustrative removable SD card used only to show UHS-II slot insertion direction; it is not represented as an included accessory.")

    latch = rounded_box("Z50II-05-007_bottom_door_latch", (5.0, 3.0, 2.0), (-49.5, 27.0, -36.5), 0.60, collection, structure)
    _parent(rounded_box("Z50II_bottom_door_latch_hook", (1.0, 4.0, 1.4), (-52.5, 27.0, -36.5), 0.35, collection, structure), latch)
    _parent(rounded_box("Z50II_bottom_door_latch_spring", (1.2, 0.7, 0.7), (-47.7, 27.0, -36.5), 0.25, collection, gold), latch)
    _annotate(latch, "Z50II-05-007", "底部舱门内侧的滑动锁扣，带独立锁钩和弹片。", "Sliding inner bottom-door latch with separate hook and spring leaf.")

    power_flex = flex_cable(
        "Z50II-05-008_power_flex_cable",
        ((-35.2, 27.5, 5.5), (-35.2, 27.6, 10.0), (-33.0, 27.6, 10.0), (-33.0, 12.0, 10.0), (-33.0, 12.0, -1.0), (-33.0, 12.0, -11.0)),
        3.0,
        0.28,
        collection,
        flex_mat,
    )
    _parent(rounded_box("Z50II_power_flex_battery_connector", (7.0, 0.4, 2.0), (-35.2, 27.5, 5.5), 0.20, collection, package_mat), power_flex)
    _parent(rounded_box("Z50II_power_flex_board_connector", (7.0, 0.4, 2.0), (-33.0, 12.0, -11.0), 0.20, collection, package_mat), power_flex)
    _annotate(power_flex, "Z50II-05-008", "沿托架与电源板边缘转折布线的薄型电源排线，带两端连接器。", "Thin routed power flex following cradle and power-board edges, with connectors at both ends.")

    return [battery, cradle, contacts, power_board, sd_slot, sd_card, latch, power_flex]


build = build_power_storage
