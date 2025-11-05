// tools/build-claim.mjs
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

sharp.cache(false);
sharp.concurrency(1);

const FORCE = process.env.IMG_FORCE === "1"; // IMG_FORCE=1 npm run build:claim

const ITEMS = [
  {
    srcPng: "src/assets/claim-back-master-960.png", // фон модалки: мастер PNG
    outDir: "public/claim",
    baseName: "claim-back",
    sizes: [480, 720, 960],
    qualities: { avif: 42, webp: 68, jpg: 74 }
  },
  {
    srcPng: "src/assets/trophy-oops-master-480.png", // трофей: мастер PNG
    outDir: "public/claim",
    baseName: "trophy-oops",
    sizes: [240, 360, 480],
    qualities: { avif: 45, webp: 70, jpg: 78 }
  }
];

function mtimeMs(p) { try { return fs.statSync(p).mtimeMs; } catch { return 0; } }
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

async function buildOnce(src, out, transform) {
  if (!FORCE) {
    const srcTime = mtimeMs(src);
    const outTime = mtimeMs(out);
    if (outTime && outTime >= srcTime) {
      console.log("↷ skip", out);
      return;
    }
  }
  await transform.toFile(out);
  console.log("✓", out);
}

(async () => {
  for (const item of ITEMS) {
    const { srcPng, outDir, baseName, sizes, qualities } = item;

    if (!fs.existsSync(srcPng)) {
      console.warn(`[build-claim] PNG master missing: ${srcPng} (skip)`);
      continue; // не падаем, просто пропускаем
    }

    ensureDir(outDir);

    for (const w of sizes) {
      const base = sharp(srcPng).resize({ width: w, withoutEnlargement: true });

      await buildOnce(srcPng, path.join(outDir, `${baseName}-${w}.avif`),
        base.clone().avif({ quality: qualities.avif, effort: 4 })
      );
      await buildOnce(srcPng, path.join(outDir, `${baseName}-${w}.webp`),
        base.clone().webp({ quality: qualities.webp })
      );
      await buildOnce(srcPng, path.join(outDir, `${baseName}-${w}.jpg`),
        base.clone().jpeg({ quality: qualities.jpg, progressive: true })
      );
    }

    // LQIP
    await buildOnce(
      srcPng,
      path.join(outDir, `${baseName}-lqip.avif`),
      sharp(srcPng).resize({ width: 20 }).avif({ quality: 28, effort: 4 })
    );
  }

  console.log("claim assets ready.");
})();
