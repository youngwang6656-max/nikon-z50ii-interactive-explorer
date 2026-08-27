"""Render the named studio rig to a 1024x512 Radiance environment."""

from __future__ import annotations

from hashlib import sha256
import json
import os
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "public" / "assets" / "environment" / "studio-neutral-1k.hdr"
MANIFEST = OUTPUT.with_suffix(".json")
WIDTH, HEIGHT = 1024, 512
LIGHT_NAMES = ("Studio_Key_FrontLeft", "Studio_Fill_FrontRight", "Studio_Rim_Rear")
CAMERA_NAME = "Studio_Environment_Panorama"


def configure_panorama(scene: bpy.types.Scene) -> bpy.types.Object:
    old = bpy.data.objects.get(CAMERA_NAME)
    if old is not None:
        bpy.data.objects.remove(old, do_unlink=True)
    data = bpy.data.cameras.new(CAMERA_NAME)
    data.type = "PANO"
    data.panorama_type = "EQUIRECTANGULAR"
    data.clip_start = 0.001
    data.clip_end = 10.0
    camera = bpy.data.objects.new(CAMERA_NAME, data)
    scene.collection.objects.link(camera)
    camera.location = (0.0, 0.0, 0.032)
    camera.rotation_euler = (0.0, 0.0, 0.0)
    camera["studioEnvironmentCamera"] = True
    scene.camera = camera
    return camera


def configure_render(scene: bpy.types.Scene) -> None:
    scene.render.engine = "CYCLES"
    scene.cycles.samples = int(os.environ.get("Z50II_ENV_SAMPLES", "128"))
    scene.cycles.use_denoising = True
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.02
    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "HDR"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "32"
    scene.render.film_transparent = False
    scene.render.filepath = str(OUTPUT)
    scene.render.use_file_extension = True
    scene.render.use_overwrite = True
    # Radiance environments are stored in scene-linear space, independent of
    # the AgX transform used for the two display-referred reference PNGs.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = 0.0


def render_environment() -> None:
    scene = bpy.context.scene
    lights = {}
    for name in LIGHT_NAMES:
        light = bpy.data.objects.get(name)
        assert light is not None and light.type == "LIGHT", f"missing named studio rig light: {name}"
        assert light.data.type == "AREA", f"studio rig light is not AREA: {name}"
        lights[name] = light
    cyclorama = bpy.data.objects.get("Studio_Cyclorama")
    assert cyclorama is not None and cyclorama.get("studioAsset"), "missing named studio cyclorama"

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    camera = configure_panorama(scene)
    configure_render(scene)
    hidden = {obj.name: obj.hide_render for obj in bpy.data.objects}
    camera_visibility = {name: lights[name].visible_camera for name in LIGHT_NAMES}
    try:
        # The environment is the empty product stage: only the cyclorama and
        # the actual named key/fill/rim rig contribute to the panorama.
        for obj in bpy.data.objects:
            if obj is camera or obj is cyclorama or obj.name in LIGHT_NAMES:
                obj.hide_render = False
            else:
                obj.hide_render = True
        for light in lights.values():
            light.visible_camera = True
        bpy.context.view_layer.update()
        bpy.ops.render.render(write_still=True)
    finally:
        for name, state in hidden.items():
            if name in bpy.data.objects:
                bpy.data.objects[name].hide_render = state
        for name, state in camera_visibility.items():
            lights[name].visible_camera = state

    payload = OUTPUT.read_bytes()
    manifest = {
        "engine": "CYCLES",
        "operator": "bpy.ops.render.render",
        "blenderVersion": ".".join(str(value) for value in bpy.app.version),
        "camera": {
            "name": CAMERA_NAME,
            "type": camera.data.type,
            "panoramaType": camera.data.panorama_type,
        },
        "resolution": [WIDTH, HEIGHT],
        "samples": scene.cycles.samples,
        "rigLights": {
            name: {
                "role": lights[name]["studioRole"],
                "energy": lights[name].data.energy,
                "location": [round(value, 6) for value in lights[name].location],
            }
            for name in LIGHT_NAMES
        },
        "cyclorama": cyclorama.name,
        "sha256": sha256(payload).hexdigest(),
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(
        f"Radiance HDR rendered from named studio rig: {OUTPUT} "
        f"({WIDTH}x{HEIGHT}, {scene.cycles.samples} Cycles samples)"
    )


if __name__ == "__main__":
    render_environment()
