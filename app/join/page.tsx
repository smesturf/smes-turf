"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

type Batch = "Morning Batch" | "Evening Batch";

const inputCls =
  "w-full min-h-[48px] bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none px-3 text-sm text-white font-mono";
const labelCls = "text-[10px] font-mono uppercase tracking-widest text-neutral-400 block mb-1.5";

export default function JoinPage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [email, setEmail] = useState("");
  const [batch, setBatch] = useState<Batch>("Morning Batch");
  const [website, setWebsite] = useState(""); // honeypot: real people never fill this
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (website) { setDone(true); return; } // bot: pretend success, save nothing
    if (!name.trim()) return setError("Please enter the student's name.");
    if (phone.length !== 10) return setError("Mobile number must be exactly 10 digits.");
    if (!dob) return setError("Please enter the date of birth.");
    if (email && !/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Please enter a valid email or leave it empty.");

    setSubmitting(true);
    const { error: dbErr } = await supabase.from("student_applications").insert([
      {
        name: name.trim(),
        phone,
        dob,
        email: email.trim().toLowerCase() || null,
        batch,
      },
    ]);
    setSubmitting(false);

    if (dbErr) {
      if (dbErr.code === "23505") {
        setError("A request with this mobile number is already waiting for approval. Please wait for the academy to confirm.");
      } else {
        setError("Something went wrong. Please try again in a moment.");
      }
      return;
    }
    setDone(true);
  };

  return (
    <main className="min-h-screen bg-[#050505] text-white flex items-start sm:items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-[#0a0a0a] border border-neutral-800 relative overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-lime-500 to-emerald-400" />

        <div className="p-5 sm:p-7">
          <span className="text-[10px] font-mono uppercase tracking-widest text-lime-400 block mb-1">
            SMES Sports Academy
          </span>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight leading-none">
            Football Coaching
          </h1>
          <p className="text-neutral-400 text-sm font-mono mt-2">Student registration form</p>

          {done ? (
            <div className="mt-8 text-center space-y-3 py-6">
              <div className="text-5xl">✅</div>
              <h2 className="text-lg font-black uppercase text-lime-400">Request sent</h2>
              <p className="text-sm text-neutral-400 font-mono leading-relaxed">
                Thank you! The academy team will review your details and contact you on your mobile number.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className={labelCls}>Student Name *</label>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </div>

              <div>
                <label className={labelCls}>Mobile Number *</label>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  placeholder="10 digits"
                  autoComplete="tel"
                />
              </div>

              <div>
                <label className={labelCls}>Date of Birth *</label>
                <input type="date" max={today} className={inputCls} value={dob} onChange={(e) => setDob(e.target.value)} />
              </div>

              <div>
                <label className={labelCls}>Email (optional)</label>
                <input
                  type="email"
                  className={inputCls}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>

              <div>
                <label className={labelCls}>Preferred Batch *</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["Morning Batch", "Evening Batch"] as Batch[]).map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBatch(b)}
                      className={`min-h-[48px] text-[11px] font-mono font-black uppercase tracking-widest border transition-colors ${
                        batch === b
                          ? "bg-lime-400 text-black border-lime-400"
                          : "bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-white"
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              {/* honeypot */}
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="hidden"
                aria-hidden="true"
              />

              {error && (
                <p className="text-xs font-mono text-red-400 bg-red-500/10 border border-red-500/30 p-3">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[52px] bg-lime-400 hover:bg-lime-300 disabled:opacity-60 text-black font-mono font-black uppercase tracking-widest text-xs transition-colors"
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}