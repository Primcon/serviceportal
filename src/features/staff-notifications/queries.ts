import { prisma } from "@/lib/prisma";

/** A staff member's notifications, newest first. */
export async function listStaffNotifications(userId: string, { page = 1, pageSize = 25 } = {}) {
  const currentPage = Math.max(1, Math.floor(page));
  const where = { userId, kind: "STAFF" as const };
  const [total, unread, notifications, preference] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      select: { id: true, subject: true, body: true, readAt: true, createdAt: true, eventKey: true },
    }),
    prisma.notificationPreference.findUnique({ where: { userId }, select: { emailHandoffs: true } }),
  ]);
  return { notifications, total, unread, page: currentPage, pageSize, emailHandoffs: preference?.emailHandoffs ?? false };
}

/** How many notifications a staff member hasn't opened, for the badge in the menu. */
export function countUnreadStaffNotifications(userId: string) {
  return prisma.notification.count({ where: { userId, kind: "STAFF", readAt: null } });
}
