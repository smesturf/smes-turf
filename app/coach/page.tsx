"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";

/* ------------------------------------------------------------------ */
/*  Motion Presets                                                    */
/* ------------------------------------------------------------------ */
const easeOut = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easeOut } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const rowItem = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { duration: 0.35, ease: easeOut } },
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */
export default function CoachPage() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false); // Secure validation state
  const [bookings, setBookings] = useState<any[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);

  // Registration Form States
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentPhone, setNewStudentPhone] = useState("");
  const [newStudentDOB, setNewStudentDOB] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");

  // UI state (visual only — does not touch business logic)
  const [tab, setTab] = useState<"bookings" | "blocks">("bookings"); // Set default tab cleanly
  const [search, setSearch] = useState("");
  const [isSendingEmails, setIsSendingEmails] = useState(false);

  const FIXED_COACHING_FEE = 3500;
  const currentMonthYear = new Date().toISOString().slice(0, 7); // YYYY-MM
  const currentMonthLabel = new Date().toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  /* -------- 1. FIXED ROUTE GUARD -------- */
  useEffect(() => {
    const isCoach = localStorage.getItem("subAdminLoggedIn");
    
    if (isCoach !== "true") {
      // If the coach token is missing, send them away
      router.replace("/");
    } else {
      // Token confirmed! Access allowed
      setIsAuthorized(true);
    }
  }, [router]);

  /* -------- 2. REALTIME SYNCHRONIZATION -------- */
  useEffect(() => {
    if (!isAuthorized) return; // Wait to connect until authorized

    loadCoachData();

    const bookingsChannel = supabase
      .channel("coach-b-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => loadCoachData())
      .subscribe();
    const blockedChannel = supabase
      .channel("coach-bl-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "blocked_slots" }, () => loadCoachData())
      .subscribe();
    const studentsChannel = supabase
      .channel("coach-st-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, () => loadCoachData())
      .subscribe();
    const paymentsChannel = supabase
      .channel("coach-p-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "student_payments" }, () => loadCoachData())
      .subscribe();

    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(blockedChannel);
      supabase.removeChannel(studentsChannel);
      supabase.removeChannel(paymentsChannel);
    };
  }, [isAuthorized]);

  const loadCoachData = async () => {
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

    const { data: bData } = await supabase
      .from("bookings")
      .select("*")
      .gte("booking_date", todayStr)
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true });
    setBookings(bData || []);

    const { data: blData } = await supabase
      .from("blocked_slots")
      .select("*")
      .gte("booking_date", todayStr)
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true });
    setBlockedSlots(blData || []);

    const { data: stData } = await supabase
      .from("students")
      .select(`*, student_payments(*)`)
      .order("name", { ascending: true });

    if (stData) {
      const processedStudents = stData.map((student: any) => {
        const currentMonthRecord = student.student_payments?.find(
          (p: any) => p.month_year === currentMonthYear
        );
        return {
          ...student,
          payment_status: currentMonthRecord ? currentMonthRecord.status : "pending",
          amount_paid: currentMonthRecord ? currentMonthRecord.amount_paid : 0,
          payment_method: currentMonthRecord ? currentMonthRecord.payment_method : "-",
          payment_record_id: currentMonthRecord ? currentMonthRecord.id : null,
        };
      });
      setStudents(processedStudents);
    }
  };

  const registerNewStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName || !newStudentPhone) {
      alert("Please complete name and phone fields");
      return;
    }
    if (newStudentPhone.length !== 10) {
      alert("⚠️ Input Error: Mobile number must be exactly 10 digits long.");
      return;
    }

    const { data: student, error: stError } = await supabase
      .from("students")
      .insert([{
        name: newStudentName,
        phone: newStudentPhone,
        dob: newStudentDOB || null,
        email: newStudentEmail || null,
        monthly_fee: FIXED_COACHING_FEE,
      }])
      .select()
      .single();

    if (stError || !student) {
      alert(stError?.message || "Registration failed node mismatch");
      return;
    }

    const { error: pmError } = await supabase.from("student_payments").insert([{
      student_id: student.id,
      month_year: currentMonthYear,
      status: "pending",
      amount_paid: 0,
      payment_method: null,
    }]);

    if (pmError) { alert(pmError.message); return; }

    alert(`✅ ${newStudentName} Enrolled Successfully! Pending Desk Payment Approval.`);
    setNewStudentName(""); setNewStudentPhone(""); setNewStudentDOB(""); setNewStudentEmail("");
    loadCoachData();
  };

  const exportCoachExcel = async () => {
    const XLSX = await import("xlsx");

    const currentMonthNum = new Date().getMonth();
    const currentYearNum = new Date().getFullYear();

    const data = students.map((s) => {
      const joinDate = new Date(s.created_at);
      const isNew =
        joinDate.getMonth() === currentMonthNum && joinDate.getFullYear() === currentYearNum;

      return {
        "Student Name": s.name + (isNew ? " (NEW)" : ""),
        "Phone Number": s.phone,
        "Date of Birth": s.dob ? new Date(s.dob).toLocaleDateString("en-GB") : "-",
        "Email ID": s.email || "-",
        "Monthly Fee (₹)": s.monthly_fee || FIXED_COACHING_FEE,
        "Amount Paid (₹)": s.amount_paid,
        "Payment Method": s.payment_method,
        "Status": s.payment_status === "settled" ? "✅ SETTLED" : "❌ PENDING",
        "Type": isNew ? "NEW STUDENT" : "EXISTING",
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Coaching Roster");

    worksheet["!cols"] = [
      { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 25 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
    ];
    XLSX.writeFile(workbook, `Coach_Report_${currentMonthYear}.xlsx`);
  };
  /* -------- Automated Email Reminders -------- */
  const sendEmailReminders = async () => {
    // 1. Filter students who are unpaid AND have an email address provided
    const pendingStudents = students.filter(s => s.payment_status !== "settled" && s.email);
    const noEmailStudents = students.filter(s => s.payment_status !== "settled" && !s.email);

    if (pendingStudents.length === 0) {
      alert(noEmailStudents.length > 0
        ? `⚠️ No pending students with valid email addresses. (${noEmailStudents.length} pending students are missing emails).`
        : "✅ All students have paid! No reminders needed.");
      return;
    }

    const confirmed = confirm(`Are you sure you want to send official email reminders to ${pendingStudents.length} student(s) for the month of ${currentMonthLabel}?`);
    if (!confirmed) return;

    setIsSendingEmails(true);
    try {
      // 2. Trigger the secure backend API
      const response = await fetch("/api/send-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          students: pendingStudents,
          month: currentMonthLabel,
          fee: FIXED_COACHING_FEE
        })
      });

      if (!response.ok) throw new Error("Failed to send emails");
      
      alert(`✅ Successfully dispatched ${pendingStudents.length} email reminders!`);
    } catch (error) {
      console.error(error);
      alert("❌ Failed to send emails. Please check your internet connection.");
    } finally {
      setIsSendingEmails(false);
    }
  };

  const getTimeRangeLabel = (startTimeStr: string, durationMins: number) => {
    if (!startTimeStr) return "";
    const [h, m] = startTimeStr.split(":");
    const startTotal = Number(h) * 60 + Number(m);
    const endTotal = startTotal + Number(durationMins);
    const formatString = (t: number) => {
      const hours24 = Math.floor(t / 60) % 24;
      const mins = t % 60;
      return `${hours24 % 12 === 0 ? 12 : hours24 % 12}:${String(mins).padStart(2, "0")} ${hours24 >= 12 ? "pm" : "am"}`;
    };
    return `${formatString(startTotal)} to ${formatString(endTotal)}`;
  };

  /* -------- Derived stats (visual only) -------- */
  const stats = useMemo(() => {
    const total = students.length;
    const paid = students.filter((s) => s.payment_status === "settled").length;
    const pending = total - paid;
    const currentMonthNum = new Date().getMonth();
    const currentYearNum = new Date().getFullYear();
    const newThisMonth = students.filter((s) => {
      const d = new Date(s.created_at);
      return d.getMonth() === currentMonthNum && d.getFullYear() === currentYearNum;
    }).length;
    return { total, paid, pending, newThisMonth };
  }, [students]);

  const filteredStudents = useMemo(() => {
    if (!search.trim()) return students;
    const q = search.toLowerCase();
    return students.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.phone?.includes(q) ||
        s.email?.toLowerCase().includes(q)
    );
  }, [students, search]);

  /* -------- 3. SECURE LOADER INTERCEPTOR -------- */
  if (!isAuthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-955 text-neutral-400">
        <div className="text-center space-y-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-lime-400 border-t-transparent mx-auto"></div>
          <p className="text-xs font-mono tracking-widest uppercase text-neutral-500">// Syncing Coach Credentials</p>
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER                                                          */
  /* ================================================================ */
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 font-sans tracking-tight antialiased relative w-full overflow-x-hidden">

      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 inset-x-0 h-[520px] bg-gradient-to-b from-lime-500/10 via-transparent to-transparent" />
        <motion.div
          animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-5%] left-[-10%] w-[55%] h-[40%] bg-emerald-500/10 rounded-full blur-[120px]"
        />
        <motion.div
          animate={{ x: [0, -50, 0], y: [0, 40, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[10%] right-[-10%] w-[50%] h-[50%] bg-lime-500/10 rounded-full blur-[120px]"
        />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-4 sm:p-6 md:p-10">

        {/* ---------- Header ---------- */}
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4 pb-6 mb-8 border-b border-neutral-900"
        >
          <motion.div variants={fadeUp}>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-900/80 backdrop-blur border border-neutral-800 text-[10px] font-mono uppercase tracking-widest text-lime-400 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" />
              // Football Academy Terminal
            </div>
            <h1 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter text-white leading-none">
              <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-neutral-400">
                Coach Portal
              </span>
            </h1>
            <p className="text-neutral-400 text-sm mt-2 font-mono">
              Live roster · Real-time sync · <span className="text-lime-400">{currentMonthLabel}</span>
            </p>
          </motion.div>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            <motion.button
              variants={fadeUp}
              whileHover={{ y: -2, boxShadow: "0 12px 30px rgba(239,68,68,0.35)" }}
              whileTap={{ scale: 0.97 }}
              onClick={sendEmailReminders}
              disabled={isSendingEmails}
              className={`bg-neutral-900 border border-neutral-800 text-red-400 hover:bg-red-950 hover:border-red-900 hover:text-white font-mono text-[10px] sm:text-xs uppercase tracking-widest px-5 py-4 font-black transition-colors flex items-center gap-2 ${isSendingEmails ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {isSendingEmails ? "⏳ Dispatching..." : "📧 Email Due Reminders"}
            </motion.button>
            <motion.button
              variants={fadeUp}
              whileHover={{ y: -2, boxShadow: "0 12px 30px rgba(163,230,53,0.35)" }}
              whileTap={{ scale: 0.97 }}
              onClick={exportCoachExcel}
              className="bg-lime-400 hover:bg-lime-300 text-black font-mono text-[10px] sm:text-xs uppercase tracking-widest px-5 py-4 font-black transition-colors flex items-center gap-2"
            >
              📊 Download Roster
            </motion.button>
            <button 
              onClick={() => { localStorage.removeItem("subAdminLoggedIn"); router.replace("/"); }}
              className="bg-neutral-900 border border-neutral-800 text-neutral-400 text-[10px] sm:text-xs font-mono py-4 px-4 hover:text-white transition-colors uppercase tracking-wider"
            >
              Exit Terminal
            </button>
          </div>
        </motion.div>

        {/* ---------- Stat Cards ---------- */}
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-10"
        >
          {[
            { label: "Total Students", value: stats.total, accent: "text-white", tag: "01" },
            { label: "Paid This Month", value: stats.paid, accent: "text-lime-400", tag: "02" },
            { label: "Pending Fees", value: stats.pending, accent: "text-red-400", tag: "03" },
            { label: "New This Month", value: stats.newThisMonth, accent: "text-emerald-400", tag: "04" },
          ].map((s) => (
            <motion.div
              key={s.label}
              variants={fadeUp}
              whileHover={{ y: -3, borderColor: "rgba(163,230,53,0.4)" }}
              className="border border-neutral-900 bg-neutral-900/30 backdrop-blur p-4 sm:p-5 transition-colors"
            >
              <span className="text-[10px] font-mono text-neutral-600 block mb-2">{s.tag} //</span>
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">
                {s.label}
              </p>
              <AnimatePresence mode="wait">
                <motion.div
                  key={s.value}
                  initial={{ opacity: 0, y: -6, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.9 }}
                  transition={{ duration: 0.25, ease: easeOut }}
                  className={`text-2xl sm:text-3xl font-black mt-1 ${s.accent}`}
                >
                  {s.value}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          ))}
        </motion.div>

        {/* ---------- Main Grid ---------- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">

          {/* -------- Left column -------- */}
          <div className="lg:col-span-2 space-y-6 lg:space-y-8">

            {/* Enrollment Card */}
            <motion.section
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.2 }}
              className="border border-neutral-900 bg-neutral-900/40 backdrop-blur p-5 sm:p-6 space-y-5"
            >
              <div>
                <span className="text-[11px] font-mono uppercase tracking-widest text-neutral-500 block mb-1">
                  01 — Enrollment
                </span>
                <h2 className="text-lg sm:text-xl font-black uppercase text-white">
                  Enroll New Student
                </h2>
                <p className="text-xs text-neutral-400 mt-1">
                  Add player details to the ledger. Fee collection is handled at the main desk counter.
                </p>
              </div>

              <form onSubmit={registerNewStudent} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase text-neutral-400">Student Name</label>
                  <input
                    type="text"
                    placeholder="Enter player name"
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                    className="w-full p-3.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase text-neutral-400">Phone (10 Digits)</label>
                  <input
                    type="text"
                    placeholder="10-digit number"
                    value={newStudentPhone}
                    onChange={(e) => {
                      const numericValue = e.target.value.replace(/\D/g, "");
                      if (numericValue.length <= 10) setNewStudentPhone(numericValue);
                    }}
                    maxLength={10}
                    className="w-full p-3.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium font-mono transition-colors text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase text-neutral-400">Date of Birth</label>
                  <input
                    type="date"
                    value={newStudentDOB}
                    onChange={(e) => setNewStudentDOB(e.target.value)}
                    className="w-full p-3.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors text-white"
                    style={{ colorScheme: "dark" }}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase text-neutral-400">Email ID</label>
                  <input
                    type="email"
                    placeholder="example@email.com"
                    value={newStudentEmail}
                    onChange={(e) => setNewStudentEmail(e.target.value)}
                    className="w-full p-3.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors text-white"
                  />
                </div>

                <motion.button
                  whileHover={{ y: -2, boxShadow: "0 12px 30px rgba(163,230,53,0.3)" }}
                  whileTap={{ scale: 0.97 }}
                  type="submit"
                  className="sm:col-span-2 bg-lime-400 hover:bg-lime-300 text-black font-mono font-black py-4 text-xs uppercase tracking-widest transition-colors"
                >
                  Submit Enrollment
                </motion.button>
              </form>
            </motion.section>

            {/* Roster Table */}
            <motion.section
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.15 }}
              className="border border-neutral-900 bg-neutral-900/30 backdrop-blur overflow-hidden"
            >
              <div className="p-4 sm:p-5 border-b border-neutral-900 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-widest text-neutral-500 block">
                    02 — Roster
                  </span>
                  <h2 className="text-base sm:text-lg font-black uppercase text-white mt-0.5">
                    Academy Roster · <span className="text-lime-400">{currentMonthLabel}</span>
                  </h2>
                </div>
                <input
                  type="text"
                  placeholder="Search name / phone / email"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full sm:w-64 p-2.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-xs font-mono transition-colors text-white"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[720px]">
                  <thead>
                    <tr className="border-b border-neutral-900 text-[10px] font-mono uppercase tracking-widest text-neutral-500 bg-neutral-950/40">
                      <th className="p-4">Student Info</th>
                      <th className="p-4">Contact Details</th>
                      <th className="p-4">Academy Fee</th>
                      <th className="p-4 text-center">Payment Status</th>
                    </tr>
                  </thead>
                  <motion.tbody
                    variants={stagger}
                    initial="hidden"
                    animate="show"
                    className="divide-y divide-neutral-900 text-sm font-medium"
                  >
                    <AnimatePresence>
                      {filteredStudents.length === 0 ? (
                        <motion.tr
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          <td colSpan={4} className="p-8 text-center text-xs font-mono text-neutral-600">
                            No students match your search.
                          </td>
                        </motion.tr>
                      ) : (
                        filteredStudents.map((student) => {
                          const joinDate = new Date(student.created_at);
                          const isNew =
                            joinDate.getMonth() === new Date().getMonth() &&
                            joinDate.getFullYear() === new Date().getFullYear();
                          const isUnpaid = student.payment_status !== "settled";

                          return (
                            <motion.tr
                              key={student.id}
                              variants={rowItem}
                              layout
                              className={`transition-colors ${
                                isUnpaid
                                  ? "bg-red-500/[0.05] hover:bg-red-500/[0.10]"
                                  : "hover:bg-lime-400/[0.03]"
                              }`}
                            >
                              <td className="p-4">
                                <div className={`font-bold flex items-center gap-2 ${
                                  isUnpaid ? "text-red-300" : "text-white"
                                }`}>
                                  {student.name}
                                  {isNew && (
                                    <motion.span
                                      initial={{ scale: 0 }}
                                      animate={{ scale: 1 }}
                                      className="px-2 py-0.5 text-[9px] bg-lime-400/15 border border-lime-400/30 text-lime-400 tracking-wider font-black uppercase"
                                    >
                                      New
                                    </motion.span>
                                  )}
                                </div>
                                <div className="text-[11px] text-neutral-500 font-mono mt-0.5">
                                  DOB:{" "}
                                  {student.dob
                                    ? new Date(student.dob).toLocaleDateString("en-GB")
                                    : "-"}
                                </div>
                              </td>
                              <td className="p-4 space-y-0.5">
                                <div className="font-mono text-neutral-300 text-xs">
                                  {student.phone}
                                </div>
                                <div className="text-xs text-neutral-500 truncate max-w-[200px]">
                                  {student.email || "-"}
                                </div>
                              </td>
                              <td className="p-4 font-mono text-white">
                                ₹{student.monthly_fee || FIXED_COACHING_FEE}
                              </td>
                              <td className="p-4 text-center">
                                {student.payment_status === "settled" ? (
                                  <span className="px-3 py-1 text-[10px] font-mono uppercase bg-lime-400/10 border border-lime-400/30 text-lime-400 whitespace-nowrap inline-flex items-center gap-1 justify-center">
                                    ✅ Paid
                                  </span>
                                ) : (
                                  <motion.span
                                    animate={{ opacity: [1, 0.5, 1] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                    className="px-3 py-1 text-[10px] font-mono uppercase bg-red-500/15 border border-red-500/40 text-red-400 font-black whitespace-nowrap inline-flex items-center gap-1 justify-center"
                                  >
                                    ⚠️ Unpaid
                                  </motion.span>
                                )}
                              </td>
                            </motion.tr>
                          );
                        })
                      )}
                    </AnimatePresence>
                  </motion.tbody>
                </table>
              </div>
            </motion.section>
          </div>

          {/* -------- Right Column: Live Feeds -------- */}
          <div className="space-y-6 lg:space-y-8 lg:col-span-1">

            {/* Tab pill (visual) */}
            <LayoutGroup>
              <div className="grid grid-cols-2 gap-2 p-1.5 border border-neutral-900 bg-neutral-900/30 backdrop-blur">
                {[
                  { id: "bookings", label: "Live Bookings" },
                  { id: "blocks", label: "Field Blocks" },
                ].map((t) => (
                  <motion.button
                    key={t.id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setTab(t.id as any)}
                    className={`relative py-2.5 text-[10px] font-mono uppercase tracking-widest transition-colors ${
                      tab === t.id
                        ? "text-black font-black"
                        : "text-neutral-500 hover:text-white"
                    }`}
                  >
                    {tab === t.id && (
                      <motion.span
                        layoutId="tab-highlight"
                        className="absolute inset-0 bg-lime-400 -z-0"
                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">{t.label}</span>
                  </motion.button>
                ))}
              </div>
            </LayoutGroup>

            {/* Bookings Feed */}
            <AnimatePresence mode="wait">
              {tab === "bookings" ? (
                <motion.section
                  key="bookings"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.3, ease: easeOut }}
                  className="border border-neutral-900 bg-neutral-900/30 backdrop-blur overflow-hidden"
                >
                  <div className="p-4 border-b border-neutral-900">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">
                      Feed // Read-only
                    </span>
                    <h2 className="text-sm font-black uppercase text-white mt-0.5">
                      📅 Active Turf Bookings
                    </h2>
                  </div>
                  <motion.div
                    variants={stagger}
                    initial="hidden"
                    animate="show"
                    className="max-h-[420px] overflow-y-auto p-3 space-y-2"
                  >
                    {bookings.length === 0 ? (
                      <p className="text-xs text-neutral-600 p-4 font-mono text-center">
                        No live match bookings.
                      </p>
                    ) : (
                      bookings.map((b) => (
                        <motion.div
                          key={b.id}
                          variants={rowItem}
                          whileHover={{ x: 4, borderColor: "rgba(163,230,53,0.4)" }}
                          className="p-3 bg-neutral-950/60 border border-neutral-900 font-mono text-xs transition-colors"
                        >
                          <div className="font-bold text-neutral-200">
                            {new Date(b.booking_date?.split("T")[0]).toLocaleDateString("en-GB")}
                          </div>
                          <div className="text-lime-400 font-black mt-1">
                            {getTimeRangeLabel(b.start_time, b.duration_minutes || 60)}
                          </div>
                          <div className="text-neutral-500 text-[10px] mt-0.5">
                            {b.court_number} • {b.booking_type}
                          </div>
                        </motion.div>
                      ))
                    )}
                  </motion.div>
                </motion.section>
              ) : (
                <motion.section
                  key="blocks"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.3, ease: easeOut }}
                  className="border border-neutral-900 bg-neutral-900/30 backdrop-blur overflow-hidden"
                >
                  <div className="p-4 border-b border-neutral-900">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">
                      Feed // Read-only
                    </span>
                    <h2 className="text-sm font-black uppercase text-white mt-0.5">
                      🚫 Excluded Field Blocks
                    </h2>
                  </div>
                  <motion.div
                    variants={stagger}
                    initial="hidden"
                    animate="show"
                    className="max-h-[420px] overflow-y-auto p-3 space-y-2"
                  >
                    {blockedSlots.length === 0 ? (
                      <p className="text-xs text-neutral-600 p-4 font-mono text-center">
                        No field block restrictions.
                      </p>
                    ) : (
                      blockedSlots.map((s) => (
                        <motion.div
                          key={s.id}
                          variants={rowItem}
                          whileHover={{ x: 4, borderColor: "rgba(239,68,68,0.4)" }}
                          className="p-3 bg-neutral-950/60 border border-red-500/10 font-mono text-xs transition-colors"
                        >
                          <div className="font-bold text-neutral-400">
                            {new Date(s.booking_date?.split("T")[0]).toLocaleDateString("en-GB")}
                          </div>
                          <div className="text-red-400 font-black mt-1">
                            {getTimeRangeLabel(s.start_time, s.duration_minutes || 60)}
                          </div>
                          <div className="text-neutral-500 text-[10px] mt-0.5 uppercase">
                            {s.reason} • {s.court_number}
                          </div>
                        </motion.div>
                      ))
                    )}
                  </motion.div>
                </motion.section>
              )}
            </AnimatePresence>

            {/* Small footer note */}
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="text-[10px] font-mono text-neutral-600 uppercase tracking-widest text-center pt-2"
            >
              // SMES Sports Academy · Live Sync Enabled
            </motion.div>
          </div>
        </div>
      </div>
    </main>
  );
}