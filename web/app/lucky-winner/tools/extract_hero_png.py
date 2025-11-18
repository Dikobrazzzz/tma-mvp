import re
import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # /opt/tma-mvp/web/app/lucky-winner
svg_path = ROOT / "src/assets/Image man.svg"
out_dir = ROOT / "public/hero"
out_dir.mkdir(parents=True, exist_ok=True)

data = svg_path.read_text(encoding="utf-8")

pattern = re.compile(r'xlink:href="data:image/png;base64,([^"]+)"')

for idx, match in enumerate(pattern.finditer(data)):
    b64 = match.group(1)
    out_file = out_dir / f"image{idx}.png"
    print(f"[+] write {out_file}")
    out_file.write_bytes(base64.b64decode(b64))

print("Done.")
