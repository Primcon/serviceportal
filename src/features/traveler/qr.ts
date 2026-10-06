import QRCode from "qrcode";

/** The address a printed traveler's QR code opens: the work order in the staff workspace. */
export function workOrderAddress(workOrderId: string) {
  const origin = process.env.APP_ORIGIN || "http://localhost:3000";
  return `${origin.replace(/\/$/, "")}/workspace/work-orders/${workOrderId}`;
}

/** A QR code as an SVG image address, so it prints sharply at any size and needs no script. */
export async function qrCodeDataUri(text: string) {
  const svg = await QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
