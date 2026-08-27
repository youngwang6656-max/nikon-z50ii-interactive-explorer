"""Render assembled and metadata-driven exploded 1600x1200 Cycles references."""

from __future__ import annotations

from pathlib import Path
import os
import sys
from time import perf_counter

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parent.parent
BLENDER_ROOT = Path(__file__).resolve().parent
if str(BLENDER_ROOT) not in sys.path:
    sys.path.insert(0, str(BLENDER_ROOT))

from z50ii.studio_lighting import LIGHTS, point_at


HDR = ROOT / "public" / "assets" / "environment" / "studio-neutral-1k.hdr"
OUTPUT_DIR = ROOT / "artifacts" / "renders"


def configure_world(scene: bpy.types.Scene) -> None:
    world = scene.world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputWorld")
    background = nodes.new("ShaderNodeBackground")
    environment = nodes.new("ShaderNodeTexEnvironment")
    environment.image = bpy.data.images.load(str(HDR), check_existing=True)
    environment.interpolation = "Linear"
    background.inputs["Strength"].default_value = 0.24
    world.node_tree.links.new(environment.outputs["Color"], background.inputs["Color"])
    world.node_tree.links.new(background.outputs["Background"], output.inputs["Surface"])


def configure_render(scene: bpy.types.Scene) -> None:
    scene.render.engine = "CYCLES"
    scene.cycles.samples = int(os.environ.get("Z50II_RENDER_SAMPLES", "128"))
    scene.cycles.use_denoising = True
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.02
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = int(os.environ.get("Z50II_RENDER_PERCENT", "100"))
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = float(os.environ.get("Z50II_RENDER_EXPOSURE", "-4.5"))
    scene.render.use_file_extension = True
    scene.render.use_overwrite = True
    scene.render.image_settings.color_management = "FOLLOW_SCENE"


def ensure_camera(scene: bpy.types.Scene) -> bpy.types.Object:
    camera = bpy.data.objects.get("Studio_Reference_Camera")
    if camera is None:
        data = bpy.data.cameras.new("Studio_Reference_Camera")
        data.lens = 64.0
        data.sensor_width = 36.0
        camera = bpy.data.objects.new("Studio_Reference_Camera", data)
        scene.collection.objects.link(camera)
    scene.camera = camera
    return camera


def set_camera(camera: bpy.types.Object, location, target, lens: float) -> None:
    camera.location = location
    camera.data.lens = lens
    point_at(camera, target)


def selectable_roots():
    return sorted((obj for obj in bpy.data.objects if obj.get("partId")), key=lambda obj: obj["partId"])


def snapshot_transforms() -> dict[str, Matrix]:
    return {obj.name: obj.matrix_world.copy() for obj in selectable_roots()}


def snapshot_decal_transforms() -> dict[str, Matrix]:
    return {
        obj.name: obj.matrix_world.copy()
        for obj in bpy.data.objects
        if obj.get("decalLabel") and obj.get("attachedPartId")
    }


def apply_explode(scale: float = 0.82) -> None:
    roots = selectable_roots()
    for obj in roots:
        axis = Vector(obj["explodeAxis"])
        distance = float(obj["explodeDistance"])
        matrix = obj.matrix_world.copy()
        matrix.translation += axis * distance * scale
        obj.matrix_world = matrix


def restore_transforms(snapshot: dict[str, Matrix]) -> None:
    for name, matrix in snapshot.items():
        bpy.data.objects[name].matrix_world = matrix
    bpy.context.view_layer.update()
    maximum_delta = 0.0
    for name, matrix in snapshot.items():
        delta = max(
            abs(a - b)
            for row_a, row_b in zip(bpy.data.objects[name].matrix_world, matrix)
            for a, b in zip(row_a, row_b)
        )
        maximum_delta = max(maximum_delta, delta)
        assert delta <= 2.0e-7, (name, delta)
    print(f"Transform restore maximum matrix delta: {maximum_delta:.3e}")


def restore_decal_transforms(snapshot: dict[str, Matrix]) -> None:
    for name, matrix in snapshot.items():
        bpy.data.objects[name].matrix_world = matrix


def render(scene: bpy.types.Scene, filename: str) -> float:
    suffix = os.environ.get("Z50II_RENDER_SUFFIX", "")
    if suffix:
        filename = filename.replace(".png", f"-{suffix}.png")
    scene.render.filepath = str(OUTPUT_DIR / filename)
    started = perf_counter()
    bpy.ops.render.render(write_still=True)
    elapsed = perf_counter() - started
    print(f"Rendered {filename}: {elapsed:.2f}s, 1600x1200, {scene.cycles.samples} Cycles samples, denoising, exposure {scene.view_settings.exposure:+.1f} EV")
    return elapsed


if __name__ == "__main__":
    assert HDR.is_file(), f"Run render_environment.py first: {HDR}"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    configure_world(scene)
    configure_render(scene)
    for light in (obj for obj in bpy.data.objects if obj.type == "LIGHT"):
        light.visible_camera = False
        if light.name in LIGHTS:
            light.data.energy = LIGHTS[light.name][1]
    cyclorama = bpy.data.objects.get("Studio_Cyclorama")
    if cyclorama and cyclorama.dimensions.x < 1.4:
        cyclorama.scale.x *= 1.5 / cyclorama.dimensions.x
    hidden_name = os.environ.get("Z50II_DIAGNOSTIC_HIDE", "")
    if hidden_name and bpy.data.objects.get(hidden_name):
        bpy.data.objects[hidden_name].hide_render = True
    camera = ensure_camera(scene)
    assembled = snapshot_transforms()
    assembled_decals = snapshot_decal_transforms()
    set_camera(camera, (0.185, -0.245, 0.135), (0.0, 0.003, 0.002), 64.0)
    render(scene, "assembled-studio.png")
    if os.environ.get("Z50II_RENDER_MODE", "both") == "assembled":
        restore_transforms(assembled)
        restore_decal_transforms(assembled_decals)
        raise SystemExit(0)
    try:
        apply_explode()
        bpy.context.view_layer.update()
        set_camera(camera, (0.265, -0.355, 0.235), (0.0, 0.008, 0.010), 66.0)
        render(scene, "exploded-studio.png")
    finally:
        restore_transforms(assembled)
        restore_decal_transforms(assembled_decals)
    assert snapshot_transforms().keys() == assembled.keys()
    print("Assembled transforms restored exactly after exploded reference render")
