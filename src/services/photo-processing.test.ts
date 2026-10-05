import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { isHeic, preparePhoto } from "./photo-processing";

/** A detailed image, so compression has something to do, in the given format. */
async function photo(width: number, height: number, orientation?: number) {
  const noise = Buffer.alloc(width * height * 3);
  for (let index = 0; index < noise.length; index += 1) noise[index] = (index * 31 + (index >> 7) * 17) % 256;
  const image = sharp(noise, { raw: { width, height, channels: 3 } });
  return (orientation ? image.withMetadata({ orientation }) : image).jpeg({ quality: 95 }).toBuffer();
}

describe("preparePhoto", () => {
  it("makes a smaller viewing copy and a thumbnail, both WebP", async () => {
    const original = await photo(4000, 3000);
    const prepared = await preparePhoto(original);
    expect(prepared?.originalType).toBe("image/jpeg");
    const viewing = await sharp(prepared!.viewing).metadata();
    expect(viewing).toMatchObject({ format: "webp", width: 2400, height: 1800 });
    const thumbnail = await sharp(prepared!.thumbnail).metadata();
    expect(thumbnail).toMatchObject({ format: "webp", width: 480, height: 360 });
    expect(prepared!.viewing.length).toBeLessThan(original.length / 2);
  });

  it("turns a photo the right way up using the camera's orientation", async () => {
    // Orientation 6 is a phone held upright: the stored pixels are landscape, the photo is portrait.
    const prepared = await preparePhoto(await photo(1600, 1200, 6));
    expect(await sharp(prepared!.viewing).metadata()).toMatchObject({ width: 1200, height: 1600 });
  });

  it("doesn't enlarge a small photo", async () => {
    const prepared = await preparePhoto(await photo(800, 600));
    expect(await sharp(prepared!.viewing).metadata()).toMatchObject({ width: 800, height: 600 });
  });

  it("rejects files that aren't photos, whatever they're called", async () => {
    expect(await preparePhoto(Buffer.from("%PDF-1.7 not a photo"))).toBeNull();
    // Claims to be HEIC but holds nothing a decoder can read.
    expect(await preparePhoto(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(64)]))).toBeNull();
  });
});

describe("isHeic", () => {
  it("recognizes iPhone HEIC files by their header", () => {
    const header = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from(`ftyp${brand}`), Buffer.alloc(8)]);
    expect(isHeic(header("heic"))).toBe(true);
    expect(isHeic(header("mif1"))).toBe(true);
    expect(isHeic(header("avif"))).toBe(false);
    expect(isHeic(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false);
  });
});
