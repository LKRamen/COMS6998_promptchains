import "server-only";
import sharp from "sharp";
import { access } from "node:fs/promises";
import path from "node:path";

function escapeXml(text: string) {
  return text.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
}
export async function renderMeme(
  source: Buffer,
  caption: string,
): Promise<Buffer> {
  if (!caption.trim() || caption.trim().length > 240)
    throw new Error("Use 1–240 characters for your caption.");
  // Serverless hosts have no system fonts. Ship and explicitly load our licensed font.
  const fontfile = path.join(
    process.cwd(),
    "assets",
    "fonts",
    "NotoSans-Bold.ttf",
  );
  await access(fontfile);
  // Pango wraps actual glyph widths and long unbroken words.
  const text = await sharp({
    text: {
      text: `<span foreground="white">${escapeXml(caption.replace(/\s+/g, " ").trim())}</span>`,
      font: "Noto Sans Bold 46",
      fontfile,
      width: 972,
      rgba: true,
      wrap: "word-char",
      spacing: 12,
    },
  })
    .png()
    .toBuffer();
  const textMeta = await sharp(text).metadata();
  const band = (textMeta.height ?? 58) + 80;
  const photo = await sharp(source, { limitInputPixels: 20_000_000 })
    .rotate()
    .resize({ width: 1080, height: 1080, fit: "inside" })
    .jpeg()
    .toBuffer();
  const meta = await sharp(photo).metadata();
  const height = (meta.height ?? 720) + band;
  return sharp({
    create: { width: 1080, height, channels: 3, background: "#101012" },
  })
    .composite([
      { input: text, top: 40, left: 54 },
      {
        input: photo,
        top: band,
        left: Math.floor((1080 - (meta.width ?? 1080)) / 2),
      },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}
