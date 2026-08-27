"""Deterministic glTF-safe PBR materials and decal/microdetail assets."""

from __future__ import annotations

from hashlib import sha256
import json
from math import cos, pi, sin
from pathlib import Path
import shutil
import struct
from typing import Callable, Sequence
import zlib

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_TEXTURE_DIR = ROOT / "artifacts" / "textures"
PUBLIC_TEXTURE_DIR = ROOT / "public" / "assets" / "textures"
DECAL_LABELS = ("Nikon", "Z50II", "MENU", "DISP", "ISO", "MODE", "USB", "HDMI", "MIC", "SENSOR")
DECAL_KINDS = {
    "Nikon": "brand-wordmark",
    "Z50II": "model-wordmark",
    "MENU": "button-legend",
    "DISP": "button-legend",
    "ISO": "button-legend",
    "MODE": "mode-dial-markings",
    "USB": "usb-port-icon",
    "HDMI": "hdmi-port-icon",
    "MIC": "microphone-port-icon",
    "SENSOR": "sensor-warning-icon",
}

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
    if name == "sensor_glass":
        # Blender 4.5 exposes glTF-exportable thin-film/iridescence controls on
        # the one Principled node. A 420 nm layer gives the low-roughness sensor
        # cover a restrained cyan-to-magenta shift with viewing angle.
        _set_input(principled, "Thin Film Thickness", 420.0)
        _set_input(principled, "Thin Film IOR", 1.34)
        _set_input(principled, "Coat Tint", (0.92, 0.72, 1.0, 1.0))
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


FONT = {
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"), "B": ("11110", "10001", "10001", "11110", "10001", "10001", "11110"),
    "C": ("01111", "10000", "10000", "10000", "10000", "10000", "01111"),
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

    def paint(x: int, y: int, radius: int = 0) -> None:
        for py in range(max(0, y - radius), min(height, y + radius + 1)):
            for px in range(max(0, x - radius), min(width, x + radius + 1)):
                offset = (py * width + px) * 4
                pixels[offset : offset + 4] = b"\xff\xff\xff\xff"

    def line(x0: int, y0: int, x1: int, y1: int, thickness: int = 4) -> None:
        steps = max(abs(x1 - x0), abs(y1 - y0), 1)
        for step in range(steps + 1):
            fraction = step / steps
            paint(round(x0 + (x1 - x0) * fraction), round(y0 + (y1 - y0) * fraction), thickness)

    def text(value: str, x0: int, y0: int, scale: int) -> None:
        for char_index, char in enumerate(value):
            glyph = FONT[char]
            for gy, glyph_row in enumerate(glyph):
                for gx, bit in enumerate(glyph_row):
                    if bit == "1":
                        for sy in range(scale):
                            for sx in range(scale):
                                paint(x0 + char_index * 6 * scale + gx * scale + sx, y0 + gy * scale + sy)

    for index, label in enumerate(DECAL_LABELS):
        row_index, col_index = divmod(index, 5)
        cell_x, cell_y = col_index * cell_w, row_index * cell_h
        center_x, center_y = cell_x + cell_w // 2, cell_y + cell_h // 2
        if label in {"Nikon", "Z50II", "MENU", "DISP", "ISO"}:
            value = label.upper()
            scale = 14 if len(value) <= 5 else 10
            text_w = len(value) * 6 * scale - scale
            text(value, cell_x + (cell_w - text_w) // 2, cell_y + (cell_h - 7 * scale) // 2, scale)
        elif label == "MODE":
            # Circular dial arc, radial index marks, and the familiar M/A/S/P
            # exposure-mode lettering—not the placeholder word "MODE".
            radius = 142
            for tick in range(9):
                angle = (-0.82 + tick * 0.205) * pi
                inner = radius - (28 if tick % 2 == 0 else 18)
                line(
                    round(center_x + inner * cos(angle)), round(center_y + inner * sin(angle)),
                    round(center_x + radius * cos(angle)), round(center_y + radius * sin(angle)), 4,
                )
            text("MASP", center_x - 46, center_y + 22, 7)
        elif label == "USB":
            # USB trident: central stem, arrow, square, and circular terminals.
            line(center_x, center_y + 110, center_x, center_y - 75, 6)
            line(center_x, center_y - 15, center_x - 92, center_y - 70, 6)
            line(center_x, center_y + 34, center_x + 92, center_y - 18, 6)
            line(center_x - 92, center_y - 70, center_x - 92, center_y - 98, 6)
            line(center_x - 108, center_y - 98, center_x - 76, center_y - 98, 6)
            paint(center_x + 92, center_y - 18, 14)
            line(center_x, center_y - 75, center_x - 14, center_y - 47, 6)
            line(center_x, center_y - 75, center_x + 14, center_y - 47, 6)
        elif label == "HDMI":
            # Type-D HDMI outline with a compact contact row.
            outline = ((center_x - 120, center_y - 55), (center_x + 120, center_y - 55),
                       (center_x + 88, center_y + 65), (center_x - 88, center_y + 65))
            for start, end in zip(outline, outline[1:] + outline[:1]):
                line(*start, *end, 6)
            for pin in range(7):
                x = center_x - 72 + pin * 24
                line(x, center_y - 8, x, center_y + 20, 3)
        elif label == "MIC":
            # Microphone capsule/icon plus literal MIC lettering. The explicit
            # C glyph prevents the old fallback that visibly rendered “MIO”.
            for angle_step in range(33):
                angle = 2.0 * pi * angle_step / 32.0
                paint(round(center_x + 42 * cos(angle)), round(center_y - 55 + 70 * sin(angle)), 5)
            line(center_x - 70, center_y - 25, center_x - 55, center_y + 38, 5)
            line(center_x + 70, center_y - 25, center_x + 55, center_y + 38, 5)
            line(center_x - 55, center_y + 38, center_x + 55, center_y + 38, 5)
            line(center_x, center_y + 38, center_x, center_y + 82, 5)
            line(center_x - 48, center_y + 82, center_x + 48, center_y + 82, 5)
            text("MIC", center_x - 53, center_y + 112, 6)
        else:
            # Sensor warning: outlined hazard triangle and exclamation mark.
            triangle = ((center_x, center_y - 132), (center_x + 125, center_y + 94), (center_x - 125, center_y + 94))
            for start, end in zip(triangle, triangle[1:] + triangle[:1]):
                line(*start, *end, 7)
            line(center_x, center_y - 58, center_x, center_y + 28, 8)
            paint(center_x, center_y + 62, 9)
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


BAKE_SPECS = {
    "body-black-normal-2k.png": (2048, "NORMAL", 0.48, 0.025, 54.0, 0.08),
    "body-black-roughness-2k.png": (2048, "EMIT", 0.48, 0.025, 54.0, 0.08),
    "grip-rubber-normal-2k.png": (2048, "NORMAL", 0.72, 0.055, 18.0, 0.16),
    "grip-rubber-roughness-2k.png": (2048, "EMIT", 0.72, 0.055, 18.0, 0.16),
    "internal-metal-roughness-1k.png": (1024, "EMIT", 0.38, 0.045, 42.0, 0.06),
}


def _bake_manifest_is_current(path: Path) -> bool:
    if not path.is_file():
        return False
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    if manifest.get("engine") != "CYCLES" or manifest.get("operator") != "bpy.ops.object.bake":
        return False
    if manifest.get("blenderVersion") != ".".join(str(value) for value in bpy.app.version):
        return False
    records = manifest.get("maps", {})
    if set(records) != set(BAKE_SPECS):
        return False
    for filename, (_size, pass_type, *_rest) in BAKE_SPECS.items():
        texture = SOURCE_TEXTURE_DIR / filename
        if not texture.is_file() or records[filename].get("passType") != pass_type:
            return False
        if records[filename].get("sha256") != sha256(texture.read_bytes()).hexdigest():
            return False
    return True


def _bake_surface_maps() -> None:
    """Bake procedural micro-surface maps with Cycles into exportable PNGs."""
    manifest_path = SOURCE_TEXTURE_DIR / "bake-manifest.json"
    if _bake_manifest_is_current(manifest_path):
        return

    scene = bpy.context.scene
    old_engine = scene.render.engine
    old_samples = scene.cycles.samples
    old_margin = scene.render.bake.margin
    old_selected = list(bpy.context.selected_objects)
    old_active = bpy.context.view_layer.objects.active
    mesh = bpy.data.meshes.new("Task8_Bake_Plane_mesh")
    mesh.from_pydata(((-1.0, -1.0, 0.0), (1.0, -1.0, 0.0), (1.0, 1.0, 0.0), (-1.0, 1.0, 0.0)), (), ((0, 1, 2, 3),))
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for loop, uv in zip(mesh.polygons[0].loop_indices, ((0, 0), (1, 0), (1, 1), (0, 1))):
        uv_layer.data[loop].uv = uv
    bake_object = bpy.data.objects.new("Task8_Bake_Plane", mesh)
    scene.collection.objects.link(bake_object)
    material = bpy.data.materials.new("Task8_Bake_Material")
    material.use_nodes = True
    bake_object.data.materials.append(material)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 1
    scene.render.bake.margin = 16
    bpy.ops.object.select_all(action="DESELECT")
    bake_object.select_set(True)
    bpy.context.view_layer.objects.active = bake_object
    records = {}
    try:
        for filename, (size, pass_type, center, amplitude, scale, bump_strength) in BAKE_SPECS.items():
            nodes = material.node_tree.nodes
            nodes.clear()
            output = nodes.new("ShaderNodeOutputMaterial")
            principled = nodes.new("ShaderNodeBsdfPrincipled")
            texcoord = nodes.new("ShaderNodeTexCoord")
            mapping = nodes.new("ShaderNodeMapping")
            noise = nodes.new("ShaderNodeTexNoise")
            noise.noise_dimensions = "2D"
            noise.inputs["Scale"].default_value = scale
            noise.inputs["Detail"].default_value = 5.0
            noise.inputs["Roughness"].default_value = 0.72
            material.node_tree.links.new(texcoord.outputs["UV"], mapping.inputs["Vector"])
            material.node_tree.links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
            material.node_tree.links.new(principled.outputs["BSDF"], output.inputs["Surface"])
            if pass_type == "NORMAL":
                bump = nodes.new("ShaderNodeBump")
                bump.inputs["Strength"].default_value = bump_strength
                bump.inputs["Distance"].default_value = 0.08
                material.node_tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
                material.node_tree.links.new(bump.outputs["Normal"], principled.inputs["Normal"])
            else:
                value_range = nodes.new("ShaderNodeMapRange")
                value_range.inputs["From Min"].default_value = 0.0
                value_range.inputs["From Max"].default_value = 1.0
                value_range.inputs["To Min"].default_value = center - amplitude
                value_range.inputs["To Max"].default_value = center + amplitude
                material.node_tree.links.new(noise.outputs["Fac"], value_range.inputs["Value"])
                material.node_tree.links.new(value_range.outputs["Result"], principled.inputs["Emission Color"])
                principled.inputs["Emission Strength"].default_value = 1.0

            image = bpy.data.images.new(f"Task8_Bake_{filename}", width=size, height=size, alpha=False, float_buffer=False)
            image.colorspace_settings.name = "Non-Color"
            image.filepath_raw = str(SOURCE_TEXTURE_DIR / filename)
            image.file_format = "PNG"
            target = nodes.new("ShaderNodeTexImage")
            target.image = image
            nodes.active = target
            target.select = True
            bpy.ops.object.bake(type=pass_type, use_clear=True, margin=16)
            image.save()
            bpy.data.images.remove(image)
            texture = SOURCE_TEXTURE_DIR / filename
            records[filename] = {
                "passType": pass_type,
                "sourceNodes": ["ShaderNodeTexCoord", "ShaderNodeMapping", "ShaderNodeTexNoise"],
                "sha256": sha256(texture.read_bytes()).hexdigest(),
            }
            print(f"Cycles-baked {filename}: {size}x{size}, pass={pass_type}")
    finally:
        bpy.data.objects.remove(bake_object, do_unlink=True)
        bpy.data.meshes.remove(mesh)
        bpy.data.materials.remove(material)
        scene.render.engine = old_engine
        scene.cycles.samples = old_samples
        scene.render.bake.margin = old_margin
        bpy.ops.object.select_all(action="DESELECT")
        for obj in old_selected:
            if obj.name in bpy.data.objects:
                obj.select_set(True)
        if old_active and old_active.name in bpy.data.objects:
            bpy.context.view_layer.objects.active = old_active

    manifest = {
        "engine": "CYCLES",
        "operator": "bpy.ops.object.bake",
        "blenderVersion": ".".join(str(value) for value in bpy.app.version),
        "maps": records,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def ensure_texture_assets() -> None:
    """Create the authored atlas and real Cycles-baked surface maps."""
    SOURCE_TEXTURE_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_TEXTURE_DIR.mkdir(parents=True, exist_ok=True)
    _bake_surface_maps()
    _write_atlas(SOURCE_TEXTURE_DIR / "decal-atlas-2k.png")
    for name in (*BAKE_SPECS, "decal-atlas-2k.png"):
        source = SOURCE_TEXTURE_DIR / name
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
    decal.use_backface_culling = True


def _project_to_surface(surface: bpy.types.Object, point: Vector, outward: Vector) -> Vector:
    evaluated = surface.evaluated_get(bpy.context.evaluated_depsgraph_get())
    inverse = evaluated.matrix_world.inverted()
    origin_world = point + outward * 0.03
    origin_local = inverse @ origin_world
    direction_local = (inverse.to_3x3() @ -outward).normalized()
    hit, location, normal, _face = evaluated.ray_cast(origin_local, direction_local, distance=0.08)
    assert hit, f"decal projection missed {surface.name} at {tuple(round(value, 5) for value in point)}"
    world_location = evaluated.matrix_world @ location
    world_normal = (evaluated.matrix_world.inverted().transposed().to_3x3() @ normal).normalized()
    if world_normal.dot(outward) < 0.0:
        world_normal.negate()
    return world_location + world_normal * 0.00005


def _decal_mesh(label: str, center, size, outward, collection, parent, surface_name: str | None = None) -> bpy.types.Object:
    center = Vector(center)
    outward = Vector(outward).normalized()
    width, height = size
    if outward.y < -0.5:
        tangent_u, tangent_v = Vector((1, 0, 0)), Vector((0, 0, 1))
    elif outward.y > 0.5:
        tangent_u, tangent_v = Vector((-1, 0, 0)), Vector((0, 0, 1))
    elif outward.z > 0.5:
        tangent_u, tangent_v = Vector((1, 0, 0)), Vector((0, 1, 0))
    elif outward.x > 0.5:
        tangent_u, tangent_v = Vector((0, 1, 0)), Vector((0, 0, 1))
    else:
        raise AssertionError(f"unsupported decal outward normal: {tuple(outward)}")
    surface = bpy.data.objects[surface_name] if surface_name else parent
    nominal = (
        center - tangent_u * width / 2 - tangent_v * height / 2,
        center + tangent_u * width / 2 - tangent_v * height / 2,
        center + tangent_u * width / 2 + tangent_v * height / 2,
        center - tangent_u * width / 2 + tangent_v * height / 2,
    )
    vertices = [tuple(_project_to_surface(surface, point, outward)) for point in nominal]
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
    obj["decalKind"] = DECAL_KINDS[label]
    obj["surfaceObject"] = surface.name
    obj["projectionMethod"] = "evaluated-host-raycast"
    if parent is not None:
        obj["attachedPartId"] = parent["partId"]
        world_matrix = obj.matrix_world.copy()
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
        obj.matrix_world = world_matrix
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
        ("Nikon", (0.003, 0.0160, 0.0548), (0.0180, 0.0040), (0, 0, 1), "Z50II-02-003", "Z50II_evf_housing"),
        ("Z50II", (-0.0410, -0.0001, 0.0140), (0.0120, 0.0028), (0, -1, 0), "Z50II-02-001", None),
        ("MENU", (-0.0390, 0.0369, 0.0180), (0.0034, 0.0010), (0, 1, 0), "Z50II-07-008", None),
        ("DISP", (-0.0390, 0.03745, -0.0075), (0.0038, 0.0010), (0, 1, 0), "Z50II-07-011", None),
        ("ISO", (-0.0380, 0.0160, 0.0381), (0.0070, 0.0025), (0, 0, 1), "Z50II-02-003", None),
        ("MODE", (0.0350, 0.0180, 0.04045), (0.0120, 0.0120), (0, 0, 1), "Z50II-02-014", None),
        ("USB", (0.05675, 0.0135, 0.0130), (0.0045, 0.0025), (1, 0, 0), "Z50II-02-008", None),
        ("HDMI", (0.05675, 0.0185, 0.0070), (0.0055, 0.0024), (1, 0, 0), "Z50II-02-008", None),
        ("MIC", (0.05675, 0.0160, -0.0105), (0.0060, 0.0030), (1, 0, 0), "Z50II-02-009", None),
        ("SENSOR", (0.0, 0.0124, 0.0045), (0.0040, 0.0030), (0, -1, 0), "Z50II-03-010", None),
    )
    for label, center, size, outward, part_id, surface_name in layouts:
        parent = parts.get(part_id)
        _decal_mesh(label, center, size, outward, decal_collection, parent, surface_name)


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
