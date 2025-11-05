// tools/build-wall.mjs
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

sharp.cache(false);      // отключаем кеш sharp (меньше RAM)
sharp.concurrency(1); 

const SRC_SVG = "src/assets/Wall.svg";           // исходный SVG
const OUT_DIR = "public/wall";
const SIZES = [480, 720, 1080, 1440];            // мобильно-центричный набор
const DENSITY = 200;                              // dpi для растеризации SVG
const BG = { r: 0, g: 0, b: 0, alpha: 0 };       // прозрачный фон; сделай alpha:1 и цвет если нужен непрозрачный

const FORMATS = [
  { ext: "avif", toBuf: (img) => img.avif({ quality: 40, effort: 4 }) },   // можно смелее, это фон
  { ext: "webp", toBuf: (img) => img.webp({ quality: 65 }) },
  { ext: "jpg",  toBuf: (img) => img.jpeg({ quality: 72, progressive: true }) },
];

if (!fs.existsSync(SRC_SVG)) {
  console.error(`[build-wall] Не найден SVG: ${SRC_SVG}`);
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  for (const w of SIZES) {
    const base = sharp(SRC_SVG, { density: DENSITY, limitInputPixels: false })
      .flatten({ background: BG })
      .resize({ width: w, withoutEnlargement: true });

    for (const { ext, toBuf } of FORMATS) {
      const out = path.join(OUT_DIR, `wall-${w}.${ext}`);
      await toBuf(base.clone()).toFile(out);
      console.log("✓", out);
    }
  }

  // LQIP (крошечный превью)
  await sharp(SRC_SVG, { density: 50, limitInputPixels: false })
    .resize({ width: 24 })
    .avif({ quality: 28 })
    .toFile(path.join(OUT_DIR, "wall-lqip.avif"));

  console.log("wall variants ready.");
})();
