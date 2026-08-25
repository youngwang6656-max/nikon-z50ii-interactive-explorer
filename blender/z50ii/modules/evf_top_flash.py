"""Procedural module 06: layered EVF, ISO shoe, flash, and top PCB."""

from __future__ import annotations

from math import cos, pi, sin

import bpy

from z50ii.geometry import cylinder, rounded_box
from z50ii.materials import get_material
from z50ii.metadata import attach_part_metadata


MODULE_ID = "06_evf_top_flash"

PART_META = {
    "Z50II-06-001": ("Z50II-02-003", "电子取景器内壳", "EVF housing", 17, (0, 1, 0), 32, ("Z50II-02-003", "Z50II-06-003", "Z50II-06-004")),
    "Z50II-06-002": ("Z50II-06-001", "电子取景器显示屏", "EVF display", 18, (0, 1, 0), 25, ("Z50II-06-001",)),
    "Z50II-06-003": ("Z50II-06-001", "电子取景器目镜", "EVF eyepiece lens", 5, (0, 1, 0), 18, ()),
    "Z50II-06-004": ("Z50II-06-001", "屈光度调节轮", "Diopter wheel", 5, (1, 0, 0), 16, ()),
    "Z50II-06-005": ("Z50II-02-003", "热靴导轨", "Hot-shoe rails", 4, (0, 0, 1), 18, ()),
    "Z50II-06-006": ("Z50II-06-005", "热靴触点板", "Hot-shoe contact plate", 5, (0, 0, 1), 16, ("Z50II-06-005",)),
    "Z50II-06-007": ("Z50II-06-009", "内置闪光灯灯头外壳", "Flash outer head", 5, (0, 0, 1), 32, ("Z50II-06-008",)),
    "Z50II-06-008": ("Z50II-06-007", "闪光灯反光杯", "Flash reflector", 4, (0, -1, 0), 18, ()),
    "Z50II-06-009": ("Z50II-02-003", "闪光灯铰链", "Flash hinge", 6, (1, 0, 0), 24, ("Z50II-06-007",)),
    "Z50II-06-010": ("Z50II-02-003", "顶部控制电路板", "Top-control PCB", 22, (0, 1, 0), 26, ("Z50II-02-003", "Z50II-08-007")),
}


def _clear(collection: bpy.types.Collection) -> None:
    objects = tuple(collection.all_objects)
    meshes = {obj.data for obj in objects if obj.type == "MESH" and obj.data is not None}
    for obj in objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in meshes:
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


def _rail_frame(name, center, width, height, depth, collection, material):
    x, y, z = center
    rail = 1.25
    root = rounded_box(name, (width, depth, rail), (x, y, z + height / 2), 0.35, collection, material)
    _parent(rounded_box(f"{name}_bottom", (width, depth, rail), (x, y, z - height / 2), 0.35, collection, material), root)
    _parent(rounded_box(f"{name}_left", (rail, depth, height - rail), (x - width / 2, y, z), 0.35, collection, material), root)
    _parent(rounded_box(f"{name}_right", (rail, depth, height - rail), (x + width / 2, y, z), 0.35, collection, material), root)
    return root


def build_evf_top_flash() -> list[bpy.types.Object]:
    collection = bpy.data.collections[MODULE_ID]
    _clear(collection)

    structural = get_material("Z50II EVF Structural Polymer", (0.022, 0.026, 0.030, 1), metallic=0.05, roughness=0.50)
    optical = get_material("Z50II EVF Optical Glass", (0.025, 0.080, 0.105, 1), metallic=0.16, roughness=0.07)
    oled = get_material("Z50II EVF OLED", (0.018, 0.060, 0.075, 1), metallic=0.25, roughness=0.13)
    steel = get_material("Z50II Hot Shoe Steel", (0.46, 0.49, 0.52, 1), metallic=0.96, roughness=0.21)
    shoe_black = get_material("Z50II Hot Shoe Insulator", (0.020, 0.023, 0.026, 1), metallic=0.02, roughness=0.45)
    gold = get_material("Z50II Top Electrical Contacts", (0.76, 0.44, 0.08, 1), metallic=0.92, roughness=0.20)
    reflector_mat = get_material("Z50II Flash Reflector", (0.72, 0.74, 0.76, 1), metallic=0.97, roughness=0.12)
    diffuser = get_material("Z50II Flash Diffuser", (0.74, 0.79, 0.82, 1), metallic=0.0, roughness=0.18)
    board_mat = get_material("Z50II Top Control PCB", (0.028, 0.17, 0.09, 1), metallic=0.08, roughness=0.44)
    package_mat = get_material("Z50II Top PCB Packages", (0.018, 0.021, 0.023, 1), metallic=0.12, roughness=0.36)

    housing = _rail_frame("Z50II-06-001_evf_housing", (5.0, 26.0, 45.5), 19.0, 10.0, 8.5, collection, structural)
    for index, y in enumerate((22.0, 25.0, 28.0), start=1):
        _parent(_rail_frame(f"Z50II_evf_baffle_{index}", (5.0, y, 45.5), 15.8, 7.2, 0.45, collection, structural), housing)
    housing["opticalAxis"] = [0.0, 1.0, 0.0]
    housing["isHollow"] = True
    _annotate(housing, "Z50II-06-001", "位于外部取景器隆起内部的开放式光学通道，包含三道遮光挡圈。", "Open optical tunnel inside the exterior EVF hump, including three light-control baffles.")

    display = rounded_box("Z50II-06-002_evf_display", (13.2, 0.48, 7.2), (5.0, 21.25, 45.5), 0.25, collection, oled)
    _parent(rounded_box("Z50II_evf_display_carrier", (15.6, 0.60, 9.2), (5.0, 21.70, 45.5), 0.50, collection, structural), display)
    _parent(rounded_box("Z50II_evf_display_flex_socket", (6.0, 1.0, 1.8), (5.0, 22.5, 40.6), 0.25, collection, gold), display)
    display["layerIndex"] = 0
    _annotate(display, "Z50II-06-002", "与目镜分层的微型显示面板、载板和排线插座参考组件。", "Microdisplay reference assembly separated from the eyepiece, with carrier and flex socket.")

    eyepiece = rounded_box("Z50II-06-003_evf_eyepiece_lens", (14.2, 0.55, 6.1), (5.0, 33.15, 45.0), 1.35, collection, optical)
    _parent(rounded_box("Z50II_evf_eyepiece_mask", (16.0, 0.42, 8.0), (5.0, 32.72, 45.0), 1.7, collection, structural), eyepiece)
    eyepiece["layerIndex"] = 4
    _annotate(eyepiece, "Z50II-06-003", "位于观看孔后的独立圆角目镜片和遮光框。", "Separate rounded eyepiece lens and light mask immediately behind the viewing aperture.")

    diopter = cylinder("Z50II-06-004_diopter_wheel", 3.4, 2.2, (15.8, 32.4, 44.0), (0, 90, 0), collection, structural, vertices=48)
    for index in range(16):
        angle = 2.0 * pi * index / 16
        _parent(rounded_box(f"Z50II_diopter_knurl_{index + 1:02d}", (0.65, 0.75, 1.25), (16.95, 32.4 + 3.2 * cos(angle), 44.0 + 3.2 * sin(angle)), 0.18, collection, structural), diopter)
    diopter["rotationAxis"] = [1.0, 0.0, 0.0]
    _annotate(diopter, "Z50II-06-004", "带十六个周向齿的侧置屈光度调节轮。", "Side-mounted diopter wheel with sixteen readable circumferential knurls.")

    rails = rounded_box("Z50II-06-005_hot_shoe_rails", (2.0, 6.2, 1.15), (-2.0, 30.5, 55.15), 0.24, collection, steel)
    _parent(rounded_box("Z50II_hot_shoe_right_rail", (2.0, 6.2, 1.15), (10.0, 30.5, 55.15), 0.24, collection, steel), rails)
    _parent(rounded_box("Z50II_hot_shoe_rear_bridge", (14.0, 1.6, 1.15), (4.0, 32.8, 55.15), 0.24, collection, steel), rails)
    _parent(rounded_box("Z50II_hot_shoe_left_return", (1.1, 6.0, 1.0), (0.0, 30.5, 55.75), 0.20, collection, steel), rails)
    _parent(rounded_box("Z50II_hot_shoe_right_return", (1.1, 6.0, 1.0), (8.0, 30.5, 55.75), 0.20, collection, steel), rails)
    rails["shoeStandard"] = "ISO 518 reference geometry"
    _annotate(rails, "Z50II-06-005", "具有双导轨、后桥和内翻压边的ISO 518热靴参考结构。", "ISO 518 reference shoe structure with twin rails, rear bridge, and inward retention lips.")

    contact_plate = rounded_box("Z50II-06-006_hot_shoe_contact_plate", (7.2, 5.2, 0.45), (4.0, 30.5, 55.55), 0.35, collection, shoe_black)
    for index, (x, y) in enumerate(((4.0, 28.8), (1.7, 30.5), (6.3, 30.5), (2.2, 32.0), (5.8, 32.0)), start=1):
        _parent(cylinder(f"Z50II_hot_shoe_contact_{index}", 0.62, 0.30, (x, y, 55.95), (0, 0, 0), collection, gold, vertices=24), contact_plate)
    _annotate(contact_plate, "Z50II-06-006", "绝缘触点板包含中央同步触点和四个辅助触点。", "Insulated contact plate with a central synchronization contact and four auxiliary contacts.")

    pivot = (5.0, 20.5, 57.2)
    flash_head = rounded_box("Z50II-06-007_flash_outer_head", (29.0, 1.6, 1.2), pivot, 0.38, collection, structural)
    for suffix, size, location in (
        ("top", (29.0, 9.0, 0.75), (5.0, 15.5, 58.05)),
        ("bottom", (29.0, 1.4, 1.2), (5.0, 10.5, 57.2)),
        ("left", (1.5, 9.0, 1.2), (-8.8, 15.5, 57.2)),
        ("right", (1.5, 9.0, 1.2), (18.8, 15.5, 57.2)),
        ("rear", (29.0, 1.0, 1.2), (5.0, 19.6, 57.2)),
    ):
        _parent(rounded_box(f"Z50II_flash_head_{suffix}", size, location, 0.45, collection, structural), flash_head)
    flash_head["pivotOriginMm"] = list(pivot)
    flash_head["pivotAxis"] = [1.0, 0.0, 0.0]
    flash_head["closedAngleDeg"] = 0.0
    flash_head["openAngleDeg"] = -72.0
    _annotate(flash_head, "Z50II-06-007", "以铰轴为对象原点的开放式灯头框架，可用于后续弹起动画。", "Open flash-head frame whose object origin is the hinge axis for a later pop-up animation.")

    reflector = rounded_box("Z50II-06-008_flash_reflector", (24.0, 5.6, 0.35), (5.0, 15.2, 56.35), 1.6, collection, reflector_mat)
    _parent(rounded_box("Z50II_flash_diffuser", (25.0, 6.0, 0.30), (5.0, 15.2, 55.85), 1.7, collection, diffuser), reflector)
    _parent(cylinder("Z50II_flash_tube", 0.85, 20.0, (5.0, 15.2, 56.08), (0, 90, 0), collection, diffuser, vertices=32), reflector)
    reflector["opticalAxis"] = [0.0, 0.0, -1.0]
    _annotate(reflector, "Z50II-06-008", "独立反光杯、扩散窗和横置闪光管的教学化组合。", "Teaching assembly of separate reflector bowl, diffuser window, and transverse flash tube.")

    hinge = cylinder("Z50II-06-009_flash_hinge", 2.15, 31.8, pivot, (0, 90, 0), collection, steel, vertices=40)
    _parent(cylinder("Z50II_flash_hinge_left_bearing", 3.0, 2.2, (-10.2, pivot[1], pivot[2]), (0, 90, 0), collection, structural, vertices=32), hinge)
    _parent(cylinder("Z50II_flash_hinge_right_bearing", 3.0, 2.2, (20.2, pivot[1], pivot[2]), (0, 90, 0), collection, structural, vertices=32), hinge)
    hinge["pivotOriginMm"] = list(pivot)
    hinge["pivotAxis"] = [1.0, 0.0, 0.0]
    _annotate(hinge, "Z50II-06-009", "与灯头对象原点同轴的金属转轴及两端轴承座。", "Metal pivot and two bearing blocks coaxial with the flash-head object origin.")

    top_pcb = rounded_box("Z50II-06-010_top_control_pcb", (22.0, 12.0, 0.60), (-34.0, 12.0, 33.0), 0.50, collection, board_mat)
    for index, (x, y, size) in enumerate(((-41.0, 9.5, (4.5, 3.0, 1.0)), (-35.0, 9.5, (4.2, 3.0, 1.0)), (-29.0, 9.5, (4.0, 2.8, 0.9)), (-38.0, 14.5, (3.5, 2.5, 0.9)), (-31.0, 14.5, (5.5, 2.5, 0.9))), start=1):
        _parent(rounded_box(f"Z50II_top_pcb_package_{index}", size, (x, y, 31.7), 0.28, collection, package_mat), top_pcb)
    _parent(rounded_box("Z50II_top_pcb_flex_socket", (6.0, 2.0, 1.2), (-43.0, 12.0, 31.8), 0.28, collection, gold), top_pcb)
    top_pcb["shellInterface"] = "seated beneath top/front shell overlap"
    _annotate(top_pcb, "Z50II-06-010", "位于顶壳下方的薄型控制板，带开关封装和排线座。", "Thin control board below the top shell with switch packages and a flex socket.")

    return [housing, display, eyepiece, diopter, rails, contact_plate, flash_head, reflector, hinge, top_pcb]


build = build_evf_top_flash
