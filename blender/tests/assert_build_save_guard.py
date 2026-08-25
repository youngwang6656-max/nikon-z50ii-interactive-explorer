"""A failed pre-save validator must not overwrite an existing artifact."""

from pathlib import Path
import sys
from tempfile import TemporaryDirectory

BLENDER_ROOT = Path(__file__).resolve().parents[1]
if str(BLENDER_ROOT) not in sys.path:
    sys.path.insert(0, str(BLENDER_ROOT))

from z50ii.scene import build_scene


def reject_catalog():
    raise AssertionError("deliberately invalid internal catalog")


with TemporaryDirectory(prefix="z50ii-save-guard-") as temporary_dir:
    artifact = Path(temporary_dir) / "protected.blend"
    sentinel = b"existing artifact must survive failed validation\n"
    artifact.write_bytes(sentinel)
    try:
        build_scene(artifact, validator=reject_catalog)
    except AssertionError as error:
        assert str(error) == "deliberately invalid internal catalog"
    else:
        raise AssertionError("invalid catalog unexpectedly reached the save step")
    assert artifact.read_bytes() == sentinel, "failed validation overwrote the existing artifact"

print("Build save guard passed: invalid catalog preserved the existing artifact byte-for-byte")
