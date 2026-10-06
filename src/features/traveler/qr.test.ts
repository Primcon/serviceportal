import { afterEach, describe, expect, it, vi } from "vitest";
import { qrCodeDataUri, workOrderAddress } from "./qr";

afterEach(() => vi.unstubAllEnvs());

describe("traveler QR code", () => {
  it("points at the work order on the portal's own address", () => {
    vi.stubEnv("APP_ORIGIN", "https://portal.example/");
    expect(workOrderAddress("abc")).toBe("https://portal.example/workspace/work-orders/abc");
  });

  it("is an SVG image that needs no script", async () => {
    const uri = await qrCodeDataUri("https://portal.example/workspace/work-orders/abc");
    expect(uri.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const svg = Buffer.from(uri.split(",")[1], "base64").toString();
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("<script");
  });
});
