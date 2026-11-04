import "server-only";
import sharp from "sharp";
export async function normalizePhoto(file: File): Promise<Buffer> {
  const formats: Record<string, string> = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
  };
  if (!file.size || file.size > 5 * 1024 * 1024 || !formats[file.type])
    throw new Error("Choose a JPEG, PNG or WebP photo under 5 MiB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const image = sharp(bytes, {
      limitInputPixels: 20_000_000,
      animated: false,
      failOn: "warning",
    });
    const metadata = await image.metadata();
    if (metadata.format !== formats[file.type] || (metadata.pages ?? 1) > 1)
      throw new Error("Invalid photo");
    return await image
      .rotate()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw new Error(
      "That photo could not be read. Use a still JPEG, PNG or WebP under 20 megapixels.",
    );
  }
}
