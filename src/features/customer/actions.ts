"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/errors";
import { runAction } from "@/lib/run-action";
import { getActiveCustomerUser } from "@/services/authorization";
import { emailPreferenceFor } from "@/services/notifications";
import { readUnsubscribeToken } from "@/services/unsubscribe";

/** Saves which kinds of notification the customer is emailed about. */
export async function updateCustomerNotificationPreference(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const preferences = {
      emailUpdates: formData.get("emailUpdates") === "on",
      emailStatusChanges: formData.get("emailStatusChanges") === "on",
      emailDocuments: formData.get("emailDocuments") === "on",
    };
    const user = await getActiveCustomerUser();
    await prisma.notificationPreference.upsert({ where: { userId: user.id }, update: preferences, create: { userId: user.id, ...preferences } });
    revalidatePath("/portal", "layout");
    return "Preferences saved.";
  });
}

/** Opens a notification: marks it read, then goes to the repair it's about. */
export async function openNotification(formData: FormData) {
  const notificationId = z.string().uuid().safeParse(formData.get("notificationId")?.toString()).data;
  const user = await getActiveCustomerUser();
  const notification = notificationId ? await prisma.notification.findFirst({ where: { id: notificationId, userId: user.id }, select: { id: true, readAt: true, linkPath: true } }) : null;
  if (!notification) redirect("/portal/notifications");
  if (!notification.readAt) await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
  revalidatePath("/portal", "layout");
  // Only ever a page inside the customer portal.
  redirect(notification.linkPath?.startsWith("/portal/") ? notification.linkPath : "/portal/notifications");
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  return runAction(async () => {
    const user = await getActiveCustomerUser();
    const marked = await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    revalidatePath("/portal", "layout");
    return marked.count ? "All marked as read." : "Nothing was unread.";
  });
}

/**
 * Turns off one kind of email from a link in an email, without signing in. The link's
 * signature says who it's for, so it can only change that person's own setting.
 */
export async function unsubscribeFromEmails(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const target = readUnsubscribeToken(formData.get("token")?.toString());
    const field = target ? emailPreferenceFor[target.kind] : null;
    if (!target || !field) throw new UserFacingError("This link isn't valid any more. Sign in to change your email settings.");
    const user = await prisma.user.findUnique({ where: { id: target.userId }, select: { id: true } });
    if (!user) throw new UserFacingError("This link isn't valid any more. Sign in to change your email settings.");
    await prisma.notificationPreference.upsert({ where: { userId: user.id }, update: { [field]: false }, create: { userId: user.id, [field]: false } });
    return "Done. You won't get these emails any more.";
  });
}
