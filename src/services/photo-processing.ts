import sharp from "sharp";
import { detectPhotoType } from "@/services/file-types";

/** The largest photo accepted. Current phone cameras produce 3 to 15 MB; this leaves room for high-resolution modes. */
export const maxPhotoBytes = 40 * 1024 * 1024;

/**
 * The version everyone looks at: large enough to zoom in on a nameplate, about a tenth the
 * size of the original. The original itself goes to archive storage.
 */
const viewingWidth = 2400;
const viewingQuality = 80;
const thumbnailSize = 480;

const heicBrands = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

/** True for HEIC/HEIF files, the default format of iPhone cameras, which sharp can't decode. */
export function isHeic(content: Buffer) {
  return content.subarray(4, 8).toString("latin1") === "ftyp" && heicBrands.has(content.subarray(8, 12).toString("latin1"));
}

async function heicToJpeg(content: Buffer) {
  // Loaded only when needed: the decoder is a large WebAssembly module.
  const { default: convert } = await import("heic-convert");
  return Buffer.from(await convert({ buffer: content, format: "JPEG", quality: 0.92 }));
}

export type PreparedPhoto = {
  /** The real type of the uploaded file, from its contents. */
  originalType: string;
  viewing: Buffer;
  thumbnail: Buffer;
};

/**
 * Checks an upload is a real photo and makes its viewing copy and thumbnail (both WebP).
 * Returns null for anything that isn't a supported image.
 */
export async function preparePhoto(content: Buffer): Promise<PreparedPhoto | null> {
  let originalType = await detectPhotoType(content);
  let decodable = content;
  if (!originalType && isHeic(content)) {
    try {
      decodable = await heicToJpeg(content);
    } catch {
      return null;
    }
    originalType = "image/heic";
  }
  if (!originalType) return null;

  try {
    // rotate() applies the orientation the camera recorded, so photos aren't stored sideways.
    const image = sharp(decodable).rotate();
    const [viewing, thumbnail] = await Promise.all([
      image.clone().resize({ width: viewingWidth, height: viewingWidth, fit: "inside", withoutEnlargement: true }).webp({ quality: viewingQuality }).toBuffer(),
      image.clone().resize({ width: thumbnailSize, height: thumbnailSize, fit: "inside", withoutEnlargement: true }).webp({ quality: 76 }).toBuffer(),
    ]);
    return { originalType, viewing, thumbnail };
  } catch {
    return null;
  }
}
