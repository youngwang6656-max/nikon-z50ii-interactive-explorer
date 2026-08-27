"""Deterministic glTF-safe PBR materials and decal/microdetail assets."""

from __future__ import annotations

from math import cos, pi, sin
from pathlib import Path
import shutil
import struct
from typing import Callable, Sequence
import zlib

import bpy


ROOT = Path(__file__).resolve().parents[2]
SOURCE_TEXTURE_DIR = ROOT / "artifacts" / "textures"
PUBLIC_TEXTURE_DIR = ROOT / "public" / "assets" / "textures"
DECAL_LABELS = ("Nikon", "Z50II", "MENU", "DISP", "ISO", "MODE", "USB", "HDMI", "MIC", "SENSOR")

MATERIAL_SPECS = {
    "body_black": dict(color=(0.012, 0.015, 0.019, 1.0), metallic=0.12, roughness=0.48),
    "grip_rubber": dict(color=(0.006, 0.008, 0.010, 1.0), metallic=0.0, roughness=0.72),
    "mount_metal": dict(color=(0.42, 0.46, 0.50, 1.0), metallic=1.0, roughness=0.22),
    "brushed_shield": dict(color=(0.31, 0.34, 0.37, 1.0), metallic=0.9, roughness=0.38),
    "pcb_green": dict(color=(0.018, 0.135, 0.061, 1.0), metallic=0.04, roughness=0.46),
    "pcb_black": dict(color=(0.006, 0.008, 0.011, 1.0), metallic=0.05, roughness=0.39),
    "sensor_glass": dict(color=(0.018, 0.075, 0.090, 1.0), metallic=0.12, roughness=0.055, transmission=0.12, coat=0.35),
    "display_glass": dict(color=(0.006, 0.020, 0.030, 1.0), metallic=0.08, roughness=0.07, transmission=0.12, coat=0.35),
    "flex_amber": dict(color=(0.55, 0.205, 0.018, 1.0), metallic=0.24, roughness=0.40),
    "button_black": dict(color=(0.009, 0.012, 0.015, 1.0), metallic=0.04, roughness=0.43),
    "white_decal": dict(color=(0.92, 0.94, 0.96, 1.0), metallic=0.0, roughness=0.32),
    "red_accent": dict(color=(0.62, 0.003, 0.008, 1.0), metallic=0.0, roughness=0.34),
    "contact_gold": dict(color=(0.72, 0.36, 0.035, 1.0), metallic=0.94, roughness=0.20),
    "copper_metal": dict(color=(0.55, 0.22, 0.055, 1.0), metallic=0.92, roughness=0.27),
    "thermal_pad_blue": dict(color=(0.07, 0.24, 0.37, 1.0), metallic=0.0, roughness=0.74),
    "flash_diffuser": dict(color=(0.68, 0.76, 0.82, 1.0), metallic=0.0, roughness=0.18, transmission=0.08, coat=0.18),
    "studio_cyclorama": dict(color=(0.19, 0.205, 0.22, 1.0), metallic=0.0, roughness=0.62),
}


def _legacy_key(name: str) -> str:
    lowered = name.lower()
    if "red accent" in lowered:
        return "red_accent"
    if any(token in lowered for token in ("grip rubber", "mount gasket")):
        return "grip_rubber"
    if any(token in lowered for token in ("sensor cover", "dx sensor")):
        return "sensor_glass"
    if any(token in lowered for token in ("dark glass", "lcd cover", "lcd panel", "optical glass", "evf oled")):
        return "display_glass"
    if "diffuser" in lowered:
        return "flash_diffuser"
    if any(token in lowered for token in ("flex", "antenna")) and "connector" not in lowered:
        return "flex_amber"
    if any(token in lowered for token in ("pcb", "board")):
        return "pcb_green"
    if any(token in lowered for token in ("package", "sd card")):
        return "pcb_black"
    if any(token in lowered for token in ("contacts", "gold", "connector bank")):
        return "contact_gold"
    if any(token in lowered for token in ("copper", "heat spreader")):
        return "copper_metal"
    if "thermal pad" in lowered:
        return "thermal_pad_blue"
    if any(token in lowered for token in ("shield", "shutter curtain", "fastener", "structural metal", "magnesium", "reflector")):
        return "brushed_shield"
    if any(token in lowered for token in ("mount stainless", "stainless hardware", "exterior metal", "hot shoe steel", "hinge metal", "slot metal", "connector shells")):
        return "mount_metal"
    if any(token in lowered for token in ("controls", "insulator", "battery cap")):
        return "button_black"
    return "body_black"


def _principled(material: bpy.types.Material):
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (520, 0)
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.name = "Principled BSDF"
    principled.location = (180, 0)
    material.node_tree.links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return principled


def _set_input(node, name: str, value) -> None:
    socket = node.inputs.get(name)
    if socket is not None:
        socket.default_value = value


def _create_material(name: str) -> bpy.types.Material:
    spec = MATERIAL_SPECS[name]
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name=name)
    principled = _principled(material)
    _set_input(principled, "Base Color", spec["color"])
    _set_input(principled, "Metallic", spec["metallic"])
    _set_input(principled, "Roughness", spec["roughness"])
    _set_input(principled, "Transmission Weight", spec.get("transmission", 0.0))
    _set_input(principled, "Coat Weight", spec.get("coat", 0.0))
    _set_input(principled, "Coat Roughness", 0.08)
    _set_input(principled, "IOR", 1.49)
    material.diffuse_color = spec["color"]
    material["gltfSafeCore"] = True
    material["materialRole"] = name
    return material


def get_material(name: str, base_color: Sequence[float] = (0.18, 0.18, 0.18, 1.0), *, metallic: float = 0.0, roughness: float = 0.5) -> bpy.types.Material:
    """Return the canonical role material behind a legacy builder request."""
    key = name if name in MATERIAL_SPECS else _legacy_key(name)
    return bpy.data.materials.get(key) or _create_material(key)


def assign_material(obj: bpy.types.Object, material: bpy.types.Material | None) -> None:
    if material is None or not hasattr(obj.data, "materials"):
        return
    obj.data.materials.clear()
    obj.data.materials.append(material)


def _png_chunk(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)


def _write_png(path: Path, width: int, height: int, channels: int, row: Callable[[int], bytes]) -> None:
    color_type = {1: 0, 3: 2, 4: 6}[channels]
    compressor = zlib.compressobj(9)
    compressed = bytearray()
    for y in range(height):
        pixels = row(y)
        assert len(pixels) == width * channels
        compressed.extend(compressor.compress(b"\0" + pixels))
    compressed.extend(compressor.flush())
    header = struct.pack(">IIBBBBB", width, height, 8, color_type, 0, 0, 0)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + _png_chunk(b"IHDR", header) + _png_chunk(b"IDAT", bytes(compressed)) + _png_chunk(b"IEND", b""))


def _normal_row(width: int, y: int, strength: float, grain: int) -> bytes:
    values = bytearray(width * 3)
    for x in range(width):
        nx = sin(2.0 * pi * x / grain) * strength + sin(2.0 * pi * (x + y) / (grain * 3)) * strength * 0.35
        ny = cos(2.0 * pi * y / grain) * strength + cos(2.0 * pi * (x - y) / (grain * 2)) * strength * 0.35
        values[x * 3 : x * 3 + 3] = bytes((int(128 + nx * 127), int(128 + ny * 127), 255))
    return bytes(values)


def _roughness_row(width: int, y: int, center: float, amplitude: float, grain: int) -> bytes:
    values = bytearray(width)
    for x in range(width):
        wave = 0.55 * sin(2.0 * pi * x / grain) + 0.45 * cos(2.0 * pi * y / (grain * 2))
        values[x] = max(0, min(255, int(255 * (center + amplitude * wave))))
    return bytes(values)


def _roughness_rgb_row(width: int, y: int, center: float, amplitude: float, grain: int) -> bytes:
    grayscale = _roughness_row(width, y, center, amplitude, grain)
    return bytes(channel for value in grayscale for channel in (value, value, value))


FONT = {
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"), "B": ("11110", "10001", "10001", "11110", "10001", "10001", "11110"),
    "D": ("11110", "10001", "10001", "10001", "10001", "10001", "11110"), "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "H": ("10001", "10001", "10001", "11111", "10001", "10001", "10001"), "I": ("11111", "00100", "00100", "00100", "00100", "00100", "11111"),
    "K": ("10001", "10010", "10100", "11000", "10100", "10010", "10001"), "M": ("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
    "N": ("10001", "11001", "10101", "10011", "10001", "10001", "10001"), "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"), "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"), "U": ("10001", "10001", "10001", "10001", "10001", "10001", "01110"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
    "V": ("10001", "10001", "10001", "10001", "10001", "01010", "00100"), "Z": ("11111", "00001", "00010", "00100", "01000", "10000", "11111"),
    "0": ("01110", "10001", "10011", "10101", "11001", "10001", "01110"), "2": ("01110", "10001", "00001", "00010", "00100", "01000", "11111"),
    "5": ("11111", "10000", "11110", "00001", "00001", "10001", "01110"),
}


def _atlas_pixels(width: int, height: int) -> bytearray:
    pixels = bytearray(width * height * 4)
    cell_w, cell_h = width // 5, height // 2
    for index, label in enumerate(DECAL_LABELS):
        row_index, col_index = divmod(index, 5)
        text = label.upper()
        scale = 14 if len(text) <= 5 else 10
        text_w = len(text) * 6 * scale - scale
        x0 = col_index * cell_w + (cell_w - text_w) // 2
        y0 = row_index * cell_h + (cell_h - 7 * scale) // 2
        for char_index, char in enumerate(text):
            glyph = FONT.get(char, FONT["O"])
            for gy, glyph_row in enumerate(glyph):
                for gx, bit in enumerate(glyph_row):
                    if bit != "1":
                        continue
                    for sy in range(scale):
                        for sx in range(scale):
                            x = x0 + char_index * 6 * scale + gx * scale + sx
                            y = y0 + gy * scale + sy
                            offset = (y * width + x) * 4
                            pixels[offset : offset + 4] = b"\xff\xff\xff\xff"
    return pixels


def _write_atlas(path: Path) -> None:
    width, height = 2048, 1024
    pixels = _atlas_pixels(width, height)
    _write_png(path, width, height, 4, lambda y: bytes(pixels[y * width * 4 : (y + 1) * width * 4]))


def _save_webp(png_path: Path, webp_path: Path) -> None:
    image = bpy.data.images.load(str(png_path), check_existing=False)
    try:
        # Image dimensions are parsed eagerly, but pixels are lazy-loaded.
        # Force the first pixel before changing format and saving.
        image.pixels[0]
        image.filepath_raw = str(webp_path)
        image.file_format = "WEBP"
        image.save()
    finally:
        bpy.data.images.remove(image)


def ensure_texture_assets() -> None:
    """Generate deterministic tileable maps; these are generated, not Cycles-baked."""
    SOURCE_TEXTURE_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_TEXTURE_DIR.mkdir(parents=True, exist_ok=True)
    generators = {
        "body-black-normal-2k.png": lambda p: _write_png(p, 2048, 2048, 3, lambda y: _normal_row(2048, y, 0.035, 64)),
        "body-black-roughness-2k.png": lambda p: _write_png(p, 2048, 2048, 3, lambda y: _roughness_rgb_row(2048, y, 0.48, 0.025, 96)),
        "grip-rubber-normal-2k.png": lambda p: _write_png(p, 2048, 2048, 3, lambda y: _normal_row(2048, y, 0.16, 18)),
        "grip-rubber-roughness-2k.png": lambda p: _write_png(p, 2048, 2048, 3, lambda y: _roughness_rgb_row(2048, y, 0.72, 0.055, 24)),
        "internal-metal-roughness-1k.png": lambda p: _write_png(p, 1024, 1024, 3, lambda y: _roughness_rgb_row(1024, y, 0.38, 0.045, 52)),
        "decal-atlas-2k.png": _write_atlas,
    }
    for name, generator in generators.items():
        source = SOURCE_TEXTURE_DIR / name
        generator(source)
        public = PUBLIC_TEXTURE_DIR / name
        shutil.copyfile(source, public)
        _save_webp(public, PUBLIC_TEXTURE_DIR / name.replace(".png", ".webp"))


def _image_node(material: bpy.types.Material, filename: str, *, non_color: bool = True):
    path = SOURCE_TEXTURE_DIR / filename
    image = bpy.data.images.get(filename) or bpy.data.images.load(str(path))
    image.name = filename
    image.filepath = f"//textures/{filename}"
    if non_color:
        image.colorspace_settings.name = "Non-Color"
    node = material.node_tree.nodes.new("ShaderNodeTexImage")
    node.name = filename
    node.image = image
    node.extension = "REPEAT"
    return node


def _wire_surface_maps() -> None:
    for key, normal_name, roughness_name, strength in (
        ("body_black", "body-black-normal-2k.png", "body-black-roughness-2k.png", 0.08),
        ("grip_rubber", "grip-rubber-normal-2k.png", "grip-rubber-roughness-2k.png", 0.16),
    ):
        material = bpy.data.materials[key]
        principled = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
        normal_tex = _image_node(material, normal_name); normal_tex.location = (-620, -120)
        normal = material.node_tree.nodes.new("ShaderNodeNormalMap"); normal.inputs["Strength"].default_value = strength; normal.location = (-180, -120)
        material.node_tree.links.new(normal_tex.outputs["Color"], normal.inputs["Color"])
        material.node_tree.links.new(normal.outputs["Normal"], principled.inputs["Normal"])
        rough_tex = _image_node(material, roughness_name); rough_tex.location = (-620, 160)
        material.node_tree.links.new(rough_tex.outputs["Color"], principled.inputs["Roughness"])
    material = bpy.data.materials["brushed_shield"]
    principled = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    texture = _image_node(material, "internal-metal-roughness-1k.png"); texture.location = (-520, 80)
    material.node_tree.links.new(texture.outputs["Color"], principled.inputs["Roughness"])
    decal = bpy.data.materials["white_decal"]
    principled = next(node for node in decal.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    texture = _image_node(decal, "decal-atlas-2k.png", non_color=False); texture.location = (-520, 40)
    decal.node_tree.links.new(texture.outputs["Color"], principled.inputs["Base Color"])
    decal.node_tree.links.new(texture.outputs["Alpha"], principled.inputs["Alpha"])
    decal.surface_render_method = "DITHERED"


def _decal_mesh(label: str, center, size, plane: str, collection, parent) -> bpy.types.Object:
    cx, cy, cz = center; width, height = size
    if plane == "XZ":
        vertices = ((cx-width/2, cy, cz-height/2), (cx+width/2, cy, cz-height/2), (cx+width/2, cy, cz+height/2), (cx-width/2, cy, cz+height/2))
        uvs = ((0, 0), (1, 0), (1, 1), (0, 1))
    elif plane == "XZ_REAR":
        vertices = ((cx-width/2, cy, cz-height/2), (cx-width/2, cy, cz+height/2), (cx+width/2, cy, cz+height/2), (cx+width/2, cy, cz-height/2))
        uvs = ((0, 0), (0, 1), (1, 1), (1, 0))
    elif plane == "XY":
        vertices = ((cx-width/2, cy-height/2, cz), (cx+width/2, cy-height/2, cz), (cx+width/2, cy+height/2, cz), (cx-width/2, cy+height/2, cz))
        uvs = ((0, 0), (1, 0), (1, 1), (0, 1))
    else:
        vertices = ((cx, cy-width/2, cz-height/2), (cx, cy+width/2, cz-height/2), (cx, cy+width/2, cz+height/2), (cx, cy-width/2, cz+height/2))
        uvs = ((0, 0), (1, 0), (1, 1), (0, 1))
    mesh = bpy.data.meshes.new(f"Z50II_Decal_{label}_mesh")
    mesh.from_pydata(vertices, [], ((0, 1, 2, 3),)); mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    index = DECAL_LABELS.index(label); row, col = divmod(index, 5)
    u0, u1 = col / 5.0, (col + 1) / 5.0; v0, v1 = 1.0 - (row + 1) / 2.0, 1.0 - row / 2.0
    for loop, (unit_u, unit_v) in zip(mesh.polygons[0].loop_indices, uvs):
        uv_layer.data[loop].uv = (u0 + unit_u * (u1 - u0), v0 + unit_v * (v1 - v0))
    obj = bpy.data.objects.new(f"Z50II_Decal_{label}", mesh); collection.objects.link(obj)
    assign_material(obj, bpy.data.materials["white_decal"])
    obj["decalLabel"] = label; obj["surfaceOffsetMm"] = 0.05; obj["usesAtlas"] = "//textures/decal-atlas-2k.png"; obj["brandReferenceOnly"] = label in {"Nikon", "Z50II"}
    if parent is not None:
        # Decals are non-selectable overlays, not mechanical collision geometry.
        # The reference renderer uses this stable link to carry them with the
        # matching part during its metadata-driven exploded view.
        obj["attachedPartId"] = parent["partId"]
    return obj


def create_decals() -> None:
    for obj in list(bpy.data.objects):
        if obj.name.startswith("Z50II_Decal_"): bpy.data.objects.remove(obj, do_unlink=True)
    decal_collection = bpy.data.collections.get("Z50II_Decals")
    if decal_collection is None:
        decal_collection = bpy.data.collections.new("Z50II_Decals")
        bpy.context.scene.collection.children.link(decal_collection)
    parts = {obj.get("partId"): obj for obj in bpy.data.objects if obj.get("partId")}
    layouts = (
        ("Nikon", (0.0, -0.03330, 0.031), (0.020, 0.0050), "XZ", "Z50II-02-001"), ("Z50II", (-0.041, -0.03330, 0.021), (0.014, 0.0032), "XZ", "Z50II-02-001"),
        ("MENU", (0.041, 0.03330, 0.013), (0.010, 0.0028), "XZ_REAR", "Z50II-07-001"), ("DISP", (0.041, 0.03330, -0.002), (0.010, 0.0028), "XZ_REAR", "Z50II-07-001"),
        ("ISO", (0.038, -0.010, 0.04845), (0.008, 0.0030), "XY", "Z50II-02-003"), ("MODE", (-0.038, 0.002, 0.04845), (0.012, 0.0030), "XY", "Z50II-02-003"),
        ("USB", (0.05675, 0.007, 0.012), (0.010, 0.0030), "YZ", "Z50II-02-005"), ("HDMI", (0.05675, 0.017, 0.003), (0.012, 0.0030), "YZ", "Z50II-02-005"),
        ("MIC", (0.05675, 0.009, -0.010), (0.008, 0.0030), "YZ", "Z50II-02-005"), ("SENSOR", (0.0, -0.00305, 0.010), (0.012, 0.0028), "XZ", "Z50II-03-010"),
    )
    for label, center, size, plane, part_id in layouts:
        parent = parts.get(part_id)
        _decal_mesh(label, center, size, plane, decal_collection, parent)


def apply_material_system() -> None:
    for name in MATERIAL_SPECS:
        if bpy.data.materials.get(name) is None: _create_material(name)
    ensure_texture_assets(); _wire_surface_maps()
    fallback = bpy.data.materials["body_black"]
    for obj in bpy.data.objects:
        if obj.type == "MESH" and not obj.data.materials: assign_material(obj, fallback)
    create_decals()
    for obj in bpy.data.objects:
        if obj.get("partId"): obj["assembledMatrix"] = [value for row in obj.matrix_world for value in row]
