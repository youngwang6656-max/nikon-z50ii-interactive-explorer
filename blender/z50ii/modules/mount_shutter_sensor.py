"""Procedural module 03: Z mount, shutter curtains, and fixed DX sensor."""

from __future__ import annotations

from math import radians

import bpy

from z50ii.geometry import cylinder, panel, rounded_box, torus
from z50ii.materials import get_material
from z50ii.metadata import attach_part_metadata


MODULE_ID = "03_mount_shutter_sensor"

PART_META = {
    "Z50II-03-001": (None, "Z卡口环", "Z mount ring", 29, (0, -1, 0), 38, ("Z50II-02-001",)),
    "Z50II-03-002": ("Z50II-03-001", "卡口密封圈", "Mount gasket", 30, (0, -1, 0), 34, ("Z50II-03-001",)),
    "Z50II-03-003": ("Z50II-03-001", "卡口触点座", "Mount contact block", 30, (0, 0, 1), 32, ("Z50II-03-001",)),
    "Z50II-03-004": ("Z50II-03-003", "卡口触点针组", "Mount contact-pin bank", 31, (0, -1, 0), 30, ("Z50II-03-003",)),
    "Z50II-03-005": ("Z50II-03-001", "卡口间隔环", "Mount spacer", 31, (0, -1, 0), 30, ("Z50II-03-002",)),
    "Z50II-03-006": ("Z50II-03-008", "快门前帘", "Shutter front curtain", 32, (0, -1, 0), 28, ("Z50II-03-005",)),
    "Z50II-03-007": ("Z50II-03-008", "快门后帘", "Shutter rear curtain", 33, (0, -1, 0), 27, ("Z50II-03-006",)),
    "Z50II-03-008": ("Z50II-01-005", "快门框架", "Shutter frame", 34, (0, -1, 0), 26, ("Z50II-03-007",)),
    "Z50II-03-009": ("Z50II-01-005", "固定式DX传感器封装", "Fixed DX sensor package", 37, (0, -1, 0), 25, ("Z50II-03-010",)),
    "Z50II-03-010": ("Z50II-03-009", "传感器盖玻璃", "Sensor cover glass", 36, (0, -1, 0), 24, ("Z50II-03-012",)),
    "Z50II-03-011": ("Z50II-03-009", "传感器电路板", "Sensor PCB", 38, (0, -1, 0), 28, ("Z50II-03-009", "Z50II-08-009")),
    "Z50II-03-012": ("Z50II-03-009", "传感器防尘框", "Sensor dust shield", 35, (0, -1, 0), 24, ("Z50II-03-008",)),
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


def _rectangular_frame(name, width, height, depth, location_y, collection, material):
    root = rounded_box(name, (width, depth, 1.8), (0, location_y, height / 2), 0.35, collection, material)
    _parent(rounded_box(f"{name}_bottom", (width, depth, 1.8), (0, location_y, -height / 2), 0.35, collection, material), root)
    _parent(rounded_box(f"{name}_left", (1.8, depth, height - 1.8), (-width / 2, location_y, 0), 0.35, collection, material), root)
    _parent(rounded_box(f"{name}_right", (1.8, depth, height - 1.8), (width / 2, location_y, 0), 0.35, collection, material), root)
    return root


def _curtain(name, location_y, slant_deg, collection, material):
    # In the assembled inspection pose the vertical-travel curtains are parked
    # together in the upper cassette, leaving the DX aperture and its lower edge
    # unobstructed. Their separated Y planes remain visible in exploded mode.
    retracted_z = tuple(15.0 + 0.28 * index for index in range(7))
    root = rounded_box(name, (26.5, 0.14, 2.7), (0, location_y, retracted_z[0]), 0.05, collection, material)
    root.rotation_euler[1] = radians(slant_deg)
    for index, z in enumerate(retracted_z[1:], start=2):
        slat = rounded_box(f"{name}_lamella_{index:02d}", (26.5, 0.14, 2.7), (0, location_y, z), 0.05, collection, material)
        slat.rotation_euler[1] = radians(slant_deg)
        _parent(slat, root)
    return root


def build_mount_shutter_sensor() -> list[bpy.types.Object]:
    collection = bpy.data.collections[MODULE_ID]
    _clear(collection)

    steel = get_material("Z50II Mount Stainless", (0.42, 0.45, 0.48, 1), metallic=0.95, roughness=0.22)
    gasket_mat = get_material("Z50II Mount Gasket", (0.012, 0.014, 0.015, 1), metallic=0.0, roughness=0.86)
    gold = get_material("Z50II Electrical Contacts", (0.76, 0.43, 0.08, 1), metallic=0.92, roughness=0.20)
    dark = get_material("Z50II Shutter Frame", (0.025, 0.028, 0.030, 1), metallic=0.70, roughness=0.34)
    curtain_mat = get_material("Z50II Shutter Curtain", (0.018, 0.020, 0.022, 1), metallic=0.82, roughness=0.25)
    sensor_mat = get_material("Z50II DX Sensor", (0.045, 0.095, 0.105, 1), metallic=0.34, roughness=0.12)
    glass = get_material("Z50II Sensor Cover Glass", (0.055, 0.095, 0.105, 1), metallic=0.12, roughness=0.08)
    pcb = get_material("Z50II Sensor PCB", (0.035, 0.18, 0.10, 1), metallic=0.10, roughness=0.45)

    mount_ring = torus("Z50II-03-001_mount_ring", 28.25, 0.75, (0, -2.2, 0), (90, 0, 0), collection, steel)
    for index, angle in enumerate((55, 125, 235, 305), start=1):
        from math import cos, sin
        x = 32.0 * cos(radians(angle))
        z = 32.0 * sin(radians(angle))
        _parent(cylinder(f"Z50II_mount_fastening_land_{index}", 2.2, 0.9, (x, -1.4, z), (90, 0, 0), collection, steel, vertices=32), mount_ring)
    for index, (x, z, angle) in enumerate(((-17, 21, -34), (24, 6, 78), (-8, -25, 12)), start=1):
        tab = rounded_box(f"Z50II_mount_bayonet_tab_{index}", (8.0, 0.8, 2.2), (x, -3.15, z), 0.35, collection, steel)
        tab.rotation_euler[1] = radians(angle)
        _parent(tab, mount_ring)
    _annotate(mount_ring, "Z50II-03-001", "具有卡爪和四个紧固座的Z卡口金属环；内部尺寸为参考重建。", "Z-mount metal ring with bayonet tabs and four fastening lands; internal dimensions are a reference reconstruction.")

    gasket = torus("Z50II-03-002_mount_gasket", 28.10, 0.25, (0, 0.5, 0), (90, 0, 0), collection, gasket_mat)
    _annotate(gasket, "Z50II-03-002", "位于金属卡口后方的独立弹性防尘密封圈。", "Separate elastomer dust gasket immediately behind the metal mount.")

    contact_block = rounded_box("Z50II-03-003_contact_block", (14.0, 1.2, 3.2), (0.0, 0.8, -23.5), 1.0, collection, gasket_mat)
    _parent(rounded_box("Z50II_mount_contact_block_key", (2.0, 1.4, 1.5), (8.0, 0.8, -22.8), 0.5, collection, gasket_mat), contact_block)
    _annotate(contact_block, "Z50II-03-003", "弧形区域内的绝缘触点座，为后续镜头接口保留位置。", "Insulated mount contact carrier positioned for the reserved future lens interface.")

    pin_positions = (-6.0, -4.8, -3.6, -2.4, -1.2, 0.0, 1.2, 2.4, 3.6, 4.8, 6.0)
    pin_bank = cylinder("Z50II-03-004_contact_pin_bank", 0.48, 0.9, (pin_positions[0], -0.15, -23.5), (90, 0, 0), collection, gold, vertices=24)
    for index, x in enumerate(pin_positions[1:], start=2):
        _parent(cylinder(f"Z50II_mount_contact_pin_{index:02d}", 0.48, 0.9, (x, -0.15, -23.5), (90, 0, 0), collection, gold, vertices=24), pin_bank)
    _annotate(pin_bank, "Z50II-03-004", "11枚独立圆头导电针的教学化触点组。", "Teaching representation of an eleven-pin bank with separate rounded conductive contacts.")

    spacer = torus("Z50II-03-005_mount_spacer", 28.10, 0.30, (0, 2.4, 0), (90, 0, 0), collection, dark)
    for index, angle in enumerate((0, 90, 180, 270), start=1):
        from math import cos, sin
        _parent(cylinder(f"Z50II_mount_spacer_boss_{index}", 0.65, 1.0, (29.2 * cos(radians(angle)), 2.4, 29.2 * sin(radians(angle))), (90, 0, 0), collection, dark, vertices=24), spacer)
    _annotate(spacer, "Z50II-03-005", "保持卡口与快门组件间光路间隔的开放式支承环。", "Open support ring preserving the optical-path spacing between mount and shutter assembly.")

    front_curtain = _curtain("Z50II-03-006_shutter_front_curtain", 8.6, 0.8, collection, curtain_mat)
    _annotate(front_curtain, "Z50II-03-006", "由七片薄金属叶片表达的前帘，位于卡口与传感器之间。", "Front curtain represented by seven thin metal lamellae between mount and sensor.")
    rear_curtain = _curtain("Z50II-03-007_shutter_rear_curtain", 9.4, -0.8, collection, curtain_mat)
    _annotate(rear_curtain, "Z50II-03-007", "与前帘分层对齐的第二组薄金属叶片。", "Second aligned set of thin metal lamellae, physically separated behind the front curtain.")

    shutter_frame = _rectangular_frame("Z50II-03-008_shutter_frame", 35.0, 25.0, 1.1, 10.5, collection, dark)
    _parent(cylinder("Z50II_shutter_motor_housing", 3.2, 4.2, (19.0, 10.5, -6.0), (90, 0, 0), collection, dark, vertices=32), shutter_frame)
    _parent(rounded_box("Z50II_shutter_guide_left", (1.0, 1.8, 20.0), (-14.2, 10.5, 0), 0.25, collection, steel), shutter_frame)
    _parent(rounded_box("Z50II_shutter_guide_right", (1.0, 1.8, 20.0), (14.2, 10.5, 0), 0.25, collection, steel), shutter_frame)
    _annotate(shutter_frame, "Z50II-03-008", "包含导轨和驱动罩的开放式纵走焦平面快门框架。", "Open vertical-travel focal-plane shutter frame with guides and drive housing.")

    dust_shield = _rectangular_frame("Z50II-03-012_dust_shield", 27.2, 19.4, 0.65, 11.8, collection, gasket_mat)
    _annotate(dust_shield, "Z50II-03-012", "在快门与盖玻璃之间形成独立周边防尘边界的开放框。", "Open perimeter dust shield forming a separate boundary between shutter and cover glass.")

    cover_glass = rounded_box("Z50II-03-010_sensor_cover_glass", (24.5, 0.45, 16.7), (0, 12.7, 0), 0.22, collection, glass)
    _annotate(cover_glass, "Z50II-03-010", "与感光面分离的薄型光学盖玻璃参考件。", "Thin optical cover-glass reference element separated from the photosensitive plane.")

    sensor = rounded_box("Z50II-03-009_sensor_package", (23.5, 0.60, 15.7), (0, 13.6, 0), 0.16, collection, sensor_mat)
    sensor["activeAreaMm"] = [23.5, 15.7]
    sensor["sensorMount"] = "fixed"
    sensor["hasIBIS"] = False
    _parent(rounded_box("Z50II_sensor_package_edge_connector", (12.0, 0.8, 1.4), (0, 14.0, -9.0), 0.25, collection, gold), sensor)
    _annotate(sensor, "Z50II-03-009", "23.5×15.7毫米DX有效面尺寸锚点；本参考模型为固定式传感器，不含机身防抖机构。", "23.5 x 15.7 mm DX active-area anchor; this reference model uses a fixed sensor and contains no in-body stabilization mechanism.")

    sensor_pcb = panel(
        "Z50II-03-011_sensor_pcb",
        ((-15.5, -10.5), (13.5, -10.5), (15.5, -8.5), (15.5, 8.5), (13.5, 10.5), (-15.5, 10.5)),
        1.0,
        (0, 15.2, 0),
        (0, 0, 0),
        collection,
        pcb,
    )
    for index, x in enumerate((-11.0, -5.5, 0.0, 5.5, 11.0), start=1):
        _parent(rounded_box(f"Z50II_sensor_pcb_pad_{index}", (3.4, 0.15, 1.2), (x, 15.78, -8.7), 0.15, collection, gold), sensor_pcb)
    _parent(rounded_box("Z50II_sensor_pcb_controller", (8.0, 1.1, 4.2), (0, 16.25, 5.2), 0.45, collection, dark), sensor_pcb)
    _annotate(sensor_pcb, "Z50II-03-011", "具有边缘焊盘、控制封装和定位切角的传感器载板。", "Sensor carrier PCB with edge pads, controller package, and keyed profile.")

    return [
        mount_ring,
        gasket,
        contact_block,
        pin_bank,
        spacer,
        front_curtain,
        rear_curtain,
        shutter_frame,
        sensor,
        cover_glass,
        sensor_pcb,
        dust_shield,
    ]


build = build_mount_shutter_sensor
