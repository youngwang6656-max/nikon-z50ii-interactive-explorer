"""Task 8 acceptance checks for materials, decals, studio light, and renders."""

from __future__ import annotations

from hashlib import sha256
from math import isfinite
from pathlib import Path
import struct
import zlib

import bpy


ROOT = Path(__file__).resolve().parents[2]
TEXTURE_SOURCE = ROOT / "artifacts" / "textures"
TEXTURE_PUBLIC = ROOT / "public" / "assets" / "textures"
HDR_PATH = ROOT / "public" / "assets" / "environment" / "studio-neutral-1k.hdr"
RENDER_DIR = ROOT / "artifacts" / "renders"

MATERIAL_KEYS = {
    "body_black",
    "grip_rubber",
    "mount_metal",
    "brushed_shield",
    "pcb_green",
    "pcb_black",
    "sensor_glass",
    "display_glass",
    "flex_amber",
    "button_black",
    "white_decal",
    "red_accent",
}
TEXTURES = {
    "body-black-normal-2k.png": (2048, 2048),
    "body-black-roughness-2k.png": (2048, 2048),
    "grip-rubber-normal-2k.png": (2048, 2048),
    "grip-rubber-roughness-2k.png": (2048, 2048),
    "internal-metal-roughness-1k.png": (1024, 1024),
    "decal-atlas-2k.png": (2048, 1024),
}
DECAL_LABELS = {"Nikon", "Z50II", "MENU", "DISP", "ISO", "MODE", "USB", "HDMI", "MIC", "SENSOR"}
LIGHT_NAMES = {"Studio_Key_FrontLeft", "Studio_Fill_FrontRight", "Studio_Rim_Rear"}


def png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        assert handle.read(8) == b"\x89PNG\r\n\x1a\n", f"invalid PNG signature: {path}"
        length = struct.unpack(">I", handle.read(4))[0]
        assert handle.read(4) == b"IHDR" and length == 13, f"missing PNG IHDR: {path}"
        return struct.unpack(">II", handle.read(8))


def rgba_pixel(path: Path, x: int, y: int) -> tuple[int, int, int, int]:
    payload = path.read_bytes()
    position = 8
    compressed = bytearray()
    width = height = None
    while position < len(payload):
        length = struct.unpack(">I", payload[position : position + 4])[0]
        kind = payload[position + 4 : position + 8]
        data = payload[position + 8 : position + 8 + length]
        position += 12 + length
        if kind == b"IHDR":
            width, height, depth, color_type = struct.unpack(">IIBB", data[:10])
            assert depth == 8 and color_type == 6
        elif kind == b"IDAT":
            compressed.extend(data)
        elif kind == b"IEND":
            break
    raw = zlib.decompress(bytes(compressed))
    stride = width * 4 + 1
    assert all(raw[row * stride] == 0 for row in range(height)), "atlas must use deterministic filter 0"
    offset = y * stride + 1 + x * 4
    return tuple(raw[offset : offset + 4])


def png_rgb(path: Path) -> tuple[int, int, bytearray]:
    payload = path.read_bytes()
    position = 8
    compressed = bytearray()
    width = height = channels = None
    while position < len(payload):
        length = struct.unpack(">I", payload[position : position + 4])[0]
        kind = payload[position + 4 : position + 8]
        data = payload[position + 8 : position + 8 + length]
        position += 12 + length
        if kind == b"IHDR":
            width, height, depth, color_type = struct.unpack(">IIBB", data[:10])
            assert depth == 8 and color_type in {2, 6}
            channels = 3 if color_type == 2 else 4
        elif kind == b"IDAT":
            compressed.extend(data)
        elif kind == b"IEND":
            break
    raw = zlib.decompress(bytes(compressed))
    stride = width * channels
    decoded = bytearray(width * height * channels)
    source = 0
    previous = bytearray(stride)

    def paeth(a: int, b: int, c: int) -> int:
        estimate = a + b - c
        distances = abs(estimate - a), abs(estimate - b), abs(estimate - c)
        return a if distances[0] <= distances[1] and distances[0] <= distances[2] else (b if distances[1] <= distances[2] else c)

    for y in range(height):
        filter_type = raw[source]
        source += 1
        filtered = raw[source : source + stride]
        source += stride
        current = bytearray(stride)
        for x, value in enumerate(filtered):
            left = current[x - channels] if x >= channels else 0
            up = previous[x]
            upper_left = previous[x - channels] if x >= channels else 0
            predictor = {0: 0, 1: left, 2: up, 3: (left + up) // 2}.get(filter_type)
            if filter_type == 4:
                predictor = paeth(left, up, upper_left)
            assert predictor is not None, f"unsupported PNG filter {filter_type}"
            current[x] = (value + predictor) & 255
        decoded[y * stride : (y + 1) * stride] = current
        previous = current
    if channels == 4:
        rgb = bytearray(width * height * 3)
        for index in range(width * height):
            rgb[index * 3 : index * 3 + 3] = decoded[index * 4 : index * 4 + 3]
        decoded = rgb
    return width, height, decoded


def luminance_values(rgb: bytearray) -> list[float]:
    return [
        (54 * rgb[index] + 183 * rgb[index + 1] + 19 * rgb[index + 2]) / 65280.0
        for index in range(0, len(rgb), 3)
    ]


def percentile(sorted_values: list[float], fraction: float) -> float:
    return sorted_values[int((len(sorted_values) - 1) * fraction)]


def radiance_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        header = handle.read(4096)
    assert header.startswith(b"#?RADIANCE\n"), "HDR lacks Radiance signature"
    marker = b"-Y 512 +X 1024\n"
    assert marker in header, "HDR is not 1024 x 512 equirectangular"
    assert b"FORMAT=32-bit_rle_rgbe" in header
    payload_offset = header.index(marker) + len(marker)
    assert header[payload_offset : payload_offset + 4] == b"\x02\x02\x04\x00", (
        "HDR declares RLE but lacks a valid 1024-pixel scanline header"
    )
    return 1024, 512


missing = MATERIAL_KEYS - {material.name for material in bpy.data.materials}
assert not missing, f"missing Task 8 materials: {sorted(missing)}"

for name in sorted(MATERIAL_KEYS):
    material = bpy.data.materials[name]
    assert material.use_nodes and material.node_tree, f"{name} has no node tree"
    principled = [node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"]
    assert len(principled) == 1, f"{name} must use exactly one Principled BSDF"
    unsafe = [node.name for node in material.node_tree.nodes if node.type.startswith("BSDF_") and node.type != "BSDF_PRINCIPLED"]
    assert not unsafe, f"{name} has non-glTF core shaders: {unsafe}"
    assert material.get("gltfSafeCore") is True

scene = bpy.context.scene
assert scene.render.engine == "BLENDER_EEVEE_NEXT" or scene.render.engine == "CYCLES"
assert scene.get("referenceRenderEngine") == "CYCLES"
assert scene.get("referenceRenderSamples") == 128
assert scene.view_settings.view_transform == "AgX"

meshes = [obj for obj in bpy.data.objects if obj.type == "MESH" and not obj.hide_render]
assert meshes, "scene has no renderable meshes"
unassigned = [obj.name for obj in meshes if not obj.data.materials or any(slot.material is None for slot in obj.material_slots)]
assert not unassigned, f"renderable meshes lack materials: {unassigned}"
default_gray = [obj.name for obj in meshes if any(material.name == "Material" for material in obj.data.materials)]
assert not default_gray, f"renderable meshes use Blender default gray: {default_gray}"
unsafe_meshes = [obj.name for obj in meshes if any(material.get("gltfSafeCore") is not True for material in obj.data.materials)]
assert not unsafe_meshes, f"mesh materials lack glTF-safe role metadata: {unsafe_meshes}"
for role in MATERIAL_KEYS:
    assert any(any(material.name == role for material in obj.data.materials) for obj in meshes), f"unused material role: {role}"

roots = [obj for obj in bpy.data.objects if obj.get("partId")]
assert len(roots) == 100, f"expected 100 selectable roots, got {len(roots)}"
for root in roots:
    assert len(root.get("assembledMatrix", [])) == 16, f"{root.name} lacks assembled transform snapshot"
    actual = tuple(round(value, 10) for row in root.matrix_world for value in row)
    stored = tuple(round(value, 10) for value in root["assembledMatrix"])
    assert actual == stored, f"assembled transform changed for {root['partId']}"

decals = [obj for obj in meshes if obj.get("decalLabel")]
assert DECAL_LABELS <= {obj["decalLabel"] for obj in decals}, "decal atlas labels are incomplete"
for decal in decals:
    assert abs(decal.get("surfaceOffsetMm", 0.0) - 0.05) < 1.0e-9
    assert decal.active_material and decal.active_material.name == "white_decal"
    assert decal.get("usesAtlas") == "//textures/decal-atlas-2k.png"

atlas_path = TEXTURE_SOURCE / "decal-atlas-2k.png"
# Hand-derived samples in the Z50II cell: row 1/column 0 of the 'Z' is clear,
# while row 5/column 0 is painted. This catches vertical mirroring/row swapping.
assert rgba_pixel(atlas_path, 410, 221)[3] == 0
assert rgba_pixel(atlas_path, 410, 277)[3] == 255

expected_normals = {
    "Nikon": (0.0, -1.0, 0.0), "Z50II": (0.0, -1.0, 0.0),
    "MENU": (0.0, 1.0, 0.0), "DISP": (0.0, 1.0, 0.0),
    "ISO": (0.0, 0.0, 1.0), "MODE": (0.0, 0.0, 1.0),
    "USB": (1.0, 0.0, 0.0), "HDMI": (1.0, 0.0, 0.0), "MIC": (1.0, 0.0, 0.0),
    "SENSOR": (0.0, -1.0, 0.0),
}
for decal in decals:
    normal = (decal.matrix_world.to_3x3() @ decal.data.polygons[0].normal).normalized()
    expected = expected_normals[decal["decalLabel"]]
    assert sum(a * b for a, b in zip(normal, expected)) > 0.999, (decal.name, tuple(normal), expected)

lights = {obj.name: obj for obj in bpy.data.objects if obj.type == "LIGHT"}
assert LIGHT_NAMES <= set(lights), f"missing studio lights: {sorted(LIGHT_NAMES - set(lights))}"
for name in LIGHT_NAMES:
    assert lights[name].data.type == "AREA", f"{name} must be an area light"
assert lights["Studio_Key_FrontLeft"].data.energy > lights["Studio_Fill_FrontRight"].data.energy
assert lights["Studio_Rim_Rear"].data.shape == "RECTANGLE"
assert bpy.data.objects.get("Studio_Cyclorama") is not None

for name, dimensions in TEXTURES.items():
    source = TEXTURE_SOURCE / name
    public = TEXTURE_PUBLIC / name
    assert source.is_file() and source.stat().st_size > 100, f"missing source texture: {source}"
    assert public.is_file() and public.stat().st_size > 100, f"missing public texture: {public}"
    assert png_dimensions(source) == dimensions
    assert png_dimensions(public) == dimensions
    assert sha256(source.read_bytes()).digest() == sha256(public.read_bytes()).digest()
    webp = TEXTURE_PUBLIC / name.replace(".png", ".webp")
    assert webp.is_file() and webp.stat().st_size > 100, f"missing browser WebP: {webp}"

radiance_dimensions(HDR_PATH)
hdr_bytes = HDR_PATH.read_bytes()
assert len(hdr_bytes) > 1024 * 512, "HDR payload is unexpectedly small"
assert max(hdr_bytes[-1024 * 512 :]) > 200, "HDR lacks bright studio-light range"

for name in ("assembled-studio.png", "exploded-studio.png"):
    path = RENDER_DIR / name
    assert path.is_file() and path.stat().st_size > 100_000, f"missing reference render: {path}"
    assert png_dimensions(path) == (1600, 1200)
    image = bpy.data.images.load(str(path), check_existing=False)
    try:
        pixels = list(image.pixels)
        assert pixels and all(isfinite(value) for value in pixels), f"non-finite pixels in {name}"
        rgb = [pixels[index] for index in range(0, len(pixels), 4)]
        assert max(rgb) - min(rgb) > 0.35, f"insufficient render dynamic range: {name}"
    finally:
        bpy.data.images.remove(image)

    width, height, rgb = png_rgb(path)
    values = luminance_values(rgb)
    ordered = sorted(values)
    p01, p05, p95, p999 = (percentile(ordered, fraction) for fraction in (0.01, 0.05, 0.95, 0.999))
    clipped_fraction = sum(value >= 0.98 for value in values) / len(values)
    assert p999 < 0.95, f"99.9th percentile clips/highlights too hot in {name}: {p999:.4f}"
    assert clipped_fraction < 0.0005, f"too many clipped pixels in {name}: {clipped_fraction:.6%}"
    assert p01 < 0.18 and p95 - p05 > 0.38, f"weak shadow/midtone/highlight spread in {name}"
    assert p95 > 0.52, f"nonblank highlight content missing in {name}"

    if name == "assembled-studio.png":
        body = []
        for y in range(250, 950):
            for x in range(220, 520):
                body.append(values[y * width + x])
        background = []
        for y in range(0, 180):
            background.extend(values[y * width : (y + 1) * width])
        body.sort()
        background.sort()
        body_median = percentile(body, 0.5)
        background_median = percentile(background, 0.5)
        assert body_median < 0.30, f"black body reads too light: median={body_median:.4f}"
        assert body_median + 0.25 < background_median, (
            f"body/background separation too small: {body_median:.4f} vs {background_median:.4f}"
        )
    print(
        f"{name} QA: p01={p01:.4f}, p999={p999:.4f}, "
        f"clip>=0.98={clipped_fraction:.6%}, spread95-05={p95-p05:.4f}"
    )

print("Task 8 materials/lighting assertion passed")
