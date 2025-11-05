import fs from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";

const [,, inSvg, outPng, widthStr] = process.argv;
if (!inSvg || !outPng || !widthStr) {
  console.error("Usage: node tools/svg2png-resvg.mjs input.svg output.png width");
  process.exit(1);
}
const width = parseInt(widthStr, 10);
const svgRaw = await fs.readFile(inSvg, "utf8");
const resvg = new Resvg(svgRaw, { fitTo: { mode: "width", value: width } });
const png = resvg.render().asPng();
await fs.writeFile(outPng, png);
console.log("✓", outPng);
