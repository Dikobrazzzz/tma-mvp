import fs from "node:fs/promises";
import puppeteer from "puppeteer";

const [,, inSvg, outPng, widthStr] = process.argv;
if (!inSvg || !outPng || !widthStr) {
  console.error("Usage: node tools/svg2png.mjs input.svg output.png width");
  process.exit(1);
}
const width = parseInt(widthStr, 10);
const svgRaw = await fs.readFile(inSvg, "utf8");

// Пытаемся вычислить высоту по viewBox, иначе 4:3
const m = svgRaw.match(/viewBox\s*=\s*"[\d.\-]+\s+[\d.\-]+\s+([\d.\-]+)\s+([\d.\-]+)"/i);
let height = Math.round(width * 0.75);
if (m) {
  const vbW = parseFloat(m[1]), vbH = parseFloat(m[2]);
  if (vbW > 0 && vbH > 0) height = Math.round(width * (vbH / vbW));
}
const html = `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:transparent}svg{width:${width}px;height:${height}px;display:block}</style>
${svgRaw}`;

const browser = await puppeteer.launch({ args: ["--no-sandbox","--disable-setuid-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.screenshot({ path: outPng, type: "png" });
  console.log("✓", outPng);
} finally {
  await browser.close();
}
