import { CustomerFacingStatus, ReportType, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveInternalUserForRoles } from "@/services/authorization";
import { getRequestActor } from "@/services/request-actor";
import { generateReportWorkbook } from "@/services/reports";

export const dynamic = "force-dynamic";

const reportTypeSchema = z.nativeEnum(ReportType);

function queryDate(value: string | null, endOfDay = false) {
  if (!value) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

export async function GET(request: Request) {
  const requestActor = await getRequestActor("employee");
  if (!requestActor) return NextResponse.redirect(new URL("/api/auth/employee/login", request.url));
  const actor = await getActiveInternalUserForRoles([UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER]);
  const searchParams = new URL(request.url).searchParams;
  const reportType = reportTypeSchema.parse(searchParams.get("reportType") ?? "");
  const companyId = searchParams.get("companyId")?.trim();
  const statuses = searchParams.getAll("statuses").filter((status): status is CustomerFacingStatus => Object.values(CustomerFacingStatus).includes(status as CustomerFacingStatus));
  const filters = { ...(companyId ? { companyId } : {}), ...(queryDate(searchParams.get("from")) ? { from: queryDate(searchParams.get("from")) } : {}), ...(queryDate(searchParams.get("to"), true) ? { to: queryDate(searchParams.get("to"), true) } : {}), ...(statuses.length ? { statuses } : {}) };
  const report = await generateReportWorkbook(reportType, filters);
  await prisma.auditEvent.create({ data: { actorUserId: actor.id, eventType: "report.exported", entityType: "Report", metadata: { reportType, filters, rowCount: report.rowCount } } });
  const body = report.buffer.buffer.slice(report.buffer.byteOffset, report.buffer.byteOffset + report.buffer.byteLength) as ArrayBuffer;
  return new NextResponse(body, { headers: { "Content-Disposition": `attachment; filename="${report.fileName}"`, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
}