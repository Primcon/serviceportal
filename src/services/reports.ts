import ExcelJS from "exceljs";
import { CustomerFacingStatus, Prisma, ReportType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ReportFilters = {
  companyId?: string;
  from?: Date;
  to?: Date;
  statuses?: CustomerFacingStatus[];
};

type GeneratedReport = {
  buffer: Buffer;
  fileName: string;
  rowCount: number;
};

function dateForFileName(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function reportFileName(reportType: ReportType) {
  const label = reportType.toLowerCase().replaceAll("_", "-");
  return `vactech-${label}-${dateForFileName()}.xlsx`;
}

function dateRange(column: "createdAt" | "updatedAt", filters: ReportFilters) {
  if (!filters.from && !filters.to) return {};
  return {
    [column]: {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    },
  };
}

function preventFormulaInjection(value: string | null | undefined) {
  if (!value) return value ?? "";
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function addSheet(workbook: ExcelJS.Workbook, name: string, headers: string[], rows: (string | number | Date | null)[][]) {
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(row.map((value) => typeof value === "string" ? preventFormulaInjection(value) : value));
  }
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEA3435" } };
  header.alignment = { vertical: "middle" };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: { row: 1, column: headers.length } };
  headers.forEach((headerName, index) => {
    const longestValue = Math.max(headerName.length, ...rows.map((row) => String(row[index] ?? "").length));
    sheet.getColumn(index + 1).width = Math.min(Math.max(longestValue + 2, 12), 40);
  });
}

export async function generateReportWorkbook(reportType: ReportType, filters: ReportFilters = {}): Promise<GeneratedReport> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VacTech Service Portal";
  workbook.created = new Date();

  if (reportType === ReportType.WORK_ORDERS) {
    const where: Prisma.WorkOrderWhereInput = {
      ...(filters.companyId ? { companyId: filters.companyId } : {}),
      ...(filters.statuses?.length ? { customerFacingStatus: { in: filters.statuses } } : {}),
      ...dateRange("createdAt", filters),
    };
    const workOrders = await prisma.workOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: { workOrderNumber: true, summary: true, serviceType: true, priority: true, receivedAt: true, completedAt: true, customerFacingStatus: true, condition: true, createdAt: true, updatedAt: true, company: { select: { name: true } }, location: { select: { name: true } }, equipment: { select: { productModel: true, serialNumber: true } }, serviceStage: { select: { displayName: true } } },
    });
    addSheet(workbook, "Work orders", ["Work order", "Company", "Location", "Model", "Serial number", "Summary", "Service type", "Priority", "Stage", "Customer status", "Condition", "Received", "Completed", "Created", "Last updated"], workOrders.map((workOrder) => [workOrder.workOrderNumber, workOrder.company.name, workOrder.location?.name ?? null, workOrder.equipment.productModel, workOrder.equipment.serialNumber, workOrder.summary, workOrder.serviceType, workOrder.priority, workOrder.serviceStage.displayName, workOrder.customerFacingStatus, workOrder.condition, workOrder.receivedAt, workOrder.completedAt, workOrder.createdAt, workOrder.updatedAt]));
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return { buffer, fileName: reportFileName(reportType), rowCount: workOrders.length };
  }

  if (reportType === ReportType.EQUIPMENT) {
    const where: Prisma.EquipmentWhereInput = {
      ...(filters.companyId ? { companyId: filters.companyId } : {}),
      ...dateRange("createdAt", filters),
    };
    const equipment = await prisma.equipment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: { productModel: true, serialNumber: true, description: true, createdAt: true, updatedAt: true, company: { select: { name: true } }, location: { select: { name: true } }, _count: { select: { workOrders: true } } },
    });
    addSheet(workbook, "Equipment", ["Company", "Location", "Model", "Serial number", "Description", "Work orders", "Created", "Last updated"], equipment.map((item) => [item.company.name, item.location?.name ?? null, item.productModel, item.serialNumber, item.description, item._count.workOrders, item.createdAt, item.updatedAt]));
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return { buffer, fileName: reportFileName(reportType), rowCount: equipment.length };
  }

  const where: Prisma.AuditEventWhereInput = {
    ...(filters.companyId ? { workOrder: { companyId: filters.companyId } } : {}),
    ...dateRange("createdAt", filters),
  };
  const auditEvents = await prisma.auditEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: { eventType: true, entityType: true, entityId: true, customerVisible: true, createdAt: true, actorUser: { select: { displayName: true, email: true } }, workOrder: { select: { workOrderNumber: true, company: { select: { name: true } } } } },
  });
  addSheet(workbook, "Audit events", ["Occurred", "Event", "Entity type", "Entity ID", "Company", "Work order", "Actor", "Actor email", "Customer visible"], auditEvents.map((event) => [event.createdAt, event.eventType, event.entityType, event.entityId, event.workOrder?.company.name ?? null, event.workOrder?.workOrderNumber ?? null, event.actorUser?.displayName ?? null, event.actorUser?.email ?? null, event.customerVisible ? "Yes" : "No"]));
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, fileName: reportFileName(reportType), rowCount: auditEvents.length };
}