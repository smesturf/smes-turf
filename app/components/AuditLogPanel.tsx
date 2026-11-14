"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Row = {
  id: string; created_at: string; actor_name: string | null; actor_role: string | null;
  action: string; entity_type: string; entity_id: string | null; summary: string | null;
  before: any; after: any;
};

const LABEL: Record<string, string> = {
  booking_cancel_refund: "Cancelled · refund",
  booking_cancel_no_refund: "Cancelled · no refund",
  booking_reschedule: "Rescheduled",
  booking_extend: "Extended",
  booking_upgrade_full: "Upgraded to full",
  booking_offline_created: "Offline booking",
  booking_payment_reset: "Payment reset",
  slot_blocked: "Slot blocked",
  slot_unblocked: "Block removed",
  student_removed: "Student removed",
  student_restored: "Student restored",
  student_purged: "Student deleted",
  student_edited: "Student edited",
  reminders_sent: "Reminders sent",
};

const FILTERS: { id: string; label: string; match: (a: string) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "cancel", label: "Cancellations", match: (a) => a.startsWith("booking_cancel") },
  { id: "resched", label: "Reschedules", match: (a) => a === "booking_reschedule" },
  { id: "booking", label: "Other bookings", match: (a) => a.startsWith("booking_") && !a.startsWith("booking_cancel") && a !== "booking_reschedule" },
  { id: "slot", label: "Blocks", match: (a) => a.startsWith("slot_") },
  { id: "student", label: "Students", match: (a) => a.startsWith("student_") || a === "reminders_sent" },
];

const fmt = (ts: string) =>
  new Date(ts).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });

export default function AuditLogPanel() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(300);
    if (error) alert(`Could not load audit log: ${error.message}`);
    else setRows((data || []) as Row[]);
    setLoading(false);
  };
  useEffect(() => { if (open) load(); }, [open]);

  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)!;
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      f.match(r.action) &&
      (!needle || `${r.actor_name} ${r.summary} ${LABEL[r.action] || r.action}`.toLowerCase().includes(needle))
    );
  }, [rows, filter, q]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 px-3 py-2 text-[11px] font-mono uppercase tracking-widest font-black bg-neutral-900 border border-neutral-800 hover:border-lime-400 text-neutral-200 transition-colors"
      >
        🧾 Audit Log
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-end sm:items-center justify-center" onClick={() => setOpen(false)}>
          <div className="bg-neutral-950 border border-neutral-800 w-full sm:max-w-3xl max-h-[90vh] flex flex-col relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-lime-400 to-emerald-500" />
            <div className="p-4 pt-5 border-b border-neutral-900 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">Who did what</span>
                  <h3 className="text-lg font-black text-white">Audit Log</h3>
                </div>
                <div className="flex gap-2">
                  <button onClick={load} className="px-3 h-10 text-[10px] font-mono uppercase border border-neutral-800 bg-neutral-900 text-neutral-300">{loading ? "…" : "↻ Refresh"}</button>
                  <button onClick={() => setOpen(false)} aria-label="Close" className="w-10 h-10 border border-neutral-800 bg-neutral-900 text-neutral-400">✕</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => (
                  <button key={f.id} onClick={() => setFilter(f.id)}
                    className={`px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider border ${filter === f.id ? "bg-lime-400 text-black border-lime-400 font-black" : "bg-neutral-900 text-neutral-400 border-neutral-800"}`}>
                    {f.label}
                  </button>
                ))}
              </div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search staff name or customer…"
                className="w-full p-3 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-base sm:text-sm text-white placeholder:text-neutral-600" />
            </div>

            <div className="overflow-y-auto p-3 space-y-2">
              {shown.length === 0 && <p className="text-center text-xs font-mono text-neutral-500 py-10">{loading ? "Loading…" : "No entries"}</p>}
              {shown.map((r) => {
                const danger = r.action.startsWith("booking_cancel") || r.action === "student_purged";
                return (
                  <div key={r.id} className={`p-3 border ${danger ? "border-red-500/25 bg-red-500/[0.05]" : "border-neutral-800 bg-neutral-900/40"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className={`text-[10px] font-mono uppercase font-black ${danger ? "text-red-400" : "text-lime-400"}`}>{LABEL[r.action] || r.action}</span>
                        <p className="text-sm text-white mt-0.5 break-words">{r.summary}</p>
                        <p className="text-[11px] font-mono text-neutral-500 mt-1">👤 {r.actor_name || "unknown"}{r.actor_role ? ` · ${r.actor_role}` : ""}</p>
                      </div>
                      <span className="text-[10px] font-mono text-neutral-500 shrink-0 text-right">{fmt(r.created_at)}</span>
                    </div>
                    {(r.before || r.after) && (
                      <>
                        <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="mt-2 text-[10px] font-mono uppercase text-neutral-400 hover:text-white">
                          {expanded === r.id ? "Hide details ▲" : "Details ▼"}
                        </button>
                        {expanded === r.id && (
                          <div className="mt-2 grid sm:grid-cols-2 gap-2">
                            {r.before && <pre className="text-[10px] text-neutral-300 bg-black/40 p-2 overflow-x-auto"><b className="text-neutral-500">BEFORE</b>{"\n"}{JSON.stringify(r.before, null, 2)}</pre>}
                            {r.after && <pre className="text-[10px] text-neutral-300 bg-black/40 p-2 overflow-x-auto"><b className="text-neutral-500">AFTER</b>{"\n"}{JSON.stringify(r.after, null, 2)}</pre>}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}