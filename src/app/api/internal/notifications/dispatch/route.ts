import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { dispatchPendingNotifications } from "@/services/notifications";

export const dynamic = "force-dynamic";

function hasValidWorkerSecret(request: Request) {
  const configuredSecret = process.env.NOTIFICATION_WORKER_SECRET;
  const providedSecret = request.headers.get("x-notification-worker-secret");
  if (!configuredSecret || !providedSecret) return false;
  const configuredBuffer = Buffer.from(configuredSecret);
  const providedBuffer = Buffer.from(providedSecret);
  return configuredBuffer.length === providedBuffer.length && timingSafeEqual(configuredBuffer, providedBuffer);
}

export async function POST(request: Request) {
  if (!hasValidWorkerSecret(request)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? "25");
  const result = await dispatchPendingNotifications(Number.isFinite(limit) ? limit : 25);
  return NextResponse.json(result);
}