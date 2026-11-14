import { supabase } from "./supabase";

export type AuditEntry = {
  action: string;                       // booking_cancel_refund, booking_reschedule, ...
  entityType: "booking" | "blocked_slot" | "student" | "reminder";
  entityId?: string | number | null;
  summary: string;
  before?: unknown;
  after?: unknown;
};

/**
 * Best-effort audit trail. It never throws, so a logging hiccup can't block a real action.
 * The actor's user id is added by the database (auth.uid()), the name/role are for easy reading.
 */
export async function logAudit(
  staff: { name?: string; role?: string } | null | undefined,
  e: AuditEntry
) {
  try {
    const { error } = await supabase.from("audit_log").insert([{
      actor_name: staff?.name ?? "unknown",
      actor_role: staff?.role ?? null,
      action: e.action,
      entity_type: e.entityType,
      entity_id: e.entityId != null ? String(e.entityId) : null,
      summary: e.summary,
      before: e.before ?? null,
      after: e.after ?? null,
    }]);
    if (error) console.error("Audit log failed:", error.message);
  } catch (err) {
    console.error("Audit log failed:", err);
  }
}