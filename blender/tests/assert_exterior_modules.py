"""Assert the complete Task 5 exterior catalog and assembled body envelope."""

import bpy
from mathutils import Vector


EXPECTED_BY_MODULE = {
    "01_chassis_front": {
        "Z50II-01-001",
        "Z50II-01-002",
        "Z50II-01-003",
        "Z50II-01-004",
        "Z50II-01-005",
        "Z50II-01-006",
        "Z50II-01-007",
        "Z50II-01-008",
    },
    "02_outer_shell_controls": {
        "Z50II-02-001",
        "Z50II-02-002",
        "Z50II-02-003",
        "Z50II-02-004",
        "Z50II-02-005",
        "Z50II-02-006",
        "Z50II-02-007",
        "Z50II-02-008",
        "Z50II-02-009",
        "Z50II-02-010",
        "Z50II-02-011",
        "Z50II-02-012",
        "Z50II-02-013",
        "Z50II-02-014",
        "Z50II-02-015",
        "Z50II-02-016",
        "Z50II-02-017",
        "Z50II-02-018",
        "Z50II-02-019",
        "Z50II-02-020",
    },
}
EXPECTED = set().union(*EXPECTED_BY_MODULE.values())
REQUIRED_METADATA = {
    "partId",
    "moduleId",
    "parentId",
    "nameZh",
    "nameEn",
    "descriptionZh",
    "descriptionEn",
    "step",
    "explodeAxis",
    "explodeDistance",
    "dependsOn",
    "isReferenceGeometry",
}


parts = {obj.get("partId"): obj for obj in bpy.data.objects if obj.get("partId")}
actual = set(parts)
missing = EXPECTED - actual
unexpected = actual - EXPECTED
assert not missing, f"missing exterior part IDs: {sorted(missing)}"
assert not unexpected, f"unexpected part IDs before Task 6: {sorted(unexpected)}"

for module_id, expected_ids in EXPECTED_BY_MODULE.items():
    for part_id in expected_ids:
        obj = parts[part_id]
        absent_metadata = REQUIRED_METADATA - set(obj.keys())
        assert not absent_metadata, f"{part_id} missing metadata: {sorted(absent_metadata)}"
        assert obj["moduleId"] == module_id, (
            f"{part_id} expected module {module_id}, got {obj['moduleId']}"
        )
        assert obj["nameZh"].strip() and obj["nameEn"].strip(), f"{part_id} lacks bilingual name"
        assert obj["descriptionZh"].strip() and obj["descriptionEn"].strip(), (
            f"{part_id} lacks bilingual description"
        )
        assert all(dimension > 0.0 for dimension in obj.dimensions), (
            f"{part_id} has zero-sized geometry: {tuple(obj.dimensions)}"
        )
        axis = Vector(obj["explodeAxis"])
        assert abs(axis.length - 1.0) < 1e-6, f"{part_id} has non-unit explodeAxis"
        assert obj["explodeDistance"] > 0.0, f"{part_id} has no explode distance"
        unresolved = set(obj["dependsOn"]) - EXPECTED
        assert not unresolved, f"{part_id} has unresolved dependencies: {sorted(unresolved)}"
        out_of_order = {
            dependency
            for dependency in obj["dependsOn"]
            if parts[dependency]["step"] >= obj["step"]
        }
        assert not out_of_order, (
            f"{part_id} depends on parts not removed earlier: {sorted(out_of_order)}"
        )

assert {parts[part_id]["step"] for part_id in EXPECTED_BY_MODULE["01_chassis_front"]} == set(
    range(28, 36)
), "module 01 must occupy disassembly steps 28-35"
assert all(
    1 <= parts[part_id]["step"] <= 20
    for part_id in EXPECTED_BY_MODULE["02_outer_shell_controls"]
), "module 02 removal steps must be in the visible exterior range 1-20"

# Include every visible mesh in the two exterior collections, including grouped
# child geometry without a selectable part ID. The scene is saved assembled, so
# no exploded offsets need to be subtracted here.
corners = []
for collection_name in EXPECTED_BY_MODULE:
    collection = bpy.data.collections[collection_name]
    for obj in collection.all_objects:
        if obj.type == "MESH" and not obj.hide_render:
            corners.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)

assert corners, "no visible exterior geometry found"
minimum = Vector(tuple(min(point[index] for point in corners) for index in range(3)))
maximum = Vector(tuple(max(point[index] for point in corners) for index in range(3)))
envelope_mm = (maximum - minimum) * 1000.0
expected_mm = Vector((127.0, 66.5, 96.8))
for axis_name, actual_mm, target_mm in zip("XYZ", envelope_mm, expected_mm):
    assert abs(actual_mm - target_mm) <= 2.0, (
        f"{axis_name} envelope {actual_mm:.3f} mm outside {target_mm:.1f} +/- 2.0 mm"
    )

print(
    "Exterior assertion passed: "
    f"{len(parts)} parts, envelope "
    f"{envelope_mm.x:.3f} x {envelope_mm.z:.3f} x {envelope_mm.y:.3f} mm (W x H x D)"
)
