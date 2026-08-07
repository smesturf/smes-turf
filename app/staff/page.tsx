"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { motion, LayoutGroup } from "framer-motion";

export default function StaffPortal() {
  const router = useRouter();
  const [staffRole, setStaffRole] = useState("Admin");
  const [staffPassword, setStaffPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    let staffEmail = "";
    if (staffRole === "Admin") staffEmail = "sports+admin@smesturf.com";
    if (staffRole === "Sub-Admin") staffEmail = "sports+subadmin@smesturf.com";
    if (staffRole === "Coach") staffEmail = "sports+coach@smesturf.com";

    // 1. Authenticate securely with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email: staffEmail,
      password: staffPassword,
    });

    if (error) {
      alert(`❌ Authorization Refused: ${error.message}`);
      setIsLoading(false);
      return;
    }

    // 2. Route the user. Supabase has already saved the secure session token!
    if (data.session) {
      if (staffRole === "Admin") {
        router.push("/admin");
      } else if (staffRole === "Sub-Admin") {
        router.push("/subadmin");
      } else if (staffRole === "Coach") {
        router.push("/coach");
      }
    }
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
          <span className="text-[10px] font-mono uppercase tracking-widest text-lime-400">
            // Secure Node Terminal
          </span>
          <h3 className="text-xl font-black uppercase text-white mt-1">System Gateway</h3>
        </div>

        <form onSubmit={handleStaffLogin} className="space-y-5">
          <div className="space-y-2">
            <label className="block text-[10px] font-mono uppercase tracking-wider text-neutral-400">
              Target Role
            </label>
            <LayoutGroup>
              <div className="grid grid-cols-3 gap-2">
                {["Admin", "Sub-Admin", "Coach"].map((role) => (
                  <motion.button
                    key={role}
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setStaffRole(role)}
                    className={`relative py-2.5 text-[11px] font-mono uppercase tracking-wider transition-colors border rounded-md ${
                      staffRole === role
                        ? "bg-lime-400 border-lime-400 text-black font-black"
                        : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white"
                    }`}
                  >
                    {staffRole === role && (
                      <motion.span
                        layoutId="role-highlight"
                        className="absolute inset-0 bg-lime-400 rounded-md -z-0"
                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">{role}</span>
                  </motion.button>
                ))}
              </div>
            </LayoutGroup>
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Access Keycode
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter password"
                value={staffPassword}
                onChange={(e) => setStaffPassword(e.target.value)}
                className="w-full p-3.5 pr-12 rounded-xl bg-neutral-950 text-white border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors"
                autoFocus
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-neutral-500 hover:text-lime-400 transition-colors focus:outline-none"
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
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
              {isLoading ? (
                <span className="w-4 h-4 border-2 border-neutral-500 border-t-transparent rounded-full animate-spin"></span>
              ) : (
                "Authorize"
              )}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </main>
  );
}