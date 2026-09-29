import { NextResponse } from "next/server";
import { inlineSafeImageTypes } from "@/services/file-types";

/**
 * Builds the response for a private file. Only raster images display inline; everything
 * else downloads. The browser may not guess a different type, and the sandbox policy stops
 * any content that slips through from running scripts on the portal's origin.
 */
export function privateFileResponse(content: Buffer, contentType: string, fileName: string) {
  const disposition = inlineSafeImageTypes.has(contentType) ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(content), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
