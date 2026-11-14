"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { setActiveRole, STAFF_ACCOUNTS, type StaffRole } from "../lib/staff";
import { motion, LayoutGroup } from "framer-motion";

const ROLES: { label: string; role: StaffRole; path: string }[] = [
  { label: "Admin", role: "admin", path: "/admin" },
  { label: "Sub-Admin", role: "subadmin", path: "/subadmin" },
  { label: "Coach", role: "coach", path: "/coach" },
];

export default function StaffPortal() {
  const router = useRouter();
  const [staffRole, setStaffRole] = useState("Admin");
  const [staffPassword, setStaffPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Remember the last role used on this device
  useEffect(() => {
    try {
      const savedRole = localStorage.getItem("smes_staff_role");
      if (savedRole && ROLES.some((r) => r.label === savedRole)) setStaffRole(savedRole);
    } catch {}
  }, []);

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const selected = ROLES.find((r) => r.label === staffRole)!;

    // Everyone who may use this role. The password belongs to one person, so whichever
    // account accepts it tells us who is logging in - nobody types a name.
    const candidates = STAFF_ACCOUNTS.filter((a) => a.roles.includes(selected.role));

    let signedIn = false;
    for (const account of candidates) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: account.email,
        password: staffPassword,
      });
      if (!error && data.session) {
        signedIn = true;
        break;
      }
    }

    if (!signedIn) {
      alert("❌ Authorization Refused: wrong password.");
      setIsLoading(false);
      return;
    }

    // role chosen on the tab (matters for people who have both admin and sub-admin)
    setActiveRole(selected.role);
    try { localStorage.setItem("smes_staff_role", selected.label); } catch {}

    router.push(selected.path);
  };

  return (
    <main className="min-h-screen bg-neutral-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle Background Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 flex items-center justify-center">
        <motion.div
          animate={{ opacity: [0.3, 0.5, 0.3], scale: [1, 1.05, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="w-[300px] h-[300px] bg-lime-500/5 rounded-full blur-[100px]"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        className="bg-neutral-900 border border-neutral-800 p-6 sm:p-8 rounded-2xl w-full max-w-sm shadow-2xl space-y-5 relative z-10"
      >
        <div className="text-center">
          <span className="text-[10px] font-mono uppercase tracking-widest text-lime-400">// Secure Node Terminal</span>
          <h3 className="text-xl font-black uppercase text-white mt-1">System Gateway</h3>
        </div>

        <form onSubmit={handleStaffLogin} className="space-y-5" autoComplete="on" method="post">
          <div className="space-y-2">
            <label className="block text-[10px] font-mono uppercase tracking-wider text-neutral-400">Target Role</label>
            <LayoutGroup>
              <div className="grid grid-cols-3 gap-2">
                {ROLES.map(({ label }) => (
                  <motion.button
                    key={label}
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setStaffRole(label)}
                    className={`relative py-2.5 text-[11px] font-mono uppercase tracking-wider transition-colors border rounded-md ${
                      staffRole === label
                        ? "bg-lime-400 border-lime-400 text-black font-black"
                        : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white"
                    }`}
                  >
                    {staffRole === label && (
                      <motion.span
                        layoutId="role-highlight"
                        className="absolute inset-0 bg-lime-400 rounded-md -z-0"
                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">{label}</span>
                  </motion.button>
                ))}
              </div>
            </LayoutGroup>
          </div>

          <div className="space-y-2">
            <label htmlFor="staff-password" className="block text-[10px] font-mono uppercase tracking-wider text-slate-400">Access Keycode</label>
            <div className="relative">
              <input
                id="staff-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter password"
                value={staffPassword}
                onChange={(e) => setStaffPassword(e.target.value)}
                className="w-full p-3.5 pr-12 rounded-xl bg-neutral-950 text-white border border-neutral-800 focus:border-lime-400 outline-none text-base sm:text-sm font-medium transition-colors"
                autoFocus
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-neutral-500 hover:text-lime-400 transition-colors focus:outline-none text-xs font-mono"
              >
                {showPassword ? "HIDE" : "SHOW"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3">
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={() => router.push("/")}
              className="w-full bg-neutral-800 hover:bg-neutral-700 text-slate-300 font-mono text-xs uppercase tracking-wider py-3.5 rounded-xl transition-colors min-h-[44px]"
            >
              Cancel
            </motion.button>
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              type="submit"
              disabled={isLoading || !staffPassword}
              className={`w-full font-mono text-xs uppercase tracking-wider py-3.5 font-black transition-all rounded-xl flex items-center justify-center min-h-[44px] ${
                isLoading || !staffPassword
                  ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                  : "bg-gradient-to-r from-lime-400 to-lime-300 text-neutral-950 shadow-[0_0_15px_rgba(163,230,53,0.2)]"
              }`}
            >
              {isLoading ? <span className="w-4 h-4 border-2 border-neutral-500 border-t-transparent rounded-full animate-spin"></span> : "Authorize"}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </main>
  );
}