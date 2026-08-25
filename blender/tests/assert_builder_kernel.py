import bpy


EXPECTED = {
    "01_chassis_front",
    "02_outer_shell_controls",
    "03_mount_shutter_sensor",
    "04_mainboard_thermal",
    "05_power_storage",
    "06_evf_top_flash",
    "07_rear_lcd_controls",
    "08_io_flex_fasteners",
}

actual = {collection.name for collection in bpy.data.collections}
assert EXPECTED <= actual, f"missing collections: {EXPECTED - actual}"
assert bpy.context.scene.unit_settings.system == "METRIC"
assert abs(bpy.context.scene.unit_settings.scale_length - 1.0) < 1e-9
assert bpy.data.worlds.get("Z50II_StudioWorld") is not None
