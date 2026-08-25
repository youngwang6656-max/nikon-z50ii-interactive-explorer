"""Build the Z50II master scene and optionally render inspection silhouettes."""

from pathlib import Path
import os
import sys

import bpy
from mathutils import Vector


BLENDER_ROOT = Path(__file__).resolve().parent
if str(BLENDER_ROOT) not in sys.path:
    sys.path.insert(0, str(BLENDER_ROOT))

from z50ii.scene import build_scene


SILHOUETTE_VIEWS = {
    "front": (0.01, -0.36, 0.005),
    "rear": (0.01, 0.39, 0.005),
    "left": (-0.39, 0.02, 0.005),
    "right": (0.41, 0.02, 0.005),
    "top": (0.01, 0.02, 0.42),
    "three-quarter": (0.25, -0.30, 0.19),
}

CORE_INTERNAL_MODULE_COUNTS = {
    "03_mount_shutter_sensor": 12,
    "04_mainboard_thermal": 12,
    "05_power_storage": 8,
}


def verify_core_internal_catalog() -> None:
    """Fail a master build if an installed Task 6 builder is incomplete."""
    for module_id, expected_count in CORE_INTERNAL_MODULE_COUNTS.items():
        actual_count = sum(
            obj.get("moduleId") == module_id and bool(obj.get("partId"))
            for obj in bpy.data.objects
        )
        assert actual_count == expected_count, (
            f"{module_id} produced {actual_count} selectable parts; "
            f"expected {expected_count}"
        )


def _point_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def _studio_light(name: str, location: tuple[float, float, float], energy: float, size: float) -> None:
    data = bpy.data.lights.new(name=name, type="AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    light = bpy.data.objects.new(name, data)
    light.location = location
    bpy.context.scene.collection.objects.link(light)
    _point_at(light, (0.005, 0.008, 0.004))


def render_silhouette_views(output_dir: Path) -> None:
    """Render six deterministic inspection views of the assembled exterior."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.0
    if scene.world and scene.world.node_tree:
        background = scene.world.node_tree.nodes.get("Background")
        if background is not None:
            background.inputs["Color"].default_value = (0.018, 0.022, 0.028, 1.0)
            background.inputs["Strength"].default_value = 0.12

    camera_data = bpy.data.cameras.new("Z50II_Silhouette_Camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 0.158
    camera_data.lens = 70.0
    camera = bpy.data.objects.new("Z50II_Silhouette_Camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera

    _studio_light("Z50II_Key", (0.24, -0.28, 0.25), 22.0, 0.18)
    _studio_light("Z50II_Fill", (-0.24, -0.12, 0.10), 10.0, 0.22)
    _studio_light("Z50II_Rim", (-0.08, 0.28, 0.24), 28.0, 0.16)

    output_dir.mkdir(parents=True, exist_ok=True)
    target = (0.006, 0.010, 0.005)
    for view_name, location in SILHOUETTE_VIEWS.items():
        camera.location = location
        _point_at(camera, target)
        camera_data.ortho_scale = 0.158 if view_name != "three-quarter" else 0.175
        scene.render.filepath = str(output_dir / f"{view_name}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    output_path = root / "artifacts" / "z50ii_master.blend"
    bpy.context.preferences.filepaths.save_version = 0
    build_scene(output_path)
    verify_core_internal_catalog()
    if os.environ.get("Z50II_RENDER_SILHOUETTES") == "1":
        render_silhouette_views(root / "artifacts" / "renders" / "silhouette")
