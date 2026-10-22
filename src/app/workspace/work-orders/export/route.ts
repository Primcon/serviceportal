import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { readWorkOrderFilters } from "@/features/work-orders/list-filters";
import { formatEnumLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/services/audit";
import { getActiveInternalUser } from "@/services/authorization";
import { getRequestActor } from "@/services/request-actor";
import { addSheet } from "@/services/reports";

export const dynamic = "force-dynamic";

/** A list longer than this belongs in a scheduled report instead. */
const maxRows = 5000;

/** Calendar dates are stored as midnight UTC; a spreadsheet cell shows them as that day. */
function calendarDay(date: Date | null) {
  return date ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())) : null;
}

/** The work order list, with the filters on screen, as a spreadsheet. */
export async function GET(request: Request) {
  if (!(await getRequestActor("employee"))) return NextResponse.redirect(new URL("/api/auth/employee/login", request.url));
  const user = await getActiveInternalUser();
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const { where, query } = readWorkOrderFilters(params, user.id);
  const workOrders = await prisma.workOrder.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: maxRows,
    select: {
      workOrderNumber: true, summary: true, priority: true, serviceType: true, condition: true, customerPurchaseOrder: true, rmaReference: true,
      receivedAt: true, promisedAt: true, shippedAt: true, completedAt: true, warrantyEndsAt: true, updatedAt: true,
      company: { select: { name: true } }, location: { select: { name: true } },
      equipment: { select: { productModel: true, serialNumber: true } },
      serviceStage: { select: { displayName: true } }, assignedTo: { select: { displayName: true } },
    },
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VacTech Service Portal";
  workbook.created = new Date();
  addSheet(workbook, "Work orders",
    ["WIP", "Customer", "Location", "Model", "Serial number", "Summary", "Stage", "Condition", "Priority", "Service type", "With", "Customer PO", "RMA", "Received", "Promised", "Shipped", "Completed", "Warranty ends", "Last updated"],
    workOrders.map((order) => [
      order.workOrderNumber, order.company.name, order.location?.name ?? null, order.equipment.productModel, order.equipment.serialNumber, order.summary,
      order.serviceStage.displayName, order.condition === "NORMAL" ? null : formatEnumLabel(order.condition), order.priority, order.serviceType,
      order.assignedTo?.displayName ?? null, order.customerPurchaseOrder, order.rmaReference,
      order.receivedAt, calendarDay(order.promisedAt), calendarDay(order.shippedAt), order.completedAt, calendarDay(order.warrantyEndsAt), order.updatedAt,
    ]));
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  await recordAudit(prisma, { actorUserId: user.id, eventType: "report.exported", entityType: "Report", metadata: { reportType: "WORK_ORDER_LIST", filters: query, rowCount: workOrders.length } });

  const body = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  const fileName = `vactech-work-orders-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(body, { headers: { "Content-Disposition": `attachment; filename="${fileName}"`, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Cache-Control": "no-store" } });
}
