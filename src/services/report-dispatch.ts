import { DateTime } from "luxon";
import { ReportFrequency, ReportRunStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { UserFacingError } from "@/lib/errors";
import { emailConfiguration } from "@/services/notifications";
import { generateReportWorkbook, ReportFilters } from "@/services/reports";

const retryDelayMilliseconds = 5 * 60 * 1000;

export function nextReportOccurrence(date: Date, frequency: ReportFrequency, timeZone: string) {
  const scheduled = DateTime.fromJSDate(date, { zone: "utc" }).setZone(timeZone);
  const next = frequency === ReportFrequency.DAILY
    ? scheduled.plus({ days: 1 })
    : frequency === ReportFrequency.WEEKLY
      ? scheduled.plus({ weeks: 1 })
      : scheduled.plus({ months: 1 });
  return next.toUTC().toJSDate();
}

async function deliverSchedule(scheduleId: string, dueAt?: Date) {
  const configuration = emailConfiguration();
  if (!configuration) return { outcome: "skipped" as const };
  const schedule = await prisma.reportSchedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) return { outcome: "skipped" as const };

  const scheduledFor = dueAt ?? schedule.nextRunAt;
  const nextRunAt = nextReportOccurrence(scheduledFor, schedule.frequency, schedule.timeZone);
  if (dueAt) {
    const claimed = await prisma.reportSchedule.updateMany({
      where: { id: schedule.id, isActive: true, nextRunAt: scheduledFor },
      data: { nextRunAt },
    });
    if (claimed.count === 0) return { outcome: "skipped" as const };
  }

  try {
    const report = await generateReportWorkbook(schedule.reportType, (schedule.filters ?? {}) as ReportFilters);
    const poller = await configuration.client.beginSend({
      senderAddress: configuration.senderAddress,
      recipients: { to: schedule.recipientEmails.map((address) => ({ address })) },
      content: { subject: `VacTech report: ${schedule.reportType.replaceAll("_", " ")}`, plainText: `Attached is the requested VacTech ${schedule.reportType.toLowerCase().replaceAll("_", " ")} report. It contains ${report.rowCount} row${report.rowCount === 1 ? "" : "s"}.` },
      attachments: [{ name: report.fileName, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", contentInBase64: report.buffer.toString("base64") }],
    });
    await poller.pollUntilDone();
    await prisma.reportSchedule.update({
      where: { id: schedule.id },
      data: { lastRunAt: new Date(), lastRunStatus: ReportRunStatus.SUCCESS, lastError: null, ...(dueAt ? {} : { nextRunAt }) },
    });
    await prisma.auditEvent.create({ data: { eventType: "report-schedule.sent", entityType: "ReportSchedule", entityId: schedule.id, metadata: { reportType: schedule.reportType, recipientCount: schedule.recipientEmails.length } } });
    return { outcome: "delivered" as const };
  } catch (error) {
    await prisma.reportSchedule.update({
      where: { id: schedule.id },
      data: { lastRunStatus: ReportRunStatus.FAILED, lastError: error instanceof Error ? error.message.slice(0, 1000) : "Report delivery failed.", ...(dueAt ? { nextRunAt: new Date(Date.now() + retryDelayMilliseconds) } : {}) },
    });
    return { outcome: "failed" as const };
  }
}

export async function dispatchDueReportSchedules(limit = 10) {
  if (!emailConfiguration()) return { processed: 0, delivered: 0, failed: 0 };
  const dueSchedules = await prisma.reportSchedule.findMany({
    where: { isActive: true, nextRunAt: { lte: new Date() } },
    orderBy: { nextRunAt: "asc" },
    take: Math.min(Math.max(1, limit), 100),
    select: { id: true, nextRunAt: true },
  });
  let delivered = 0;
  let failed = 0;
  for (const schedule of dueSchedules) {
    const result = await deliverSchedule(schedule.id, schedule.nextRunAt);
    if (result.outcome === "delivered") delivered += 1;
    if (result.outcome === "failed") failed += 1;
  }
  return { processed: dueSchedules.length, delivered, failed };
}

export async function sendReportScheduleNow(scheduleId: string) {
  const result = await deliverSchedule(scheduleId);
  if (result.outcome === "skipped") throw new UserFacingError("Report email delivery is not configured or the schedule no longer exists.");
  if (result.outcome === "failed") throw new UserFacingError("Unable to send the report. The schedule has been marked as failed.");
}