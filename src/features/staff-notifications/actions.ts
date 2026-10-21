"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/action-result";
import { runAction } from "@/lib/run-action";
import { getActiveInternalUser } from "@/services/authorization";

/** Opens a staff notification: marks it read, then goes to the work order it's about. */
export async function openStaffNotification(formData: FormData) {
  const notificationId = z.string().uuid().safeParse(formData.get("notificationId")?.toString()).data;
  const user = await getActiveInternalUser();
  const notification = notificationId ? await prisma.notification.findFirst({ where: { id: notificationId, userId: user.id, kind: "STAFF" }, select: { id: true, readAt: true, linkPath: true } }) : null;
  if (!notification) redirect("/workspace/notifications");
  if (!notification.readAt) await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
  revalidatePath("/workspace", "layout");
  // Only ever a page inside the workspace.
  redirect(notification.linkPath?.startsWith("/workspace/") ? notification.linkPath : "/workspace/notifications");
}

export async function markAllStaffNotificationsRead(): Promise<ActionResult> {
  return runAction(async () => {
    const user = await getActiveInternalUser();
    const marked = await prisma.notification.updateMany({ where: { userId: user.id, kind: "STAFF", readAt: null }, data: { readAt: new Date() } });
    revalidatePath("/workspace", "layout");
    return marked.count ? "All marked as read." : "Nothing was unread.";
  });
}

/** Whether a staff member is also emailed when a job is handed to them. */
export async function saveHandoffEmailPreference(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const emailHandoffs = formData.get("emailHandoffs") === "on";
    const user = await getActiveInternalUser();
    await prisma.notificationPreference.upsert({ where: { userId: user.id }, update: { emailHandoffs }, create: { userId: user.id, emailHandoffs } });
    revalidatePath("/workspace/notifications");
    return emailHandoffs ? "You'll also get an email when a job is handed to you." : "Hand-offs will only show here.";
  });
}
