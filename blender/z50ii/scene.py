"""Scene lifecycle and module-builder orchestration for the master Blender file."""

from __future__ import annotations

from importlib import import_module
from pathlib import Path
from typing import Callable

import bpy

from .constants import (
    COORDINATE_CONVENTION,
    LENS_MOUNT_ORIGIN_NAME,
    MODULE_COLLECTIONS,
    STUDIO_WORLD_NAME,
)

MODULE_BUILDERS = (
    "chassis_front",
    "outer_shell_controls",
    "mount_shutter_sensor",
    "mainboard_thermal",
    "power_storage",
    "evf_top_flash",
    "rear_lcd_controls",
    "io_flex_fasteners",
)


def initialize_scene() -> dict[str, bpy.types.Collection]:
    """Create an empty, metric master scene with stable export collections."""
    scene = bpy.context.scene
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for world in list(bpy.data.worlds):
        bpy.data.worlds.remove(world)

    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene["coordinateConvention"] = COORDINATE_CONVENTION

    world = bpy.data.worlds.new(STUDIO_WORLD_NAME)
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background") if world.node_tree else None
    if background is not None:
        background.inputs["Color"].default_value = (0.055, 0.055, 0.055, 1.0)
        background.inputs["Strength"].default_value = 0.25
    scene.world = world

    collections = {}
    for name in MODULE_COLLECTIONS:
        collection = bpy.data.collections.new(name)
        scene.collection.children.link(collection)
        collections[name] = collection

    mount_origin = bpy.data.objects.new(LENS_MOUNT_ORIGIN_NAME, None)
    mount_origin.empty_display_type = "PLAIN_AXES"
    mount_origin.empty_display_size = 0.012
    mount_origin.location = (0.0, 0.0, 0.0)
    scene.collection.objects.link(mount_origin)
    mount_origin["purpose"] = "Reserved Nikon Z-mount attachment origin"
    return collections


def call_module_builders() -> None:
    """Call module builders which have been added by later modelling tasks."""
    for module_name in MODULE_BUILDERS:
        qualified_name = f"z50ii.modules.{module_name}"
        try:
            module = import_module(qualified_name)
        except ModuleNotFoundError as error:
            if error.name in {"z50ii.modules", qualified_name}:
                continue
            raise
        builder = getattr(module, f"build_{module_name}", None)
        if builder is None:
            builder = getattr(module, "build", None)
        if callable(builder):
            builder()


def build_scene(
    output_path: Path,
    *,
    validator: Callable[[], None] | None = None,
) -> Path:
    """Build, optionally validate, then save without touching output on failure."""
    initialize_scene()
    call_module_builders()
    if validator is not None:
        validator()
    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(destination))
    return destination
