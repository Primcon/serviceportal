import sharp from "sharp";

/** Raster image types a browser can display inline without running scripts. SVG is deliberately excluded. */
export const inlineSafeImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const photoFormats: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  tiff: "image/tiff",
  avif: "image/avif",
};

export const supportedPhotoDescription = "JPEG, PNG, HEIC, WebP, GIF, TIFF or AVIF";
export const supportedDocumentDescription = "PDF, Word, Excel, PowerPoint, Outlook message, CSV, text or image files";

/** Identifies a photo from its decoded contents. Returns null for anything that isn't a supported raster image. */
export async function detectPhotoType(content: Buffer): Promise<string | null> {
  try {
    const { format } = await sharp(content).metadata();
    return format ? photoFormats[format] ?? null : null;
  } catch {
    return null;
  }
}

function startsWith(content: Buffer, bytes: number[]) {
  return bytes.every((byte, index) => content[index] === byte);
}

function extensionOf(fileName: string) {
  const match = /\.([a-z0-9]+)$/i.exec(fileName);
  return match ? match[1].toLowerCase() : "";
}

const officeZipTypes: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const legacyOfficeTypes: Record<string, string> = {
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  ppt: "application/vnd.ms-powerpoint",
  msg: "application/vnd.ms-outlook",
};

const textTypes: Record<string, string> = {
  csv: "text/csv",
  txt: "text/plain",
};

/**
 * Identifies a document from its leading bytes, using the file extension only to tell apart
 * formats that share a container (Office files are zip or OLE archives). The browser's
 * declared type is never trusted. Returns null for unsupported or mismatched files.
 */
export function detectDocumentType(content: Buffer, fileName: string): string | null {
  const extension = extensionOf(fileName);
  if (startsWith(content, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (startsWith(content, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(content, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(content, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith(content, [0x52, 0x49, 0x46, 0x46]) && content.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (startsWith(content, [0x50, 0x4b, 0x03, 0x04])) return officeZipTypes[extension] ?? null;
  if (startsWith(content, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return legacyOfficeTypes[extension] ?? null;
  const textType = textTypes[extension];
  if (textType && !content.subarray(0, 8192).includes(0)) return textType;
  return null;
}
