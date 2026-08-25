"""Part metadata used by Blender exports and the browser assembly manifest."""

from __future__ import annotations

from typing import Sequence

import bpy

from .constants import mm


def _has_part_id(part_id: str) -> bool:
    return any(obj.get("partId") == part_id for obj in bpy.data.objects)


def attach_part_metadata(
    obj: bpy.types.Object,
    *,
    part_id: str,
    module_id: str,
    parent_id: str | None,
    name_zh: str,
    name_en: str,
    description_zh: str,
    description_en: str,
    step: int,
    explode_axis: Sequence[float],
    explode_distance_mm: float,
    depends_on: Sequence[str],
    is_reference_geometry: bool,
) -> bpy.types.Object:
    """Attach the export contract after rejecting every duplicate stable ID."""
    if _has_part_id(part_id):
        raise ValueError(f"Duplicate Z50II part ID: {part_id}")

    obj["partId"] = part_id
    obj["moduleId"] = module_id
    obj["parentId"] = parent_id
    obj["nameZh"] = name_zh
    obj["nameEn"] = name_en
    obj["descriptionZh"] = description_zh
    obj["descriptionEn"] = description_en
    obj["step"] = step
    obj["explodeAxis"] = list(explode_axis)
    obj["explodeDistance"] = mm(explode_distance_mm)
    obj["dependsOn"] = list(depends_on)
    obj["isReferenceGeometry"] = is_reference_geometry
    return obj
