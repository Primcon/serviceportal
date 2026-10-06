import { EmailClient } from "@azure/communication-email";
import { AccessScope, CustomerFacingStatus, NotificationKind, NotificationStatus, Prisma, PrismaClient } from "@prisma/client";
import { renderNotificationEmail } from "@/services/email-template";
import { unsubscribeLink } from "@/services/unsubscribe";
import { customerStatusLabels } from "@/lib/labels";
import { prisma } from "@/lib/prisma";

const maximumDeliveryAttempts = 5;
/** How long a dispatcher owns a notification it claimed. After this, another run may retry it. */
const claimLeaseMilliseconds = 10 * 60 * 1000;
/** Emails still unsent after this long are out of date, so they're expired instead of sent. */
const notificationMaximumAgeMilliseconds = 48 * 60 * 60 * 1000;
export const expiredNotificationError = "Expired: not sent because it was still queued 48 hours after it was created.";

/**
 * Marks pending emails that are too old to be useful as failed, so a backlog (after an outage,
 * or before the dispatcher first ran) doesn't reach customers as a burst of stale messages.
 */
export async function expireStaleNotifications(now = new Date()) {
  const expired = await prisma.notification.updateMany({
    where: { status: NotificationStatus.PENDING, createdAt: { lt: new Date(now.getTime() - notificationMaximumAgeMilliseconds) } },
    data: { status: NotificationStatus.FAILED, lastError: expiredNotificationError },
  });
  return expired.count;
}

export function emailConfiguration() {
  const connectionString = process.env.AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING;
  const senderAddress = process.env.AZURE_COMMUNICATION_SERVICES_SENDER_ADDRESS;
  if (!connectionString || !senderAddress) return null;
  return { client: new EmailClient(connectionString), senderAddress };
}

export function portalOrigin() {
  return (process.env.APP_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
}

export function customerWorkOrderPath(workOrderId: string) {
  return `/portal/work-orders/${workOrderId}`;
}

export function customerWorkOrderLink(workOrderId: string) {
  return `${portalOrigin()}${customerWorkOrderPath(workOrderId)}`;
}

/** The email setting that governs each kind of notification. Access emails can't be turned off. */
export const emailPreferenceFor = {
  SERVICE_UPDATE: "emailUpdates",
  STATUS_CHANGE: "emailStatusChanges",
  DOCUMENT_SHARED: "emailDocuments",
  ACCESS: null,
} as const satisfies Record<NotificationKind, "emailUpdates" | "emailStatusChanges" | "emailDocuments" | null>;

/**
 * Notifies the customers who can see a work order. Everyone with access gets it in their
 * portal feed; it's also emailed unless they've turned off email for that kind. A given
 * event reaches each person once, however many times it's raised.
 */
export async function logCustomerNotification(
  client: Prisma.TransactionClient | PrismaClient,
  input: {
    companyId: string;
    workOrderId: string;
    serviceUpdateId?: string;
    kind?: NotificationKind;
    eventKey?: string;
    subject?: string;
    body?: string;
  },
) {
  const workOrder = await client.workOrder.findFirst({
    where: { id: input.workOrderId, companyId: input.companyId },
    select: { locationId: true, workOrderNumber: true, summary: true },
  });
  if (!workOrder) {
    throw new Error("Work order not found.");
  }

  if (input.serviceUpdateId) {
    const serviceUpdate = await client.serviceUpdate.findUnique({
        where: { id: input.serviceUpdateId },
        select: { notifyCustomer: true, title: true, body: true },
      });
    if (!serviceUpdate?.notifyCustomer) {
      return 0;
    }
    input.eventKey ??= `service-update:${input.serviceUpdateId}`;
    input.subject ??= `Repair ${workOrder.workOrderNumber}: ${serviceUpdate.title}`;
    input.body ??= serviceUpdate.body;
  }
  if (!input.eventKey || !input.subject || !input.body) throw new Error("Notification content is required.");
  const kind = input.kind ?? (input.serviceUpdateId ? NotificationKind.SERVICE_UPDATE : NotificationKind.STATUS_CHANGE);
  const preference = emailPreferenceFor[kind];

  const recipients = await client.user.findMany({
    where: {
      isActive: true,
      access: {
        some: {
          companyId: input.companyId,
          role: "CUSTOMER_USER",
          OR: [
            { scope: AccessScope.COMPANY, locationId: null },
            ...(workOrder.locationId ? [{ scope: AccessScope.LOCATION, locationId: workOrder.locationId }] : []),
          ],
        },
      },
    },
    select: { id: true, email: true, notificationPreference: true },
  });
  if (!recipients.length) {
    return 0;
  }

  const emailStatus = emailConfiguration() ? NotificationStatus.PENDING : NotificationStatus.LOGGED;
  const result = await client.notification.createMany({
    data: recipients.map((user) => ({
      workOrderId: input.workOrderId,
      serviceUpdateId: input.serviceUpdateId,
      userId: user.id,
      kind,
      recipientEmail: user.email,
      linkPath: customerWorkOrderPath(input.workOrderId),
      eventKey: input.eventKey!,
      subject: input.subject!,
      body: input.body!,
      status: preference && user.notificationPreference && !user.notificationPreference[preference] ? NotificationStatus.OPTED_OUT : emailStatus,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

/**
 * Queues an email that isn't about a repair: an access request for the admins, a decision
 * for the requester, or an invitation. It goes through the same outbox, so it's retried and
 * never sent twice.
 */
export async function queueAccessEmail(
  client: Prisma.TransactionClient | PrismaClient,
  input: { recipientEmail: string; userId?: string | null; eventKey: string; subject: string; body: string; linkPath?: string },
) {
  const result = await client.notification.createMany({
    data: [{
      kind: NotificationKind.ACCESS,
      recipientEmail: input.recipientEmail,
      userId: input.userId ?? null,
      eventKey: input.eventKey,
      subject: input.subject,
      body: input.body,
      linkPath: input.linkPath ?? null,
      // Marked read: these are emails, not items for the customer's feed.
      readAt: new Date(),
      status: emailConfiguration() ? NotificationStatus.PENDING : NotificationStatus.LOGGED,
    }],
    skipDuplicates: true,
  });
  return result.count;
}

/** Notification content for a change in the status customers see. Internal stages and conditions stay out of it. */
export function statusChangeNotification(input: { workOrderId: string; workOrderNumber: string; status: CustomerFacingStatus }) {
  const label = customerStatusLabels[input.status];
  return {
    kind: NotificationKind.STATUS_CHANGE,
    subject: `Repair ${input.workOrderNumber}: ${label}`,
    body: `The status of your repair ${input.workOrderNumber} is now ${label}.`,
  };
}

/**
 * Takes ownership of a pending notification before sending it, by moving its next attempt
 * forward. Only one dispatcher can win the claim, so overlapping runs never send twice.
 */
export async function claimNotification(notification: { id: string; nextAttemptAt: Date }) {
  const claimed = await prisma.notification.updateMany({
    where: { id: notification.id, status: NotificationStatus.PENDING, nextAttemptAt: notification.nextAttemptAt },
    data: { nextAttemptAt: new Date(Date.now() + claimLeaseMilliseconds) },
  });
  return claimed.count === 1;
}

/** The HTML and plain-text bodies of a queued notification, with its link and the right footer. */
export function emailContent(notification: { kind: NotificationKind; subject: string; body: string; linkPath: string | null; userId: string | null }) {
  const origin = portalOrigin();
  const canOptOut = Boolean(notification.userId && emailPreferenceFor[notification.kind]);
  return renderNotificationEmail({
    heading: notification.subject,
    body: notification.body,
    link: notification.linkPath ? { url: `${origin}${notification.linkPath}`, label: notification.kind === NotificationKind.ACCESS ? "Open the portal" : "View the repair" } : null,
    logoUrl: `${origin}/pfeiffer-vacuum-logo.png`,
    footer: canOptOut
      ? { preferencesUrl: `${origin}/portal/notifications`, unsubscribeUrl: unsubscribeLink(notification.userId!, notification.kind) }
      : null,
  });
}

export async function dispatchPendingNotifications(limit = 25) {
  const configuration = emailConfiguration();
  if (!configuration) return { processed: 0, delivered: 0, failed: 0, expired: 0 };
  const expired = await expireStaleNotifications();
  const notifications = await prisma.notification.findMany({
    where: {
      status: NotificationStatus.PENDING,
      nextAttemptAt: { lte: new Date() },
      attemptCount: { lt: maximumDeliveryAttempts },
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(1, limit), 100),
  });
  let delivered = 0;
  let failed = 0;
  for (const notification of notifications) {
    if (!(await claimNotification(notification))) continue;
    try {
      const poller = await configuration.client.beginSend({
        senderAddress: configuration.senderAddress,
        recipients: { to: [{ address: notification.recipientEmail }] },
        content: { subject: notification.subject, ...emailContent(notification) },
      });
      const result = await poller.pollUntilDone();
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.SENT, sentAt: new Date(), attemptCount: { increment: 1 }, lastError: null, providerMessageId: result?.id ?? null },
      });
      delivered += 1;
    } catch (error) {
      const attemptCount = notification.attemptCount + 1;
      const retryDelayMinutes = 2 ** Math.min(attemptCount, 6);
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: attemptCount >= maximumDeliveryAttempts ? NotificationStatus.FAILED : NotificationStatus.PENDING,
          attemptCount,
          lastError: error instanceof Error ? error.message.slice(0, 1000) : "Email delivery failed.",
          nextAttemptAt: new Date(Date.now() + retryDelayMinutes * 60 * 1000),
        },
      });
      failed += 1;
    }
  }
  return { processed: notifications.length, delivered, failed, expired };
}
