// Ops Copilot — audit trail + per-user daily cap.
//
// Everything here is best-effort: if the copilot_audit table hasn't been
// created yet (server/scripts/add-copilot-audit.sql), writes are skipped and
// the cap check fails open, so the copilot keeps working.

import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../../db";
import { copilotAudit } from "@shared/schema";

export const COPILOT_DAILY_MESSAGE_LIMIT = Number(process.env.COPILOT_DAILY_MESSAGE_LIMIT || "150");

export interface CopilotAuditRow {
  userId: string | null;
  storeId: string | null;
  kind: "message" | "tool" | "action";
  toolName?: string | null;
  input?: unknown;
  ok?: boolean;
  error?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  durationMs?: number | null;
}

export async function logCopilot(row: CopilotAuditRow): Promise<void> {
  try {
    await db.insert(copilotAudit).values({
      userId: row.userId,
      storeId: row.storeId,
      kind: row.kind,
      toolName: row.toolName ?? null,
      input: (row.input ?? null) as any,
      ok: row.ok ?? true,
      error: row.error ? String(row.error).slice(0, 1000) : null,
      inputTokens: row.inputTokens ?? null,
      outputTokens: row.outputTokens ?? null,
      durationMs: row.durationMs ?? null,
    });
  } catch (e: any) {
    console.warn(`[copilot] audit write skipped: ${e?.message ?? e}`);
  }
}

/** Messages this user sent in the trailing 24h, or null if unknown (table missing). */
export async function messagesInLastDay(userId: string): Promise<number | null> {
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(copilotAudit)
      .where(
        and(
          eq(copilotAudit.userId, userId),
          eq(copilotAudit.kind, "message"),
          gte(copilotAudit.createdAt, since),
        ),
      );
    return Number(r?.n ?? 0);
  } catch (e: any) {
    console.warn(`[copilot] cap check skipped: ${e?.message ?? e}`);
    return null;
  }
}
