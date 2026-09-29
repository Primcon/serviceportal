"use server";

import { DateTime } from "luxon";
import { CustomerFacingStatus, Prisma, ReportFrequency, ReportType, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/errors";
import { runAction } from "@/lib/run-action";
import { recordAudit } from "@/services/audit";
import { sendReportScheduleNow } from "@/services/report-dispatch";
import { getActiveInternalUserForRoles } from "@/services/authorization";

const allowedRoles = [UserRole.PORTAL_ADMINISTRATOR, UserRole.VACTECH_MANAGER];
const reportTypeSchema = z.nativeEnum(ReportType);
const frequencySchema = z.nativeEnum(ReportFrequency);
const timeZoneSchema = z.string().trim().refine((value) => DateTime.now().setZone(value).isValid, "Select a valid time zone.");

function value(formData: FormData, name: string) {
  return formData.get(name)?.toString() ?? "";
}

function filtersFromFormData(formData: FormData) {
  const companyId = value(formData, "companyId").trim();
  const from = value(formData, "from").trim();
  const to = value(formData, "to").trim();
  const statuses = formData.getAll("statuses").map(String).filter((status): status is CustomerFacingStatus => Object.values(CustomerFacingStatus).includes(status as CustomerFacingStatus));
  return { ...(companyId ? { companyId } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(statuses.length ? { statuses } : {}) };
}

function recipientEmails(input: string) {
  const emails = [...new Set(input.split(/[\n,;]/).map((email) => email.trim().toLowerCase()).filter(Boolean))];
  const result = z.array(z.string().email()).min(1).max(20).safeParse(emails);
  if (!result.success) {
    if (!emails.length) throw new UserFacingError("Provide at least one recipient.");
    if (emails.length > 20) throw new UserFacingError("A schedule can have at most 20 recipients.");
    throw new UserFacingError("One or more recipient email addresses are not valid.");
  }
  return result.data;
}

export async function createReportSchedule(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({ reportType: reportTypeSchema, frequency: frequencySchema, startAt: z.string().trim().min(1), timeZone: timeZoneSchema }).parse({ reportType: value(formData, "reportType"), frequency: value(formData, "frequency"), startAt: value(formData, "startAt"), timeZone: value(formData, "timeZone") });
    const startAt = DateTime.fromFormat(input.startAt, "yyyy-MM-dd'T'HH:mm", { zone: input.timeZone });
    if (!startAt.isValid) throw new UserFacingError("Choose a valid start date and time.");
    const recipients = recipientEmails(value(formData, "recipientEmails"));
    const actor = await getActiveInternalUserForRoles(allowedRoles);
    await prisma.$transaction(async (transaction) => {
      const schedule = await transaction.reportSchedule.create({
        data: { reportType: input.reportType, filters: filtersFromFormData(formData) as Prisma.InputJsonValue, recipientEmails: recipients, frequency: input.frequency, startAt: startAt.toUTC().toJSDate(), timeZone: input.timeZone, nextRunAt: startAt.toUTC().toJSDate(), createdById: actor.id },
      });
      await recordAudit(transaction, { actorUserId: actor.id, eventType: "report-schedule.created", entityType: "ReportSchedule", entityId: schedule.id, metadata: { reportType: schedule.reportType, frequency: schedule.frequency, recipientCount: schedule.recipientEmails.length } });
    });
    revalidatePath("/workspace/reports");
  });
}

export async function updateReportScheduleStatus(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const input = z.object({ scheduleId: z.string().uuid(), isActive: z.enum(["true", "false"]) }).parse({ scheduleId: value(formData, "scheduleId"), isActive: value(formData, "isActive") });
    const actor = await getActiveInternalUserForRoles(allowedRoles);
    await prisma.$transaction(async (transaction) => {
      const schedule = await transaction.reportSchedule.update({ where: { id: input.scheduleId }, data: { isActive: input.isActive === "true" } });
      await recordAudit(transaction, { actorUserId: actor.id, eventType: schedule.isActive ? "report-schedule.resumed" : "report-schedule.paused", entityType: "ReportSchedule", entityId: schedule.id });
    });
    revalidatePath("/workspace/reports");
  });
}

export async function deleteReportSchedule(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const scheduleId = z.string().uuid().parse(value(formData, "scheduleId"));
    const actor = await getActiveInternalUserForRoles(allowedRoles);
    await prisma.$transaction(async (transaction) => {
      await transaction.reportSchedule.delete({ where: { id: scheduleId } });
      await recordAudit(transaction, { actorUserId: actor.id, eventType: "report-schedule.deleted", entityType: "ReportSchedule", entityId: scheduleId });
    });
    revalidatePath("/workspace/reports");
  });
}

export async function sendReportSchedule(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const scheduleId = z.string().uuid().parse(value(formData, "scheduleId"));
    const actor = await getActiveInternalUserForRoles(allowedRoles);
    await sendReportScheduleNow(scheduleId);
    await recordAudit(prisma, { actorUserId: actor.id, eventType: "report-schedule.sent-manually", entityType: "ReportSchedule", entityId: scheduleId });
    revalidatePath("/workspace/reports");
    return "Report sent.";
  });
}
