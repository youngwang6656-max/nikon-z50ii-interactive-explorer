"""Assert the complete eight-module, 100-part Z50II catalog."""

from pathlib import Path
import sys

import bpy
from itertools import combinations
from math import ceil, radians
from math import isfinite
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


BLENDER_ROOT = Path(__file__).resolve().parents[1]
if str(BLENDER_ROOT) not in sys.path:
    sys.path.insert(0, str(BLENDER_ROOT))
TESTS_ROOT = Path(__file__).resolve().parent
if str(TESTS_ROOT) not in sys.path:
    sys.path.insert(0, str(TESTS_ROOT))

from root_contact_contract import TASK7_ROOT_CONTACTS


EXPECTED_COUNTS = {
    "01_chassis_front": 8,
    "02_outer_shell_controls": 20,
    "03_mount_shutter_sensor": 12,
    "04_mainboard_thermal": 12,
    "05_power_storage": 8,
    "06_evf_top_flash": 10,
    "07_rear_lcd_controls": 12,
    "08_io_flex_fasteners": 18,
}

EXPECTED_CONTROL_PARTS = {
    "06_evf_top_flash": {
        "Z50II-06-001": ("Z50II-06-001_evf_housing", "电子取景器内壳", "EVF housing", 17, (0.0, 1.0, 0.0), 32.0, ("Z50II-02-003", "Z50II-06-003", "Z50II-06-004")),
        "Z50II-06-002": ("Z50II-06-002_evf_display", "电子取景器显示屏", "EVF display", 18, (0.0, -1.0, 0.0), 25.0, ("Z50II-06-001",)),
        "Z50II-06-003": ("Z50II-06-003_evf_eyepiece_lens", "电子取景器目镜", "EVF eyepiece lens", 5, (0.0, 1.0, 0.0), 18.0, ()),
        "Z50II-06-004": ("Z50II-06-004_diopter_wheel", "屈光度调节轮", "Diopter wheel", 5, (1.0, 0.0, 0.0), 16.0, ()),
        "Z50II-06-005": ("Z50II-06-005_hot_shoe_rails", "热靴导轨", "Hot-shoe rails", 4, (0.0, 0.0, 1.0), 18.0, ()),
        "Z50II-06-006": ("Z50II-06-006_hot_shoe_contact_plate", "热靴触点板", "Hot-shoe contact plate", 5, (0.0, 0.0, 1.0), 16.0, ("Z50II-06-005",)),
        "Z50II-06-007": ("Z50II-06-007_flash_outer_head", "内置闪光灯灯头外壳", "Flash outer head", 5, (0.0, 0.0, 1.0), 32.0, ("Z50II-06-008",)),
        "Z50II-06-008": ("Z50II-06-008_flash_reflector", "闪光灯反光杯", "Flash reflector", 4, (0.0, -1.0, 0.0), 18.0, ()),
        "Z50II-06-009": ("Z50II-06-009_flash_hinge", "闪光灯铰链", "Flash hinge", 6, (0.0, 0.0, 1.0), 24.0, ("Z50II-06-007",)),
        "Z50II-06-010": ("Z50II-06-010_top_control_pcb", "顶部控制电路板", "Top-control PCB", 22, (0.0, 0.0, 1.0), 26.0, ("Z50II-02-003", "Z50II-08-007")),
    },
    "07_rear_lcd_controls": {
        "Z50II-07-001": ("Z50II-07-001_rear_shell", "后壳", "Rear shell", 11, (0.0, 1.0, 0.0), 45.0, ("Z50II-07-005", "Z50II-07-006", "Z50II-07-008", "Z50II-07-009", "Z50II-07-010", "Z50II-07-011", "Z50II-07-012", "Z50II-08-013", "Z50II-08-014", "Z50II-08-017")),
        "Z50II-07-002": ("Z50II-07-002_lcd_frame", "液晶屏框架", "LCD frame", 8, (0.0, 1.0, 0.0), 28.0, ("Z50II-07-003",)),
        "Z50II-07-003": ("Z50II-07-003_lcd_panel", "液晶显示面板", "LCD panel", 7, (0.0, 1.0, 0.0), 24.0, ("Z50II-07-004",)),
        "Z50II-07-004": ("Z50II-07-004_lcd_cover_glass", "液晶屏盖玻璃", "LCD cover glass", 6, (0.0, 1.0, 0.0), 20.0, ()),
        "Z50II-07-005": ("Z50II-07-005_inner_hinge_arm", "液晶屏内侧铰臂", "Inner LCD hinge arm", 10, (-1.0, 0.0, 0.0), 24.0, ("Z50II-07-007",)),
        "Z50II-07-006": ("Z50II-07-006_outer_hinge_arm", "液晶屏外侧铰臂", "Outer LCD hinge arm", 10, (0.0, 1.0, 0.0), 28.0, ("Z50II-07-007",)),
        "Z50II-07-007": ("Z50II-07-007_hinge_pivot", "液晶屏铰链转轴", "LCD hinge pivot", 9, (0.0, 0.0, 1.0), 60.0, ("Z50II-07-002", "Z50II-08-012", "Z50II-08-014", "Z50II-08-017")),
        "Z50II-07-008": ("Z50II-07-008_menu_button", "菜单按钮", "MENU button", 3, (0.0, 1.0, 0.0), 16.0, ()),
        "Z50II-07-009": ("Z50II-07-009_playback_button", "播放按钮", "Playback button", 3, (0.0, 1.0, 0.0), 16.0, ()),
        "Z50II-07-010": ("Z50II-07-010_delete_button", "删除按钮", "Delete button", 3, (0.0, 1.0, 0.0), 16.0, ()),
        "Z50II-07-011": ("Z50II-07-011_direction_pad", "方向键", "Direction pad", 3, (0.0, 1.0, 0.0), 18.0, ()),
        "Z50II-07-012": ("Z50II-07-012_ok_button", "OK确认按钮", "OK button", 3, (0.0, 1.0, 0.0), 16.0, ()),
    },
    "08_io_flex_fasteners": {
        "Z50II-08-001": ("Z50II-08-001_usb_c_port", "USB Type-C接口", "USB Type-C port", 21, (1.0, 0.0, 0.0), 22.0, ("Z50II-02-005", "Z50II-02-008", "Z50II-08-010")),
        "Z50II-08-002": ("Z50II-08-002_micro_hdmi_port", "Type-D HDMI接口", "Type-D HDMI port", 21, (1.0, 0.0, 0.0), 22.0, ("Z50II-02-005", "Z50II-02-008", "Z50II-08-010")),
        "Z50II-08-003": ("Z50II-08-003_microphone_jack", "3.5毫米麦克风接口", "3.5 mm microphone jack", 21, (1.0, 0.0, 0.0), 22.0, ("Z50II-02-005", "Z50II-02-009", "Z50II-08-010")),
        "Z50II-08-004": ("Z50II-08-004_output_remote_jack", "3.5毫米输出／遥控接口", "3.5 mm output/remote jack", 21, (1.0, 0.0, 0.0), 22.0, ("Z50II-02-005", "Z50II-02-009", "Z50II-08-010")),
        "Z50II-08-005": ("Z50II-08-005_io_daughterboard", "接口子板", "I/O daughterboard", 22, (1.0, 0.0, 0.0), 30.0, ("Z50II-08-001", "Z50II-08-002", "Z50II-08-003", "Z50II-08-004", "Z50II-08-010")),
        "Z50II-08-006": ("Z50II-08-006_wifi_bluetooth_antenna", "Wi-Fi／Bluetooth天线", "Wi-Fi/Bluetooth antenna", 20, (0.0, 1.0, 0.0), 22.0, ("Z50II-07-001", "Z50II-08-008")),
        "Z50II-08-007": ("Z50II-08-007_top_flex_cable", "顶部控制排线", "Top-control flex cable", 19, (0.0, 1.0, 0.0), 24.0, ("Z50II-02-001", "Z50II-02-003", "Z50II-08-018")),
        "Z50II-08-008": ("Z50II-08-008_rear_flex_cable", "后部控制排线", "Rear-control flex cable", 19, (0.0, 1.0, 0.0), 24.0, ("Z50II-07-001", "Z50II-08-018")),
        "Z50II-08-009": ("Z50II-08-009_sensor_flex_cable", "传感器排线", "Sensor flex cable", 19, (0.0, 1.0, 0.0), 26.0, ("Z50II-02-001", "Z50II-07-001", "Z50II-08-018")),
        "Z50II-08-010": ("Z50II-08-010_port_flex_cable", "接口板排线", "Port flex cable", 19, (1.0, 0.0, 0.0), 24.0, ("Z50II-02-001", "Z50II-02-005", "Z50II-08-018")),
        "Z50II-08-011": ("Z50II-08-011_upper_left_screw", "左上机壳螺钉", "Upper-left shell screw", 1, (0.0, 1.0, 0.0), 18.0, ()),
        "Z50II-08-012": ("Z50II-08-012_upper_right_screw", "右上机壳螺钉", "Upper-right shell screw", 1, (0.0, 1.0, 0.0), 18.0, ()),
        "Z50II-08-013": ("Z50II-08-013_rear_left_screw", "左后机壳螺钉", "Rear-left shell screw", 1, (0.0, 1.0, 0.0), 20.0, ()),
        "Z50II-08-014": ("Z50II-08-014_rear_right_screw", "右后机壳螺钉", "Rear-right shell screw", 1, (0.0, 1.0, 0.0), 20.0, ()),
        "Z50II-08-015": ("Z50II-08-015_bottom_left_screw", "左下机壳螺钉", "Bottom-left shell screw", 1, (0.0, 0.0, -1.0), 18.0, ()),
        "Z50II-08-016": ("Z50II-08-016_bottom_right_screw", "右下机壳螺钉", "Bottom-right shell screw", 1, (0.0, 0.0, -1.0), 18.0, ()),
        "Z50II-08-017": ("Z50II-08-017_washer_set", "机壳垫圈组", "Shell washer set", 2, (0.0, 1.0, 0.0), 16.0, ("Z50II-08-011", "Z50II-08-012", "Z50II-08-013", "Z50II-08-014", "Z50II-08-015", "Z50II-08-016")),
        "Z50II-08-018": ("Z50II-08-018_cable_clamp", "排线压板", "Cable clamp", 18, (-1.0, 0.0, 0.0), 18.0, ("Z50II-02-005", "Z50II-07-001")),
    },
}


for module_id, expected_count in EXPECTED_COUNTS.items():
    objects = [obj for obj in bpy.data.objects if obj.get("moduleId") == module_id]
    assert len(objects) == expected_count, (module_id, len(objects), expected_count)

part_ids = [obj["partId"] for obj in bpy.data.objects if obj.get("partId")]
assert len(part_ids) == len(set(part_ids)) == 100

parts = {obj["partId"]: obj for obj in bpy.data.objects if obj.get("partId")}
for part_id, obj in parts.items():
    parent_id = obj.get("parentId")
    assert parent_id != "", part_id
    assert parent_id is None or parent_id in parts, (part_id, parent_id)
expected_control_ids = set().union(*(set(entries) for entries in EXPECTED_CONTROL_PARTS.values()))
actual_control_ids = {
    part_id for part_id in parts if part_id.startswith(("Z50II-06-", "Z50II-07-", "Z50II-08-"))
}
assert actual_control_ids == expected_control_ids

for module_id, records in EXPECTED_CONTROL_PARTS.items():
    for part_id, (object_name, name_zh, name_en, step, axis, distance_mm, dependencies) in records.items():
        obj = parts[part_id]
        assert obj.name == object_name
        assert obj["moduleId"] == module_id
        assert obj["nameZh"] == name_zh and obj["nameEn"] == name_en
        assert obj["descriptionZh"].strip() and obj["descriptionEn"].strip()
        assert obj["step"] == step
        assert tuple(obj["explodeAxis"]) == axis
        assert abs(obj["explodeDistance"] * 1000.0 - distance_mm) < 1.0e-6
        assert tuple(obj["dependsOn"]) == dependencies
        assert obj["isReferenceGeometry"] is True
        assert all(dimension > 0.0 for dimension in obj.dimensions)

assert {obj["step"] for obj in parts.values()} == set(range(1, 41))
for part_id, obj in parts.items():
    axis = Vector(obj["explodeAxis"])
    # mathutils.Vector stores values at Blender's single-precision boundary;
    # normalized diagonal axes therefore round by about 3e-8.
    assert abs(axis.length - 1.0) < 1.0e-6
    assert obj["explodeDistance"] > 0.0
    determinant = obj.matrix_world.determinant()
    assert isfinite(determinant) and determinant > 1.0e-9, (part_id, determinant)
    for dependency in obj["dependsOn"]:
        assert dependency in parts, (part_id, dependency)
        assert parts[dependency]["step"] < obj["step"], (
            part_id,
            obj["step"],
            dependency,
            parts[dependency]["step"],
        )

# Layered optical and display stacks must remain ordered toward the viewer.
evf_display = parts["Z50II-06-002"]
evf_lens = parts["Z50II-06-003"]
evf_baffles = [bpy.data.objects[f"Z50II_evf_baffle_{index}"] for index in range(1, 4)]
assert evf_display.location.y < min(obj.location.y for obj in evf_baffles)
assert max(obj.location.y for obj in evf_baffles) < evf_lens.location.y
assert evf_display["layerIndex"] < evf_lens["layerIndex"]

lcd_frame = parts["Z50II-07-002"]
lcd_panel = parts["Z50II-07-003"]
lcd_glass = parts["Z50II-07-004"]
assert lcd_frame.location.y < lcd_panel.location.y < lcd_glass.location.y
assert lcd_panel["layerIndex"] < lcd_glass["layerIndex"]
assert lcd_frame["closedPosition"] is True

# Both physical arms and the pivot share one usable animation origin. The
# negative X-axis rotation lifts the flash head clear of its closed cavity.
lcd_hinge_parts = [parts[part_id] for part_id in ("Z50II-07-005", "Z50II-07-006", "Z50II-07-007")]
lcd_origins = [Vector(obj["pivotOriginMm"]) for obj in lcd_hinge_parts]
assert max((origin - lcd_origins[0]).length for origin in lcd_origins[1:]) < 1.0e-9
assert all(tuple(obj["pivotAxis"]) == (0.0, 0.0, 1.0) for obj in lcd_hinge_parts)
assert all((obj.matrix_world.translation * 1000.0 - lcd_origins[0]).length < 1.0e-5 for obj in lcd_hinge_parts)
assert parts["Z50II-07-007"]["openAngleDeg"] == -105.0

lcd_pivot_node = bpy.data.objects.get("Z50II_LCD_SCREEN_PIVOT")
assert lcd_pivot_node is not None and lcd_pivot_node.type == "EMPTY"
assert lcd_pivot_node.get("partId") is None
assert lcd_pivot_node.get("motionGroupId") == "rear-lcd-screen"
moving_lcd_ids = {
    "Z50II-07-002",
    "Z50II-07-003",
    "Z50II-07-004",
    "Z50II-07-006",
}
for part_id in moving_lcd_ids:
    moving = parts[part_id]
    assert moving.parent == lcd_pivot_node, part_id
    assert moving["pivotObject"] == lcd_pivot_node.name
    assert moving["motionGroupId"] == "rear-lcd-screen"
    assert moving["kinematicRole"] == "moving"
assert parts["Z50II-07-005"].parent != lcd_pivot_node
assert parts["Z50II-07-005"]["kinematicRole"] == "stationary"
assert parts["Z50II-07-007"]["kinematicRole"] == "axis"

flash_head = parts["Z50II-06-007"]
flash_hinge = parts["Z50II-06-009"]
assert Vector(flash_head["pivotOriginMm"]) == Vector(flash_hinge["pivotOriginMm"])
assert tuple(flash_head["pivotAxis"]) == tuple(flash_hinge["pivotAxis"]) == (1.0, 0.0, 0.0)
assert (flash_head.matrix_world.translation * 1000.0 - Vector(flash_head["pivotOriginMm"])).length < 1.0e-5
assert (flash_hinge.matrix_world.translation * 1000.0 - Vector(flash_hinge["pivotOriginMm"])).length < 1.0e-5
assert flash_head["openAngleDeg"] == -72.0
assert tuple(flash_head["explodeAxis"]) == (0.0, 0.0, 1.0)

# Connector geometry is aligned to the two real port-door openings and each
# published connector form remains mechanically distinct.
connector_ids = ("Z50II-08-001", "Z50II-08-002", "Z50II-08-003", "Z50II-08-004")
connector_types = {parts[part_id]["connectorType"] for part_id in connector_ids}
assert len(connector_types) == 4
for part_id in connector_ids:
    center = Vector(parts[part_id]["openingCenterMm"])
    assert abs(center.x - 55.2) <= 0.1 and 10.0 <= center.y <= 22.0
for part_id in ("Z50II-08-001", "Z50II-08-002"):
    assert 3.0 <= parts[part_id]["openingCenterMm"][2] <= 17.0
for part_id in ("Z50II-08-003", "Z50II-08-004"):
    assert -18.0 <= parts[part_id]["openingCenterMm"][2] <= -3.0
assert parts["Z50II-08-001"].dimensions != parts["Z50II-08-002"].dimensions
assert parts["Z50II-08-003"]["openingDiameterMm"] == 3.5
assert parts["Z50II-08-004"]["openingDiameterMm"] == 3.5

# Flex routes expose their physical bend points and end connectors so routing
# remains inspectable rather than being represented by straight placeholder bars.
for part_id in ("Z50II-08-007", "Z50II-08-008", "Z50II-08-009", "Z50II-08-010"):
    flex = parts[part_id]
    points = [Vector(point) for point in flex["routePointsMm"]]
    assert flex["routePointCount"] == len(points) >= 5
    assert flex["hasEndConnectors"] is True
    direction_changes = sum(
        (points[index] - points[index - 1]).normalized().dot(
            (points[index + 1] - points[index]).normalized()
        )
        < 0.999
        for index in range(1, len(points) - 1)
    )
    assert direction_changes >= 2, f"{part_id} lacks routed bends"
    assert all(-55.0 <= point.x <= 55.0 and 8.0 <= point.y <= 34.0 and -30.0 <= point.z <= 38.0 for point in points)

# Six separately selectable screws share one mesh while retaining distinct
# seats and removal directions aligned to their local shaft axes.
screws = [parts[f"Z50II-08-{index:03d}"] for index in range(11, 17)]
assert len({id(screw.data) for screw in screws}) == 1
assert len({screw.name for screw in screws}) == len({screw["partId"] for screw in screws}) == 6
for screw in screws:
    seat = Vector(screw["seatCenterMm"])
    assert (screw.matrix_world.translation * 1000.0 - seat).length < 1.0e-5
    axis = Vector(screw["removalAxis"])
    shaft_axis = (screw.matrix_world.to_3x3() @ Vector((0.0, 0.0, 1.0))).normalized()
    assert shaft_axis.dot(axis) > 0.999, (screw["partId"], tuple(shaft_axis), tuple(axis))
assert parts["Z50II-08-017"]["washerCount"] == 6

# All export nodes, not just selectable roots, retain proper positive transforms.
for module_id in EXPECTED_CONTROL_PARTS:
    for obj in bpy.data.collections[module_id].all_objects:
        determinant = obj.matrix_world.determinant()
        assert isfinite(determinant) and determinant > 1.0e-9, (obj.name, determinant)


def selectable_root(obj):
    current = obj
    while current is not None:
        if current.get("partId"):
            return current
        current = current.parent
    return None


def root_meshes(root):
    return [obj for obj in bpy.data.objects if obj.type == "MESH" and selectable_root(obj) == root]


depsgraph = bpy.context.evaluated_depsgraph_get()
_root_geometry_cache = {}


def root_geometry(root):
    if root.name in _root_geometry_cache:
        return _root_geometry_cache[root.name]
    vertices = []
    polygons = []
    for obj in root_meshes(root):
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            offset = len(vertices)
            vertices.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
            polygons.extend(tuple(offset + index for index in polygon.vertices) for polygon in mesh.polygons)
        finally:
            evaluated.to_mesh_clear()
    minimum = Vector(tuple(min(point[axis] for point in vertices) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in vertices) for axis in range(3)))
    value = vertices, polygons, minimum, maximum
    _root_geometry_cache[root.name] = value
    return value


def transformed_root_bvh(root, transform=Matrix.Identity(4), offset=Vector((0.0, 0.0, 0.0))):
    vertices, polygons, _minimum, _maximum = root_geometry(root)
    transformed = [transform @ vertex + offset for vertex in vertices]
    return BVHTree.FromPolygons(transformed, polygons, all_triangles=False, epsilon=0.0)


def transformed_object_bvh(obj, transform=Matrix.Identity(4)):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        vertices = [transform @ (evaluated.matrix_world @ vertex.co) for vertex in mesh.vertices]
        polygons = [tuple(polygon.vertices) for polygon in mesh.polygons]
        return BVHTree.FromPolygons(vertices, polygons, all_triangles=False, epsilon=0.0)
    finally:
        evaluated.to_mesh_clear()


def roots_overlap(first, second):
    _first_vertices, _first_polygons, first_min, first_max = root_geometry(first)
    _second_vertices, _second_polygons, second_min, second_max = root_geometry(second)
    if any(first_max[axis] < second_min[axis] or first_min[axis] > second_max[axis] for axis in range(3)):
        return False
    return bool(transformed_root_bvh(first).overlap(transformed_root_bvh(second)))


def point_to_root_bounds_distance_mm(root, point_mm):
    _vertices, _polygons, minimum, maximum = root_geometry(root)
    point = Vector(point_mm) / 1000.0
    nearest = Vector(
        tuple(max(minimum[axis], min(maximum[axis], point[axis])) for axis in range(3))
    )
    return (nearest - point).length * 1000.0


# The final handedness reflection places the +X-removing side cover beside the
# +X screw seats.  Dependency IDs must follow evaluated world geometry, not the
# pre-reflection modelling side.
cover_fasteners = {
    "Z50II-02-005": ("Z50II-08-012", "Z50II-08-014"),
    "Z50II-02-006": ("Z50II-08-011", "Z50II-08-013"),
}
for cover_id, expected_screws in cover_fasteners.items():
    dependencies = set(parts[cover_id]["dependsOn"])
    assert set(expected_screws) <= dependencies, (cover_id, dependencies)
    selected_distances = [
        point_to_root_bounds_distance_mm(parts[cover_id], parts[screw_id]["seatCenterMm"])
        for screw_id in expected_screws
    ]
    opposite_screws = tuple(
        screw_id
        for screw_id in ("Z50II-08-011", "Z50II-08-012", "Z50II-08-013", "Z50II-08-014")
        if screw_id not in expected_screws
    )
    opposite_distances = [
        point_to_root_bounds_distance_mm(parts[cover_id], parts[screw_id]["seatCenterMm"])
        for screw_id in opposite_screws
    ]
    assert max(selected_distances) < min(opposite_distances), (
        cover_id,
        selected_distances,
        opposite_distances,
    )


# Complete BVH coverage for every new/new and new/retained selectable-root pair.
# Every exception is both observed below and documented in the shared contract.
ALLOWED_ROOT_CONTACTS = TASK7_ROOT_CONTACTS

unobserved_allowed_contacts = sorted(
    tuple(sorted(pair))
    for pair in ALLOWED_ROOT_CONTACTS
    if not roots_overlap(*(parts[part_id] for part_id in sorted(pair)))
)
assert not unobserved_allowed_contacts, (
    f"pre-emptive root-contact exceptions: {unobserved_allowed_contacts}"
)

new_ids = sorted(expected_control_ids)
retained_ids = sorted(set(parts) - set(new_ids))
checked_pairs = list(combinations(new_ids, 2)) + [
    (new_id, retained_id) for new_id in new_ids for retained_id in retained_ids
]
assert len(checked_pairs) == 3180
unexpected_intersections = {}
for first_id, second_id in checked_pairs:
    pair = frozenset((first_id, second_id))
    if pair in ALLOWED_ROOT_CONTACTS:
        continue
    if roots_overlap(parts[first_id], parts[second_id]):
        unexpected_intersections[(first_id, second_id)] = True
assert not unexpected_intersections, f"Task-7 selectable-root interpenetration: {sorted(unexpected_intersections)}"

# Sample the physical open sweeps around the stored origins. The complete LCD
# motion group swings rearward around Z. Its annular moving knuckle remains
# surface-clear of both the stationary knuckles and the solid pivot pin.
lcd_pivot_m = Vector(parts["Z50II-07-007"]["pivotOriginMm"]) / 1000.0
assert parts["Z50II-07-007"]["openAngleDeg"] == -105.0
stationary_lcd_ids = sorted(set(parts) - moving_lcd_ids)
stationary_lcd_bvhs = {
    part_id: transformed_root_bvh(parts[part_id]) for part_id in stationary_lcd_ids
}
lcd_sweep_failures = {}
for angle in range(-1, -106, -1):
    transform = Matrix.Translation(lcd_pivot_m) @ Matrix.Rotation(radians(angle), 4, "Z") @ Matrix.Translation(-lcd_pivot_m)
    overlaps = []
    for moving_id in sorted(moving_lcd_ids):
        moving_tree = transformed_root_bvh(parts[moving_id], transform)
        for stationary_id in stationary_lcd_ids:
            if moving_tree.overlap(stationary_lcd_bvhs[stationary_id]):
                overlaps.append((moving_id, stationary_id))
    if overlaps:
        lcd_sweep_failures[angle] = overlaps
assert not lcd_sweep_failures, lcd_sweep_failures
print("LCD kinematic sweep passed: angles=-1..-105, increment_deg=1, exemptions=0")

flash_pivot_m = Vector(flash_head["pivotOriginMm"]) / 1000.0
top_shell_bvh = transformed_root_bvh(parts["Z50II-02-003"])
open_transform = Matrix.Translation(flash_pivot_m) @ Matrix.Rotation(radians(-72.0), 4, "X") @ Matrix.Translation(-flash_pivot_m)
for angle in (-12, -24, -36, -48, -60, -72):
    transform = Matrix.Translation(flash_pivot_m) @ Matrix.Rotation(radians(angle), 4, "X") @ Matrix.Translation(-flash_pivot_m)
    overlaps = [
        (moving.name, retained.name)
        for moving in root_meshes(flash_head)
        for retained in root_meshes(parts["Z50II-02-003"])
        if transformed_object_bvh(moving, transform).overlap(transformed_object_bvh(retained))
    ]
    assert not overlaps, (angle, overlaps)
for index in range(7):
    offset = Vector((0.0, 0.0, flash_head["explodeDistance"] * index / 6.0))
    assert not transformed_root_bvh(flash_head, open_transform, offset).overlap(top_shell_bvh), index

# Rebuilding every Task-7 module twice must preserve object/mesh counts, linked
# fasteners, and leave no Z50II mesh orphan behind.
from z50ii.modules.evf_top_flash import build_evf_top_flash
from z50ii.modules.io_flex_fasteners import build_io_flex_fasteners
from z50ii.modules.rear_lcd_controls import build_rear_lcd_controls


def task7_signature():
    nodes = {obj for module_id in EXPECTED_CONTROL_PARTS for obj in bpy.data.collections[module_id].all_objects}
    roots = [obj for obj in nodes if obj.get("partId")]
    meshes = {obj.data for obj in nodes if obj.type == "MESH"}
    linked_screw_meshes = {
        parts_obj.data.as_pointer()
        for parts_obj in bpy.data.objects
        if parts_obj.get("partId") in {f"Z50II-08-{index:03d}" for index in range(11, 17)}
    }
    orphan_meshes = [mesh.name for mesh in bpy.data.meshes if mesh.users == 0 and mesh.name.startswith("Z50II")]
    return len(nodes), len(roots), len(meshes), len(linked_screw_meshes), tuple(orphan_meshes)


baseline_signature = task7_signature()
assert baseline_signature[1] == 40 and baseline_signature[3] == 1 and not baseline_signature[4]
for cycle in range(2):
    build_evf_top_flash()
    build_rear_lcd_controls()
    build_io_flex_fasteners()
    assert task7_signature() == baseline_signature, (cycle + 1, baseline_signature, task7_signature())

print("Control-module catalog passed: 100 unique selectable roots across 8 modules")
