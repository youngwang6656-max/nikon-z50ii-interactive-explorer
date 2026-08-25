"""Procedural module 08: side I/O, routed flexes, antenna, and hardware."""

from __future__ import annotations

from math import radians

import bpy

from z50ii.constants import mm
from z50ii.geometry import cylinder, fastener, flex_cable, rounded_box, torus
from z50ii.materials import assign_material, get_material
from z50ii.metadata import attach_part_metadata


MODULE_ID = "08_io_flex_fasteners"

PART_META = {
    "Z50II-08-001": ("Z50II-08-005", "USB Type-C接口", "USB Type-C port", 21, (1, 0, 0), 22, ("Z50II-02-005", "Z50II-02-008", "Z50II-08-010")),
    "Z50II-08-002": ("Z50II-08-005", "Type-D HDMI接口", "Type-D HDMI port", 21, (1, 0, 0), 22, ("Z50II-02-005", "Z50II-02-008", "Z50II-08-010")),
    "Z50II-08-003": ("Z50II-08-005", "3.5毫米麦克风接口", "3.5 mm microphone jack", 21, (1, 0, 0), 22, ("Z50II-02-005", "Z50II-02-009", "Z50II-08-010")),
    "Z50II-08-004": ("Z50II-08-005", "3.5毫米输出／遥控接口", "3.5 mm output/remote jack", 21, (1, 0, 0), 22, ("Z50II-02-005", "Z50II-02-009", "Z50II-08-010")),
    "Z50II-08-005": ("Z50II-04-001", "接口子板", "I/O daughterboard", 22, (1, 0, 0), 30, ("Z50II-08-001", "Z50II-08-002", "Z50II-08-003", "Z50II-08-004", "Z50II-08-010")),
    "Z50II-08-006": ("Z50II-07-001", "Wi-Fi／Bluetooth天线", "Wi-Fi/Bluetooth antenna", 20, (0, 1, 0), 22, ("Z50II-07-001", "Z50II-08-008")),
    "Z50II-08-007": ("Z50II-06-010", "顶部控制排线", "Top-control flex cable", 19, (0, 1, 0), 24, ("Z50II-02-003", "Z50II-08-018")),
    "Z50II-08-008": ("Z50II-07-001", "后部控制排线", "Rear-control flex cable", 19, (0, 1, 0), 24, ("Z50II-07-001", "Z50II-08-018")),
    "Z50II-08-009": ("Z50II-03-011", "传感器排线", "Sensor flex cable", 19, (0, 1, 0), 26, ("Z50II-02-001", "Z50II-07-001", "Z50II-08-018")),
    "Z50II-08-010": ("Z50II-08-005", "接口板排线", "Port flex cable", 19, (1, 0, 0), 24, ("Z50II-02-005", "Z50II-08-018")),
    "Z50II-08-011": ("Z50II-02-003", "左上机壳螺钉", "Upper-left shell screw", 1, (0, 1, 0), 18, ()),
    "Z50II-08-012": ("Z50II-02-003", "右上机壳螺钉", "Upper-right shell screw", 1, (0, 1, 0), 18, ()),
    "Z50II-08-013": ("Z50II-07-001", "左后机壳螺钉", "Rear-left shell screw", 1, (0, 1, 0), 20, ()),
    "Z50II-08-014": ("Z50II-07-001", "右后机壳螺钉", "Rear-right shell screw", 1, (0, 1, 0), 20, ()),
    "Z50II-08-015": ("Z50II-02-004", "左下机壳螺钉", "Bottom-left shell screw", 1, (0, 0, -1), 18, ()),
    "Z50II-08-016": ("Z50II-02-004", "右下机壳螺钉", "Bottom-right shell screw", 1, (0, 0, -1), 18, ()),
    "Z50II-08-017": ("Z50II-01-001", "机壳垫圈组", "Shell washer set", 2, (0, 1, 0), 16, ("Z50II-08-011", "Z50II-08-012", "Z50II-08-013", "Z50II-08-014", "Z50II-08-015", "Z50II-08-016")),
    "Z50II-08-018": ("Z50II-01-001", "排线压板", "Cable clamp", 18, (0, 1, 0), 18, ("Z50II-02-005", "Z50II-07-001")),
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


def _trapezoid_prism_x(name, outline_yz, depth, center_x, collection, material):
    half = depth / 2.0
    vertices = [(center_x - half, y, z) for y, z in outline_yz]
    vertices += [(center_x + half, y, z) for y, z in outline_yz]
    count = len(outline_yz)
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    faces.extend((index, (index + 1) % count, (index + 1) % count + count, index + count) for index in range(count))
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata([tuple(mm(value) for value in vertex) for vertex in vertices], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    assign_material(obj, material)
    bevel = obj.modifiers.new(name="Connector edge soften", type="BEVEL")
    bevel.width = mm(0.25)
    bevel.segments = 3
    return obj


def _flex_with_ends(name, points, width, collection, flex_mat, connector_mat):
    root = flex_cable(name, points, width, 0.28, collection, flex_mat)
    for suffix, point in (("start", points[0]), ("end", points[-1])):
        _parent(rounded_box(f"{name}_{suffix}_connector", (width + 2.0, 1.0, 2.0), point, 0.30, collection, connector_mat), root)
    root["routePointCount"] = len(points)
    root["routePointsMm"] = [list(point) for point in points]
    root["hasEndConnectors"] = True
    return root


def build_io_flex_fasteners() -> list[bpy.types.Object]:
    collection = bpy.data.collections[MODULE_ID]
    _clear(collection)

    shell_metal = get_material("Z50II Connector Shells", (0.42, 0.45, 0.48, 1), metallic=0.94, roughness=0.24)
    insulator = get_material("Z50II Connector Insulator", (0.018, 0.021, 0.024, 1), metallic=0.02, roughness=0.42)
    gold = get_material("Z50II Connector Contacts", (0.75, 0.43, 0.08, 1), metallic=0.92, roughness=0.20)
    board_mat = get_material("Z50II I/O PCB", (0.028, 0.17, 0.09, 1), metallic=0.08, roughness=0.44)
    package_mat = get_material("Z50II I/O Packages", (0.018, 0.021, 0.023, 1), metallic=0.14, roughness=0.36)
    antenna_mat = get_material("Z50II RF Antenna", (0.62, 0.33, 0.07, 1), metallic=0.74, roughness=0.28)
    flex_mat = get_material("Z50II Signal Flex", (0.72, 0.35, 0.045, 1), metallic=0.28, roughness=0.39)
    fastener_mat = get_material("Z50II Fastener Steel", (0.40, 0.43, 0.46, 1), metallic=0.96, roughness=0.23)

    usb = rounded_box("Z50II-08-001_usb_c_port", (6.5, 8.0, 1.0), (51.2, 17.0, 13.5), 0.48, collection, shell_metal)
    _parent(rounded_box("Z50II_usb_c_lower_shell", (6.5, 8.0, 1.0), (51.2, 17.0, 9.5), 0.48, collection, shell_metal), usb)
    _parent(rounded_box("Z50II_usb_c_front_shell", (1.0, 8.0, 4.0), (54.0, 17.0, 11.5), 1.65, collection, shell_metal), usb)
    _parent(rounded_box("Z50II_usb_c_tongue", (1.2, 5.8, 0.62), (54.6, 17.0, 11.5), 0.25, collection, insulator), usb)
    for index, y in enumerate((13.8, 15.3, 16.7, 18.2), start=1):
        _parent(rounded_box(f"Z50II_usb_c_contact_{index}", (0.25, 0.55, 0.18), (55.25, y, 14.2), 0.08, collection, gold), usb)
    usb["connectorType"] = "USB Type-C SuperSpeed"
    usb["openingCenterMm"] = [55.2, 17.0, 11.5]
    _annotate(usb, "Z50II-08-001", "具有圆角金属壳、中央舌片和可见触点的Type-C SuperSpeed接口。", "Type-C SuperSpeed connector with rounded metal shell, central tongue, and visible contacts.")

    hdmi_outline = ((12.7, 8.5), (21.3, 8.5), (22.0, 7.3), (20.6, 4.7), (13.4, 4.7), (12.0, 7.3))
    hdmi = _trapezoid_prism_x("Z50II-08-002_micro_hdmi_port", hdmi_outline, 6.0, 51.0, collection, shell_metal)
    _parent(_trapezoid_prism_x("Z50II_hdmi_insulator", ((13.7, 7.9), (20.3, 7.9), (20.8, 7.2), (19.8, 5.4), (14.2, 5.4), (13.2, 7.2)), 1.2, 54.5, collection, insulator), hdmi)
    for index, y in enumerate((13.2, 14.6, 16.0, 17.4, 18.8), start=1):
        _parent(rounded_box(f"Z50II_hdmi_contact_{index}", (0.28, 0.65, 0.16), (55.15, y, 7.15), 0.06, collection, gold), hdmi)
    hdmi["connectorType"] = "HDMI Type-D"
    hdmi["openingCenterMm"] = [55.2, 17.0, 6.6]
    _annotate(hdmi, "Z50II-08-002", "具有不对称梯形开口和触点排的Type-D HDMI接口。", "HDMI Type-D connector with an asymmetric trapezoidal opening and contact row.")

    microphone = torus("Z50II-08-003_microphone_jack", 2.55, 0.62, (54.6, 16.0, -7.0), (0, 90, 0), collection, shell_metal)
    _parent(cylinder("Z50II_microphone_jack_barrel", 2.25, 7.0, (51.0, 16.0, -7.0), (0, 90, 0), collection, insulator, vertices=40), microphone)
    _parent(cylinder("Z50II_microphone_jack_contact", 0.55, 0.40, (47.3, 16.0, -7.0), (0, 90, 0), collection, gold, vertices=24), microphone)
    microphone["connectorType"] = "3.5 mm stereo microphone input"
    microphone["openingDiameterMm"] = 3.5
    microphone["openingCenterMm"] = [55.2, 16.0, -7.0]
    _annotate(microphone, "Z50II-08-003", "具有真实圆孔、绝缘筒和后部触点的3.5毫米立体声麦克风接口。", "3.5 mm stereo microphone input with a true circular opening, insulated barrel, and rear contact.")

    remote = torus("Z50II-08-004_output_remote_jack", 2.55, 0.62, (54.6, 16.0, -14.0), (0, 90, 0), collection, shell_metal)
    _parent(cylinder("Z50II_output_remote_jack_barrel", 2.25, 7.0, (51.0, 16.0, -14.0), (0, 90, 0), collection, insulator, vertices=40), remote)
    _parent(cylinder("Z50II_output_remote_jack_contact", 0.55, 0.40, (47.3, 16.0, -14.0), (0, 90, 0), collection, gold, vertices=24), remote)
    remote["connectorType"] = "3.5 mm audio output/remote"
    remote["openingDiameterMm"] = 3.5
    remote["openingCenterMm"] = [55.2, 16.0, -14.0]
    _annotate(remote, "Z50II-08-004", "与麦克风口分离的3.5毫米音频输出／遥控复用接口。", "Separate 3.5 mm combined audio-output/remote connector.")

    io_board = rounded_box("Z50II-08-005_io_daughterboard", (1.0, 18.0, 28.0), (48.0, 17.0, -3.0), 0.60, collection, board_mat)
    for index, (y, z, size) in enumerate(((11.5, 15.0, (1.3, 4.0, 4.0)), (20.5, 14.5, (1.2, 4.0, 3.5)), (12.0, 0.0, (1.2, 4.5, 5.0)), (20.0, -2.0, (1.2, 4.5, 5.0)), (16.0, -20.0, (1.3, 7.0, 3.0))), start=1):
        _parent(rounded_box(f"Z50II_io_board_package_{index}", size, (47.05, y + 1.0, min(z, 8.0)), 0.30, collection, package_mat), io_board)
    _parent(rounded_box("Z50II_io_board_flex_socket", (1.2, 8.0, 2.5), (47.0, 17.0, -18.5), 0.30, collection, gold), io_board)
    io_board["boardThicknessMm"] = 1.0
    _annotate(io_board, "Z50II-08-005", "承载四种官方公布接口形态的窄型侧置子板，带独立封装和排线座。", "Narrow side daughterboard carrying the four published connector forms, with separate packages and flex socket.")

    antenna = rounded_box("Z50II-08-006_wifi_bluetooth_antenna", (20.0, 0.34, 5.0), (-8.0, 33.0, 24.5), 0.60, collection, antenna_mat)
    for index, x in enumerate((-16.0, -12.0, -8.0, -4.0, 0.0), start=1):
        _parent(rounded_box(f"Z50II_antenna_meander_{index}", (2.2, 0.22, 1.1), (x, 33.22, 24.5 + (1.4 if index % 2 else -1.4)), 0.18, collection, antenna_mat), antenna)
    _parent(cylinder("Z50II_antenna_coax_terminal", 1.1, 0.45, (-19.0, 33.25, 24.5), (90, 0, 0), collection, gold, vertices=24), antenna)
    antenna["radioBands"] = "Wi-Fi/Bluetooth reference antenna"
    _annotate(antenna, "Z50II-08-006", "沿后部上缘布置的薄型折线天线和同轴端子参考件。", "Thin meander antenna and coax terminal routed along the upper rear edge.")

    top_flex = _flex_with_ends("Z50II-08-007_top_flex_cable", ((-43.0, 12.0, 31.8), (-34.0, 18.0, 31.5), (-28.0, 24.0, 31.0), (-28.0, 29.0, 18.0), (-22.0, 29.0, 8.0)), 2.4, collection, flex_mat, insulator)
    top_flex["shellPassThrough"] = "top-control service aperture"
    _annotate(top_flex, "Z50II-08-007", "从顶部控制板沿肩部折弯至后部连接区的五段排线。", "Five-segment flex routed from the top-control board around the shoulder to the rear connector zone.")
    rear_flex = _flex_with_ends("Z50II-08-008_rear_flex_cable", ((40.0, 32.0, -22.0), (35.0, 32.0, -23.0), (28.0, 31.8, -23.0), (19.0, 31.8, -21.0), (10.0, 31.5, -20.0)), 2.6, collection, flex_mat, insulator)
    _annotate(rear_flex, "Z50II-08-008", "绕过屏幕铰链并沿后壳内侧转折的控制排线。", "Rear-control flex bending around the LCD hinge and along the inner rear shell.")
    sensor_flex = _flex_with_ends("Z50II-08-009_sensor_flex_cable", ((0.0, 16.5, -9.0), (25.0, 16.5, -9.0), (40.0, 18.0, -15.0), (40.0, 29.5, -15.0), (28.0, 31.5, -12.0), (18.0, 31.5, -10.0)), 1.0, collection, flex_mat, insulator)
    _annotate(sensor_flex, "Z50II-08-009", "从固定式传感器载板后缘弯折至主板连接区的宽排线。", "Wide flex bending from the fixed sensor carrier edge to the main-board connector zone.")
    port_flex = _flex_with_ends("Z50II-08-010_port_flex_cable", ((47.0, 17.0, -18.5), (44.0, 21.0, -18.0), (38.0, 27.5, -15.0), (30.0, 28.0, -12.0), (18.0, 28.0, -10.0)), 2.2, collection, flex_mat, insulator)
    _annotate(port_flex, "Z50II-08-010", "从侧置接口板绕至后部连接器的四次转折排线。", "Port-board flex making four controlled bends to the rear connector bank.")

    screw_specs = (
        ("Z50II-08-011", "Z50II-08-011_upper_left_screw", (-48.0, 32.5, 34.5), (-90, 0, 0)),
        ("Z50II-08-012", "Z50II-08-012_upper_right_screw", (48.0, 32.5, 34.5), (-90, 0, 0)),
        ("Z50II-08-013", "Z50II-08-013_rear_left_screw", (-48.0, 35.0, -28.0), (-90, 0, 0)),
        ("Z50II-08-014", "Z50II-08-014_rear_right_screw", (48.0, 35.0, -28.0), (-90, 0, 0)),
        ("Z50II-08-015", "Z50II-08-015_bottom_left_screw", (-10.0, 14.0, -39.2), (180, 0, 0)),
        ("Z50II-08-016", "Z50II-08-016_bottom_right_screw", (12.0, 14.0, -39.2), (180, 0, 0)),
    )
    first_id, first_name, first_location, first_rotation = screw_specs[0]
    first_screw = fastener(first_name, first_location, first_rotation, collection, fastener_mat, head_mm=2.0, length_mm=5.2)
    first_screw["seatCenterMm"] = list(first_location)
    first_screw["removalAxis"] = list(PART_META[first_id][4])
    _annotate(first_screw, first_id, "具有圆柱头和十字槽的机壳紧固件；六枚螺钉共享同一网格数据。", "Shell fastener with cylindrical head and cross recess; all six screws share one mesh datablock.")
    screws = [first_screw]
    for part_id, name, location, rotation in screw_specs[1:]:
        screw = first_screw.copy()
        screw.data = first_screw.data
        screw.name = name
        screw.location = tuple(mm(value) for value in location)
        screw.rotation_euler = tuple(radians(value) for value in rotation)
        collection.objects.link(screw)
        screw["seatCenterMm"] = list(location)
        screw["removalAxis"] = list(PART_META[part_id][4])
        _annotate(screw, part_id, "与同组紧固件链接网格、但保留独立选择ID和装配座标的机壳螺钉。", "Shell screw linked to the shared fastener mesh while retaining its own selectable ID and seat coordinate.")
        screws.append(screw)

    for screw, (part_id, _name, location, rotation) in zip(screws, screw_specs):
        axis = PART_META[part_id][4]
        head_location = tuple(location[index] + axis[index] * 3.0 for index in range(3))
        head = cylinder(f"{screw.name}_head", 1.8, 0.9, head_location, rotation, collection, fastener_mat, vertices=32)
        _parent(head, screw)
        if axis[1] != 0:
            slot_sizes = ((2.5, 0.32, 0.42), (0.42, 0.32, 2.5))
        else:
            slot_sizes = ((2.5, 0.42, 0.32), (0.42, 2.5, 0.32))
        slot_location = tuple(head_location[index] + axis[index] * 0.48 for index in range(3))
        for slot_index, slot_size in enumerate(slot_sizes, start=1):
            _parent(rounded_box(f"{screw.name}_cross_slot_{slot_index}", slot_size, slot_location, 0.08, collection, insulator), screw)

    washer_locations = tuple(spec[2] for spec in screw_specs)
    washers = torus("Z50II-08-017_washer_set", 2.0, 0.35, washer_locations[0], (90, 0, 0), collection, fastener_mat)
    for index, (location, rotation) in enumerate(zip(washer_locations[1:], (spec[3] for spec in screw_specs[1:])), start=2):
        _parent(torus(f"Z50II_shell_washer_{index}", 2.0, 0.35, location, rotation, collection, fastener_mat), washers)
    washers["washerCount"] = 6
    _annotate(washers, "Z50II-08-017", "六枚与机壳螺钉座对应的独立环形垫圈组成一个选择组。", "Selectable set of six annular washers corresponding to the six shell-screw seats.")

    cable_clamp = rounded_box("Z50II-08-018_cable_clamp", (18.0, 0.65, 5.0), (20.0, 29.2, -14.0), 0.65, collection, fastener_mat)
    _parent(cylinder("Z50II_cable_clamp_left_bore", 1.1, 0.40, (13.5, 29.65, -14.0), (90, 0, 0), collection, insulator, vertices=24), cable_clamp)
    _parent(cylinder("Z50II_cable_clamp_right_bore", 1.1, 0.40, (26.5, 29.65, -14.0), (90, 0, 0), collection, insulator, vertices=24), cable_clamp)
    cable_clamp["clampedFlexIds"] = ["Z50II-08-007", "Z50II-08-008", "Z50II-08-009", "Z50II-08-010"]
    _annotate(cable_clamp, "Z50II-08-018", "跨越四条信号排线通道的金属压板，带两个实体紧固孔位。", "Metal clamp bridging the four signal-flex routes with two physical fastening locations.")

    return [usb, hdmi, microphone, remote, io_board, antenna, top_flex, rear_flex, sensor_flex, port_flex, *screws, washers, cable_clamp]


build = build_io_flex_fasteners
