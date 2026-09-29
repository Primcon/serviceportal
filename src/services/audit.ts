import type { Prisma, PrismaClient } from "@prisma/client";

export type AuditInput = {
  actorUserId?: string | null;
  workOrderId?: string | null;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  customerVisible?: boolean;
  metadata?: Prisma.InputJsonValue;
};

/** Records an audit event. Pass the transaction client so the event commits or rolls back with the change it describes. */
export function recordAudit(client: Prisma.TransactionClient | PrismaClient, input: AuditInput) {
  return client.auditEvent.create({ data: input });
}
