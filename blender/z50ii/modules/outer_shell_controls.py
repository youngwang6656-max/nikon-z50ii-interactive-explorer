"""Procedural module 02: Z50II-like exterior shell, doors, and controls."""

from __future__ import annotations

from math import radians

import bpy

from z50ii.constants import mm
from z50ii.geometry import cylinder, rounded_box, torus
from z50ii.materials import assign_material, get_material
from z50ii.metadata import attach_part_metadata


MODULE_ID = "02_outer_shell_controls"


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
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def _round_cut(
    target: bpy.types.Object,
    *,
    name: str,
    radius_mm: float,
    depth_mm: float,
    location_mm: tuple[float, float, float],
    rotation_deg: tuple[float, float, float],
) -> None:
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


def _box_cut(
    target: bpy.types.Object,
    *,
    name: str,
    size_mm: tuple[float, float, float],
    location_mm: tuple[float, float, float],
) -> None:
    bpy.ops.mesh.primitive_cube_add(location=tuple(mm(value) for value in location_mm))
    cutter = bpy.context.active_object
    cutter.name = name
    cutter.dimensions = tuple(mm(value) for value in size_mm)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    _boolean_difference(target, cutter, f"{name}_difference")


def _text(
    name: str,
    body: str,
    location_mm: tuple[float, float, float],
    size_mm: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    parent: bpy.types.Object,
) -> bpy.types.Object:
    bpy.ops.object.text_add(
        location=tuple(mm(value) for value in location_mm),
        rotation=(radians(90.0), 0.0, 0.0),
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.data.body = body
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = mm(size_mm)
    obj.data.extrude = mm(0.12)
    obj.data.bevel_depth = mm(0.04)
    _move_to_collection(obj, collection)
    assign_material(obj, material)
    return _parent(obj, parent)


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


def build_outer_shell_controls() -> list[bpy.types.Object]:
    """Build the 20 selectable exterior parts in their assembled transforms."""
    collection = bpy.data.collections[MODULE_ID]
    _clear(collection)

    shell = get_material(
        "Z50II Black Shell",
        (0.022, 0.025, 0.028, 1.0),
        metallic=0.12,
        roughness=0.36,
    )
    shell_edge = get_material(
        "Z50II Charcoal Shell",
        (0.045, 0.049, 0.053, 1.0),
        metallic=0.08,
        roughness=0.43,
    )
    rubber = get_material(
        "Z50II Grip Rubber",
        (0.018, 0.019, 0.020, 1.0),
        metallic=0.0,
        roughness=0.78,
    )
    control = get_material(
        "Z50II Controls",
        (0.035, 0.038, 0.041, 1.0),
        metallic=0.18,
        roughness=0.31,
    )
    metal = get_material(
        "Z50II Exterior Metal",
        (0.38, 0.41, 0.44, 1.0),
        metallic=0.92,
        roughness=0.22,
    )
    glass = get_material(
        "Z50II Dark Glass",
        (0.006, 0.012, 0.016, 1.0),
        metallic=0.18,
        roughness=0.12,
    )
    white = get_material(
        "Z50II White Markings",
        (0.72, 0.75, 0.77, 1.0),
        metallic=0.0,
        roughness=0.38,
    )
    red = get_material(
        "Z50II Red Accent",
        (0.42, 0.012, 0.016, 1.0),
        metallic=0.0,
        roughness=0.34,
    )

    front_shell = rounded_box(
        "Z50II-02-001_front_shell",
        (112.0, 34.0, 70.0),
        (0.0, 17.0, 0.0),
        4.0,
        collection,
        shell,
    )
    _round_cut(
        front_shell,
        name="reserved_z_mount_opening_55mm",
        radius_mm=27.5,
        depth_mm=40.0,
        location_mm=(0.0, 5.0, 0.0),
        rotation_deg=(90.0, 0.0, 0.0),
    )
    _box_cut(
        front_shell,
        name="rear_display_recess",
        size_mm=(79.0, 8.0, 50.0),
        location_mm=(-4.0, 33.0, -3.0),
    )
    for index, (x, z, radius) in enumerate(((32.0, 8.0, 3.2), (34.0, -2.0, 3.0), (25.0, 7.0, 3.6))):
        _round_cut(
            front_shell,
            name=f"front_control_socket_{index + 1}",
            radius_mm=radius,
            depth_mm=5.0,
            location_mm=(x, 0.5, z),
            rotation_deg=(90.0, 0.0, 0.0),
        )
    mount_lip = torus(
        "Z50II_mount_interface_lip",
        29.2,
        1.1,
        (0.0, -0.7, 0.0),
        (90.0, 0.0, 0.0),
        collection,
        metal,
    )
    _parent(mount_lip, front_shell)
    cavity = cylinder(
        "Z50II_mount_reserved_dark_cavity",
        27.1,
        0.8,
        (0.0, 19.5, 0.0),
        (90.0, 0.0, 0.0),
        collection,
        glass,
        vertices=96,
    )
    _parent(cavity, front_shell)
    display_recess = rounded_box(
        "Z50II_rear_display_placeholder",
        (76.0, 1.0, 47.0),
        (-4.0, 29.4, -3.0),
        1.2,
        collection,
        glass,
    )
    _parent(display_recess, front_shell)
    hinge_recess = rounded_box(
        "Z50II_display_hinge_recess",
        (5.0, 3.0, 24.0),
        (-45.5, 31.0, -3.0),
        1.0,
        collection,
        shell_edge,
    )
    _parent(hinge_recess, front_shell)
    _text("Z50II_front_brand", "Nikon", (-17.0, -0.9, 27.0), 7.0, collection, white, front_shell)
    _text("Z50II_front_model", "Z50II", (-40.5, -0.9, -27.0), 3.2, collection, white, front_shell)
    _metadata(
        front_shell,
        part_id="Z50II-02-001",
        parent_id="",
        name_zh="前壳",
        name_en="Front shell",
        description_zh="带55毫米卡口开口和后屏凹位的Z50II外形参考重建。",
        description_en="Z50II-like reference shell with a 55 mm mount opening and rear-display recess.",
        step=8,
        axis=(0.0, -1.0, 0.0),
        distance_mm=55.0,
        depends_on=("Z50II-02-003",),
    )

    grip_rubber = rounded_box(
        "Z50II-02-002_grip_rubber",
        (31.0, 32.0, 66.0),
        (54.5, -16.0, -5.0),
        7.0,
        collection,
        rubber,
    )
    for z in (-23.0, -17.0, -11.0, -5.0, 1.0, 7.0, 13.0):
        groove = rounded_box(
            f"Z50II_grip_texture_{int(z + 30)}",
            (20.0, 0.4, 1.2),
            (55.0, -31.85, z),
            0.3,
            collection,
            shell_edge,
        )
        _parent(groove, grip_rubber)
    _metadata(
        grip_rubber,
        part_id="Z50II-02-002",
        parent_id="Z50II-02-001",
        name_zh="握柄橡胶",
        name_en="Grip rubber",
        description_zh="形成深握柄与颗粒触感的外观参考件。",
        description_en="Exterior reference piece forming the deep grip and textured contact surface.",
        step=9,
        axis=(0.0, -1.0, 0.0),
        distance_mm=38.0,
        depends_on=("Z50II-02-001", "Z50II-02-006"),
    )

    top_shell = rounded_box(
        "Z50II-02-003_top_shell",
        (104.0, 33.0, 9.0),
        (0.0, 18.0, 33.5),
        3.2,
        collection,
        shell,
    )
    evf_housing = rounded_box(
        "Z50II_evf_housing",
        (32.0, 22.0, 23.6),
        (-5.0, 23.0, 45.0),
        5.0,
        collection,
        shell,
    )
    _box_cut(
        evf_housing,
        name="evf_viewing_aperture",
        size_mm=(18.0, 5.0, 8.5),
        location_mm=(-5.0, 33.0, 44.0),
    )
    _parent(evf_housing, top_shell)
    eyepiece = rounded_box(
        "Z50II_evf_eyepiece_glass",
        (16.0, 1.0, 7.0),
        (-5.0, 32.0, 44.0),
        1.7,
        collection,
        glass,
    )
    _parent(eyepiece, top_shell)
    hot_shoe = rounded_box(
        "Z50II_hot_shoe_interface_placeholder",
        (15.0, 14.0, 1.5),
        (-5.0, 23.0, 38.6),
        0.4,
        collection,
        metal,
    )
    _parent(hot_shoe, top_shell)
    _metadata(
        top_shell,
        part_id="Z50II-02-003",
        parent_id="Z50II-02-001",
        name_zh="顶壳",
        name_en="Top shell",
        description_zh="包含EVF隆起、取景开口和热靴占位的外形参考顶壳。",
        description_en="Reference top shell with EVF hump, viewing aperture, and hot-shoe placeholder.",
        step=7,
        axis=(0.0, 0.0, 1.0),
        distance_mm=42.0,
        depends_on=("Z50II-02-005", "Z50II-02-006"),
    )

    bottom_shell = rounded_box(
        "Z50II-02-004_bottom_shell",
        (108.0, 32.0, 5.0),
        (0.0, 16.0, -37.5),
        2.0,
        collection,
        shell_edge,
    )
    _metadata(
        bottom_shell,
        part_id="Z50II-02-004",
        parent_id="Z50II-02-001",
        name_zh="底壳",
        name_en="Bottom shell",
        description_zh="保持公开机身高度基准的外形参考底壳。",
        description_en="Reference base shell preserving the published overall-height anchor.",
        step=4,
        axis=(0.0, 0.0, -1.0),
        distance_mm=35.0,
        depends_on=("Z50II-02-007",),
    )

    left_cover = rounded_box(
        "Z50II-02-005_left_side_cover",
        (2.0, 27.0, 52.0),
        (-56.0, 16.0, -2.0),
        1.0,
        collection,
        shell_edge,
    )
    _metadata(
        left_cover,
        part_id="Z50II-02-005",
        parent_id="Z50II-02-001",
        name_zh="左侧盖",
        name_en="Left side cover",
        description_zh="覆盖侧面接口舱区域的外形参考盖板。",
        description_en="Reference cover over the side connector-door region.",
        step=5,
        axis=(-1.0, 0.0, 0.0),
        distance_mm=30.0,
        depends_on=("Z50II-02-004", "Z50II-02-008", "Z50II-02-009"),
    )

    right_cover = rounded_box(
        "Z50II-02-006_right_grip_cover",
        (12.0, 27.0, 54.0),
        (62.0, 14.0, -5.0),
        4.0,
        collection,
        shell,
    )
    _metadata(
        right_cover,
        part_id="Z50II-02-006",
        parent_id="Z50II-02-001",
        name_zh="右握柄盖",
        name_en="Right grip cover",
        description_zh="连接握柄蒙皮和主机身轮廓的外形参考侧盖。",
        description_en="Reference side cover joining the grip skin to the main body silhouette.",
        step=6,
        axis=(1.0, 0.0, 0.0),
        distance_mm=34.0,
        depends_on=("Z50II-02-004",),
    )

    battery_door = rounded_box(
        "Z50II-02-007_battery_door",
        (31.0, 25.0, 1.4),
        (37.0, 16.0, -39.3),
        0.7,
        collection,
        shell_edge,
    )
    _metadata(
        battery_door,
        part_id="Z50II-02-007",
        parent_id="Z50II-02-004",
        name_zh="电池舱门",
        name_en="Battery door",
        description_zh="与EN-EL25a电池舱位置对应的外形参考舱门。",
        description_en="Reference exterior door at the EN-EL25a battery-bay position.",
        step=1,
        axis=(0.0, 0.0, -1.0),
        distance_mm=24.0,
        depends_on=(),
    )

    upper_port_door = rounded_box(
        "Z50II-02-008_upper_port_door",
        (1.4, 13.0, 17.0),
        (-56.3, 15.0, 9.0),
        0.7,
        collection,
        rubber,
    )
    _metadata(
        upper_port_door,
        part_id="Z50II-02-008",
        parent_id="Z50II-02-005",
        name_zh="上接口舱门",
        name_en="Upper port door",
        description_zh="侧面上部接口区域的柔性外观参考舱门。",
        description_en="Flexible exterior reference door for the upper connector region.",
        step=2,
        axis=(-1.0, 0.0, 0.0),
        distance_mm=22.0,
        depends_on=(),
    )

    lower_port_door = rounded_box(
        "Z50II-02-009_lower_port_door",
        (1.4, 13.0, 18.0),
        (-56.3, 15.0, -11.0),
        0.7,
        collection,
        rubber,
    )
    _metadata(
        lower_port_door,
        part_id="Z50II-02-009",
        parent_id="Z50II-02-005",
        name_zh="下接口舱门",
        name_en="Lower port door",
        description_zh="侧面下部接口区域的柔性外观参考舱门。",
        description_en="Flexible exterior reference door for the lower connector region.",
        step=3,
        axis=(-1.0, 0.0, 0.0),
        distance_mm=22.0,
        depends_on=(),
    )

    shutter = cylinder(
        "Z50II-02-010_shutter_button",
        4.2,
        2.2,
        (49.0, -4.0, 31.8),
        (0.0, 0.0, 0.0),
        collection,
        metal,
        vertices=64,
    )
    _metadata(
        shutter,
        part_id="Z50II-02-010",
        parent_id="Z50II-02-002",
        name_zh="快门释放按钮",
        name_en="Shutter-release button",
        description_zh="位于握柄顶部的快门按钮外形参考件。",
        description_en="Reference shutter-release control at the top of the grip.",
        step=12,
        axis=(0.0, 0.0, 1.0),
        distance_mm=18.0,
        depends_on=("Z50II-02-002",),
    )

    power_collar = torus(
        "Z50II-02-011_power_collar",
        5.5,
        1.0,
        (49.0, -4.0, 31.0),
        (0.0, 0.0, 0.0),
        collection,
        control,
    )
    _parent(
        rounded_box(
            "Z50II_power_collar_red_index",
            (1.2, 2.4, 1.0),
            (54.0, -4.0, 31.8),
            0.2,
            collection,
            red,
        ),
        power_collar,
    )
    _metadata(
        power_collar,
        part_id="Z50II-02-011",
        parent_id="Z50II-02-010",
        name_zh="电源环",
        name_en="Power collar",
        description_zh="环绕快门按钮的电源控制环外形参考件。",
        description_en="Reference power-control collar surrounding the shutter button.",
        step=13,
        axis=(0.0, 0.0, 1.0),
        distance_mm=18.0,
        depends_on=("Z50II-02-010",),
    )

    front_dial = cylinder(
        "Z50II-02-012_front_command_dial",
        6.2,
        4.0,
        (47.0, -9.0, 22.0),
        (0.0, 90.0, 0.0),
        collection,
        control,
        vertices=40,
    )
    _metadata(
        front_dial,
        part_id="Z50II-02-012",
        parent_id="Z50II-02-002",
        name_zh="前指令拨轮",
        name_en="Front command dial",
        description_zh="握柄前上部的带齿指令拨轮外形参考件。",
        description_en="Reference knurled command dial on the upper-front grip.",
        step=14,
        axis=(1.0, 0.0, 0.0),
        distance_mm=20.0,
        depends_on=("Z50II-02-002",),
    )

    rear_dial = cylinder(
        "Z50II-02-013_rear_command_dial",
        6.0,
        4.0,
        (40.0, 28.5, 29.0),
        (0.0, 90.0, 0.0),
        collection,
        control,
        vertices=40,
    )
    _metadata(
        rear_dial,
        part_id="Z50II-02-013",
        parent_id="Z50II-02-003",
        name_zh="后指令拨轮",
        name_en="Rear command dial",
        description_zh="机背右上部的指令拨轮外形参考件。",
        description_en="Reference command dial at the upper-right rear of the body.",
        step=15,
        axis=(1.0, 0.0, 0.0),
        distance_mm=20.0,
        depends_on=("Z50II-02-003",),
    )

    mode_dial = cylinder(
        "Z50II-02-014_mode_dial",
        9.5,
        3.0,
        (-35.0, 18.0, 39.0),
        (0.0, 0.0, 0.0),
        collection,
        control,
        vertices=48,
    )
    _metadata(
        mode_dial,
        part_id="Z50II-02-014",
        parent_id="Z50II-02-003",
        name_zh="模式拨盘",
        name_en="Mode dial",
        description_zh="顶部左侧的拍摄模式拨盘外形参考件。",
        description_en="Reference shooting-mode dial on the upper-left shoulder.",
        step=16,
        axis=(0.0, 0.0, 1.0),
        distance_mm=22.0,
        depends_on=("Z50II-02-003",),
    )

    selector = rounded_box(
        "Z50II-02-015_photo_video_selector",
        (10.0, 2.0, 5.0),
        (30.0, 33.5, 25.0),
        1.0,
        collection,
        control,
    )
    _metadata(
        selector,
        part_id="Z50II-02-015",
        parent_id="Z50II-02-003",
        name_zh="照片／视频选择器",
        name_en="Photo/video selector",
        description_zh="机背上部照片与视频模式切换控件的外形参考件。",
        description_en="Reference rear control for switching between still-photo and video modes.",
        step=17,
        axis=(0.0, 1.0, 0.0),
        distance_mm=18.0,
        depends_on=("Z50II-02-003",),
    )

    fn1 = cylinder(
        "Z50II-02-016_fn1_button",
        2.8,
        2.0,
        (32.0, -1.0, 8.0),
        (90.0, 0.0, 0.0),
        collection,
        control,
        vertices=48,
    )
    _metadata(
        fn1,
        part_id="Z50II-02-016",
        parent_id="Z50II-02-001",
        name_zh="Fn1按钮",
        name_en="Fn1 button",
        description_zh="卡口右侧上方的自定义功能按钮外形参考件。",
        description_en="Reference customizable function button above-right of the mount.",
        step=18,
        axis=(0.0, -1.0, 0.0),
        distance_mm=16.0,
        depends_on=("Z50II-02-001",),
    )

    fn2 = cylinder(
        "Z50II-02-017_fn2_button",
        2.6,
        2.0,
        (34.0, -1.0, -2.0),
        (90.0, 0.0, 0.0),
        collection,
        control,
        vertices=48,
    )
    _metadata(
        fn2,
        part_id="Z50II-02-017",
        parent_id="Z50II-02-001",
        name_zh="Fn2按钮",
        name_en="Fn2 button",
        description_zh="卡口右侧下方的自定义功能按钮外形参考件。",
        description_en="Reference customizable function button below-right of the mount.",
        step=19,
        axis=(0.0, -1.0, 0.0),
        distance_mm=16.0,
        depends_on=("Z50II-02-016",),
    )

    lens_release = cylinder(
        "Z50II-02-018_lens_release_button",
        3.3,
        2.2,
        (25.0, -1.0, 7.0),
        (90.0, 0.0, 0.0),
        collection,
        control,
        vertices=48,
    )
    _metadata(
        lens_release,
        part_id="Z50II-02-018",
        parent_id="Z50II-02-001",
        name_zh="镜头释放按钮",
        name_en="Lens-release button",
        description_zh="预留Z卡口界面旁的镜头释放按钮外形参考件；本期不含镜头。",
        description_en="Reference lens-release control beside the reserved Z-mount interface; no lens is included.",
        step=20,
        axis=(0.0, -1.0, 0.0),
        distance_mm=16.0,
        depends_on=("Z50II-02-001",),
    )

    left_lug = rounded_box(
        "Z50II-02-019_left_strap_lug",
        (3.0, 7.0, 13.0),
        (-55.5, 11.0, 20.0),
        1.2,
        collection,
        metal,
    )
    _metadata(
        left_lug,
        part_id="Z50II-02-019",
        parent_id="Z50II-02-005",
        name_zh="左肩带环",
        name_en="Left strap lug",
        description_zh="机身左肩的金属肩带连接环外形参考件。",
        description_en="Reference metal strap attachment at the left shoulder.",
        step=10,
        axis=(-1.0, 0.0, 0.0),
        distance_mm=24.0,
        depends_on=("Z50II-02-005",),
    )

    right_lug = rounded_box(
        "Z50II-02-020_right_strap_lug",
        (3.0, 7.0, 13.0),
        (68.5, 11.0, 20.0),
        1.2,
        collection,
        metal,
    )
    _metadata(
        right_lug,
        part_id="Z50II-02-020",
        parent_id="Z50II-02-006",
        name_zh="右肩带环",
        name_en="Right strap lug",
        description_zh="机身右肩的金属肩带连接环外形参考件。",
        description_en="Reference metal strap attachment at the right shoulder.",
        step=11,
        axis=(1.0, 0.0, 0.0),
        distance_mm=24.0,
        depends_on=("Z50II-02-006",),
    )

    return [
        front_shell,
        grip_rubber,
        top_shell,
        bottom_shell,
        left_cover,
        right_cover,
        battery_door,
        upper_port_door,
        lower_port_door,
        shutter,
        power_collar,
        front_dial,
        rear_dial,
        mode_dial,
        selector,
        fn1,
        fn2,
        lens_release,
        left_lug,
        right_lug,
    ]


build = build_outer_shell_controls
