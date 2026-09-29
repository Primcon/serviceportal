import { EmailClient } from "@azure/communication-email";
import { AccessScope, CustomerFacingStatus, NotificationStatus, Prisma, PrismaClient } from "@prisma/client";
import { customerStatusLabels } from "@/lib/labels";
import { prisma } from "@/lib/prisma";

const maximumDeliveryAttempts = 5;
/** How long a dispatcher owns a notification it claimed. After this, another run may retry it. */
const claimLeaseMilliseconds = 10 * 60 * 1000;

export function emailConfiguration() {
  const connectionString = process.env.AZURE_COMMUNICATION_SERVICES_CONNECTION_STRING;
  const senderAddress = process.env.AZURE_COMMUNICATION_SERVICES_SENDER_ADDRESS;
  if (!connectionString || !senderAddress) return null;
  return { client: new EmailClient(connectionString), senderAddress };
}

export function customerWorkOrderLink(workOrderId: string) {
  const origin = process.env.APP_ORIGIN || "http://localhost:3000";
  return `${origin.replace(/\/$/, "")}/portal/work-orders/${workOrderId}`;
}

export async function logCustomerNotification(
  client: Prisma.TransactionClient | PrismaClient,
  input: {
    companyId: string;
    workOrderId: string;
    serviceUpdateId?: string;
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
    input.subject ??= `Service update: ${serviceUpdate.title}`;
    input.body ??= `${serviceUpdate.body}\n\nView repair ${workOrder.workOrderNumber}: ${customerWorkOrderLink(input.workOrderId)}`;
  }
  if (!input.eventKey || !input.subject || !input.body) throw new Error("Notification content is required.");

  const recipientWhere: Prisma.UserAccessWhereInput = {
    companyId: input.companyId,
    role: "CUSTOMER_USER",
    user: { isActive: true },
    OR: [
      { scope: AccessScope.COMPANY, locationId: null },
      ...(workOrder.locationId ? [{ scope: AccessScope.LOCATION, locationId: workOrder.locationId }] : []),
    ],
  };
  const recipients = await client.userAccess.findMany({
    where: recipientWhere,
    distinct: ["userId"],
    select: { user: { select: { email: true } } },
  });

  const optedInRecipients = await client.user.findMany({
    where: {
      email: { in: recipients.map(({ user }) => user.email) },
      isActive: true,
      OR: [
        { notificationPreference: null },
        { notificationPreference: { emailUpdates: true } },
      ],
    },
    select: { email: true },
  });

  if (!optedInRecipients.length) {
    return 0;
  }

  const result = await client.notification.createMany({
    data: optedInRecipients.map((user) => ({
      workOrderId: input.workOrderId,
      serviceUpdateId: input.serviceUpdateId,
      recipientEmail: user.email,
      eventKey: input.eventKey!,
      subject: input.subject!,
      body: input.body!,
      status: emailConfiguration() ? NotificationStatus.PENDING : NotificationStatus.LOGGED,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

/** Email content for a change in the status customers see. Internal stages and conditions stay out of it. */
export function statusChangeNotification(input: { workOrderId: string; workOrderNumber: string; status: CustomerFacingStatus }) {
  const label = customerStatusLabels[input.status];
  return {
    subject: `Repair ${input.workOrderNumber}: ${label}`,
    body: `The status of your repair ${input.workOrderNumber} is now ${label}.\n\nView the repair: ${customerWorkOrderLink(input.workOrderId)}`,
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

export async function dispatchPendingNotifications(limit = 25) {
  const configuration = emailConfiguration();
  if (!configuration) return { processed: 0, delivered: 0, failed: 0 };
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
        content: { subject: notification.subject, plainText: notification.body },
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
  return { processed: notifications.length, delivered, failed };
}
