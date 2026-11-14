"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type Application = {
  id: string;
  name: string;
  phone: string;
  dob: string | null;
  email: string | null;
  batch: "Morning Batch" | "Evening Batch";
  created_at: string;
};

const FIXED_COACHING_FEE = 2500;

const fmtWhen = (ts: string) =>
  new Date(ts).toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

/**
 * Shared by Admin, Sub-Admin and Coach.
 * - Shows the public registration link (copy / WhatsApp share)
 * - Lists new student requests; the FIRST person to accept wins, so the same
 *   student can never be added twice.
 */
export default function StudentApplications({
  role,
  onAccepted,
}: {
  role: "admin" | "subadmin" | "coach";
  onAccepted?: () => void;
}) {
  const [apps, setApps] = useState<Application[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(true);
  const channelId = useRef(`student-apps-${role}-${Math.random().toString(36).slice(2, 8)}`);

  const load = async () => {
    const { data } = await supabase
      .from("student_applications")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (data) setApps(data as Application[]);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(channelId.current)
      .on("postgres_changes", { event: "*", schema: "public", table: "student_applications" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const link = typeof window !== "undefined" ? `${window.location.origin}/join` : "/join";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt("Copy this link:", link);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(
    `Join SMES Sports Academy football coaching. Fill in your details here: ${link}`
  )}`;

  const accept = async (app: Application) => {
    setBusyId(app.id);
    try {
      // Warn if this phone number is already an active student
      const { data: dup } = await supabase
        .from("students")
        .select("id,name")
        .eq("phone", app.phone)
        .is("deleted_at", null)
        .limit(1);
      if (dup && dup.length > 0) {
        const ok = confirm(
          `A student with this phone number already exists (${dup[0].name}).\n\nAdd "${app.name}" anyway?`
        );
        if (!ok) return;
      }

      // Claim it first: only works if it is still pending (stops double-accept by two staff)
      const { data: claimed, error: claimErr } = await supabase
        .from("student_applications")
        .update({ status: "accepted", reviewed_by: role, reviewed_at: new Date().toISOString() })
        .eq("id", app.id)
        .eq("status", "pending")
        .select();

      if (claimErr) {
        alert(`Could not accept: ${claimErr.message}`);
        return;
      }
      if (!claimed || claimed.length === 0) {
        alert("This request was already handled by someone else.");
        load();
        return;
      }

      const { error: stErr } = await supabase.from("students").insert([
        {
          name: app.name,
          phone: app.phone,
          dob: app.dob || null,
          email: app.email || null,
          batch: app.batch,
          monthly_fee: FIXED_COACHING_FEE,
        },
      ]);

      if (stErr) {
        // Put it back so nothing is lost
        await supabase
          .from("student_applications")
          .update({ status: "pending", reviewed_by: null, reviewed_at: null })
          .eq("id", app.id);
        alert(`Could not add the student: ${stErr.message}`);
        load();
        return;
      }

      alert(`✅ ${app.name} added to ${app.batch}. Fee shows as pending until paid.`);
      load();
      onAccepted?.();
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (app: Application) => {
    if (!confirm(`Reject the request from "${app.name}"?`)) return;
    setBusyId(app.id);
    const { error } = await supabase
      .from("student_applications")
      .update({ status: "rejected", reviewed_by: role, reviewed_at: new Date().toISOString() })
      .eq("id", app.id)
      .eq("status", "pending");
    setBusyId(null);
    if (error) alert(`Could not reject: ${error.message}`);
    load();
  };

  return (
    <div className="border border-neutral-800 bg-neutral-950/80 mb-6 relative">
      <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-sky-400 to-lime-400" />

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0">
          <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">
            New Student Requests
          </span>
          <span className="text-sm font-black uppercase text-white">
            {apps.length > 0 ? `${apps.length} waiting for approval` : "No pending requests"}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {apps.length > 0 && (
            <span className="min-w-[26px] h-[26px] px-2 flex items-center justify-center rounded-full bg-sky-500 text-black text-xs font-black">
              {apps.length}
            </span>
          )}
          <span className="text-neutral-500 text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          {/* Registration link */}
          <div className="p-3 border border-neutral-800 bg-neutral-900/60 space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">
              Registration link — send to new students
            </span>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-h-[44px] bg-neutral-950 border border-neutral-800 px-3 text-xs font-mono text-lime-400 outline-none"
              />
              <button
                type="button"
                onClick={copyLink}
                className="min-h-[44px] px-4 bg-lime-400 text-black text-[11px] font-mono font-black uppercase tracking-widest"
              >
                {copied ? "✓ Copied" : "Copy"}
              </button>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] px-4 flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-mono font-black uppercase tracking-widest"
              >
                WhatsApp
              </a>
            </div>
          </div>

          {/* Pending requests */}
          {apps.length > 0 && (
            <ul className="space-y-3">
              {apps.map((a) => (
                <li key={a.id} className="p-3 border border-neutral-800 bg-neutral-900/60 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black uppercase text-white truncate">{a.name}</p>
                      <p className="text-[11px] font-mono text-neutral-400 mt-0.5">
                        📞 {a.phone}
                        {a.email ? ` · ✉️ ${a.email}` : ""}
                      </p>
                      <p className="text-[11px] font-mono text-neutral-500 mt-0.5">
                        {a.dob ? `DOB ${a.dob} · ` : ""}
                        {a.batch} · sent {fmtWhen(a.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={busyId === a.id}
                      onClick={() => accept(a)}
                      className="min-h-[44px] bg-lime-400 hover:bg-lime-300 disabled:opacity-50 text-black text-[11px] font-mono font-black uppercase tracking-widest"
                    >
                      {busyId === a.id ? "Please wait…" : "✓ Accept"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === a.id}
                      onClick={() => reject(a)}
                      className="min-h-[44px] bg-neutral-950 border border-red-900 text-red-400 hover:bg-red-950 disabled:opacity-50 text-[11px] font-mono font-black uppercase tracking-widest"
                    >
                      ✕ Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}