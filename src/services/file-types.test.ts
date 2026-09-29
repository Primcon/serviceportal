import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { detectDocumentType, detectPhotoType, inlineSafeImageTypes } from "./file-types";

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

describe("detectPhotoType", () => {
  it("identifies real images by their contents", async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#fff" } }).png().toBuffer();
    const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    await expect(detectPhotoType(png)).resolves.toBe("image/png");
    await expect(detectPhotoType(jpeg)).resolves.toBe("image/jpeg");
  });

  it("rejects SVG and files that only claim to be images", async () => {
    await expect(detectPhotoType(svg)).resolves.toBeNull();
    await expect(detectPhotoType(Buffer.from("not an image"))).resolves.toBeNull();
  });
});

describe("detectDocumentType", () => {
  it("identifies common service documents", () => {
    expect(detectDocumentType(Buffer.from("%PDF-1.7\n..."), "Invoice.pdf")).toBe("application/pdf");
    expect(detectDocumentType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]), "Test results.xlsx")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(detectDocumentType(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]), "Customer email.msg")).toBe("application/vnd.ms-outlook");
    expect(detectDocumentType(Buffer.from("part,qty\nseal kit,1\n"), "parts.csv")).toBe("text/csv");
  });

  it("uses the contents, not the name, and refuses unsupported or disguised files", () => {
    expect(detectDocumentType(svg, "drawing.svg")).toBeNull();
    expect(detectDocumentType(Buffer.from("<html><script>alert(1)</script></html>"), "report.pdf")).toBeNull();
    expect(detectDocumentType(Buffer.from([0x4d, 0x5a, 0x90, 0]), "setup.exe")).toBeNull();
    expect(detectDocumentType(Buffer.from([0x50, 0x4b, 0x03, 0x04]), "archive.zip")).toBeNull();
    expect(detectDocumentType(Buffer.from([0x68, 0x69, 0x00, 0x00]), "binary.txt")).toBeNull();
  });
});

describe("inlineSafeImageTypes", () => {
  it("never allows SVG inline", () => {
    expect(inlineSafeImageTypes.has("image/svg+xml")).toBe(false);
  });
});
