import { ageDistribution, median, throughputWindowStart, weeklyThroughput } from "@/features/dashboard/metrics";
import { openWorkOrderWhere } from "@/features/records/merge";
import { shopTimeZone } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

const weeksShown = 8;
const day = 86_400_000;

/** Everything the operations dashboard shows, in one round of queries. */
export async function operationsDashboard(now = new Date()) {
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const windowStart = throughputWindowStart(weeksShown, now, shopTimeZone);
  const waitingConditions = ["WAITING_ON_PARTS", "AWAITING_CUSTOMER", "CUSTOMER_HOLD"] as const;

  const [stages, open, byAssignee, overdueByAssignee, staff, opened, completed, recentlyCompleted] = await Promise.all([
    prisma.serviceStage.findMany({ orderBy: { sequence: "asc" }, select: { id: true, code: true, displayName: true, isActive: true } }),
    prisma.workOrder.findMany({ where: openWorkOrderWhere, select: { serviceStageId: true, condition: true, promisedAt: true, receivedAt: true, createdAt: true, stageEnteredAt: true } }),
    prisma.workOrder.groupBy({ by: ["assignedToId"], where: openWorkOrderWhere, _count: { _all: true } }),
    prisma.workOrder.groupBy({ by: ["assignedToId"], where: { ...openWorkOrderWhere, promisedAt: { lt: startOfToday } }, _count: { _all: true } }),
    prisma.user.findMany({ where: { internalRole: { not: null } }, select: { id: true, displayName: true } }),
    prisma.workOrder.findMany({ where: { createdAt: { gte: windowStart } }, select: { createdAt: true } }),
    prisma.workOrder.findMany({ where: { completedAt: { gte: windowStart } }, select: { completedAt: true } }),
    prisma.workOrder.findMany({ where: { completedAt: { gte: new Date(now.getTime() - 30 * day) } }, select: { completedAt: true, receivedAt: true, createdAt: true } }),
  ]);

  const byStage = stages
    // An open job is never in the Completed stage, so that row would always read zero.
    .filter((stage) => stage.code !== "COMPLETED")
    .map((stage) => {
      const jobs = open.filter((job) => job.serviceStageId === stage.id);
      return { id: stage.id, name: stage.displayName, isActive: stage.isActive, count: jobs.length, medianDays: jobs.length ? Math.round(median(jobs.map((job) => (now.getTime() - job.stageEnteredAt.getTime()) / day))!) : null };
    })
    // A retired stage only appears while jobs are still sitting in it.
    .filter((stage) => stage.isActive || stage.count > 0);

  const names = new Map(staff.map((person) => [person.id, person.displayName]));
  const overdueFor = new Map(overdueByAssignee.map((row) => [row.assignedToId, row._count._all]));
  const workload = byAssignee
    .map((row) => ({ id: row.assignedToId, name: row.assignedToId ? names.get(row.assignedToId) ?? "Former staff" : "Nobody (in the queue)", count: row._count._all, overdue: overdueFor.get(row.assignedToId) ?? 0 }))
    .sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : b.count - a.count));

  const turnaround = median(recentlyCompleted.map((job) => (job.completedAt!.getTime() - (job.receivedAt ?? job.createdAt).getTime()) / day));

  return {
    totals: {
      open: open.length,
      overdue: open.filter((job) => job.promisedAt && job.promisedAt < startOfToday).length,
      waiting: open.filter((job) => (waitingConditions as readonly string[]).includes(job.condition)).length,
      completedThisWeek: completed.filter((job) => job.completedAt! >= throughputWindowStart(1, now, shopTimeZone)).length,
      completedLast30Days: recentlyCompleted.length,
      medianTurnaroundDays: turnaround === null ? null : Math.round(turnaround),
    },
    byStage,
    aging: ageDistribution(open.map((job) => job.receivedAt ?? job.createdAt), now),
    weekly: weeklyThroughput({ opened: opened.map((job) => job.createdAt), completed: completed.map((job) => job.completedAt!), weeks: weeksShown, now, timeZone: shopTimeZone }),
    workload,
  };
}
