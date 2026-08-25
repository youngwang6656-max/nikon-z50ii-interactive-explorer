"""Shared dimensions and stable identifiers for the Z50II reference model."""

MM = 0.001

# Published external body-envelope anchors (width × height × depth).
BODY_WIDTH_MM = 127.0
BODY_HEIGHT_MM = 96.8
BODY_DEPTH_MM = 66.5

COORDINATE_CONVENTION = "+X right, +Y rear, +Z up"
LENS_MOUNT_ORIGIN_NAME = "Z50II_LENS_MOUNT_ORIGIN"
STUDIO_WORLD_NAME = "Z50II_StudioWorld"

MODULE_COLLECTIONS = (
    "01_chassis_front",
    "02_outer_shell_controls",
    "03_mount_shutter_sensor",
    "04_mainboard_thermal",
    "05_power_storage",
    "06_evf_top_flash",
    "07_rear_lcd_controls",
    "08_io_flex_fasteners",
)


def mm(value: float) -> float:
    """Convert millimetres supplied by builders to Blender's metre units."""
    return value * MM
