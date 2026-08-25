"""Reusable Principled-BSDF material helpers."""

from __future__ import annotations

from typing import Sequence

import bpy


def get_material(
    name: str,
    base_color: Sequence[float] = (0.18, 0.18, 0.18, 1.0),
    *,
    metallic: float = 0.0,
    roughness: float = 0.5,
) -> bpy.types.Material:
    """Return a named PBR material, creating it when it is first requested."""
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name=name)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF") if material.node_tree else None
    if principled is not None:
        principled.inputs["Base Color"].default_value = tuple(base_color)
        principled.inputs["Metallic"].default_value = metallic
        principled.inputs["Roughness"].default_value = roughness
    material.diffuse_color = tuple(base_color)
    return material


def assign_material(obj: bpy.types.Object, material: bpy.types.Material | None) -> None:
    """Assign one reusable material without leaving stale material slots behind."""
    if material is None or not hasattr(obj.data, "materials"):
        return
    obj.data.materials.clear()
    obj.data.materials.append(material)
