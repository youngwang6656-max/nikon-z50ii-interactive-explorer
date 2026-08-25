"""Assert the Task 6 imaging, electronics, power, and storage modules."""

from math import isfinite

import bpy
from mathutils import Vector


EXPECTED_BY_MODULE = {
    "03_mount_shutter_sensor": {
        "Z50II-03-001": ("Z50II-03-001_mount_ring", 36, (0.0, -1.0, 0.0), 38.0, ("Z50II-02-001",)),
        "Z50II-03-002": ("Z50II-03-002_mount_gasket", 37, (0.0, -1.0, 0.0), 34.0, ("Z50II-03-001",)),
        "Z50II-03-003": ("Z50II-03-003_contact_block", 38, (0.0, -1.0, 0.0), 32.0, ("Z50II-03-001",)),
        "Z50II-03-004": ("Z50II-03-004_contact_pin_bank", 39, (0.0, -1.0, 0.0), 30.0, ("Z50II-03-003",)),
        "Z50II-03-005": ("Z50II-03-005_mount_spacer", 40, (0.0, -1.0, 0.0), 30.0, ("Z50II-03-002",)),
        "Z50II-03-006": ("Z50II-03-006_shutter_front_curtain", 41, (0.0, -1.0, 0.0), 28.0, ("Z50II-03-005",)),
        "Z50II-03-007": ("Z50II-03-007_shutter_rear_curtain", 42, (0.0, -1.0, 0.0), 27.0, ("Z50II-03-006",)),
        "Z50II-03-008": ("Z50II-03-008_shutter_frame", 43, (0.0, -1.0, 0.0), 26.0, ("Z50II-03-007",)),
        "Z50II-03-009": ("Z50II-03-009_sensor_package", 46, (0.0, 1.0, 0.0), 25.0, ("Z50II-03-010",)),
        "Z50II-03-010": ("Z50II-03-010_sensor_cover_glass", 45, (0.0, -1.0, 0.0), 24.0, ("Z50II-03-012",)),
        "Z50II-03-011": ("Z50II-03-011_sensor_pcb", 47, (0.0, 1.0, 0.0), 28.0, ("Z50II-03-009",)),
        "Z50II-03-012": ("Z50II-03-012_dust_shield", 44, (0.0, -1.0, 0.0), 24.0, ("Z50II-03-008",)),
    },
    "04_mainboard_thermal": {
        "Z50II-04-001": ("Z50II-04-001_main_pcb", 59, (0.0, 1.0, 0.0), 38.0, ("Z50II-04-006", "Z50II-04-007", "Z50II-04-008", "Z50II-04-009", "Z50II-04-012")),
        "Z50II-04-002": ("Z50II-04-002_processor_package", 54, (0.0, -1.0, 0.0), 24.0, ("Z50II-04-006", "Z50II-04-008")),
        "Z50II-04-003": ("Z50II-04-003_memory_package_a", 55, (0.0, -1.0, 0.0), 22.0, ("Z50II-04-006",)),
        "Z50II-04-004": ("Z50II-04-004_memory_package_b", 56, (0.0, -1.0, 0.0), 22.0, ("Z50II-04-006",)),
        "Z50II-04-005": ("Z50II-04-005_power_management_cluster", 57, (1.0, 0.0, 0.0), 24.0, ("Z50II-04-006",)),
        "Z50II-04-006": ("Z50II-04-006_front_emi_shield", 48, (0.0, -1.0, 0.0), 32.0, ("Z50II-02-001",)),
        "Z50II-04-007": ("Z50II-04-007_rear_emi_shield", 49, (0.0, 1.0, 0.0), 34.0, ("Z50II-02-003",)),
        "Z50II-04-008": ("Z50II-04-008_thermal_pad", 51, (0.0, -1.0, 0.0), 20.0, ("Z50II-04-009",)),
        "Z50II-04-009": ("Z50II-04-009_heat_spreader", 50, (0.0, -1.0, 0.0), 26.0, ("Z50II-04-006",)),
        "Z50II-04-010": ("Z50II-04-010_secondary_control_pcb", 58, (0.0, 1.0, 0.0), 28.0, ("Z50II-04-007", "Z50II-04-011")),
        "Z50II-04-011": ("Z50II-04-011_rf_shield_can", 52, (0.0, 1.0, 0.0), 22.0, ("Z50II-04-007",)),
        "Z50II-04-012": ("Z50II-04-012_flex_connector_bank", 53, (0.0, 1.0, 0.0), 20.0, ("Z50II-04-007",)),
    },
    "05_power_storage": {
        "Z50II-05-001": ("Z50II-05-001_en_el25a_battery_shell", 60, (0.0, 0.0, -1.0), 52.0, ("Z50II-02-007",)),
        "Z50II-05-002": ("Z50II-05-002_battery_cradle", 64, (0.0, 0.0, -1.0), 44.0, ("Z50II-02-004", "Z50II-05-001", "Z50II-05-003", "Z50II-05-007")),
        "Z50II-05-003": ("Z50II-05-003_battery_contacts", 63, (0.0, 0.0, -1.0), 28.0, ("Z50II-02-004", "Z50II-05-001")),
        "Z50II-05-004": ("Z50II-05-004_power_board", 67, (0.0, 1.0, 0.0), 30.0, ("Z50II-02-004", "Z50II-05-002", "Z50II-05-005", "Z50II-05-008")),
        "Z50II-05-005": ("Z50II-05-005_uhs_ii_sd_slot", 65, (0.0, 0.0, -1.0), 34.0, ("Z50II-01-006", "Z50II-02-004", "Z50II-05-006", "Z50II-05-007")),
        "Z50II-05-006": ("Z50II-05-006_sd_card", 61, (0.0, 0.0, -1.0), 46.0, ("Z50II-02-007",)),
        "Z50II-05-007": ("Z50II-05-007_bottom_door_latch", 62, (1.0, 0.0, 0.0), 18.0, ("Z50II-02-004", "Z50II-02-007")),
        "Z50II-05-008": ("Z50II-05-008_power_flex_cable", 66, (0.0, 1.0, 0.0), 26.0, ("Z50II-02-004", "Z50II-05-002", "Z50II-05-005")),
    },
}


all_part_objects = [obj for obj in bpy.data.objects if obj.get("partId")]
all_part_ids = [obj["partId"] for obj in all_part_objects]
assert len(all_part_ids) == len(set(all_part_ids)), "duplicate global partId values found"
task_6_catalog = [
    obj
    for obj in all_part_objects
    if obj.get("moduleId") in {
        "01_chassis_front",
        "02_outer_shell_controls",
        *EXPECTED_BY_MODULE,
    }
]
assert len(task_6_catalog) == 60, (
    f"expected 60 parts across modules 01-05, got {len(task_6_catalog)}"
)

parts = {obj["partId"]: obj for obj in all_part_objects}
expected_internal_ids = set().union(*(set(entries) for entries in EXPECTED_BY_MODULE.values()))
actual_internal_ids = {
    obj["partId"] for obj in all_part_objects if obj.get("moduleId") in EXPECTED_BY_MODULE
}
assert actual_internal_ids == expected_internal_ids, (
    f"internal ID mismatch: missing={sorted(expected_internal_ids - actual_internal_ids)}, "
    f"unexpected={sorted(actual_internal_ids - expected_internal_ids)}"
)

for module_id, entries in EXPECTED_BY_MODULE.items():
    module_parts = [obj for obj in all_part_objects if obj.get("moduleId") == module_id]
    assert len(module_parts) == len(entries), (module_id, len(module_parts), len(entries))
    for part_id, (object_name, step, axis, distance_mm, dependencies) in entries.items():
        obj = parts[part_id]
        assert obj.name == object_name, f"{part_id} has unstable object name {obj.name}"
        assert obj["moduleId"] == module_id
        assert obj["nameZh"].strip() and obj["nameEn"].strip(), f"{part_id} lacks bilingual name"
        assert obj["descriptionZh"].strip() and obj["descriptionEn"].strip(), (
            f"{part_id} lacks bilingual description"
        )
        assert obj["isReferenceGeometry"] is True
        assert obj["step"] == step, f"{part_id} has step {obj['step']}, expected {step}"
        assert tuple(obj["explodeAxis"]) == axis, f"{part_id} has wrong explode axis"
        assert abs(obj["explodeDistance"] * 1000.0 - distance_mm) < 1.0e-6
        assert tuple(obj["dependsOn"]) == dependencies, f"{part_id} has wrong dependencies"
        assert all(value > 0.0 for value in obj.dimensions), f"{part_id} has empty geometry"
        assert abs(Vector(obj["explodeAxis"]).length - 1.0) < 1.0e-9
        for dependency in obj["dependsOn"]:
            assert dependency in parts, f"{part_id} has unresolved dependency {dependency}"
            assert parts[dependency]["step"] < obj["step"], (
                f"{part_id} requires {dependency} before its cover/removal order permits"
            )

# Mount, curtains, dust protection, glass, and fixed sensor form a separated
# front-to-rear teaching stack in +Y. The curtains must both lie between the
# mount and active sensor plane, with the front curtain first.
mount = parts["Z50II-03-001"]
front_curtain = parts["Z50II-03-006"]
rear_curtain = parts["Z50II-03-007"]
dust_shield = parts["Z50II-03-012"]
cover_glass = parts["Z50II-03-010"]
sensor = parts["Z50II-03-009"]
assert mount.location.y < front_curtain.location.y < rear_curtain.location.y < sensor.location.y
assert rear_curtain.location.y < dust_shield.location.y < cover_glass.location.y < sensor.location.y
assert front_curtain.dimensions.y <= 0.00035 and rear_curtain.dimensions.y <= 0.00035
assert abs(sensor.dimensions.x - 0.0235) < 0.0005
assert abs(sensor.dimensions.z - 0.0157) < 0.0005
assert tuple(sensor["activeAreaMm"]) == (23.5, 15.7)
assert sensor["sensorMount"] == "fixed" and sensor["hasIBIS"] is False
scene_text = " ".join(
    str(value).upper()
    for obj in bpy.data.objects
    for value in (obj.name, obj.get("nameZh", ""), obj.get("nameEn", ""))
)
assert "IBIS" not in scene_text

# The main board is a realistic thin profile; its exterior shields and thermal
# stack are physically separate and must be detached earlier in the dependency graph.
main_pcb = parts["Z50II-04-001"]
assert 0.0008 <= main_pcb.dimensions.y <= 0.0012
for component_id in ("Z50II-04-002", "Z50II-04-003", "Z50II-04-004", "Z50II-04-005"):
    assert parts[component_id].dimensions.y >= 0.0010, f"{component_id} lacks readable package height"
for covering_id in ("Z50II-04-006", "Z50II-04-007", "Z50II-04-008", "Z50II-04-009", "Z50II-04-012"):
    assert covering_id in main_pcb["dependsOn"]
    assert parts[covering_id]["step"] < main_pcb["step"]
assert parts["Z50II-04-009"]["step"] < parts["Z50II-04-008"]["step"] < main_pcb["step"]

# User-removable products are explicitly labelled without claiming hidden Nikon dimensions.
battery = parts["Z50II-05-001"]
sd_card = parts["Z50II-05-006"]
assert "EN-EL25a" in battery["nameEn"] and "removable" in battery["descriptionEn"].lower()
assert "可拆卸" in battery["descriptionZh"]
assert "illustrative" in sd_card["descriptionEn"].lower() and "removable" in sd_card["descriptionEn"].lower()
assert "示意" in sd_card["descriptionZh"] and "可拆卸" in sd_card["descriptionZh"]

# Every detail mesh in a Task 6 collection must be attached below that module's
# selectable root, and every export node must retain a finite positive transform.
exportable_types = {"MESH", "CURVE", "SURFACE", "META", "FONT", "ARMATURE", "EMPTY"}
for module_id in EXPECTED_BY_MODULE:
    collection = bpy.data.collections[module_id]
    roots = {obj for obj in collection.all_objects if obj.get("partId")}
    for obj in collection.all_objects:
        determinant = obj.matrix_world.determinant()
        assert isfinite(determinant) and determinant > 1.0e-9, (
            f"{obj.name} has invalid export determinant {determinant}"
        )
        if obj.type not in exportable_types or obj in roots:
            continue
        ancestor = obj.parent
        while ancestor is not None and ancestor not in roots:
            ancestor = ancestor.parent
        assert ancestor in roots, f"{obj.name} is not attached to a selectable {module_id} root"

print("Internal assertion passed: 12 imaging + 12 mainboard + 8 power/storage = 32; catalog=60")
