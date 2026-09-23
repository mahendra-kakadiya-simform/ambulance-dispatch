import type { Prisma } from '../generated/prisma/client.js';

export interface AuditEntry {
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  fromValue?: string | null;
  toValue?: string | null;
  reason?: string | null;
}

/**
 * Appends an audit row using the caller's transaction client — deliberately not the
 * global `prisma` — so the audit write commits or rolls back together with the change
 * it describes. Written outside the transaction, a crash between the two writes leaves
 * either a change with no audit trail or an audit row describing a change that never
 * happened; both make the history untrustworthy.
 *
 * Audit rows are append-only: nothing in the codebase updates or deletes them.
 */
export async function writeAudit(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
  await tx.auditEvent.create({
    data: {
      actorId: entry.actorId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      fromValue: entry.fromValue ?? null,
      toValue: entry.toValue ?? null,
      reason: entry.reason ?? null,
    },
  });
}
