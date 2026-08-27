"""Generate the neutral 1024x512 Radiance studio environment deterministically."""

from __future__ import annotations

from math import exp, frexp
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "public" / "assets" / "environment" / "studio-neutral-1k.hdr"
WIDTH, HEIGHT = 1024, 512


def rgbe(red: float, green: float, blue: float) -> bytes:
    peak = max(red, green, blue)
    if peak < 1.0e-32:
        return b"\0\0\0\0"
    mantissa, exponent = frexp(peak)
    scale = mantissa * 256.0 / peak
    return bytes((min(255, int(red * scale)), min(255, int(green * scale)), min(255, int(blue * scale)), exponent + 128))


def wrapped_distance(a: float, b: float) -> float:
    return min(abs(a - b), 1.0 - abs(a - b))


def studio_pixel(u: float, v: float) -> tuple[float, float, float]:
    horizon = 0.11 + 0.18 * max(0.0, 1.0 - abs(v - 0.54) * 2.0)
    floor = 0.055 + 0.035 * max(0.0, v - 0.55)
    base = horizon + floor
    lights = (
        (0.30, 0.30, 0.075, 0.095, 15.0, (1.0, 0.92, 0.82)),
        (0.69, 0.39, 0.12, 0.14, 5.0, (0.78, 0.88, 1.0)),
        (0.52, 0.19, 0.045, 0.12, 18.0, (0.74, 0.84, 1.0)),
    )
    red = green = blue = base
    for lu, lv, su, sv, energy, color in lights:
        distance = (wrapped_distance(u, lu) / su) ** 2 + ((v - lv) / sv) ** 2
        contribution = energy * exp(-2.6 * distance)
        red += contribution * color[0]
        green += contribution * color[1]
        blue += contribution * color[2]
    return red, green, blue


def write_hdr(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as handle:
        handle.write(b"#?RADIANCE\n")
        handle.write(b"# Analytic neutral product studio; linear RGB, reference visualization\n")
        handle.write(b"FORMAT=32-bit_rle_rgbe\n\n")
        handle.write(f"-Y {HEIGHT} +X {WIDTH}\n".encode("ascii"))
        for y in range(HEIGHT):
            v = (y + 0.5) / HEIGHT
            scanline = []
            for x in range(WIDTH):
                u = (x + 0.5) / WIDTH
                scanline.append(rgbe(*studio_pixel(u, v)))
            handle.write(bytes((2, 2, WIDTH >> 8, WIDTH & 255)))
            for channel in range(4):
                values = bytes(pixel[channel] for pixel in scanline)
                for start in range(0, WIDTH, 127):
                    literal = values[start : start + 127]
                    handle.write(bytes((len(literal),)))
                    handle.write(literal)


if __name__ == "__main__":
    write_hdr(OUTPUT)
    print(f"Radiance HDR generated: {OUTPUT} ({WIDTH}x{HEIGHT}, analytic dynamic range 0.055-18.0)")
