"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";

/* ------------------------------------------------------------------ */
/*  Motion Presets (mirrored from coach)                              */
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
export default function SubAdminPage() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  const [bookings, setBookings] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [blockedSlots, setBlockedSlots] = useState<any[]>([]);
  const [todaySlots, setTodaySlots] = useState(0);
  const [tomorrowSlots, setTomorrowSlots] = useState(0);
  const [todayCashCollection, setTodayCashCollection] = useState(0);
  const [todayUpiCollection, setTodayUpiCollection] = useState(0);
  const [todayTotalCollection, setTodayTotalCollection] = useState(0);
  const [showManageSlots, setShowManageSlots] = useState(false);

  // ⚽ Synchronized Academy Coaching Parameters
  const [showCoachingPanel, setShowCoachingPanel] = useState(false);
  const [academyStudents, setAcademyStudents] = useState<any[]>([]);
  const [academyTab, setAcademyTab] = useState<"new" | "existing">("existing");
  const [adminNewStudentName, setAdminNewStudentName] = useState("");
  const [adminNewStudentPhone, setAdminNewStudentPhone] = useState("");
  const [adminNewStudentDOB, setAdminNewStudentDOB] = useState("");
  const [adminNewStudentEmail, setAdminNewStudentEmail] = useState("");
  const [adminNewStudentMethod, setAdminNewStudentMethod] = useState("UPI");
  const [adminSelectedStudentId, setAdminSelectedStudentId] = useState("");
  const [adminExistingMethod, setAdminExistingMethod] = useState("UPI");

  // Feed tab (visual only)
  const [feedTab, setFeedTab] = useState<"bookings" | "blocks">("bookings");

  const FIXED_COACHING_FEE = 3500;
  const currentMonthYear = new Date().toISOString().slice(0, 7);
  const currentMonthLabel = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

  const [slotDate, setSlotDate] = useState("");
  const adminTimeSlots = Array.from({ length: 48 }, (_, i) => {
    const hours = Math.floor(i / 2);
    const minutes = i % 2 === 0 ? "00" : "30";
    const date = new Date();
    date.setHours(hours);
    date.setMinutes(Number(minutes));
    return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  });

  const [slotTime, setSlotTime] = useState("");
  const [offlineAmount, setOfflineAmount] = useState("");
  const [offlinePaymentMethod, setOfflinePaymentMethod] = useState("Cash");
  const [offlineCashAmount, setOfflineCashAmount] = useState("");
  const [offlineUpiAmount, setOfflineUpiAmount] = useState("");
  const [slotCourt, setSlotCourt] = useState("Full Court");
  const [availableCourts, setAvailableCourts] = useState(["Full Court", "Court 1", "Court 2"]);

  const [availableAdminSlots, setAvailableAdminSlots] = useState<string[]>([]);
  const [slotDuration, setSlotDuration] = useState(60);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);

  const [paymentType, setPaymentType] = useState("Full Cash");
  const [cashAmount, setCashAmount] = useState("");
  const [upiAmount, setUpiAmount] = useState("");

  /* ---------- Helpers ---------- */
  const convertToMins = (t: string) => {
    if (!t) return 0;
    const [timePart, ampm] = t.split(" ");
    let [h, m] = timePart.split(":").map(Number);
    if (ampm?.toUpperCase() === "PM" && h !== 12) h += 12;
    if (ampm?.toUpperCase() === "AM" && h === 12) h = 0;
    return h * 60 + m;
  };

  const getTimeRangeLabel = (startTimeStr: string, durationMins: number) => {
    if (!startTimeStr) return "";
    const [h, m] = startTimeStr.split(":");
    const startTotal = Number(h) * 60 + Number(m);
    const endTotal = startTotal + Number(durationMins);
    const formatString = (totalMins: number) => {
      const hours24 = Math.floor(totalMins / 60) % 24;
      const mins = totalMins % 60;
      const ampm = hours24 >= 12 ? "pm" : "am";
      const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
      return `${hours12}:${String(mins).padStart(2, "0")} ${ampm}`;
    };
    return `${formatString(startTotal)} to ${formatString(endTotal)}`;
  };

  const formatDate = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const today = formatDate(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = formatDate(tomorrowDate);

  /* ---------- Auth Guard ---------- */
  useEffect(() => {
    const loggedIn = localStorage.getItem("subAdminLoggedIn");
    if (loggedIn !== "true") {
      router.replace("/");
    } else {
      setIsAuthorized(true);
    }
  }, [router]);

  /* ---------- Realtime + Initial Load ---------- */
  useEffect(() => {
    if (!isAuthorized) return;

    loadBookings();
    loadAcademyData();

    const bookingsChannel = supabase
      .channel("bookings-realtime-sub")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => loadBookings())
      .subscribe();

    const blockedChannel = supabase
      .channel("blocked-slots-realtime-sub")
      .on("postgres_changes", { event: "*", schema: "public", table: "blocked_slots" }, () => loadBookings())
      .subscribe();

    const studentsChannel = supabase
      .channel("students-realtime-sub")
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, () => loadAcademyData())
      .subscribe();

    const paymentsChannel = supabase
      .channel("payments-realtime-sub")
      .on("postgres_changes", { event: "*", schema: "public", table: "student_payments" }, () => loadAcademyData())
      .subscribe();

    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(blockedChannel);
      supabase.removeChannel(studentsChannel);
      supabase.removeChannel(paymentsChannel);
    };
  }, [isAuthorized]);

  /* ---------- 12h Session Timeout ---------- */
  useEffect(() => {
    if (!isAuthorized) return;
    let timeout: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        localStorage.removeItem("subAdminLoggedIn");
        alert("Session expired after 12 hours. Please re-authorize via the Home Page.");
        router.push("/");
      }, 12 * 60 * 60 * 1000);
    };

    window.addEventListener("mousemove", resetTimer);
    window.addEventListener("keypress", resetTimer);
    window.addEventListener("click", resetTimer);
    resetTimer();

    return () => {
      clearTimeout(timeout);
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("keypress", resetTimer);
      window.removeEventListener("click", resetTimer);
    };
  }, [router, isAuthorized]);

  /* ---------- Data Loaders ---------- */
  const loadAcademyData = async () => {
    const { data: stData } = await supabase
      .from("students")
      .select(`*, student_payments(*)`)
      .order("name", { ascending: true });

    if (stData) {
      setAcademyStudents(stData.map((student: any) => {
        const currentMonthRecord = student.student_payments?.find((p: any) => p.month_year === currentMonthYear);
        return {
          ...student,
          payment_status: currentMonthRecord ? currentMonthRecord.status : "pending",
          amount_paid: currentMonthRecord ? currentMonthRecord.amount_paid : 0,
          payment_method: currentMonthRecord ? currentMonthRecord.payment_method : "-",
          payment_record_id: currentMonthRecord ? currentMonthRecord.id : null,
        };
      }));
    }
  };

  const loadBookings = async () => {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .or(`booking_date.gte.${today},balance_amount.gt.0`)
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) { console.log(error); return; }
    setBookings(data || []);

    const { data: blockedData } = await supabase
      .from("blocked_slots")
      .select("*")
      .gte("booking_date", today)
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true });
    setBlockedSlots(blockedData || []);

    const todaysBookings = data?.filter((b) => b.booking_date?.split("T")[0] === today) || [];
    const tomorrowsBookings = data?.filter((b) => b.booking_date?.split("T")[0] === tomorrow) || [];

    setTodaySlots(todaysBookings.length);
    setTomorrowSlots(tomorrowsBookings.length);

    const cashCollectedToday = todaysBookings.reduce((sum, b) => sum + Number(b.cash_received || 0), 0);
    const upiCollectedToday = todaysBookings.reduce((sum, b) => sum + Number(b.upi_received || 0), 0);
    setTodayCashCollection(cashCollectedToday);
    setTodayUpiCollection(upiCollectedToday);
    setTodayTotalCollection(Number(cashCollectedToday) + Number(upiCollectedToday));
  };

  const loadAvailableCourts = async (date: string, time: string) => {
    const { data: bookingsData } = await supabase.from("bookings").select("*").eq("booking_date", date);
    const { data: blockedData } = await supabase.from("blocked_slots").select("*").eq("booking_date", date);

    let courts = ["Full Court", "Court 1", "Court 2"];
    const selectedMinutes = convertToMins(time);

    [...(bookingsData || []), ...(blockedData || [])].forEach((b: any) => {
      const startMinutes = convertToMins(b.start_time);
      const endMinutes = startMinutes + (b.duration_minutes || 60);
      const overlaps = selectedMinutes >= startMinutes && selectedMinutes < endMinutes;
      if (!overlaps) return;

      if (b.booking_type === "Full Court" || b.court_number === "Full Court" || b.court_number === "Both Courts") {
        courts = [];
      } else if (b.court_number === "Court 1") {
        courts = courts.filter((c) => c !== "Court 1" && c !== "Full Court");
      } else if (b.court_number === "Court 2") {
        courts = courts.filter((c) => c !== "Court 2" && c !== "Full Court");
      }
    });
    setAvailableCourts(courts);
  };

  const loadAvailableAdminSlots = async (date: string) => {
    const { data: bookingsData } = await supabase.from("bookings").select("start_time,duration_minutes,booking_type,court_number").eq("booking_date", date);
    const { data: blockedData } = await supabase.from("blocked_slots").select("start_time,duration_minutes,court_number").eq("booking_date", date);

    const availableTimes: string[] = [];
    adminTimeSlots.forEach((slot) => {
      const selectedMinutes = convertToMins(slot);
      let court1Available = true;
      let court2Available = true;

      [...(bookingsData || []), ...(blockedData || [])].forEach((b: any) => {
        const startMinutes = convertToMins(b.start_time);
        const endMinutes = startMinutes + (b.duration_minutes || 60);
        const overlaps = selectedMinutes >= startMinutes && selectedMinutes < endMinutes;
        if (!overlaps) return;
        if (b.booking_type === "Full Court" || b.court_number === "Full Court" || b.court_number === "Both Courts") {
          court1Available = false; court2Available = false;
        } else if (b.court_number === "Court 1") { court1Available = false; }
        else if (b.court_number === "Court 2") { court2Available = false; }
      });
      if (court1Available || court2Available) availableTimes.push(slot);
    });
    setAvailableAdminSlots(availableTimes);
  };

  /* ---------- Actions ---------- */
  const handleAdminEnrollStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminNewStudentName || !adminNewStudentPhone) { alert("Please complete name and phone fields"); return; }
    if (adminNewStudentPhone.length !== 10) { alert("Phone number must be exactly 10 digits"); return; }

    const { data: student, error: stError } = await supabase
      .from("students")
      .insert([{ name: adminNewStudentName, phone: adminNewStudentPhone, dob: adminNewStudentDOB || null, email: adminNewStudentEmail || null, monthly_fee: FIXED_COACHING_FEE }])
      .select().single();

    if (stError || !student) { alert(stError?.message || "Enrollment failure"); return; }

    const { error: pmError } = await supabase
      .from("student_payments")
      .insert([{ student_id: student.id, month_year: currentMonthYear, status: "settled", amount_paid: FIXED_COACHING_FEE, payment_method: adminNewStudentMethod }]);

    if (pmError) { alert(pmError.message); return; }

    alert(`✅ ${adminNewStudentName} Enrolled & Marked as Paid via ${adminNewStudentMethod}`);
    setAdminNewStudentName(""); setAdminNewStudentPhone(""); setAdminNewStudentDOB(""); setAdminNewStudentEmail("");
    loadAcademyData();
  };

  const handleAdminOldPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSelectedStudentId) { alert("Please select a student name first"); return; }
    const target = academyStudents.find(s => s.id === adminSelectedStudentId);
    if (!target) return;

    if (target.payment_record_id) {
      await supabase
        .from("student_payments")
        .update({ status: "settled", amount_paid: FIXED_COACHING_FEE, payment_method: adminExistingMethod, updated_at: new Date().toISOString() })
        .eq("id", target.payment_record_id);
    } else {
      await supabase
        .from("student_payments")
        .insert([{ student_id: adminSelectedStudentId, month_year: currentMonthYear, status: "settled", amount_paid: FIXED_COACHING_FEE, payment_method: adminExistingMethod }]);
    }
    alert("💸 Monthly Payment Logged Successfully");
    setAdminSelectedStudentId("");
    loadAcademyData();
  };

  const saveOfflineBooking = async () => {
    if (!slotDate || !slotTime) { alert("Please select date and time"); return; }

    const { data: existingBookings } = await supabase.from("bookings").select("*").eq("booking_date", slotDate);
    const { data: existingBlocks } = await supabase.from("blocked_slots").select("*").eq("booking_date", slotDate);

    const selectedStart = convertToMins(slotTime);
    const selectedEnd = selectedStart + Number(slotDuration);
    const allBusyItems = [...(existingBookings || []), ...(existingBlocks || [])];

    const isOverlapping = allBusyItems.some((item) => {
      const itemStart = convertToMins(item.start_time);
      const itemEnd = itemStart + (item.duration_minutes || 60);
      const overlaps = selectedStart < itemEnd && selectedEnd > itemStart;
      if (!overlaps) return false;
      if (slotCourt === "Full Court" || slotCourt === "Both Courts") return true;
      if (item.booking_type === "Full Court" || item.court_number === "Full Court" || item.court_number === "Both Courts") return true;
      return item.court_number === slotCourt;
    });

    if (isOverlapping) { alert("⚠️ This court is already booked or blocked at the selected time."); return; }

    let totalAmount = 0;
    let cashReceived = 0;
    let upiReceived = 0;

    if (offlinePaymentMethod === "Cash") {
      totalAmount = Number(offlineAmount);
      cashReceived = totalAmount;
    } else if (offlinePaymentMethod === "UPI") {
      totalAmount = Number(offlineAmount);
      upiReceived = totalAmount;
    } else if (offlinePaymentMethod === "Cash + UPI") {
      cashReceived = Number(offlineCashAmount || 0);
      upiReceived = Number(offlineUpiAmount || 0);
      totalAmount = cashReceived + upiReceived;
    }

    if (totalAmount <= 0) { alert("Enter amount received"); return; }

    const { error } = await supabase.from("bookings").insert([{
      customer_name: "Offline Booking",
      phone: "-",
      sport: "Football",
      booking_date: slotDate,
      start_time: slotTime,
      duration_minutes: Number(slotDuration),
      booking_type: slotCourt === "Full Court" ? "Full Court" : "Half Court",
      court_number: slotCourt,
      total_amount: totalAmount,
      advance_amount: totalAmount,
      balance_amount: 0,
      payment_status: "paid",
      payment_method: offlinePaymentMethod,
      cash_received: cashReceived,
      upi_received: upiReceived,
      payment_completed: true,
    }]);

    if (error) { alert(error.message); return; }

    alert("✅ Offline Walk-in Booking Saved");
    await loadBookings();
    setSlotDate(""); setSlotTime(""); setSlotDuration(60); setSlotCourt("Full Court");
    setOfflineAmount(""); setOfflineCashAmount(""); setOfflineUpiAmount(""); setShowManageSlots(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("subAdminLoggedIn");
    router.push("/");
  };

  const savePayment = async () => {
    if (!selectedBooking) return;
    const balance = selectedBooking.balance_amount || 0;
    let cash = 0;
    let upi = 0;

    if (paymentType === "Full Cash") { cash = balance; }
    else if (paymentType === "Full UPI") { upi = balance; }
    else if (paymentType === "Cash + UPI") {
      cash = Number(cashAmount);
      upi = Number(upiAmount);
      if (cash + upi !== balance) { alert(`Cash + UPI must equal ₹${balance}`); return; }
    }

    const { error } = await supabase.from("bookings").update({
      cash_received: cash,
      upi_received: upi,
      payment_method: paymentType,
      payment_completed: true,
      balance_amount: 0,
    }).eq("id", selectedBooking.id);

    if (error) { alert(error.message); return; }
    alert("✅ Payment Collected");
    setShowPaymentModal(false); setCashAmount(""); setUpiAmount(""); loadBookings();
  };

  const resetPayment = async (booking: any) => {
    const confirmed = confirm("Reset this payment?");
    if (!confirmed) return;
    const originalBalance = (booking.total_amount || 0) - (booking.advance_amount || 0);

    const { error } = await supabase.from("bookings").update({
      cash_received: 0, upi_received: 0, payment_method: null, payment_completed: false, balance_amount: originalBalance,
    }).eq("id", booking.id);

    if (error) { alert(error.message); return; }
    alert("✅ Payment Reset");
    loadBookings();
  };

  /* ---------- Derived ---------- */
  const todaysAdvance = bookings
    .filter((b) => b.created_at?.split("T")[0] === today)
    .reduce((sum, b) => sum + (b.advance_amount || 0), 0);

  const todaysBalance = bookings
    .filter((b) => b.booking_date?.split("T")[0] === today)
    .reduce((sum, b) => sum + (b.balance_amount || 0), 0);

  const filteredBookings = useMemo(() => {
    if (!searchTerm.trim()) return bookings;
    const q = searchTerm.toLowerCase();
    return bookings.filter((b) =>
      b.customer_name?.toLowerCase().includes(q) || b.phone?.includes(searchTerm)
    );
  }, [bookings, searchTerm]);

  /* ---------- Auth Loader ---------- */
  if (!isAuthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-400">
        <div className="text-center space-y-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-lime-400 border-t-transparent mx-auto"></div>
          <p className="text-xs font-mono tracking-widest uppercase text-neutral-500">// Syncing Staff Credentials</p>
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
              // Ground Staff Terminal
            </div>
            <h1 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter text-white leading-none">
              <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-neutral-400">
                SMES Staff Panel
              </span>
            </h1>
            <p className="text-neutral-400 text-sm mt-2 font-mono">
              Live booking desk · Real-time sync · <span className="text-lime-400">{currentMonthLabel}</span>
            </p>
          </motion.div>

          <motion.div variants={fadeUp} className="flex items-center gap-3">
            <motion.button
              whileHover={{ y: -2, boxShadow: "0 12px 30px rgba(163,230,53,0.35)" }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowManageSlots(true)}
              className="bg-lime-400 hover:bg-lime-300 text-black font-mono text-xs uppercase tracking-widest px-6 py-4 font-black transition-colors flex items-center gap-2"
            >
              ➕ Walk-in Booking
            </motion.button>
            <button
              onClick={() => {
                const nextState = !showCoachingPanel;
                setShowCoachingPanel(nextState);
                if (nextState) setAcademyTab("existing");
              }}
              className={`text-xs font-mono py-4 px-5 uppercase tracking-widest transition-colors border ${
                showCoachingPanel
                  ? "bg-lime-400 text-black border-lime-400 font-black"
                  : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-lime-400"
              }`}
            >
              ⚽ Football Coaching
            </button>
            <button
              onClick={handleLogout}
              className="bg-neutral-900 border border-neutral-800 text-neutral-400 text-xs font-mono py-4 px-5 hover:text-red-400 transition-colors uppercase tracking-wider"
            >
              Exit Terminal
            </button>
          </motion.div>
        </motion.div>

        {/* ---------- Stat Cards ---------- */}
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-10"
        >
          {[
            { label: "Today Slots", value: todaySlots, accent: "text-lime-400", tag: "01" },
            { label: "Tomorrow Slots", value: tomorrowSlots, accent: "text-white", tag: "02" },
            { label: "Today Advance", value: `₹${todaysAdvance}`, accent: "text-emerald-400", tag: "03" },
            { label: "Today Balance", value: `₹${todaysBalance}`, accent: "text-red-400", tag: "04" },
            { label: "Cash Vault", value: `₹${todayCashCollection}`, accent: "text-amber-300", tag: "05" },
            { label: "UPI Nodes", value: `₹${todayUpiCollection}`, accent: "text-cyan-300", tag: "06" },
          ].map((s) => (
            <motion.div
              key={s.label}
              variants={fadeUp}
              whileHover={{ y: -3, borderColor: "rgba(163,230,53,0.4)" }}
              className="border border-neutral-900 bg-neutral-900/30 backdrop-blur p-4 sm:p-5 transition-colors"
            >
              <span className="text-[10px] font-mono text-neutral-600 block mb-2">{s.tag} //</span>
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">{s.label}</p>
              <AnimatePresence mode="wait">
                <motion.div
                  key={String(s.value)}
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

        {/* ---------- Football Coaching Panel (conditional) ---------- */}
        <AnimatePresence>
          {showCoachingPanel && (
            <motion.section
              key="coaching"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4, ease: easeOut }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10"
            >
              {/* Left: Form */}
              <div className="lg:col-span-1 border border-neutral-900 bg-neutral-900/40 backdrop-blur p-5 sm:p-6 space-y-4 h-fit">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-widest text-neutral-500 block mb-1">A — Coaching Ops</span>
                  <h2 className="text-lg font-black uppercase text-white">Academy Fee Desk</h2>
                </div>

                <div className="flex gap-2 border-b border-neutral-900 pb-3">
                  <button
                    onClick={() => setAcademyTab("existing")}
                    className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest transition-colors ${
                      academyTab === "existing" ? "bg-lime-400 text-black font-black" : "bg-neutral-950 border border-neutral-800 text-neutral-400 hover:text-white"
                    }`}
                  >
                    🔄 Log Old Fee
                  </button>
                  <button
                    onClick={() => setAcademyTab("new")}
                    className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest transition-colors ${
                      academyTab === "new" ? "bg-lime-400 text-black font-black" : "bg-neutral-950 border border-neutral-800 text-neutral-400 hover:text-white"
                    }`}
                  >
                    👶 Enroll Student
                  </button>
                </div>

                {academyTab === "new" ? (
                  <form onSubmit={handleAdminEnrollStudent} className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase text-neutral-400">Student Name</label>
                      <input type="text" placeholder="Enter player name" value={adminNewStudentName} onChange={(e) => setAdminNewStudentName(e.target.value)} className="w-full p-3.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors text-white" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase text-neutral-400">Phone (10 Digits)</label>
                      <input
                        type="text"
                        placeholder="10-digit number"
                        value={adminNewStudentPhone}
                        onChange={(e) => {
                          const numericValue = e.target.value.replace(/\D/g, "");
                          if (numericValue.length <= 10) setAdminNewStudentPhone(numericValue);
                        }}
                        maxLength={10}
                        className="w-full p-3.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium font-mono transition-colors text-white"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase text-neutral-400">Date of Birth</label>
                      <input type="date" value={adminNewStudentDOB} onChange={(e) => setAdminNewStudentDOB(e.target.value)} className="w-full p-3.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors text-white" style={{ colorScheme: "dark" }} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase text-neutral-400">Email ID</label>
                      <input type="email" placeholder="example@email.com" value={adminNewStudentEmail} onChange={(e) => setAdminNewStudentEmail(e.target.value)} className="w-full p-3.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors text-white" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase text-neutral-400">Payment Method</label>
                      <select value={adminNewStudentMethod} onChange={(e) => setAdminNewStudentMethod(e.target.value)} className="w-full p-3.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors text-white">
                        <option value="UPI">UPI</option>
                        <option value="Cash">Cash</option>
                      </select>
                    </div>
                    <div className="p-3 bg-neutral-950 border border-neutral-800 text-xs font-mono font-black text-lime-400">Fixed Fee Rate: ₹3,500</div>
                    <motion.button
                      whileHover={{ y: -2, boxShadow: "0 12px 30px rgba(163,230,53,0.3)" }}
                      whileTap={{ scale: 0.97 }}
                      type="submit"
                      className="w-full bg-lime-400 hover:bg-lime-300 text-black font-mono font-black py-4 text-xs uppercase tracking-widest transition-colors"
                    >
                      Enroll & Mark Paid
                    </motion.button>
                  </form>
                ) : (
                  <form onSubmit={handleAdminOldPayment} className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase text-neutral-400">Select Due Student</label>
                      <select value={adminSelectedStudentId} onChange={(e) => setAdminSelectedStudentId(e.target.value)} className="w-full p-3.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors text-white">
                        <option value="">-- Select Due Student --</option>
                        {academyStudents.filter(s => s.payment_status !== "settled").map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({s.phone})</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase text-neutral-400">Payment Method</label>
                      <select value={adminExistingMethod} onChange={(e) => setAdminExistingMethod(e.target.value)} className="w-full p-3.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors text-white">
                        <option value="UPI">UPI</option>
                        <option value="Cash">Cash</option>
                      </select>
                    </div>
                    <div className="p-3 bg-neutral-950 border border-neutral-800 text-xs font-mono font-black text-lime-400">Enforced Rate: ₹3,500</div>
                    <motion.button
                      whileHover={{ y: -2, boxShadow: "0 12px 30px rgba(163,230,53,0.3)" }}
                      whileTap={{ scale: 0.97 }}
                      type="submit"
                      className="w-full bg-lime-400 hover:bg-lime-300 text-black font-mono font-black py-4 text-xs uppercase tracking-widest transition-colors"
                    >
                      Settle Selected Student
                    </motion.button>
                  </form>
                )}
              </div>

              {/* Right: Roster */}
              <div className="lg:col-span-2 border border-neutral-900 bg-neutral-900/30 backdrop-blur overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-neutral-900">
                  <span className="text-[11px] font-mono uppercase tracking-widest text-neutral-500 block">B — Roster</span>
                  <h2 className="text-base sm:text-lg font-black uppercase text-white mt-0.5">
                    Master Academy Roster · <span className="text-lime-400">{currentMonthLabel}</span>
                  </h2>
                </div>

                {/* Mobile Cards */}
                <div className="block sm:hidden max-h-[380px] overflow-y-auto p-3 space-y-2">
                  {academyStudents.map((s) => {
                    const isUnpaid = s.payment_status !== "settled";
                    return (
                      <div key={s.id} className={`p-4 border transition-colors ${isUnpaid ? "bg-red-500/[0.05] border-red-500/20" : "bg-neutral-950/60 border-neutral-900"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className={`text-sm font-bold ${isUnpaid ? "text-red-300" : "text-white"}`}>{s.name}</h4>
                            <p className="text-[10px] font-mono text-neutral-500">DOB: {s.dob ? new Date(s.dob).toLocaleDateString("en-GB") : "-"}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] bg-neutral-950/60 p-2.5 border border-neutral-900 font-mono">
                          <div>
                            <span className="block text-[9px] uppercase tracking-widest text-neutral-600 font-bold mb-0.5">Contact</span>
                            <span className="text-neutral-300">{s.phone}</span>
                          </div>
                          <div className="truncate">
                            <span className="block text-[9px] uppercase tracking-widest text-neutral-600 font-bold mb-0.5">Email</span>
                            <span className="text-neutral-300 truncate block" title={s.email}>{s.email || "-"}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-3 mt-3 border-t border-neutral-900">
                          <span className="text-[10px] font-mono text-neutral-600 uppercase tracking-widest font-bold">Month Fee</span>
                          {isUnpaid ? (
                            <motion.span animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 2, repeat: Infinity }} className="px-3 py-1 text-[10px] font-mono uppercase bg-red-500/15 border border-red-500/40 text-red-400 font-black">⚠️ Unpaid</motion.span>
                          ) : (
                            <span className="px-3 py-1 text-[10px] font-mono uppercase bg-lime-400/10 border border-lime-400/30 text-lime-400">✅ Paid ({s.payment_method})</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table */}
                <div className="hidden sm:block overflow-x-auto max-h-[380px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-neutral-900 text-[10px] font-mono uppercase tracking-widest text-neutral-500 bg-neutral-950/40 sticky top-0 backdrop-blur z-20">
                        <th className="p-4">Student Profile</th>
                        <th className="p-4">Contact Detail Logs</th>
                        <th className="p-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <motion.tbody variants={stagger} initial="hidden" animate="show" className="divide-y divide-neutral-900 text-sm font-medium">
                      {academyStudents.map((s) => {
                        const isUnpaid = s.payment_status !== "settled";
                        return (
                          <motion.tr key={s.id} variants={rowItem} className={`transition-colors ${isUnpaid ? "bg-red-500/[0.05] hover:bg-red-500/[0.10]" : "hover:bg-lime-400/[0.03]"}`}>
                            <td className="p-4">
                              <div className={`font-bold ${isUnpaid ? "text-red-300" : "text-white"}`}>{s.name}</div>
                              <div className="text-[10px] font-mono text-neutral-500 mt-0.5">DOB: {s.dob ? new Date(s.dob).toLocaleDateString("en-GB") : "-"}</div>
                            </td>
                            <td className="p-4 space-y-0.5">
                              <div className="font-mono text-neutral-300">{s.phone}</div>
                              <div className="text-[11px] text-neutral-500 truncate max-w-[180px]">{s.email || "-"}</div>
                            </td>
                            <td className="p-4 text-center whitespace-nowrap">
                              {isUnpaid ? (
                                <motion.span animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 2, repeat: Infinity }} className="px-3 py-1 text-[10px] font-mono uppercase bg-red-500/15 border border-red-500/40 text-red-400 font-black">⚠️ Unpaid</motion.span>
                              ) : (
                                <span className="px-3 py-1 text-[10px] font-mono uppercase bg-lime-400/10 border border-lime-400/30 text-lime-400">✅ Paid ({s.payment_method})</span>
                              )}
                            </td>
                          </motion.tr>
                        );
                      })}
                    </motion.tbody>
                  </table>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ---------- Feed Tab Pills ---------- */}
        <LayoutGroup>
          <div className="grid grid-cols-2 gap-2 p-1.5 border border-neutral-900 bg-neutral-900/30 backdrop-blur mb-6 max-w-md">
            {[
              { id: "bookings", label: "Active Bookings" },
              { id: "blocks", label: "Field Blocks" },
            ].map((t) => (
              <motion.button
                key={t.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => setFeedTab(t.id as any)}
                className={`relative py-2.5 text-[10px] font-mono uppercase tracking-widest transition-colors ${
                  feedTab === t.id ? "text-black font-black" : "text-neutral-500 hover:text-white"
                }`}
              >
                {feedTab === t.id && (
                  <motion.span
                    layoutId="feed-tab-highlight"
                    className="absolute inset-0 bg-lime-400 -z-0"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{t.label}</span>
              </motion.button>
            ))}
          </div>
        </LayoutGroup>

        {/* ---------- Feed Content ---------- */}
        <AnimatePresence mode="wait">
          {feedTab === "bookings" ? (
            <motion.section
              key="bookings-feed"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3, ease: easeOut }}
              className="border border-neutral-900 bg-neutral-900/30 backdrop-blur overflow-hidden"
            >
              <div className="p-4 sm:p-5 border-b border-neutral-900 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-widest text-neutral-500 block">03 — Bookings</span>
                  <h2 className="text-base sm:text-lg font-black uppercase text-white mt-0.5">
                    📅 Active Turf Bookings <span className="text-neutral-500 text-xs font-mono ml-2">({filteredBookings.length})</span>
                  </h2>
                </div>
                <input
                  type="text"
                  placeholder="Search name / phone / date"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full sm:w-72 p-2.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-xs font-mono transition-colors text-white"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[820px]">
                  <thead>
                    <tr className="border-b border-neutral-900 text-[10px] font-mono uppercase tracking-widest text-neutral-500 bg-neutral-950/40">
                      <th className="p-4">Client</th>
                      <th className="p-4">Schedule</th>
                      <th className="p-4">Duration</th>
                      <th className="p-4">Court</th>
                      <th className="p-4">Total</th>
                      <th className="p-4">Advance</th>
                      <th className="p-4">Due Balance</th>
                      <th className="p-4 text-center">Payment Options</th>
                    </tr>
                  </thead>
                  <motion.tbody variants={stagger} initial="hidden" animate="show" className="divide-y divide-neutral-900 text-sm font-medium text-neutral-300">
                    <AnimatePresence>
                      {filteredBookings.length === 0 ? (
                        <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <td colSpan={8} className="p-8 text-center text-xs font-mono text-neutral-600">
                            No bookings match your search.
                          </td>
                        </motion.tr>
                      ) : (
                        filteredBookings.map((booking) => {
                          const bookingDate = booking.booking_date?.split("T")[0];
                          const isToday = bookingDate === today;
                          const isTomorrow = bookingDate === tomorrow;
                          const duration = booking.duration_minutes || 60;

                          return (
                            <motion.tr
                              key={booking.id}
                              variants={rowItem}
                              layout
                              className={`transition-colors ${
                                isToday ? "bg-lime-400/[0.04]" : isTomorrow ? "bg-amber-500/[0.03]" : ""
                              } hover:bg-lime-400/[0.03]`}
                            >
                              <td className="p-4">
                                <div className="font-bold text-white">{booking.customer_name}</div>
                                <div className="font-mono text-[10px] text-neutral-500 mt-0.5">{booking.phone}</div>
                              </td>
                              <td className="p-4 font-mono text-xs whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span className="text-neutral-200">{new Date(bookingDate).toLocaleDateString("en-GB")}</span>
                                  {isToday && (
                                    <span className="px-2 py-0.5 bg-lime-400/15 border border-lime-400/30 text-lime-400 text-[9px] font-black uppercase tracking-widest">Today</span>
                                  )}
                                  {isTomorrow && (
                                    <span className="px-2 py-0.5 bg-amber-400/10 border border-amber-400/30 text-amber-400 text-[9px] font-black uppercase tracking-widest">Tomorrow</span>
                                  )}
                                </div>
                                <div className="text-lime-400 mt-1 font-black">{getTimeRangeLabel(booking.start_time, duration)}</div>
                              </td>
                              <td className="p-4 font-mono text-xs text-neutral-300 whitespace-nowrap">{duration} Mins</td>
                              <td className="p-4 font-mono text-xs whitespace-nowrap">
                                <div className="mb-1">
                                  <span className={`px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${
                                    booking.booking_type === "Half Court"
                                      ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                                      : "bg-lime-400/10 border border-lime-400/30 text-lime-400"
                                  }`}>
                                    {booking.booking_type || "Full Court"}
                                  </span>
                                </div>
                                <div className="text-neutral-500 mt-0.5">{booking.court_number}</div>
                              </td>
                              <td className="p-4 text-white font-mono whitespace-nowrap">₹{booking.total_amount}</td>
                              <td className="p-4 text-emerald-400 font-mono whitespace-nowrap">₹{booking.advance_amount || 0}</td>
                              <td className="p-4 font-mono whitespace-nowrap">
                                {booking.balance_amount > 0 ? (
                                  <span className="text-red-400 font-black">₹{booking.balance_amount}</span>
                                ) : (
                                  <span className="px-3 py-1 text-[10px] font-mono uppercase bg-lime-400/10 border border-lime-400/30 text-lime-400">Paid</span>
                                )}
                              </td>
                              <td className="p-4 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-2">
                                  {booking.balance_amount > 0 ? (
                                    <motion.button
                                      whileHover={{ y: -2 }}
                                      whileTap={{ scale: 0.95 }}
                                      onClick={() => { setSelectedBooking(booking); setShowPaymentModal(true); }}
                                      className="bg-lime-400 hover:bg-lime-300 text-black text-xs font-mono uppercase font-black px-4 py-2 transition-colors tracking-widest"
                                    >
                                      💰 Collect
                                    </motion.button>
                                  ) : (
                                    booking.customer_name !== "Offline Booking" && (
                                      <button
                                        onClick={() => resetPayment(booking)}
                                        className="bg-neutral-900 border border-neutral-800 hover:border-amber-500/40 text-amber-400 text-xs font-mono uppercase px-4 py-2 transition-colors tracking-widest"
                                      >
                                        🔄 Reset
                                      </button>
                                    )
                                  )}
                                </div>
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
          ) : (
            <motion.section
              key="blocks-feed"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3, ease: easeOut }}
              className="border border-neutral-900 bg-neutral-900/30 backdrop-blur overflow-hidden"
            >
              <div className="p-4 sm:p-5 border-b border-neutral-900">
                <span className="text-[11px] font-mono uppercase tracking-widest text-neutral-500 block">04 — Blocks</span>
                <h2 className="text-base sm:text-lg font-black uppercase text-white mt-0.5">🚫 Admin Field Blocks</h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="border-b border-neutral-900 text-[10px] font-mono uppercase tracking-widest text-neutral-500 bg-neutral-950/40">
                      <th className="p-4">Date</th>
                      <th className="p-4">Schedule</th>
                      <th className="p-4">Duration</th>
                      <th className="p-4">Court</th>
                      <th className="p-4">Reason</th>
                    </tr>
                  </thead>
                  <motion.tbody variants={stagger} initial="hidden" animate="show" className="divide-y divide-neutral-900 text-sm font-medium text-neutral-300">
                    {blockedSlots.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-xs font-mono text-neutral-600">No field block restrictions.</td>
                      </tr>
                    ) : (
                      blockedSlots.map((slot) => {
                        if (!slot.start_time) return null;
                        const bookingDate = slot.booking_date?.split("T")[0];
                        const blockDuration = slot.duration_minutes || 60;
                        return (
                          <motion.tr key={slot.id} variants={rowItem} className="hover:bg-red-500/[0.05] transition-colors">
                            <td className="p-4 font-mono text-xs text-neutral-400">{new Date(bookingDate).toLocaleDateString("en-GB")}</td>
                            <td className="p-4 font-mono text-xs text-red-400 font-black whitespace-nowrap">{getTimeRangeLabel(slot.start_time, blockDuration)}</td>
                            <td className="p-4 text-xs font-mono">{blockDuration} mins</td>
                            <td className="p-4 font-mono text-xs font-bold text-neutral-200">{slot.court_number}</td>
                            <td className="p-4 font-mono text-xs text-neutral-500 uppercase">{slot.reason}</td>
                          </motion.tr>
                        );
                      })
                    )}
                  </motion.tbody>
                </table>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Small footer note */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-[10px] font-mono text-neutral-600 uppercase tracking-widest text-center pt-8"
        >
          // SMES Sports Academy · Live Sync Enabled
        </motion.div>
      </div>

      {/* ---------- Walk-in Booking Modal ---------- */}
      <AnimatePresence>
        {showManageSlots && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-neutral-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]"
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ duration: 0.3, ease: easeOut }}
              className="bg-neutral-950 border border-neutral-800 p-5 sm:p-6 w-full max-w-md shadow-2xl space-y-5"
            >
              <div>
                <span className="text-[11px] font-mono uppercase tracking-widest text-lime-400 block mb-1">// Walk-in Registration</span>
                <h2 className="text-xl font-black uppercase text-white">Register Walk-in</h2>
                <p className="text-neutral-400 text-xs mt-1">Log a manual offline booking into the system.</p>
              </div>

              <div className="space-y-3.5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase text-neutral-400">Target Date</label>
                  <input type="date" min={new Date().toISOString().split("T")[0]} value={slotDate} onChange={(e) => { setSlotDate(e.target.value); loadAvailableAdminSlots(e.target.value); }} className="w-full p-3.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors text-white" style={{ colorScheme: "dark" }} />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase text-neutral-400">Launch Time</label>
                  <select value={slotTime} onChange={(e) => { setSlotTime(e.target.value); if (slotDate) loadAvailableCourts(slotDate, e.target.value); }} className="w-full p-3.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors text-white">
                    <option value="">Select Time</option>
                    {availableAdminSlots.map((slot) => (<option key={slot} value={slot}>{slot}</option>))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase text-neutral-400">Duration</label>
                    <select value={slotDuration} onChange={(e) => setSlotDuration(Number(e.target.value))} className="w-full p-3.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors text-white">
                      <option value={60}>60 Minutes</option>
                      <option value={90}>90 Minutes</option>
                      <option value={120}>120 Minutes</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase text-neutral-400">Court</label>
                    <select value={slotCourt} onChange={(e) => setSlotCourt(e.target.value)} className="w-full p-3.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors text-white">
                      {availableCourts.map((c) => (<option key={c} value={c}>{c}</option>))}
                    </select>
                  </div>
                </div>

                <div className="p-4 bg-neutral-900/60 border border-neutral-800 space-y-3">
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-lime-400">Payment Collection</label>

                  {offlinePaymentMethod !== "Cash + UPI" && (
                    <input type="number" placeholder="Total Received (₹)" value={offlineAmount} onChange={(e) => setOfflineAmount(e.target.value)} className="w-full p-3 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors text-white" />
                  )}

                  <select value={offlinePaymentMethod} onChange={(e) => setOfflinePaymentMethod(e.target.value)} className="w-full p-3 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors text-white">
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Cash + UPI">Cash + UPI Split</option>
                  </select>

                  {offlinePaymentMethod === "Cash + UPI" && (
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" placeholder="Cash Split" value={offlineCashAmount} onChange={(e) => setOfflineCashAmount(e.target.value)} className="w-full p-3 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-sm text-white" />
                      <input type="number" placeholder="UPI Split" value={offlineUpiAmount} onChange={(e) => setOfflineUpiAmount(e.target.value)} className="w-full p-3 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-sm text-white" />
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <motion.button
                  whileHover={{ y: -2, boxShadow: "0 12px 30px rgba(163,230,53,0.3)" }}
                  whileTap={{ scale: 0.97 }}
                  onClick={saveOfflineBooking}
                  className="w-full bg-lime-400 hover:bg-lime-300 text-black font-mono text-xs uppercase tracking-widest py-4 font-black transition-colors"
                >
                  Save Booking
                </motion.button>
                <button onClick={() => setShowManageSlots(false)} className="w-full bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white font-mono text-xs uppercase tracking-widest py-4 transition-colors">
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- Payment Modal ---------- */}
      <AnimatePresence>
        {showPaymentModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-neutral-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]"
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ duration: 0.3, ease: easeOut }}
              className="bg-neutral-950 border border-neutral-800 p-5 sm:p-6 w-full max-w-sm shadow-2xl space-y-5"
            >
              <div>
                <span className="text-[11px] font-mono uppercase tracking-widest text-lime-400 block mb-1">// Balance Settlement</span>
                <h2 className="text-xl font-black uppercase text-white">💰 Balance Clearing</h2>
                <p className="text-neutral-400 text-xs mt-1">Collect the remaining match dues below.</p>
              </div>

              <div className="p-4 bg-neutral-900/60 border border-neutral-800 flex justify-between items-center">
                <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">Outstanding Balance</span>
                <span className="text-lg font-black text-red-400">₹{selectedBooking?.balance_amount || 0}</span>
              </div>

              <div className="space-y-3.5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase text-neutral-400">Payment Route</label>
                  <div className="relative">
                    <select value={paymentType} onChange={(e) => setPaymentType(e.target.value)} className="w-full p-3.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none appearance-none text-sm font-medium transition-colors text-white">
                      <option value="Full Cash">Full Cash</option>
                      <option value="Full UPI">Full UPI</option>
                      <option value="Cash + UPI">Cash + UPI</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-neutral-500 text-xs">▼</div>
                  </div>
                </div>

                {paymentType === "Cash + UPI" && (
                  <div className="grid grid-cols-2 gap-2 p-3 bg-neutral-900/60 border border-neutral-800">
                    <input type="number" placeholder="Cash Amount" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} className="w-full p-3 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors text-white" />
                    <input type="number" placeholder="UPI Amount" value={upiAmount} onChange={(e) => setUpiAmount(e.target.value)} className="w-full p-3 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors text-white" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <motion.button
                  whileHover={{ y: -2, boxShadow: "0 12px 30px rgba(163,230,53,0.3)" }}
                  whileTap={{ scale: 0.97 }}
                  onClick={savePayment}
                  className="w-full bg-lime-400 hover:bg-lime-300 text-black font-mono text-xs uppercase tracking-widest py-4 font-black transition-colors"
                >
                  Save Payment
                </motion.button>
                <button
                  onClick={() => { setShowPaymentModal(false); setSelectedBooking(null); }}
                  className="w-full bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white font-mono text-xs uppercase tracking-widest py-4 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}