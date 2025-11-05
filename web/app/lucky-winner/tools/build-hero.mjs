// tools/build-hero.mjs
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

sharp.cache(false);      // отключаем кеш sharp (меньше RAM)
sharp.concurrency(1);  

const SRC_SVG = "src/assets/hero.svg";                  // твой исходный SVG
const OUT_DIR = "public/hero";
const SIZES = [480, 720, 1080, 1440];                  // мобильный набор
const DENSITY = 220;                                   // dpi для качественной растеризации SVG
const BACKGROUND = { r: 0, g: 0, b: 0, alpha: 0 };     // прозрачный фон (если нужен непрозрачный — укажи alpha:1 и цвет)

const FORMATS = [
  { ext: "avif", toBuf: (img) => img.avif({ quality: 45, effort: 4 }) },
  { ext: "webp", toBuf: (img) => img.webp({ quality: 70 }) },
  { ext: "jpg",  toBuf: (img) => img.jpeg({ quality: 78, progressive: true }) },
];

if (!fs.existsSync(SRC_SVG)) {
  console.error(`[build-hero] Не найден SVG: ${SRC_SVG}`);
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  for (const w of SIZES) {
    const base = sharp(SRC_SVG, { density: DENSITY, limitInputPixels: false })
      .flatten({ background: BACKGROUND })       // если нужно «заполнить» прозрачность
      .resize({ width: w, withoutEnlargement: true });

    for (const { ext, toBuf } of FORMATS) {
      const out = path.join(OUT_DIR, `hero-${w}.${ext}`);
      await toBuf(base.clone()).toFile(out);
      console.log("✓", out);
    }
  }

  // LQIP (крошечный превью-кадр, можно использовать как placeholder)
  const lqipAvif = path.join(OUT_DIR, `hero-lqip.avif`);
  await sharp(SRC_SVG, { density: 50, limitInputPixels: false })
    .resize({ width: 24 })
    .avif({ quality: 30 })
    .toFile(lqipAvif);
  console.log("✓", lqipAvif);

  console.log("hero variants ready.");
})();
