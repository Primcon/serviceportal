declare module "heic-convert" {
  export default function convert(input: { buffer: Uint8Array; format: "JPEG" | "PNG"; quality?: number }): Promise<ArrayBuffer>;
}
