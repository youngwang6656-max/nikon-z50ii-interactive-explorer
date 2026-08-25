"""Build the Z50II master Blender scene from the procedural module builders."""

from pathlib import Path
import sys


BLENDER_ROOT = Path(__file__).resolve().parent
if str(BLENDER_ROOT) not in sys.path:
    sys.path.insert(0, str(BLENDER_ROOT))

from z50ii.scene import build_scene


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    build_scene(root / "artifacts" / "z50ii_master.blend")
