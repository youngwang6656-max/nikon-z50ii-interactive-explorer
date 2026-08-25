"""Procedural module 05: removable battery, power path, and UHS-II storage."""

from __future__ import annotations

import bpy

from z50ii.geometry import flex_cable, panel, rounded_box
from z50ii.materials import get_material
from z50ii.metadata import attach_part_metadata


MODULE_ID = "05_power_storage"

PART_META = {
    "Z50II-05-001": ("", "EN-EL25a参考电池", "EN-EL25a reference battery", 60, (0, 0, -1), 52, ("Z50II-02-007",)),
    "Z50II-05-002": ("Z50II-01-003", "电池托架", "Battery cradle", 64, (0, 0, -1), 44, ("Z50II-05-001", "Z50II-05-003")),
    "Z50II-05-003": ("Z50II-05-002", "电池弹片触点", "Battery contacts", 63, (0, 0, -1), 28, ("Z50II-05-001",)),
    "Z50II-05-004": ("Z50II-05-002", "电源电路板", "Power board", 67, (0, 1, 0), 30, ("Z50II-05-002", "Z50II-05-008")),
    "Z50II-05-005": ("Z50II-05-002", "UHS-II SD卡槽", "UHS-II SD slot", 65, (0, 0, -1), 34, ("Z50II-05-006",)),
    "Z50II-05-006": ("Z50II-05-005", "可拆卸SD卡示意件", "Illustrative removable SD card", 61, (0, 0, -1), 46, ("Z50II-02-007",)),
    "Z50II-05-007": ("Z50II-02-007", "底部舱门锁扣", "Bottom-door latch", 62, (1, 0, 0), 18, ("Z50II-02-007",)),
    "Z50II-05-008": ("Z50II-05-004", "电源排线", "Power flex cable", 66, (0, 1, 0), 26, ("Z50II-05-002",)),
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
    battery = rounded_box("Z50II-05-001_en_el25a_battery_shell", (23.5, 17.0, 33.0), (-40.0, 14.0, -17.5), 2.2, collection, battery_mat)
    _parent(rounded_box("Z50II_battery_keyed_shoulder", (20.5, 15.8, 4.0), (-40.0, 14.0, 0.6), 1.5, collection, battery_cap_mat), battery)
    _parent(rounded_box("Z50II_battery_label_recess", (16.0, 0.35, 18.0), (-40.0, 5.32, -17.0), 1.0, collection, battery_cap_mat), battery)
    _parent(rounded_box("Z50II_battery_terminal_cap", (14.0, 15.0, 2.2), (-42.0, 14.0, 2.8), 0.8, collection, battery_cap_mat), battery)
    for index, x in enumerate((-44.8, -42.8, -40.8, -38.8, -36.8), start=1):
        _parent(rounded_box(f"Z50II_battery_terminal_{index}", (1.15, 1.4, 0.55), (x, 5.85, 3.8), 0.16, collection, gold), battery)
    for index, z in enumerate((-28.0, -23.0, -18.0, -13.0, -8.0), start=1):
        _parent(rounded_box(f"Z50II_battery_grip_rib_{index}", (0.6, 12.0, 1.6), (-52.1, 14.0, z), 0.35, collection, battery_cap_mat), battery)
    _annotate(battery, "Z50II-05-001", "可拆卸的EN-EL25a产品外形参考件，包含定位肩、端子盖和握持筋；不表示Nikon生产尺寸。", "Removable EN-EL25a product-shaped reference with keyed shoulder, terminal cap, and grip ribs; it does not claim Nikon production dimensions.")

    # Open cradle: a thin rear wall with four guide rails and a spring stop,
    # deliberately leaving the battery volume unobstructed.
    cradle = rounded_box("Z50II-05-002_battery_cradle", (27.5, 1.3, 37.0), (-40.0, 23.8, -16.0), 0.7, collection, structure)
    for suffix, size, location in (
        ("left_front_rail", (1.6, 18.0, 35.0), (-53.2, 14.8, -16.0)),
        ("right_front_rail", (1.6, 18.0, 35.0), (-26.8, 14.8, -16.0)),
        ("left_lip", (3.0, 2.0, 35.0), (-51.8, 5.9, -16.0)),
        ("right_lip", (3.0, 2.0, 35.0), (-28.2, 5.9, -16.0)),
        ("upper_stop", (22.0, 16.0, 1.8), (-40.0, 15.0, 2.0)),
    ):
        _parent(rounded_box(f"Z50II_battery_cradle_{suffix}", size, location, 0.55, collection, structure), cradle)
    _annotate(cradle, "Z50II-05-002", "由后壁、导轨、前缘和顶部限位组成的开放式电池托架。", "Open battery cradle made from rear wall, guide rails, front lips, and an upper stop.")

    contacts = rounded_box("Z50II-05-003_battery_contacts", (1.25, 3.5, 5.0), (-44.8, 19.8, 1.0), 0.30, collection, gold)
    for index, x in enumerate((-42.4, -40.0, -37.6, -35.2), start=2):
        _parent(rounded_box(f"Z50II_battery_spring_contact_{index}", (1.25, 3.5, 5.0), (x, 19.8, 1.0), 0.30, collection, gold), contacts)
    _parent(rounded_box("Z50II_battery_contact_insulator", (14.0, 1.2, 7.0), (-40.0, 22.0, 1.0), 0.55, collection, battery_cap_mat), contacts)
    _annotate(contacts, "Z50II-05-003", "五枚分开的弹片触点与绝缘支座，位于电池托架顶部。", "Five separate spring contacts on an insulating carrier at the top of the battery cradle.")

    power_board = panel(
        "Z50II-05-004_power_board",
        ((-12.0, -8.0), (10.0, -8.0), (12.0, -5.5), (12.0, 6.0), (9.0, 8.0), (-12.0, 8.0)),
        1.0,
        (-14.0, 23.0, -23.0),
        (0, 0, 0),
        collection,
        board_mat,
    )
    for index, (x, z, size) in enumerate(((-21, -26, (4, 1.2, 3)), (-15, -26, (4, 1.4, 3)), (-9, -26, (4, 1.2, 3)), (-19, -20, (6, 1.3, 4)), (-10, -20, (7, 1.3, 4))), start=1):
        _parent(rounded_box(f"Z50II_power_board_package_{index}", size, (x, 22.0, z), 0.35, collection, package_mat), power_board)
    for index, x in enumerate((-22.0, -18.0, -14.0, -10.0, -6.0), start=1):
        _parent(rounded_box(f"Z50II_power_board_pad_{index}", (2.2, 0.3, 1.0), (x, 22.3, -16.5), 0.15, collection, gold), power_board)
    _annotate(power_board, "Z50II-05-004", "带键位轮廓、功率封装和连接焊盘的1.0毫米电源板。", "One-millimetre keyed power board with power packages and connector pads.")

    # A folded cage is represented by a thin back plus rails, roof, and the
    # two-row UHS-II contact bank rather than an opaque placeholder block.
    sd_slot = rounded_box("Z50II-05-005_uhs_ii_sd_slot", (26.0, 0.65, 34.0), (-13.0, 17.8, -16.0), 0.45, collection, slot_mat)
    for suffix, size, location in (
        ("left_rail", (1.2, 3.4, 32.0), (-25.4, 15.8, -16.0)),
        ("right_rail", (1.2, 3.4, 32.0), (-0.6, 15.8, -16.0)),
        ("roof", (26.0, 3.4, 1.2), (-13.0, 15.8, 0.4)),
        ("lower_bridge", (26.0, 3.4, 1.2), (-13.0, 15.8, -31.9)),
    ):
        _parent(rounded_box(f"Z50II_sd_slot_{suffix}", size, location, 0.35, collection, slot_mat), sd_slot)
    for row, z in enumerate((-27.0, -24.0), start=1):
        for column, x in enumerate((-22.0, -19.0, -16.0, -13.0, -10.0, -7.0, -4.0), start=1):
            _parent(rounded_box(f"Z50II_sd_slot_uhs_contact_{row}_{column}", (1.5, 1.6, 0.65), (x, 14.2, z), 0.12, collection, gold), sd_slot)
    _annotate(sd_slot, "Z50II-05-005", "具有折边导轨、端部桥和两排触点的UHS-II SD卡槽参考件。", "Reference UHS-II SD slot with folded rails, end bridges, and two readable contact rows.")

    sd_card = panel(
        "Z50II-05-006_sd_card",
        ((-12.0, -16.0), (12.0, -16.0), (12.0, 11.0), (7.0, 16.0), (-12.0, 16.0)),
        2.1,
        (-13.0, 14.4, -16.0),
        (0, 0, 0),
        collection,
        sd_mat,
    )
    for index, x in enumerate((-21.0, -18.0, -15.0, -12.0, -9.0, -6.0, -3.0), start=1):
        _parent(rounded_box(f"Z50II_sd_card_contact_{index}", (1.8, 0.18, 6.0), (x, 13.25, -5.0), 0.20, collection, gold), sd_card)
    _parent(rounded_box("Z50II_sd_card_lock_notch", (1.0, 0.4, 5.0), (-25.1, 13.25, -11.0), 0.18, collection, battery_cap_mat), sd_card)
    _annotate(sd_card, "Z50II-05-006", "可拆卸SD卡的示意件，仅用于表达UHS-II卡槽装卸方向，不作为随机配件声明。", "Illustrative removable SD card used only to show UHS-II slot insertion direction; it is not represented as an included accessory.")

    latch = rounded_box("Z50II-05-007_bottom_door_latch", (7.0, 4.5, 3.0), (-50.0, 26.5, -35.8), 0.75, collection, structure)
    _parent(rounded_box("Z50II_bottom_door_latch_hook", (3.0, 7.0, 2.0), (-53.5, 25.3, -35.8), 0.45, collection, structure), latch)
    _parent(rounded_box("Z50II_bottom_door_latch_spring", (5.0, 1.0, 1.0), (-45.0, 26.5, -35.8), 0.30, collection, gold), latch)
    _annotate(latch, "Z50II-05-007", "底部舱门内侧的滑动锁扣，带独立锁钩和弹片。", "Sliding inner bottom-door latch with separate hook and spring leaf.")

    power_flex = flex_cable(
        "Z50II-05-008_power_flex_cable",
        ((-39.0, 22.6, -1.5), (-36.0, 22.6, -6.0), (-29.0, 22.6, -9.0), (-25.0, 22.6, -17.0), (-20.0, 22.6, -21.0), (-13.0, 22.6, -18.0)),
        4.0,
        0.28,
        collection,
        flex_mat,
    )
    _parent(rounded_box("Z50II_power_flex_battery_connector", (7.0, 1.0, 2.2), (-39.0, 22.6, -1.5), 0.30, collection, package_mat), power_flex)
    _parent(rounded_box("Z50II_power_flex_board_connector", (7.0, 1.0, 2.2), (-13.0, 22.6, -18.0), 0.30, collection, package_mat), power_flex)
    _annotate(power_flex, "Z50II-05-008", "沿托架与电源板边缘转折布线的薄型电源排线，带两端连接器。", "Thin routed power flex following cradle and power-board edges, with connectors at both ends.")

    return [battery, cradle, contacts, power_board, sd_slot, sd_card, latch, power_flex]


build = build_power_storage
