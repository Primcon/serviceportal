import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { dispatchDueReportSchedules } from "@/services/report-dispatch";

export const dynamic = "force-dynamic";

function hasValidWorkerSecret(request: Request) {
  const configuredSecret = process.env.REPORT_WORKER_SECRET;
  const providedSecret = request.headers.get("x-report-worker-secret");
  if (!configuredSecret || !providedSecret) return false;
  const configuredBuffer = Buffer.from(configuredSecret);
  const providedBuffer = Buffer.from(providedSecret);
  return configuredBuffer.length === providedBuffer.length && timingSafeEqual(configuredBuffer, providedBuffer);
}

export async function POST(request: Request) {
  if (!hasValidWorkerSecret(request)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? "10");
  return NextResponse.json(await dispatchDueReportSchedules(Number.isFinite(limit) ? limit : 10));
}