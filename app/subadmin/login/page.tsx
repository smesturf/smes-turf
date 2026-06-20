"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function SubAdminLogin() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    // 🔒 CHANGE THIS PIN TO WHATEVER YOU WANT YOUR STAFF TO USE
    const STAFF_PIN = "1234";

    if (pin === STAFF_PIN) {
      localStorage.setItem("subadminLoggedIn", "true");
      router.push("/subadmin");
    } else {
      setError("❌ Invalid Security PIN");
      setPin("");
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background FX */}
      <div className="absolute top-0 inset-x-0 h-64 bg-gradient-to-b from-cyan-500/10 via-transparent to-transparent pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-slate-900/80 backdrop-blur-xl border border-white/10 p-8 rounded-2xl shadow-2xl relative z-10"
      >
        <div className="text-center mb-8">
          <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 block mb-2">
            // Ground Staff Access
          </span>
          <h1 className="text-2xl font-black uppercase tracking-wide text-white italic">
            SMES Staff Panel
          </h1>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-2 text-center">
              Enter Passcode
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setError(""); // Clear error when typing
              }}
              className="w-full bg-slate-950 border border-white/10 text-white text-center text-3xl tracking-[1em] p-4 rounded-xl focus:border-cyan-400 outline-none transition-all font-mono"
              placeholder="••••"
              autoFocus
            />
            {error && (
              <p className="text-red-400 text-xs font-mono text-center mt-3 animate-pulse">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono text-sm uppercase tracking-widest py-4 rounded-xl font-black transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)]"
          >
            Authenticate
          </button>
        </form>

        <div className="mt-8 text-center border-t border-white/5 pt-6">
          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">
            Authorized Personnel Only
          </p>
        </div>
      </motion.div>
    </main>
  );
}