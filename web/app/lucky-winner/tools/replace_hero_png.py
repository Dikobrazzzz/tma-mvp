import base64
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

svg_in = ROOT / "src/assets/Image man.original.svg"
svg_out = ROOT / "src/assets/Image man.optimized.svg"

# новые, пережатые PNG
png_files = [
    ROOT / "public/hero/image0-q.png",
    ROOT / "public/hero/image1-q.png",
]

data = svg_in.read_text(encoding="utf-8")

# Ищем все xlink:href="data:image/png;base64,..."
pattern = re.compile(r'(xlink:href="data:image/png;base64,)([^"]+)(")')

counter = {"i": 0}

def repl(match):
    i = counter["i"]
    if i >= len(png_files):
        # на всякий случай: если в SVG больше картинок, чем мы ожидаем
        return match.group(0)
    png_data = png_files[i].read_bytes()
    b64 = base64.b64encode(png_data).decode("ascii")
    counter["i"] += 1
    return match.group(1) + b64 + match.group(3)

new_data = pattern.sub(repl, data)

svg_out.write_text(new_data, encoding="utf-8")
print(f"Written {svg_out}, replaced {counter['i']} images.")
