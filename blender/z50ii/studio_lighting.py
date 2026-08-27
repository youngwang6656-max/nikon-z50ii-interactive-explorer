"""Neutral product-photography cyclorama and deterministic three-light rig."""

from __future__ import annotations

from mathutils import Vector
import bpy

from .materials import assign_material, get_material


LIGHTS = {
    "Studio_Key_FrontLeft": ((-0.19, -0.23, 0.21), 42.0, 0.18, 0.18),
    "Studio_Fill_FrontRight": ((0.22, -0.14, 0.105), 16.0, 0.22, 0.18),
    "Studio_Rim_Rear": ((0.0, 0.22, 0.20), 52.0, 0.16, 0.035),
}


def point_at(obj, target=(0.0, 0.0, 0.006)):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def _cyclorama() -> bpy.types.Object:
    existing = bpy.data.objects.get("Studio_Cyclorama")
    if existing is not None:
        bpy.data.objects.remove(existing, do_unlink=True)
    x0, x1 = -0.75, 0.75
    profile = ((-0.38, -0.054), (0.12, -0.054), (0.18, -0.035), (0.215, 0.015), (0.225, 0.12), (0.225, 0.31))
    vertices = [(x, y, z) for y, z in profile for x in (x0, x1)]
    faces = [(index * 2, index * 2 + 1, index * 2 + 3, index * 2 + 2) for index in range(len(profile) - 1)]
    mesh = bpy.data.meshes.new("Studio_Cyclorama_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Studio_Cyclorama", mesh)
    bpy.context.scene.collection.objects.link(obj)
    assign_material(obj, get_material("studio_cyclorama"))
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj["studioAsset"] = True
    return obj


def setup_studio(scene: bpy.types.Scene | None = None) -> None:
    scene = scene or bpy.context.scene
    _cyclorama()
    for name, (location, energy, size, size_y) in LIGHTS.items():
        old = bpy.data.objects.get(name)
        if old is not None:
            bpy.data.objects.remove(old, do_unlink=True)
        data = bpy.data.lights.new(name=name, type="AREA")
        data.energy = energy
        data.shape = "RECTANGLE"
        data.size = size
        data.size_y = size_y
        data.color = (1.0, 0.965, 0.92) if "Key" in name else ((0.82, 0.90, 1.0) if "Rim" in name else (0.92, 0.96, 1.0))
        light = bpy.data.objects.new(name, data)
        scene.collection.objects.link(light)
        light.location = location
        light.visible_camera = False
        point_at(light)
        light["studioRole"] = "key" if "Key" in name else ("fill" if "Fill" in name else "rim")
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene["referenceRenderEngine"] = "CYCLES"
    scene["referenceRenderSamples"] = 128
    scene["referenceWorldStrength"] = 0.24
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.0
    if scene.world and scene.world.node_tree:
        background = scene.world.node_tree.nodes.get("Background")
        if background:
            background.inputs["Color"].default_value = (0.055, 0.060, 0.068, 1.0)
            background.inputs["Strength"].default_value = 0.12
