"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  useEffect(() => {
    const loggedIn = localStorage.getItem("adminLoggedIn");
    const loginTime = localStorage.getItem("adminLoginTime");

    if (loggedIn === "true" && loginTime) {
      const hoursPassed =
        (Date.now() - Number(loginTime)) /
        (1000 * 60 * 60);

      if (hoursPassed < 12) {
        router.push("/admin");
      } else {
        localStorage.removeItem("adminLoggedIn");
        localStorage.removeItem("adminLoginTime");
      }
    }
  }, [router]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault(); // Prevents the page from refreshing when pressing Enter

    const lockUntil = localStorage.getItem("adminLockUntil");

    if (
      lockUntil &&
      Date.now() < Number(lockUntil)
    ) {
      alert(
        "Too many failed attempts. Try again in 5 minutes."
      );
      return;
    }

    if (
      username === "admin" &&
      password === "SMES@2026"
    ) {
      localStorage.setItem("adminLoggedIn", "true");
      localStorage.setItem(
        "adminLoginTime",
        Date.now().toString()
      );

      localStorage.removeItem("loginAttempts");
      localStorage.removeItem("adminLockUntil");

      router.push("/admin");
    } else {
      const attempts =
        Number(
          localStorage.getItem("loginAttempts") || "0"
        ) + 1;

      localStorage.setItem(
        "loginAttempts",
        attempts.toString()
      );

      if (attempts >= 3) {
        localStorage.setItem(
          "adminLockUntil",
          (
            Date.now() +
            5 * 60 * 1000
          ).toString()
        );

        alert(
          "Too many failed attempts. Login locked for 5 minutes."
        );
      } else {
        alert(
          `Invalid Username or Password. ${
            3 - attempts
          } attempt(s) remaining.`
        );
      }
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 font-sans tracking-tight antialiased p-4 relative overflow-hidden">
      {/* Background Stadium Glow Elements */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(163,230,53,0.08),transparent_70%)] pointer-events-none" />
      <div className="absolute top-[-10%] right-[-10%] w-[300px] h-[300px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-sm relative z-10 space-y-6">
        {/* Branding/Header Component */}
        <div className="text-center space-y-1">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[10px] font-mono uppercase tracking-widest text-lime-400 mb-2"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" />
            Secure Node Gateway
          </motion.div>
          
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-3xl font-black uppercase italic text-white tracking-tight"
          >
            SMES CONTROL
          </motion.h1>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Admin Tower Authentication</p>
        </div>

        {/* THE FIX: Wrapped inputs and button in a form element */}
        <motion.form
          onSubmit={handleLogin}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="bg-slate-900/60 backdrop-blur-xl p-5 sm:p-6 rounded-2xl border border-white/10 shadow-2xl space-y-4"
        >
          {/* Username Input Field */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400">System Operator ID</label>
            <input
              type="text"
              placeholder="Username"
              className="w-full p-3.5 sm:p-4 rounded-xl bg-slate-950 text-white border border-white/5 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none transition-all placeholder:text-slate-700 font-medium text-base sm:text-sm min-h-[48px] sm:min-h-[52px]"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          {/* Password Input Field */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400">Access Keycode</label>
            <input
              type="password"
              placeholder="Password"
              className="w-full p-3.5 sm:p-4 rounded-xl bg-slate-950 text-white border border-white/5 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none transition-all placeholder:text-slate-700 font-medium text-base sm:text-sm min-h-[48px] sm:min-h-[52px]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {/* Core Sign-In Trigger Action */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-lime-400 to-lime-300 hover:from-lime-300 hover:to-lime-200 text-slate-950 font-mono text-xs font-black uppercase tracking-widest py-3.5 sm:py-4 rounded-xl transition-all shadow-xl shadow-lime-400/10 min-h-[48px] sm:min-h-[52px] flex items-center justify-center"
            >
              Initialize Command
            </button>
          </div>
        </motion.form>

        {/* Footer Security Notice System */}
        <div className="text-center">
          <p className="text-[10px] font-mono uppercase tracking-wide text-slate-600">
            Protected Session Protocol — 12 Hour Automatic Clear
          </p>
        </div>
      </div>
    </main>
  );
}