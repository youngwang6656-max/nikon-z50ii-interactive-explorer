"""Procedural module 07: hollow rear shell, closed vari-angle LCD, controls."""

from __future__ import annotations

from math import cos, pi, sin

import bpy

from z50ii.constants import mm
from z50ii.geometry import cylinder, rounded_box, torus
from z50ii.materials import assign_material, get_material
from z50ii.metadata import attach_part_metadata


MODULE_ID = "07_rear_lcd_controls"

PART_META = {
    "Z50II-07-001": ("Z50II-02-001", "后壳", "Rear shell", 11, (0, 1, 0), 45, ("Z50II-07-005", "Z50II-07-006", "Z50II-07-008", "Z50II-07-009", "Z50II-07-010", "Z50II-07-011", "Z50II-07-012", "Z50II-08-013", "Z50II-08-014", "Z50II-08-017")),
    "Z50II-07-002": ("Z50II-07-001", "液晶屏框架", "LCD frame", 8, (0, 1, 0), 28, ("Z50II-07-003",)),
    "Z50II-07-003": ("Z50II-07-002", "液晶显示面板", "LCD panel", 7, (0, 1, 0), 24, ("Z50II-07-004",)),
    "Z50II-07-004": ("Z50II-07-002", "液晶屏盖玻璃", "LCD cover glass", 6, (0, 1, 0), 20, ()),
    "Z50II-07-005": ("Z50II-07-001", "液晶屏内侧铰臂", "Inner LCD hinge arm", 10, (-1, 0, 0), 24, ("Z50II-07-007",)),
    "Z50II-07-006": ("Z50II-07-002", "液晶屏外侧铰臂", "Outer LCD hinge arm", 10, (0, 1, 0), 28, ("Z50II-07-007",)),
    "Z50II-07-007": ("Z50II-07-001", "液晶屏铰链转轴", "LCD hinge pivot", 9, (0, 0, 1), 60, ("Z50II-07-002", "Z50II-08-012", "Z50II-08-014", "Z50II-08-017")),
    "Z50II-07-008": ("Z50II-07-001", "菜单按钮", "MENU button", 3, (0, 1, 0), 16, ()),
    "Z50II-07-009": ("Z50II-07-001", "播放按钮", "Playback button", 3, (0, 1, 0), 16, ()),
    "Z50II-07-010": ("Z50II-07-001", "删除按钮", "Delete button", 3, (0, 1, 0), 16, ()),
    "Z50II-07-011": ("Z50II-07-001", "方向键", "Direction pad", 3, (0, 1, 0), 18, ()),
    "Z50II-07-012": ("Z50II-07-011", "OK确认按钮", "OK button", 3, (0, 1, 0), 16, ()),
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


def _frame(name, center, width, height, depth, rail, collection, material):
    x, y, z = center
    root = rounded_box(name, (width, depth, rail), (x, y, z + height / 2), 0.50, collection, material)
    _parent(rounded_box(f"{name}_bottom", (width, depth, rail), (x, y, z - height / 2), 0.50, collection, material), root)
    _parent(rounded_box(f"{name}_left", (rail, depth, height - rail), (x - width / 2, y, z), 0.50, collection, material), root)
    _parent(rounded_box(f"{name}_right", (rail, depth, height - rail), (x + width / 2, y, z), 0.50, collection, material), root)
    return root


def _seat(parent, name, location, radius, collection, material):
    return _parent(torus(name, radius + 0.65, 0.42, location, (90, 0, 0), collection, material), parent)


def _hollow_knuckles(
    name,
    pivot_center_mm,
    intervals_mm,
    outer_radius_mm,
    bore_radius_mm,
    collection,
    material,
    *,
    segments=64,
):
    """Build one or more closed annular hinge sleeves on a shared Z axis."""
    vertices = []
    faces = []
    for lower_mm, upper_mm in intervals_mm:
        base = len(vertices)
        for radius_mm, z_mm in (
            (outer_radius_mm, lower_mm),
            (outer_radius_mm, upper_mm),
            (bore_radius_mm, lower_mm),
            (bore_radius_mm, upper_mm),
        ):
            for index in range(segments):
                angle = 2.0 * pi * index / segments
                vertices.append(
                    (
                        mm(radius_mm * cos(angle)),
                        mm(radius_mm * sin(angle)),
                        mm(z_mm),
                    )
                )
        outer_bottom = base
        outer_top = base + segments
        inner_bottom = base + 2 * segments
        inner_top = base + 3 * segments
        for index in range(segments):
            following = (index + 1) % segments
            faces.extend(
                (
                    (
                        outer_bottom + index,
                        outer_bottom + following,
                        outer_top + following,
                        outer_top + index,
                    ),
                    (
                        inner_bottom + index,
                        inner_top + index,
                        inner_top + following,
                        inner_bottom + following,
                    ),
                    (
                        outer_bottom + index,
                        inner_bottom + index,
                        inner_bottom + following,
                        outer_bottom + following,
                    ),
                    (
                        outer_top + index,
                        outer_top + following,
                        inner_top + following,
                        inner_top + index,
                    ),
                )
            )
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = tuple(mm(value) for value in pivot_center_mm)
    collection.objects.link(obj)
    assign_material(obj, material)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def _hinge_web(parent, name, size, location, bevel, collection, material, *, attachment):
    web = _parent(rounded_box(name, size, location, bevel, collection, material), parent)
    web["hingeOwnerPartId"] = parent["partId"] if parent.get("partId") else name.split("_")[0]
    web["knuckleAttachment"] = attachment
    return web


def build_rear_lcd_controls() -> list[bpy.types.Object]:
    collection = bpy.data.collections[MODULE_ID]
    _clear(collection)

    shell_mat = get_material("Z50II Rear Shell Polymer", (0.020, 0.024, 0.028, 1), metallic=0.06, roughness=0.53)
    frame_mat = get_material("Z50II LCD Frame", (0.016, 0.019, 0.022, 1), metallic=0.04, roughness=0.47)
    glass_mat = get_material("Z50II LCD Cover Glass", (0.018, 0.045, 0.060, 1), metallic=0.18, roughness=0.07)
    panel_mat = get_material("Z50II LCD Panel", (0.015, 0.035, 0.048, 1), metallic=0.23, roughness=0.12)
    hinge_mat = get_material("Z50II LCD Hinge Metal", (0.34, 0.37, 0.40, 1), metallic=0.91, roughness=0.27)
    control_mat = get_material("Z50II Rear Controls", (0.028, 0.032, 0.036, 1), metallic=0.10, roughness=0.39)

    # Leave a real upper exit slot above the hinge axis so the service pin can
    # be withdrawn vertically without crossing the rear-shell top rail.
    rear_shell = rounded_box("Z50II-07-001_rear_shell", (60.0, 1.65, 3.0), (14.0, 35.0, 31.0), 0.50, collection, shell_mat)
    for suffix, size, location in (
        ("bottom", (105.0, 1.65, 3.0), (0.5, 35.0, -33.0)),
        ("left", (3.0, 1.65, 61.0), (-52.0, 35.0, -1.0)),
        # Split the right rail around the physical hinge pocket instead of
        # passing a solid shell member through the annular knuckles.
        ("right_upper", (3.0, 1.65, 16.6), (53.0, 35.0, 21.7)),
        ("right_lower", (3.0, 1.65, 14.6), (53.0, 35.0, -24.7)),
        ("control_top_return", (8.0, 1.65, 3.0), (-48.5, 35.0, 31.0)),
    ):
        _parent(rounded_box(f"Z50II-07-001_rear_shell_{suffix}", size, location, 0.50, collection, shell_mat), rear_shell)
    for suffix, size, location in (
        ("screen_upper_web", (66.0, 1.65, 2.2), (15.0, 34.4, 23.2)),
        ("screen_lower_web", (66.0, 1.65, 2.2), (15.0, 34.4, -25.2)),
        ("screen_inner_web", (2.2, 1.65, 46.0), (-18.4, 34.4, -1.0)),
        ("hinge_pocket_upper_web", (2.0, 1.65, 5.0), (52.5, 34.4, 20.0)),
        ("hinge_pocket_lower_web", (2.0, 1.65, 5.0), (52.5, 34.4, -24.0)),
        ("control_spine", (3.0, 1.65, 38.0), (-28.0, 34.4, -7.0)),
    ):
        _parent(rounded_box(f"Z50II_rear_shell_{suffix}", size, location, 0.48, collection, shell_mat), rear_shell)
    for name, location, radius in (
        ("menu_seat", (-39.0, 35.0, 18.0), 2.3),
        ("playback_seat", (-39.0, 35.0, 10.0), 2.3),
        ("delete_seat", (-39.0, 35.0, 2.0), 2.3),
        ("dpad_seat", (-39.0, 35.0, -11.0), 6.2),
    ):
        _seat(rear_shell, f"Z50II_rear_{name}", location, radius, collection, shell_mat)
    rear_shell["isHollow"] = True
    rear_shell["lcdOpeningMm"] = [66.0, 46.0]
    _annotate(rear_shell, "Z50II-07-001", "由周边梁、屏幕开口、铰链口袋和真实按键座组成的中空后壳。", "Hollow rear shell formed from perimeter rails, a screen opening, hinge pocket, and physical button seats.")

    lcd_frame = _frame("Z50II-07-002_lcd_frame", (13.0, 36.0, -1.0), 61.5, 43.0, 1.55, 2.2, collection, frame_mat)
    _parent(rounded_box("Z50II_lcd_frame_back_plate", (55.2, 0.55, 36.2), (13.0, 35.55, -1.0), 1.0, collection, frame_mat), lcd_frame)
    lcd_frame["closedPosition"] = True
    lcd_frame["screenDiagonalInches"] = 3.2
    _annotate(lcd_frame, "Z50II-07-002", "以关闭状态嵌入后壳的3.2英寸级屏幕承载框。", "3.2-inch-class screen carrier seated in the rear shell in its closed position.")

    lcd_panel = rounded_box("Z50II-07-003_lcd_panel", (56.8, 0.46, 35.8), (13.0, 36.62, -1.0), 0.75, collection, panel_mat)
    _parent(rounded_box("Z50II_lcd_panel_driver", (18.0, 0.55, 2.0), (13.0, 36.12, -18.5), 0.30, collection, control_mat), lcd_panel)
    lcd_panel["layerIndex"] = 1
    _annotate(lcd_panel, "Z50II-07-003", "与框架和盖玻璃保持独立层间距的触控液晶显示层。", "Touch LCD display layer with explicit spacing from both carrier and cover glass.")

    cover_glass = rounded_box("Z50II-07-004_lcd_cover_glass", (58.0, 0.38, 37.0), (13.0, 37.18, -1.0), 1.05, collection, glass_mat)
    cover_glass["layerIndex"] = 2
    _annotate(cover_glass, "Z50II-07-004", "关闭屏幕最外侧的独立薄型盖玻璃。", "Independent thin cover glass at the outermost face of the closed display.")

    pivot_center = (49.6, 35.15, -2.0)
    screen_pivot = bpy.data.objects.new("Z50II_LCD_SCREEN_PIVOT", None)
    screen_pivot.empty_display_type = "PLAIN_AXES"
    screen_pivot.empty_display_size = mm(8.0)
    screen_pivot.location = tuple(mm(value) for value in pivot_center)
    screen_pivot["motionGroupId"] = "rear-lcd-screen"
    screen_pivot["pivotAxis"] = [0.0, 0.0, 1.0]
    screen_pivot["closedAngleDeg"] = 0.0
    screen_pivot["openAngleDeg"] = -105.0
    screen_pivot["purpose"] = "Browser animation pivot for the complete rear LCD screen group"
    collection.objects.link(screen_pivot)

    inner_arm = _hollow_knuckles(
        "Z50II-07-005_inner_hinge_arm",
        pivot_center,
        ((-15.0, -6.0), (6.0, 15.0)),
        3.0,
        1.65,
        collection,
        hinge_mat,
    )
    inner_arm["pivotOriginMm"] = list(pivot_center)
    inner_arm["pivotAxis"] = [0.0, 0.0, 1.0]
    inner_arm["kinematicRole"] = "stationary"
    inner_arm["boreRadiusMm"] = 1.65
    inner_arm["outerRadiusMm"] = 3.0
    inner_arm["knuckleZIntervalsMm"] = [-17.0, -8.0, 4.0, 13.0]
    _annotate(inner_arm, "Z50II-07-005", "由机身侧轴套、竖向连杆和下端安装面构成的内侧铰臂。", "Inner hinge arm with body-side hub, vertical link, and lower mounting land.")
    for suffix, location in (("lower", (44.9, 34.75, -12.5)), ("upper", (44.9, 34.75, 8.5))):
        _hinge_web(
            inner_arm,
            f"Z50II_inner_hinge_arm_{suffix}_bridge",
            (3.8, 0.8, 3.0),
            location,
            0.35,
            collection,
            hinge_mat,
            attachment=True,
        )
    _hinge_web(inner_arm, "Z50II_inner_hinge_arm_spine", (2.4, 0.8, 25.5), (41.9, 34.75, -4.25), 0.36, collection, hinge_mat, attachment=False)
    _hinge_web(inner_arm, "Z50II_inner_hinge_arm_body_land", (5.0, 1.8, 4.0), (43.0, 34.3, -17.0), 0.65, collection, hinge_mat, attachment=False)

    outer_arm = _hollow_knuckles(
        "Z50II-07-006_outer_hinge_arm",
        pivot_center,
        ((-5.6, 5.6),),
        2.8,
        1.65,
        collection,
        hinge_mat,
    )
    outer_arm["pivotOriginMm"] = list(pivot_center)
    outer_arm["pivotAxis"] = [0.0, 0.0, 1.0]
    outer_arm["boreRadiusMm"] = 1.65
    outer_arm["outerRadiusMm"] = 2.8
    outer_arm["knuckleZIntervalsMm"] = [-7.6, 3.6]
    _annotate(outer_arm, "Z50II-07-006", "连接关闭屏幕框的外侧铰臂，与内臂共享动画转轴原点。", "Outer hinge arm connecting the closed screen frame and sharing the animation pivot with the inner arm.")
    _hinge_web(outer_arm, "Z50II_outer_hinge_arm_bridge", (4.0, 1.3, 3.0), (45.0, 36.2, -2.0), 0.35, collection, hinge_mat, attachment=True)
    _hinge_web(outer_arm, "Z50II_outer_hinge_arm_lower_elbow", (1.8, 3.2, 3.0), (43.0, 37.7, -2.0), 0.38, collection, hinge_mat, attachment=False)
    _hinge_web(outer_arm, "Z50II_outer_hinge_arm_spine", (1.8, 1.3, 20.0), (43.0, 39.0, 8.0), 0.42, collection, hinge_mat, attachment=False)
    _hinge_web(outer_arm, "Z50II_outer_hinge_arm_upper_elbow", (1.8, 3.2, 2.0), (43.0, 37.7, 18.0), 0.38, collection, hinge_mat, attachment=False)
    _hinge_web(outer_arm, "Z50II_outer_hinge_arm_screen_land", (5.5, 1.6, 4.0), (44.5, 36.4, 18.0), 0.65, collection, hinge_mat, attachment=False)

    hinge_pivot = cylinder("Z50II-07-007_hinge_pivot", 1.45, 34.0, pivot_center, (0, 0, 0), collection, hinge_mat, vertices=40)
    hinge_pivot["pivotOriginMm"] = list(pivot_center)
    hinge_pivot["pivotAxis"] = [0.0, 0.0, 1.0]
    hinge_pivot["closedAngleDeg"] = 0.0
    hinge_pivot["openAngleDeg"] = -105.0
    hinge_pivot["motionGroupId"] = "rear-lcd-screen"
    hinge_pivot["kinematicRole"] = "axis"
    hinge_pivot["pinRadiusMm"] = 1.45
    hinge_pivot["pinZIntervalMm"] = [-19.0, 15.0]
    hinge_pivot["solidPin"] = True
    _annotate(hinge_pivot, "Z50II-07-007", "贯穿两支铰臂的竖直金属转轴，为后续开屏动画提供同轴基准。", "Vertical metal pivot through both hinge arms, providing the coaxial basis for a later open-screen animation.")

    for moving in (lcd_frame, lcd_panel, cover_glass, outer_arm):
        moving["pivotObject"] = screen_pivot.name
        moving["pivotOriginMm"] = list(pivot_center)
        moving["pivotAxis"] = [0.0, 0.0, 1.0]
        moving["motionGroupId"] = "rear-lcd-screen"
        moving["kinematicRole"] = "moving"
        moving["closedAngleDeg"] = 0.0
        moving["openAngleDeg"] = -105.0
        _parent(moving, screen_pivot)

    menu = cylinder("Z50II-07-008_menu_button", 2.0, 1.2, (-39.0, 36.25, 18.0), (90, 0, 0), collection, control_mat, vertices=40)
    menu["seatObject"] = "Z50II_rear_menu_seat"
    _annotate(menu, "Z50II-07-008", "嵌入独立圆形沉座的MENU按钮。", "MENU button seated in a dedicated circular counterbore.")
    playback = cylinder("Z50II-07-009_playback_button", 2.0, 1.2, (-39.0, 36.25, 10.0), (90, 0, 0), collection, control_mat, vertices=40)
    playback["seatObject"] = "Z50II_rear_playback_seat"
    _annotate(playback, "Z50II-07-009", "嵌入独立圆形沉座的播放按钮。", "Playback button seated in a dedicated circular counterbore.")
    delete = cylinder("Z50II-07-010_delete_button", 2.0, 1.2, (-39.0, 36.25, 2.0), (90, 0, 0), collection, control_mat, vertices=40)
    delete["seatObject"] = "Z50II_rear_delete_seat"
    _annotate(delete, "Z50II-07-010", "嵌入独立圆形沉座的删除按钮。", "Delete button seated in a dedicated circular counterbore.")

    dpad = torus("Z50II-07-011_direction_pad", 4.4, 1.15, (-39.0, 36.25, -11.0), (90, 0, 0), collection, control_mat)
    for suffix, location, size in (
        ("up", (-39.0, 36.25, -6.7), (2.3, 1.2, 2.2)),
        ("down", (-39.0, 36.25, -15.3), (2.3, 1.2, 2.2)),
        ("left", (-43.3, 36.25, -11.0), (2.2, 1.2, 2.3)),
        ("right", (-34.7, 36.25, -11.0), (2.2, 1.2, 2.3)),
    ):
        _parent(rounded_box(f"Z50II_direction_pad_{suffix}", size, location, 0.42, collection, control_mat), dpad)
    dpad["seatObject"] = "Z50II_rear_dpad_seat"
    _annotate(dpad, "Z50II-07-011", "具有中央开孔和四个实体方向瓣的环形方向键。", "Annular direction pad with a true central opening and four physical directional lobes.")

    ok_button = cylinder("Z50II-07-012_ok_button", 2.25, 1.15, (-39.0, 36.27, -11.0), (90, 0, 0), collection, control_mat, vertices=40)
    _annotate(ok_button, "Z50II-07-012", "位于方向键真实中心开孔中的独立OK确认按钮。", "Independent OK button seated in the direction pad's true central opening.")

    return [rear_shell, lcd_frame, lcd_panel, cover_glass, inner_arm, outer_arm, hinge_pivot, menu, playback, delete, dpad, ok_button]


build = build_rear_lcd_controls
