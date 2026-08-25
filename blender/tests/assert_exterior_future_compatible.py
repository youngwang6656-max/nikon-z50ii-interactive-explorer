"""Regression: Task 5 validation must coexist with later module parts."""

from pathlib import Path
import runpy

import bpy


future_collection = bpy.data.collections["03_mount_shutter_sensor"]
future_part = bpy.data.objects.new("Z50II-03-SYNTHETIC_future_part", None)
future_part["partId"] = "Z50II-03-SYNTHETIC"
future_part["moduleId"] = "03_mount_shutter_sensor"
future_collection.objects.link(future_part)

runpy.run_path(str(Path(__file__).with_name("assert_exterior_modules.py")))
print("Exterior assertion accepted a synthetic future-module part")
