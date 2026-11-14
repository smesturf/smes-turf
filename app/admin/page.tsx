"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import StudentApplications from "../components/StudentApplications";
import { getCurrentStaff, requireStaff, logPayment, ROLE_LABEL, type StaffInfo } from "../lib/staff";
import { downloadMasterReport } from "../lib/excelReport";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";

/* ------------------------------------------------------------------ */
/* Motion Presets                                                     */
/* ------------------------------------------------------------------ */
const easeOut = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easeOut } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const rowItem = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { duration: 0.35, ease: easeOut } },
};

// ⚙️ Midnight Rollover Helpers 
const getTodayStr = () => {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
};
const getTomorrowStr = () => {
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  return tomorrowDate.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
};

// Shared styling for coaching form fields (16px on phones so iOS doesn't zoom on focus)
const coachingInputCls =
  "w-full p-3.5 min-h-[48px] bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-base sm:text-sm font-medium text-white placeholder:text-neutral-600 transition-colors rounded-none";
const coachingLabelCls = "text-[11px] font-mono uppercase tracking-widest text-neutral-400";

// 🇮🇳 Month helpers (always IST, so the month rolls over at IST midnight on the 1st)
const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const monthLabelOf = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
};
const istMonthOfTimestamp = (ts?: string) =>
  ts ? new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7) : "";
const istDayOfTimestamp = (ts?: string) =>
  ts ? Number(new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(8, 10)) : 0;
// "Added on" stamp shown in the student's history, always in IST
const fmtAddedOn = (ts?: string) =>
  ts
    ? new Date(ts).toLocaleString("en-GB", {
        timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: true,
      })
    : "-";
// A student "owes" a month only if they have no settled payment AND had already joined by then
const isDue = (s: any) => s.payment_status !== "settled" && s.payment_status !== "not_enrolled";

// Coaching started in September 2026 — no earlier months are shown anywhere
const COACHING_START_MONTH = "2026-09";

// New students who join on or after this day of the month can pay half the fee for that first month
const HALF_FEE_FROM_DAY = 13;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// 30-minute slot labels exactly as the customer page uses them (5:00 AM – 10:30 PM)
const ALL_SLOT_LABELS: string[] = (() => {
  const out: string[] = [];
  for (let mins = 5 * 60; mins <= 22 * 60 + 30; mins += 30) {
    const h24 = Math.floor(mins / 60);
    const m = mins % 60;
    const ap = h24 >= 12 ? "PM" : "AM";
    const h12 = h24 % 12 || 12;
    out.push(`${String(h12).padStart(2, "0")}:${m === 0 ? "00" : "30"} ${ap}`);
  }
  return out;
})();

// ⏱️ Academy hours are picked as "from → to" ranges; they are expanded to the same 30-min slot
// labels as before when saving, so the customer page and the API need no change.
const SLOT_STEP = 30;
const RANGE_MIN = 5 * 60; // 05:00 AM
const RANGE_MAX = 23 * 60; // 11:00 PM (end of the last 30-min slot, 10:30 PM)
type TimeRange = { from: number; to: number }; // minutes since midnight

const minsToLabel = (mins: number) => {
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const ap = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${m === 0 ? "00" : "30"} ${ap}`;
};
const FROM_OPTIONS: number[] = (() => {
  const out: number[] = [];
  for (let m = RANGE_MIN; m < RANGE_MAX; m += SLOT_STEP) out.push(m);
  return out;
})();
const TO_OPTIONS: number[] = FROM_OPTIONS.map((m) => m + SLOT_STEP);

const rangesToSlots = (ranges: TimeRange[]): string[] => {
  const set = new Set<number>();
  ranges.forEach((r) => {
    for (let m = r.from; m < r.to; m += SLOT_STEP) set.add(m);
  });
  return [...set].sort((a, b) => a - b).map(minsToLabel);
};
const slotsToRanges = (slots: string[]): TimeRange[] => {
  const byLabel = new Map(FROM_OPTIONS.map((m) => [minsToLabel(m), m]));
  const mins = slots
    .map((l) => byLabel.get(l))
    .filter((m): m is number => m !== undefined)
    .sort((a, b) => a - b);
  const out: TimeRange[] = [];
  mins.forEach((m) => {
    const last = out[out.length - 1];
    if (last && last.to === m) last.to = m + SLOT_STEP;
    else if (!last || m >= last.to) out.push({ from: m, to: m + SLOT_STEP });
  });
  return out;
};
const rangesText = (ranges: TimeRange[]) =>
  ranges.map((r) => `${minsToLabel(r.from)} – ${minsToLabel(r.to)}`).join(", ");

type BatchTabType = "Morning Batch" | "Evening Batch";

export default function AdminPage() {
  const router = useRouter();

  // 👤 Who is logged in (shown on every payment they collect)
  const [staff, setStaff] = useState<StaffInfo | null>(null);
  useEffect(() => {
    getCurrentStaff().then((s) => {
      if (!s) return;
      if (s.role !== "admin") {
        supabase.auth.signOut({ scope: "local" }).then(() => router.replace("/staff"));
        return;
      }
      setStaff(s);
    });
  }, [router]);

  const [bookings, setBookings] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDate, setFilterDate] = useState<string>(""); 
  const [blockedSlots, setBlockedSlots] = useState<any[]>([]);
  const [showManageSlots, setShowManageSlots] = useState(false);
  const [activeDate, setActiveDate] = useState(getTodayStr());

  // 🏆 Academy Coaching Toggled State Parameters
  const [showCoachingPanel, setShowCoachingPanel] = useState(false);
  const [academyStudents, setAcademyStudents] = useState<any[]>([]);
  const [academyTab, setAcademyTab] = useState<"new" | "existing">("existing");
  const [rosterTab, setRosterTab] = useState<BatchTabType>("Morning Batch");
  const [academySearch, setAcademySearch] = useState("");
  // Football Academy (batches + roster) stays collapsed until the admin taps it
  const [showAcademyRoster, setShowAcademyRoster] = useState(false);
  const [adminNewStudentName, setAdminNewStudentName] = useState("");
  const [adminNewStudentPhone, setAdminNewStudentPhone] = useState("");
  const [adminNewStudentDOB, setAdminNewStudentDOB] = useState("");
  const [adminNewStudentEmail, setAdminNewStudentEmail] = useState("");
  const [adminNewStudentBatch, setAdminNewStudentBatch] = useState<BatchTabType>("Morning Batch");
  const [adminNewStudentMethod, setAdminNewStudentMethod] = useState("UPI");
  const [adminSelectedStudentId, setAdminSelectedStudentId] = useState("");
  const [adminExistingMethod, setAdminExistingMethod] = useState("UPI");
  const [isSendingEmails, setIsSendingEmails] = useState(false);

  // ⚙️ Manage Booking Pop-Up States
  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedManageBooking, setSelectedManageBooking] = useState<any>(null);
  const [manageMode, setManageMode] = useState<"options" | "reschedule" | "extend" | "upgrade">("options");
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleDuration, setRescheduleDuration] = useState(60);
  const [rescheduleCourt, setRescheduleCourt] = useState("Full Court");
  const [availableRescheduleSlots, setAvailableRescheduleSlots] = useState<string[]>([]);
  const [extendMinutes, setExtendMinutes] = useState(30);
  const [extendCourtSize, setExtendCourtSize] = useState(false);

  // 🔄 Half → Full Court upgrade while the customer is playing
  const [upgradeAfterMins, setUpgradeAfterMins] = useState(30);      // minutes played on Half Court before switching
  const [upgradeExtraMins, setUpgradeExtraMins] = useState(0);       // extra Full Court minutes after the current end
  const [upgradeAmountInput, setUpgradeAmountInput] = useState(""); // "" = use the calculated amount
  const [livePricing, setLivePricing] = useState({ full_hour: 2200, half_hour: 1100 });

  useEffect(() => {
    supabase.from("site_settings").select("key,value").then(({ data }) => {
      const row = (data || []).find((r: any) => r.key === "pricing");
      if (row?.value) {
        setLivePricing((p) => ({
          full_hour: Number(row.value.full_hour) || p.full_hour,
          half_hour: Number(row.value.half_hour) || p.half_hour,
        }));
      }
    });
  }, []);
  const [overrideAmount, setOverrideAmount] = useState(""); // ⚡ NEW: Manual price edit override
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);

  // 🔒 Master Admin OTP Security States
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [pendingAction, setPendingAction] = useState<"cancel_refund" | "reschedule" | "cancel_no_refund" | "extend" | "upgrade_full" | "update_settings" | null>(null);

  // 📅 Fee month being viewed / settled (defaults to the current IST month)
  const [feeMonth, setFeeMonth] = useState(getTodayStr().slice(0, 7));
  const feeMonthRef = useRef(feeMonth);
  feeMonthRef.current = feeMonth;
  const feeMonthInit = useRef(true);

  const [removedStudents, setRemovedStudents] = useState<any[]>([]);
  const [showRemoved, setShowRemoved] = useState(false);
  const [historyStudentId, setHistoryStudentId] = useState<string | null>(null);
  const [editStudentId, setEditStudentId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; phone: string; dob: string; email: string; batch: BatchTabType }>({
    name: "", phone: "", dob: "", email: "", batch: "Morning Batch",
  });
  const [undoToast, setUndoToast] = useState<{ message: string; undo: () => Promise<void> } | null>(null);
  const undoTimerRef = useRef<any>(null);

  // 💰 Pricing & academy hours settings
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [pricingForm, setPricingForm] = useState({ full_hour: "2200", full_regular: "2400", half_hour: "1100", half_regular: "1500" });
  const [academyForm, setAcademyForm] = useState<{ enabled: boolean; start_date: string; days: number[]; slots: string[] }>({
    enabled: true,
    start_date: "2026-09-15",
    days: [1, 2, 3, 4, 5],
    slots: ["06:00 AM", "06:30 AM", "05:30 PM", "06:00 PM"],
  });
  // Academy hours as from→to ranges (slots above are always derived from these)
  const [academyRanges, setAcademyRanges] = useState<TimeRange[]>(() =>
    slotsToRanges(["06:00 AM", "06:30 AM", "05:30 PM", "06:00 PM"])
  );
  const updateAcademyRanges = (next: TimeRange[]) => {
    setAcademyRanges(next);
    setAcademyForm((prev) => ({ ...prev, slots: rangesToSlots(next) }));
  };

  const FIXED_COACHING_FEE = 2500;
  const HALF_COACHING_FEE = Math.round(FIXED_COACHING_FEE / 2);
  // Half fee can be offered for a student's joining month if they were added on/after the 13th
  const halfFeeAllowed = (student: any, ym: string) =>
    !!student?.created_at &&
    istMonthOfTimestamp(student.created_at) === ym &&
    istDayOfTimestamp(student.created_at) >= HALF_FEE_FROM_DAY;
  // Full / half choice when collecting a joining month that started after the 12th
  const [adminExistingFeeType, setAdminExistingFeeType] = useState<"full" | "half">("full");
  const [historyFeeChoice, setHistoryFeeChoice] = useState<Record<string, "full" | "half">>({});
  const [adminNewStudentFeeType, setAdminNewStudentFeeType] = useState<"full" | "half">("full");
  // Half-fee choice appears only for a NEW student enrolled after the 12th (IST date)
  const isHalfFeeEligible = Number(getTodayStr().slice(8, 10)) >= HALF_FEE_FROM_DAY;
  const enrollFee = isHalfFeeEligible && adminNewStudentFeeType === "half" ? HALF_COACHING_FEE : FIXED_COACHING_FEE;
  const currentMonthYear = getTodayStr().slice(0, 7); // ✅ IST month (was UTC, wrong just after midnight on the 1st)
  const currentMonthLabel = monthLabelOf(currentMonthYear);
  const feeMonthLabel = monthLabelOf(feeMonth);
  const feeMonthOptions = (() => {
    const list = Array.from({ length: 36 }, (_, i) => shiftMonth(currentMonthYear, -i)).filter((ym) => ym >= COACHING_START_MONTH);
    return list.length > 0 ? list : [currentMonthYear];
  })();

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

  const formatDurationLabel = (mins: number | string) => {
    const m = Number(mins);
    if (m === 60) return "60 Mins (1 Hour)";
    if (m === 90) return "90 Mins (1.5 Hours)";
    if (m === 120) return "120 Mins (2 Hours)";
    if (m === 150) return "150 Mins (2.5 Hours)";
    if (m === 180) return "180 Mins (3 Hours)";
    return `${m} Mins`;
  };

  // Strictly 05:00 AM to 11:00 PM Grid
  const adminTimeSlots = useMemo(() => {
    const slots = [];
    for (let i = 10; i <= 46; i++) { 
      const h = Math.floor(i / 2);
      const m = i % 2 === 0 ? "00" : "30";
      const ampm = h >= 12 ? "PM" : "AM";
      const displayH = h % 12 === 0 ? 12 : h % 12;
      slots.push(`${String(displayH).padStart(2, "0")}:${m} ${ampm}`);
    }
    return slots;
  }, []);

  const [slotDate, setSlotDate] = useState("");
  const [slotReason, setSlotReason] = useState("OFFLINE BOOKING");
  const [slotTime, setSlotTime] = useState("");
  const [slotDuration, setSlotDuration] = useState(60);
  const [slotEndTime, setSlotEndTime] = useState("");
  const [slotCourt, setSlotCourt] = useState("Full Court");

  // Optional Fields for Offline/Tournament/Maintenance
  const [offlineName, setOfflineName] = useState("");
  const [offlinePhone, setOfflinePhone] = useState("");
  const [offlineEmail, setOfflineEmail] = useState("");

  const [offlineAmount, setOfflineAmount] = useState("");
  const [offlineAdvanceAmount, setOfflineAdvanceAmount] = useState("");
  const [offlinePaymentMethod, setOfflinePaymentMethod] = useState("Cash");
  const [offlineCashAmount, setOfflineCashAmount] = useState("");
  const [offlineUpiAmount, setOfflineUpiAmount] = useState("");

  const [availableAdminSlots, setAvailableAdminSlots] = useState<string[]>([]);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [paymentType, setPaymentType] = useState("Full Cash");
  const [cashAmount, setCashAmount] = useState("");
  const [upiAmount, setUpiAmount] = useState("");

  /* -------- Security Auth & Realtime Loader -------- */
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        localStorage.removeItem("adminLoggedIn");
        localStorage.removeItem("adminLoginTime");
        router.push("/staff");
      } else {
        localStorage.setItem("adminLoggedIn", "true");
        loadBookings();
        loadAcademyData();
      }
    });

    const bookingsChannel = supabase
      .channel("bookings-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => { loadBookings(); })
      .subscribe();

    const blockedChannel = supabase
      .channel("blocked-slots-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "blocked_slots" }, () => { loadBookings(); })
      .subscribe();

    const studentsChannel = supabase
      .channel("students-realtime-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, () => loadAcademyData())
      .subscribe();

    const paymentsChannel = supabase
      .channel("payments-realtime-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "student_payments" }, () => loadAcademyData())
      .subscribe();

    const attendanceChannel = supabase
      .channel("attendance-realtime-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "student_attendance" }, () => loadAcademyData())
      .subscribe();

    return () => {
      authListener.subscription.unsubscribe();
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(blockedChannel);
      supabase.removeChannel(studentsChannel);
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(attendanceChannel);
    };
  }, [router]);

  useEffect(() => {
    loadBookings();
  }, [filterDate]);

  useEffect(() => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();

    const timer = setTimeout(() => {
      setActiveDate(getTodayStr());
      loadBookings(); 
    }, msUntilMidnight + 1000);

    return () => clearTimeout(timer);
  }, [activeDate]);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const INACTIVITY_LIMIT = 15 * 60 * 1000;

    const resetTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        await supabase.auth.signOut({ scope: "local" });
        localStorage.removeItem("adminLoggedIn");
        localStorage.removeItem("adminLoginTime");
        alert("⚠️ Session expired due to inactivity. Please log in again.");
        router.push("/staff");
      }, INACTIVITY_LIMIT);
    };

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((event) => window.addEventListener(event, resetTimer));
    
    resetTimer();

    return () => {
      clearTimeout(timeout);
      events.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [router]);

  /* -------- DYNAMIC FILTERING FOR MANAGE SLOTS -------- */
  useEffect(() => {
    const fetchAvailableTimes = async () => {
      if (!showManageSlots || !slotDate) {
        setAvailableAdminSlots([]);
        return;
      }

      const { data: bData } = await supabase.from("bookings").select("start_time,duration_minutes,booking_type,court_number").eq("booking_date", slotDate);
      const { data: blData } = await supabase.from("blocked_slots").select("start_time,duration_minutes,court_number").eq("booking_date", slotDate);

      const allBusyItems = [...(bData || []), ...(blData || [])];
      const freeTimes: string[] = [];

      adminTimeSlots.forEach((slot) => {
        const slotStart = convertToMins(slot);
        const slotEnd = slotStart + slotDuration;

        if (slotEnd > 23 * 60) return;

        const isOverlapping = allBusyItems.some((item: any) => {
          const itemStart = convertToMins(item.start_time);
          const itemEnd = itemStart + (item.duration_minutes || 60);

          const overlaps = slotStart < itemEnd && slotEnd > itemStart;
          if (!overlaps) return false;

          const targetIsFull = slotCourt === "Full Court" || slotCourt === "Both Courts";
          const itemIsFull = item.booking_type === "Full Court" || item.court_number === "Full Court" || item.court_number === "Both Courts";

          if (targetIsFull || itemIsFull) return true;
          return item.court_number === slotCourt;
        });

        if (!isOverlapping) freeTimes.push(slot);
      });

      setAvailableAdminSlots(freeTimes);
    };

    fetchAvailableTimes();
  }, [slotDate, slotDuration, slotCourt, showManageSlots, adminTimeSlots]);

  useEffect(() => {
    if (slotTime && availableAdminSlots.length > 0 && !availableAdminSlots.includes(slotTime)) {
      setSlotTime("");
    }
  }, [availableAdminSlots, slotTime]);

  const sendEmailReminders = async () => {
    const pendingStudents = academyStudents.filter(s => isDue(s) && s.email);
    const noEmailStudents = academyStudents.filter(s => isDue(s) && !s.email);

    if (pendingStudents.length === 0) {
      alert(noEmailStudents.length > 0
        ? `⚠️ No pending students with valid email addresses. (${noEmailStudents.length} pending students are missing emails).`
        : "✅ All students have paid! No reminders needed.");
      return;
    }

    const confirmed = confirm(`Are you sure you want to send official email reminders to ${pendingStudents.length} student(s) for the month of ${feeMonthLabel}?`);
    if (!confirmed) return;

    setIsSendingEmails(true);
    try {
      const response = await fetch("/api/send-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          students: pendingStudents,
          month: feeMonthLabel,
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

  const loadAcademyData = async () => {
    const ym = feeMonthRef.current;
    const selectCols = `*, student_payments(*), student_attendance(*)`;

    // Active students (soft-deleted ones are hidden)
    let { data: stData, error: stErr } = await supabase
      .from("students")
      .select(selectCols)
      .is("deleted_at", null)
      .order("name", { ascending: true });

    // Safety net: if the SQL setup hasn't been run yet, fall back to the old query
    if (stErr) {
      const retry = await supabase.from("students").select(selectCols).order("name", { ascending: true });
      stData = retry.data;
    }

    if (stData) {
      setAcademyStudents(stData.map((student: any) => {
        const rec = student.student_payments?.find((p: any) => p.month_year === ym);
        const joinedLater = !rec && istMonthOfTimestamp(student.created_at) > ym;
        return {
          ...student,
          payment_status: rec ? rec.status : joinedLater ? "not_enrolled" : "pending",
          amount_paid: rec ? rec.amount_paid : 0,
          payment_method: rec ? rec.payment_method : "-",
          collected_by: rec ? rec.collected_by ?? null : null,
          payment_record_id: rec ? rec.id : null,
        };
      }));
    }

    // Removed students are intentionally not shown or loaded in the admin page.
    setRemovedStudents([]);
  };

  // Reload fees when the admin switches month (skip the very first run; auth effect loads it)
  useEffect(() => {
    if (feeMonthInit.current) { feeMonthInit.current = false; return; }
    loadAcademyData();
  }, [feeMonth]);

  const markAttendance = async (studentId: string, status: "Present" | "Absent") => {
    const today = getTodayStr();
    const { error: deleteError } = await supabase
      .from("student_attendance")
      .delete()
      .match({ student_id: studentId, date: today });

    if (deleteError) {
      alert(`Database Error: ${deleteError.message}\nEnsure 'student_attendance' table RLS is disabled.`);
      return;
    }

    const { error: insertError } = await supabase
      .from("student_attendance")
      .insert([{ student_id: studentId, date: today, status }]);

    if (insertError) {
      alert(`Database Insert Error: ${insertError.message}`);
      console.error(insertError);
    } else {
      loadAcademyData();
    }
  };

  const handleAdminEnrollStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminNewStudentName || !adminNewStudentPhone) { alert("Please complete name and phone fields"); return; }
    if (adminNewStudentPhone.length !== 10) { alert("Phone number must be exactly 10 digits"); return; }
    const who = await requireStaff();
    if (!who) return;

    const { data: student, error: stError } = await supabase
      .from("students")
      .insert([{ 
        name: adminNewStudentName, 
        phone: adminNewStudentPhone, 
        dob: adminNewStudentDOB || null, 
        email: adminNewStudentEmail || null, 
        batch: adminNewStudentBatch,
        monthly_fee: FIXED_COACHING_FEE 
      }])
      .select().single();

    if (stError || !student) { alert(stError?.message || "Enrollment failure"); return; }

    const { error: pmError } = await supabase
      .from("student_payments")
      .insert([{
        student_id: student.id,
        month_year: currentMonthYear,
        status: "settled",
        amount_paid: enrollFee,
        payment_method: adminNewStudentMethod,
        collected_by: who.name, collected_by_role: who.role, collected_at: new Date().toISOString()
      }]);

    if (pmError) { alert(pmError.message); return; }
    await logPayment({ staff: who, kind: "student_fee", amount: enrollFee, method: adminNewStudentMethod, studentId: String(student.id), monthYear: currentMonthYear, note: `Enrolled ${adminNewStudentName}` });

    alert(`✅ ${adminNewStudentName} Enrolled in ${adminNewStudentBatch} & Marked as Paid via ${adminNewStudentMethod} — ₹${enrollFee.toLocaleString("en-IN")}${enrollFee < FIXED_COACHING_FEE ? " (half fee for this month)" : ""}`);
    setAdminNewStudentName(""); setAdminNewStudentPhone(""); setAdminNewStudentDOB(""); setAdminNewStudentEmail(""); setAdminNewStudentBatch("Morning Batch");
    setAdminNewStudentFeeType("full");
    loadAcademyData();
  };

  // ⏪ Undo toast (delete / edit / payment changes)
  const showUndo = (message: string, undo: () => Promise<void>) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoToast({ message, undo });
    undoTimerRef.current = setTimeout(() => setUndoToast(null), 10000);
  };

  const runUndo = async () => {
    if (!undoToast) return;
    const action = undoToast.undo;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoToast(null);
    try {
      await action();
    } catch (e: any) {
      alert(`Undo failed: ${e?.message || "Please try again"}`);
    }
    loadAcademyData();
  };

  // 💸 Mark one month as paid (updates the record if it exists, otherwise creates it)
  const settleStudentMonth = async (studentId: string, ym: string, method: string, amount: number = FIXED_COACHING_FEE) => {
    const { data: existing } = await supabase
      .from("student_payments")
      .select("id")
      .eq("student_id", studentId)
      .eq("month_year", ym)
      .limit(1);

    const who = await requireStaff();
    if (!who) return false;
    const payload = { status: "settled", amount_paid: amount, payment_method: method, collected_by: who.name, collected_by_role: who.role, collected_at: new Date().toISOString() };
    const { error } =
      existing && existing.length > 0
        ? await supabase.from("student_payments").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", existing[0].id)
        : await supabase.from("student_payments").insert([{ student_id: studentId, month_year: ym, ...payload }]);

    if (error) {
      alert(`Database Error: ${error.message}`);
      return false;
    }
    await logPayment({ staff: who, kind: "student_fee", amount, method, studentId: studentId, monthYear: ym });
    return true;
  };

  const handleAdminOldPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSelectedStudentId) { alert("Please select a student name first"); return; }
    const target = academyStudents.find(s => s.id === adminSelectedStudentId);
    if (!target) return;

    const ym = feeMonth;
    const amount = halfFeeAllowed(target, ym) && adminExistingFeeType === "half" ? HALF_COACHING_FEE : FIXED_COACHING_FEE;
    const ok = await settleStudentMonth(target.id, ym, adminExistingMethod, amount);
    if (!ok) return;

    showUndo(`💸 ${target.name} marked paid for ${monthLabelOf(ym)} · ₹${amount.toLocaleString("en-IN")}${amount < FIXED_COACHING_FEE ? " (half)" : ""}`, async () => {
      await supabase.from("student_payments").delete().eq("student_id", target.id).eq("month_year", ym);
    });
    setAdminSelectedStudentId("");
    setAdminExistingFeeType("full");
    loadAcademyData();
  };

  // ↩️ Remove one month's payment (history screen)
  const undoPaymentMonth = async (student: any, ym: string) => {
    const rec = student.student_payments?.find((p: any) => p.month_year === ym);
    if (!rec) return;
    if (!window.confirm(`Mark ${monthLabelOf(ym)} as NOT paid for ${student.name}?`)) return;

    const { error } = await supabase.from("student_payments").delete().eq("id", rec.id);
    if (error) { alert(`Database Error: ${error.message}`); return; }
    const remover = await getCurrentStaff();
    if (remover) await logPayment({ staff: remover, kind: "student_fee_removed", amount: Number(rec.amount_paid || 0), method: rec.payment_method, studentId: String(student.id), monthYear: ym, note: `Removed payment originally collected by ${rec.collected_by || "unknown"}` });

    showUndo(`↩️ ${monthLabelOf(ym)} payment removed for ${student.name}`, async () => {
      await supabase.from("student_payments").insert([{
        student_id: student.id,
        month_year: ym,
        status: rec.status,
        amount_paid: rec.amount_paid,
        payment_method: rec.payment_method,
        collected_by: rec.collected_by ?? null,
        collected_by_role: rec.collected_by_role ?? null,
        collected_at: rec.collected_at ?? null,
      }]);
    });
    loadAcademyData();
  };

  // 🗑️ Soft delete — student moves to "Recently Removed" and can be restored
  const deleteStudent = async (studentId: string, studentName: string) => {
    const ok = window.confirm(
      `Remove "${studentName}" from the academy?\n\nThey will move to "Recently Removed" and can be restored any time. Their payment history is kept.`
    );
    if (!ok) return;

    const { error } = await supabase.from("students").update({ deleted_at: new Date().toISOString() }).eq("id", studentId);
    if (error) {
      alert(`Database Error: ${error.message}\n\nMake sure the SQL setup (deleted_at column) has been run in Supabase.`);
      return;
    }
    showUndo(`🗑️ ${studentName} removed`, async () => {
      await supabase.from("students").update({ deleted_at: null }).eq("id", studentId);
    });
    loadAcademyData();
  };

  const restoreStudent = async (studentId: string, studentName: string) => {
    const { error } = await supabase.from("students").update({ deleted_at: null }).eq("id", studentId);
    if (error) { alert(`Database Error: ${error.message}`); return; }
    alert(`✅ ${studentName} has been restored.`);
    loadAcademyData();
  };

  const purgeStudent = async (studentId: string, studentName: string) => {
    const ok = window.confirm(
      `⚠️ DELETE FOREVER?\n\n"${studentName}" and their entire payment & attendance history will be permanently destroyed. This cannot be undone.`
    );
    if (!ok) return;
    try {
      await supabase.from("student_attendance").delete().eq("student_id", studentId);
      const { error: paymentError } = await supabase.from("student_payments").delete().eq("student_id", studentId);
      if (paymentError) throw paymentError;
      const { error: studentError } = await supabase.from("students").delete().eq("id", studentId);
      if (studentError) throw studentError;
      alert(`✅ ${studentName} permanently deleted.`);
      loadAcademyData();
    } catch (error: any) {
      alert(`Database Error: ${error.message || "Failed to delete student."}`);
    }
  };

  // ✏️ Edit student details
  const openEditStudent = (s: any) => {
    setEditStudentId(s.id);
    setEditForm({
      name: s.name || "",
      phone: s.phone || "",
      dob: s.dob ? String(s.dob).slice(0, 10) : "",
      email: s.email || "",
      batch: (s.batch as BatchTabType) || "Morning Batch",
    });
  };

  const saveStudentEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const original = academyStudents.find(s => s.id === editStudentId);
    if (!original) return;

    const name = editForm.name.trim();
    if (!name) { alert("Name cannot be empty"); return; }
    if (editForm.phone.length !== 10) { alert("Phone number must be exactly 10 digits"); return; }

    const updates = {
      name,
      phone: editForm.phone,
      dob: editForm.dob || null,
      email: editForm.email.trim() || null,
      batch: editForm.batch,
    };
    const previous = {
      name: original.name,
      phone: original.phone,
      dob: original.dob ?? null,
      email: original.email ?? null,
      batch: original.batch,
    };

    const { error } = await supabase.from("students").update(updates).eq("id", original.id);
    if (error) { alert(`Database Error: ${error.message}`); return; }

    setEditStudentId(null);
    showUndo(`✏️ ${name} updated`, async () => {
      await supabase.from("students").update(previous).eq("id", original.id);
    });
    loadAcademyData();
  };

  // 💰 Pricing & Academy Hours (OTP protected)
  const loadSettings = async () => {
    const { data } = await supabase.from("site_settings").select("key,value");
    (data || []).forEach((row: any) => {
      if (row.key === "pricing" && row.value) {
        setPricingForm({
          full_hour: String(row.value.full_hour ?? 2200),
          full_regular: String(row.value.full_regular ?? 2400),
          half_hour: String(row.value.half_hour ?? 1100),
          half_regular: String(row.value.half_regular ?? 1500),
        });
      }
      if (row.key === "academy_hours" && row.value) {
        setAcademyForm({
          enabled: row.value.enabled ?? true,
          start_date: row.value.start_date || "2026-09-15",
          days: row.value.days || [1, 2, 3, 4, 5],
          slots: row.value.slots || [],
        });
        setAcademyRanges(slotsToRanges(row.value.slots || []));
      }
    });
  };

  const requestSaveSettings = () => {
    const nums = Object.values(pricingForm).map(Number);
    if (nums.some((n) => !Number.isFinite(n) || n <= 0)) {
      alert("Please enter a valid price (greater than 0) in every price field.");
      return;
    }
    if (academyForm.enabled && (!academyForm.start_date || academyForm.days.length === 0 || academyForm.slots.length === 0)) {
      alert("Academy blocking is ON: pick a start date, at least one day and at least one time range (or switch it OFF).");
      return;
    }
    triggerOtpProtection("update_settings");
  };

  const loadBookings = async () => {
    const todayStr = getTodayStr();

    let query = supabase.from("bookings").select("*");

    if (filterDate) {
      query = query.eq("booking_date", filterDate);
    }

    const { data, error } = await query
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) { console.log(error); return; }

    const sanitizedBookings = (data || []).map((b: any) => ({
      ...b,
      advance_amount: b.customer_name === "Offline Booking" ? 0 : b.advance_amount
    }));

    setBookings(sanitizedBookings);

    let blocksQuery = supabase.from("blocked_slots").select("*");
    if (filterDate) blocksQuery = blocksQuery.eq("booking_date", filterDate);
    else blocksQuery = blocksQuery.gte("booking_date", todayStr);

    const { data: blockedData } = await blocksQuery
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true });

    setBlockedSlots(blockedData || []);
  };

  /* -------- ⚡ MATH ENGINE FOR DASHBOARD STAT CARDS -------- */
  const dashboardStats = useMemo(() => {
    const targetDateStr = filterDate || getTodayStr();
    let dSlots = 0;
    let dAdvance = 0;
    let dBalance = 0;
    let dCash = 0;
    let dUpi = 0;
    let tomSlots = 0;
    let activeBookingsCount = 0;

    const tomorrowStr = getTomorrowStr();
    const todayStr = getTodayStr();

    const now = new Date();
    const istTimeStr = now.toLocaleTimeString("en-US", { timeZone: "Asia/Kolkata", hour12: false });
    const [currentHours, currentMins] = istTimeStr.split(":").map(Number);
    const currentMinutes = currentHours * 60 + currentMins;

    bookings.forEach((booking) => {
      const bDate = booking.booking_date?.split("T")[0];
      const cDate = booking.created_at?.split("T")[0];
      const pDate = booking.payment_date;
      
      const advance = Number(booking.advance_amount || 0);
      const totalPaid = Number(booking.total_amount || 0) - Number(booking.balance_amount || 0);
      const cashTotal = Number(booking.cash_received || 0);
      const upiTotal = Math.max(0, totalPaid - cashTotal);

      let isCompleted = false;
      if (Number(booking.balance_amount || 0) <= 0) {
        if (!bDate || bDate < todayStr) {
          isCompleted = true;
        } else if (bDate === todayStr) {
          const timeParts = (booking.start_time || "").trim().split(" ");
          if (timeParts[0]) {
            const [hStr, mStr] = timeParts[0].split(":");
            let h = Number(hStr);
            const m = parseInt(mStr || "0", 10);
            if (timeParts[1]) {
              const ampm = timeParts[1].toUpperCase();
              if (ampm === "PM" && h !== 12) h += 12;
              if (ampm === "AM" && h === 12) h = 0;
            }
            const durationMins = Number(booking.duration_minutes || 60);
            const endMinutes = (h * 60 + m) + durationMins;
            
            if (endMinutes <= currentMinutes) isCompleted = true;
          }
        }
      }
      
      if (!isCompleted) {
        activeBookingsCount++;
      }

      if (bDate === targetDateStr) {
        dSlots += 1;
        dBalance += Number(booking.balance_amount || 0);
      }
      if (bDate === tomorrowStr) {
        tomSlots += 1;
      }

      if (cDate === targetDateStr) {
         dAdvance += advance;
         
         if (booking.customer_name === "Offline Booking") {
             if (pDate === targetDateStr) {
                 dCash += cashTotal;
                 dUpi += upiTotal;
             }
         } else {
             dUpi += advance;
             
             if (pDate === targetDateStr && booking.balance_amount === 0 && booking.total_amount > advance) {
                 dCash += cashTotal;
                 dUpi += Math.max(0, upiTotal - advance); 
             }
         }
      } 
      else if (pDate === targetDateStr && booking.balance_amount === 0) {
         dCash += cashTotal;
         dUpi += Math.max(0, upiTotal - advance);
      }
    });

    return [
      { label: "Total Active", value: activeBookingsCount, accent: "text-white", tag: "01" },
      { label: filterDate ? "Selected Matches" : "Today's Matches", value: dSlots, accent: "text-lime-400", tag: "02" },
      { label: "Pending Due", value: `₹${dBalance}`, accent: "text-red-400", tag: "03" },
      { label: filterDate ? "Selected Adv" : "Today's Advance", value: `₹${dAdvance}`, accent: "text-emerald-400", tag: "04" },
      { label: "Cash Vault", value: `₹${dCash}`, accent: "text-amber-400", tag: "05" },
      { label: "UPI Nodes", value: `₹${dUpi}`, accent: "text-cyan-400", tag: "06" },
      { label: "Total Collected", value: `₹${dCash + dUpi}`, accent: "text-fuchsia-400", tag: "07" },
      { label: "Tomorrow Matches", value: tomSlots, accent: "text-neutral-300", tag: "08" },
    ];
  }, [bookings, filterDate]);

  const loadRescheduleAvailableSlots = async (
    date: string,
    duration: number = rescheduleDuration,
    court: string = rescheduleCourt
  ) => {
    if (!date) return;

    const { data: bookings } = await supabase
      .from("bookings")
      .select("id,start_time,duration_minutes,booking_type,court_number")
      .eq("booking_date", date);

    const { data: blocked } = await supabase
      .from("blocked_slots")
      .select("start_time,duration_minutes,court_number")
      .eq("booking_date", date);

    const allBusy = [
      ...(bookings || []).filter((b: any) => !selectedManageBooking || b.id !== selectedManageBooking.id),
      ...(blocked || [])
    ];

    const availableTimes: string[] = [];

    adminTimeSlots.forEach((slot) => {
      const slotStart = convertToMins(slot);
      const slotEnd = slotStart + duration;

      if (slotEnd > 23 * 60) return;

      const isConflict = allBusy.some((b: any) => {
        const bStart = convertToMins(b.start_time);
        const bEnd = bStart + (b.duration_minutes || 60);

        const timeOverlaps = slotStart < bEnd && slotEnd > bStart;
        if (!timeOverlaps) return false;

        const bIsFull = b.booking_type === "Full Court" || b.court_number === "Full Court" || b.court_number === "Both Courts";
        const targetIsFull = court === "Full Court" || court === "Both Courts";

        if (targetIsFull || bIsFull) return true;
        return b.court_number === court;
      });

      if (!isConflict) {
        availableTimes.push(slot);
      }
    });

    setAvailableRescheduleSlots(availableTimes);
  };

  const saveBlockedSlot = async () => {
    if (!slotDate || !slotTime) { alert("Please select date and time"); return; }

    const { data: existingBookings } = await supabase.from("bookings").select("*").eq("booking_date", slotDate);
    const { data: existingBlocks } = await supabase.from("blocked_slots").select("*").eq("booking_date", slotDate);
    
    const selectedStart = convertToMins(slotTime);
    let selectedEnd = selectedStart + Number(slotDuration);
    
    if (slotReason === "TOURNAMENT" || slotReason === "MAINTENANCE") {
      if (!slotEndTime) { alert("Please select an End Time for the block"); return; }
      selectedEnd = convertToMins(slotEndTime);
      if (selectedEnd <= selectedStart) { alert("End time must be after the start time"); return; }
    }

    const actualCalculatedDuration = selectedEnd - selectedStart;
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

    if (isOverlapping) { alert("⚠️ This court is already booked or blocked during the selected time period."); return; }

    if (slotReason === "OFFLINE BOOKING") {
      const totalCost = Number(offlineAmount || 0);
      let advancePaid = 0;
      let cashReceived = 0;
      let upiReceived = 0;

      if (offlinePaymentMethod === "Cash") { advancePaid = Number(offlineAdvanceAmount || 0); cashReceived = advancePaid; }
      if (offlinePaymentMethod === "UPI") { advancePaid = Number(offlineAdvanceAmount || 0); upiReceived = advancePaid; }
      if (offlinePaymentMethod === "Cash + UPI") {
        cashReceived = Number(offlineCashAmount || 0);
        upiReceived = Number(offlineUpiAmount || 0);
        advancePaid = cashReceived + upiReceived;
      }

      if (totalCost <= 0) { alert("Enter Total Amount for the Turf"); return; }
      if (advancePaid < 0) { alert("Advance cannot be negative"); return; }
      if (advancePaid > totalCost) { alert("Advance cannot be greater than Total Amount"); return; }
      const who = await requireStaff();
      if (!who) return;

      const balanceDue = totalCost - advancePaid;

      const { error } = await supabase.from("bookings").insert([{
        customer_name: offlineName.trim() || "Offline Booking",
        phone: offlinePhone.trim() || "-",
        email: offlineEmail.trim() || null,
        sport: "Football",
        booking_date: slotDate,
        start_time: slotTime,
        duration_minutes: actualCalculatedDuration,
        booking_type: slotCourt === "Full Court" ? "Full Court" : "Half Court",
        court_number: slotCourt,
        total_amount: totalCost,
        advance_amount: advancePaid,
        balance_amount: balanceDue,
        payment_status: balanceDue <= 0 ? "paid" : "pending",
        payment_method: offlinePaymentMethod,
        cash_received: cashReceived,
        upi_received: upiReceived,
        payment_completed: balanceDue <= 0,
        collected_by: advancePaid > 0 ? who.name : null,
        collected_by_role: advancePaid > 0 ? who.role : null,
        collected_at: advancePaid > 0 ? new Date().toISOString() : null,
        payment_date: getTodayStr(), 
      }]);
      
      if (error) { alert(error.message); return; }

      if (advancePaid > 0) await logPayment({ staff: who, kind: "booking_advance", amount: advancePaid, method: offlinePaymentMethod, note: `Offline booking ${slotDate} ${slotTime} (${offlineName.trim() || "Offline Booking"})` });
      alert("✅ Offline Booking Saved");
      await loadBookings();
      setSlotDate(""); setSlotTime(""); setSlotDuration(60); setSlotEndTime("");
      setSlotReason("OFFLINE BOOKING"); setSlotCourt("Full Court");
      setOfflineName(""); setOfflinePhone(""); setOfflineEmail("");
      setOfflineAmount(""); setOfflineAdvanceAmount(""); setOfflineCashAmount(""); setOfflineUpiAmount("");
      setShowManageSlots(false);
      return;
    }

    let finalReason = slotReason;
    if (slotReason === "TOURNAMENT" || slotReason === "MAINTENANCE") {
      const extras = [];
      if (offlineName.trim()) extras.push(offlineName.trim());
      if (offlinePhone.trim()) extras.push(offlinePhone.trim());
      if (extras.length > 0) finalReason += ` (${extras.join(" - ")})`;
    }

    const { error } = await supabase.from("blocked_slots").insert([{
      booking_date: slotDate,
      start_time: slotTime,
      duration_minutes: actualCalculatedDuration,
      reason: finalReason,
      court_number: slotCourt,
    }]);

    if (error) { alert(error.message); return; }

    alert("✅ Field Block Saved Successfully");
    await loadBookings();

    setSlotDate(""); setSlotTime(""); setSlotEndTime(""); setSlotDuration(60);
    setSlotReason("OFFLINE BOOKING"); setSlotCourt("Full Court");
    setOfflineName(""); setOfflinePhone(""); setOfflineEmail("");
    setShowManageSlots(false);
  };

  /* ========================================================================= */
  /* 💬 MANUAL WHATSAPP CONFIRMATION TRIGGER */
  /* ========================================================================= */
  
  const handleSendWhatsApp = async () => {
    if (!selectedManageBooking) return;
    
    let targetPhone = selectedManageBooking.phone;
    if (!targetPhone || targetPhone === "-") {
      const enteredPhone = window.prompt("No phone number found for this booking.\n\nEnter 10-digit phone number to send WhatsApp:");
      if (!enteredPhone) return;
      targetPhone = enteredPhone.trim();
    }

    const confirmSend = window.confirm(`Send official WhatsApp confirmation to ${targetPhone}?`);
    if (!confirmSend) return;

    setIsSendingWhatsApp(true);
    
    try {
      let startH = 0, startM = 0, ampm = "AM";
      const rawTime = selectedManageBooking.start_time || "";
      
      if (rawTime.includes("AM") || rawTime.includes("PM")) {
        const [tStr, p] = rawTime.split(" ");
        const [h, m] = tStr.split(":").map(Number);
        startH = h; startM = m; ampm = p;
      } else {
        const [h, m] = rawTime.split(":").map(Number);
        ampm = h >= 12 ? "PM" : "AM";
        startH = h % 12 || 12;
        startM = m;
      }
      
      const displayStart = `${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")} ${ampm}`;
      
      let h24 = startH;
      if (ampm === "PM" && startH !== 12) h24 += 12;
      if (ampm === "AM" && startH === 12) h24 = 0;

      const totalMins = h24 * 60 + startM + Number(selectedManageBooking.duration_minutes || 60);
      const endH24 = Math.floor(totalMins / 60) % 24;
      const endM = totalMins % 60;
      const endH12 = endH24 % 12 === 0 ? 12 : endH24 % 12;
      const endAMPM = endH24 >= 12 ? "PM" : "AM";

      const displayEnd = `${String(endH12).padStart(2, "0")}:${String(endM).padStart(2, "0")} ${endAMPM}`;
      
      const sanitize = (str: string) => (str || "").replace(/[\n\t]/g, ' ').replace(/\s{2,}/g, ' ').trim();

      const safeTimeFormat = sanitize(`${displayStart} - ${displayEnd}`);
      const safeName = sanitize(selectedManageBooking.customer_name);
      const safeSport = sanitize(selectedManageBooking.sport || "Football");

      const response = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerPhone: targetPhone,
          customerName: safeName,
          email: selectedManageBooking.email || null,
          date: selectedManageBooking.booking_date?.split('T')[0],
          time: safeTimeFormat,
          duration: selectedManageBooking.duration_minutes || 60,
          sport: safeSport,
          court: selectedManageBooking.court_number || selectedManageBooking.booking_type || "Full Court",
          bookingId: `#${selectedManageBooking.id}`,
          referenceId: selectedManageBooking.booking_reference || "N/A",
          totalAmount: Number(selectedManageBooking.total_amount || 0),
          advanceAmount: Number(selectedManageBooking.advance_amount || 0),
          balanceAmount: Number(selectedManageBooking.balance_amount || 0)
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        alert(`❌ WhatsApp API Error:\n${errorText}`);
      } else {
        alert("✅ WhatsApp Confirmation Sent Successfully!");
      }

    } catch (error) {
      console.error("WhatsApp Dispatch Failed:", error);
      alert("❌ Failed to reach WhatsApp server. Check console.");
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  /* ========================================================================= */
  /* 🔒 MASTER OTP SECURITY LOGIC */
  /* ========================================================================= */

  type OtpActionType = "cancel_refund" | "reschedule" | "cancel_no_refund" | "extend" | "upgrade_full" | "update_settings";

  // 📧 Builds the "what is being changed" lines that go into the OTP email
  const buildOtpDetails = (actionType: OtpActionType): { label: string; value: string }[] => {
    const rows: { label: string; value: string }[] = [];
    const fmtDate = (d?: string) =>
      d ? new Date(d.split("T")[0] + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";

    if (actionType === "update_settings") {
      rows.push({ label: "Full Court price", value: `₹${pricingForm.full_hour}/hr (crossed-out ₹${pricingForm.full_regular})` });
      rows.push({ label: "Half Court price", value: `₹${pricingForm.half_hour}/hr (crossed-out ₹${pricingForm.half_regular})` });
      rows.push({
        label: "Academy blocking",
        value: academyForm.enabled
          ? `ON from ${fmtDate(academyForm.start_date)} · ${[...academyForm.days].sort().map((d) => DAY_NAMES[d]).join(", ")} · ${rangesText(slotsToRanges(academyForm.slots))}`
          : "OFF",
      });
      return rows;
    }

    const b = selectedManageBooking;
    if (!b) return rows;

    const dur = b.duration_minutes || 60;
    const court = b.court_number || b.booking_type || "-";
    const totalPaid = (b.total_amount || 0) - (b.balance_amount || 0);

    rows.push({ label: "Customer", value: `${b.customer_name || "-"}${b.phone ? ` (${b.phone})` : ""}` });
    if (b.booking_reference) rows.push({ label: "Booking ref", value: String(b.booking_reference) });
    rows.push({ label: "Current slot", value: `${fmtDate(b.booking_date)} · ${b.start_time} · ${dur} min · ${court}` });
    rows.push({ label: "Booking total", value: `₹${b.total_amount || 0} (paid ₹${totalPaid}, balance ₹${b.balance_amount || 0})` });

    if (actionType === "cancel_refund") {
      rows.push({ label: "Action", value: "Booking deleted" });
      rows.push({ label: "Refund to return", value: `₹${totalPaid}` });
    } else if (actionType === "cancel_no_refund") {
      rows.push({ label: "Action", value: "Booking deleted" });
      rows.push({ label: "Refund", value: "None (no refund issued)" });
    } else if (actionType === "extend") {
      rows.push({ label: "Extension", value: `+${extendMinutes} minutes (new total ${dur + Number(extendMinutes)} min)` });
      if (extendCourtSize) rows.push({ label: "Court change", value: "Upgraded to Full Court" });
    } else if (actionType === "upgrade_full") {
      const c = upgradeCalc(b);
      rows.push({ label: "Upgrade", value: `Half Court → Full Court after ${upgradeAfterMins} min of play` });
      rows.push({ label: "Time", value: `${c.switchedMins} min of booked time switched to Full${c.extra ? ` + ${c.extra} min extra` : ""} (new total ${c.newDur} min)` });
      rows.push({ label: "Extra amount", value: `₹${c.amount}${c.amount !== c.suggested ? ` (calculated ₹${c.suggested}, entered manually)` : ""}` });
    } else if (actionType === "reschedule") {
      rows.push({ label: "Moved to", value: `${fmtDate(rescheduleDate)} · ${rescheduleTime} · ${rescheduleDuration} min · ${rescheduleCourt}` });
      if (Number(rescheduleDuration) !== dur) {
        rows.push({
          label: "Duration change",
          value: `${dur} min → ${rescheduleDuration} min (${Number(rescheduleDuration) > dur ? "extended" : "reduced"})`,
        });
      }
      if (overrideAmount !== "") rows.push({ label: "Manual amount override", value: `₹${overrideAmount}` });
    }
    return rows;
  };

  const triggerOtpProtection = async (actionType: OtpActionType) => {
    setIsSendingOtp(true);
    try {
      const response = await fetch("/api/admin-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          email: "sports@smesturf.com",
          actionType,
          details: buildOtpDetails(actionType),
        })
      });
      
      if (!response.ok) throw new Error("Failed to trigger OTP");
      
      setPendingAction(actionType);
      setShowOtpModal(true);
    } catch (error) {
      alert("Failed to send OTP. Please check your internet connection.");
    } finally {
      setIsSendingOtp(false);
    }
  };

  // 📋 One-tap paste: copy the code in Gmail, then tap this
  const pasteOtpFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const match = text.match(/\d{6}/);
      if (match) {
        setOtpInput(match[0]);
      } else {
        alert("No 6-digit code found on your clipboard. Copy the code from the email first.");
      }
    } catch {
      alert("Couldn't read the clipboard. Long-press the box and choose Paste instead.");
    }
  };

  const verifyOtpAndExecute = async () => {
    if (!otpInput || otpInput.length !== 6) {
      alert("Please enter a valid 6-digit OTP.");
      return;
    }
    
    setIsVerifyingOtp(true);
    try {
      // 💰 Pricing / academy hours: the server checks the OTP and saves in one step
      if (pendingAction === "update_settings") {
        setIsSavingSettings(true);
        const saveRes = await fetch("/api/admin-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save_settings",
            otp: otpInput,
            pricing: {
              full_hour: Number(pricingForm.full_hour),
              full_regular: Number(pricingForm.full_regular),
              half_hour: Number(pricingForm.half_hour),
              half_regular: Number(pricingForm.half_regular),
            },
            academy: {
              enabled: academyForm.enabled,
              start_date: academyForm.start_date,
              days: [...academyForm.days].sort(),
              slots: ALL_SLOT_LABELS.filter((l) => academyForm.slots.includes(l)),
            },
          }),
        });
        const saveData = await saveRes.json();
        setIsSavingSettings(false);
        if (saveData.success) {
          setShowOtpModal(false);
          setOtpInput("");
          setPendingAction(null);
          alert("✅ Saved! Customers will see the new prices and academy hours the next time they load the booking page.");
        } else {
          alert(`❌ ${saveData.message || "Invalid or expired OTP. Please try again."}`);
        }
        return;
      }

      const response = await fetch("/api/admin-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", otp: otpInput })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setShowOtpModal(false);
        setOtpInput("");
        
        if (pendingAction === "cancel_refund") await handleCancelWithRefund(true);
        else if (pendingAction === "reschedule") await handleRescheduleBooking(true);
        else if (pendingAction === "cancel_no_refund") await handleCancelWithoutRefund(true);
        else if (pendingAction === "extend") await checkAndExtendBooking(true);
        else if (pendingAction === "upgrade_full") await handleUpgradeToFull(true);
        
        setPendingAction(null);
      } else {
        alert("❌ Invalid or Expired OTP. Please try again.");
      }
    } catch (error) {
      alert("Error verifying OTP.");
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // 1. Cancel With Refund
  const handleCancelWithRefund = async (otpVerified = false) => {
    if (!selectedManageBooking) return;

    const totalPaid = (selectedManageBooking.total_amount || 0) - (selectedManageBooking.balance_amount || 0);
    
    if (!otpVerified) {
      const confirmCancel = confirm(
        `Are you sure you want to cancel booking for "${selectedManageBooking.customer_name}"?\n\n💰 Refund to return: ₹${totalPaid}`
      );
      if (!confirmCancel) return;
      
      await triggerOtpProtection("cancel_refund");
      return;
    }

    const { error } = await supabase.from("bookings").delete().eq("id", selectedManageBooking.id);
    if (error) { alert(error.message); return; }

    alert(`✅ Booking Cancelled. Refund of ₹${totalPaid} marked to be returned.`);
    setShowManageModal(false);
    setSelectedManageBooking(null);
    loadBookings();
  };

  // 2. Reschedule & Reduce & Manual Amount Edit
  const handleRescheduleBooking = async (otpVerified = false) => {
    if (!selectedManageBooking || !rescheduleDate || !rescheduleTime) {
      alert("Please select both Date and Time for rescheduling.");
      return;
    }

    const { data: existingBookings } = await supabase.from("bookings").select("*").eq("booking_date", rescheduleDate);
    const { data: existingBlocks } = await supabase.from("blocked_slots").select("*").eq("booking_date", rescheduleDate);

    const selectedStart = convertToMins(rescheduleTime);
    const selectedEnd = selectedStart + Number(rescheduleDuration);

    const allBusyItems = [
      ...(existingBookings || []).filter((b: any) => b.id !== selectedManageBooking.id),
      ...(existingBlocks || [])
    ];

    const isOverlapping = allBusyItems.some((item) => {
      const itemStart = convertToMins(item.start_time);
      const itemEnd = itemStart + (item.duration_minutes || 60);
      const overlaps = selectedStart < itemEnd && selectedEnd > itemStart;
      if (!overlaps) return false;
      if (rescheduleCourt === "Full Court" || rescheduleCourt === "Both Courts") return true;
      if (item.booking_type === "Full Court" || item.court_number === "Full Court" || item.court_number === "Both Courts") return true;
      return item.court_number === rescheduleCourt;
    });

    if (isOverlapping) {
      alert("⚠️ The selected slot or court is already booked/blocked. Please select another time or court.");
      return;
    }

    if (!otpVerified) {
      await triggerOtpProtection("reschedule");
      return;
    }

    const originalDur = selectedManageBooking.duration_minutes || 60;
    const originalTotal = selectedManageBooking.total_amount || 0;
    const pricePerMin = originalTotal / originalDur;
    
    // ⚡ NEW: Use custom override amount if provided, otherwise compute based on duration ratio
    const calculatedNewTotal = Math.round(pricePerMin * rescheduleDuration);
    const newTotal = overrideAmount !== "" ? Number(overrideAmount) : calculatedNewTotal;

    const priceDiff = newTotal - originalTotal;
    const currentPaid = originalTotal - (selectedManageBooking.balance_amount || 0);
    const newBalance = Math.max(0, newTotal - currentPaid);

    const { error } = await supabase
      .from("bookings")
      .update({
        booking_date: rescheduleDate,
        start_time: rescheduleTime,
        duration_minutes: rescheduleDuration,
        court_number: rescheduleCourt,
        total_amount: newTotal,
        balance_amount: newBalance,
      })
      .eq("id", selectedManageBooking.id);

    if (error) { alert(error.message); return; }

    alert("✅ Booking Modified Successfully!");
    setShowManageModal(false);
    setSelectedManageBooking(null);
    setOverrideAmount("");
    loadBookings();
  };

  // 3. Cancel Without Refund
  const handleCancelWithoutRefund = async (otpVerified = false) => {
    if (!selectedManageBooking) return;
    
    if (!otpVerified) {
      const confirmCancel = confirm(
        `Are you sure you want to cancel the booking for "${selectedManageBooking.customer_name}" WITHOUT issuing a refund?`
      );
      if (!confirmCancel) return;
      
      await triggerOtpProtection("cancel_no_refund");
      return;
    }

    const { error } = await supabase.from("bookings").delete().eq("id", selectedManageBooking.id);
    if (error) { alert(error.message); return; }

    alert("✅ Booking Cancelled (No Refund Issued).");
    setShowManageModal(false);
    setSelectedManageBooking(null);
    loadBookings();
  };

  // 4. Extend Slot
  const checkAndExtendBooking = async (otpVerified = false) => {
    if (!selectedManageBooking) return;

    const bDate = selectedManageBooking.booking_date?.split("T")[0];
    const startMins = convertToMins(selectedManageBooking.start_time);
    const currentDur = selectedManageBooking.duration_minutes || 60;
    const extensionStart = startMins + currentDur;
    const extensionEnd = extensionStart + Number(extendMinutes);

    if (extensionEnd > 23 * 60) {
       alert("⚠️ Extension Failed: The turf closes strictly at 11:00 PM.");
       return;
    }

    const { data: existingBookings } = await supabase.from("bookings").select("*").eq("booking_date", bDate);
    const { data: existingBlocks } = await supabase.from("blocked_slots").select("*").eq("booking_date", bDate);

    const allBusyItems = [
      ...(existingBookings || []).filter((b: any) => b.id !== selectedManageBooking.id),
      ...(existingBlocks || [])
    ];

    const checkStart = extensionStart;
    const targetCourt = extendCourtSize ? "Full Court" : (selectedManageBooking.court_number || "Full Court");

    const isOverlapping = allBusyItems.some((item) => {
      const itemStart = convertToMins(item.start_time);
      const itemEnd = itemStart + (item.duration_minutes || 60);
      const overlaps = checkStart < itemEnd && extensionEnd > itemStart;
      if (!overlaps) return false;
      
      if (targetCourt === "Full Court" || targetCourt === "Both Courts") return true;
      if (item.booking_type === "Full Court" || item.court_number === "Full Court" || item.court_number === "Both Courts") return true;
      return item.court_number === targetCourt;
    });

    if (isOverlapping) {
      alert("⚠️ Extension Failed: The target extended time slot is already booked or blocked.");
      return;
    }
    
    if (!otpVerified) {
      await triggerOtpProtection("extend");
      return;
    }

    const currentTotal = selectedManageBooking.total_amount || 0;
    const currentBalance = selectedManageBooking.balance_amount || 0;
    
    const pricePerMin = currentTotal / currentDur;
    const addedPrice = extendCourtSize 
      ? Math.round((pricePerMin * 2) * Number(extendMinutes)) 
      : Math.round(pricePerMin * Number(extendMinutes));
    
    const newDuration = currentDur + Number(extendMinutes);
    const newTotal = currentTotal + addedPrice;
    const newBalance = currentBalance + addedPrice;
    const newBookingType = extendCourtSize ? "Full Court" : selectedManageBooking.booking_type;
    const newCourtNumber = extendCourtSize ? "Full Court" : selectedManageBooking.court_number;

    const { error } = await supabase
      .from("bookings")
      .update({
        duration_minutes: newDuration,
        total_amount: newTotal,
        balance_amount: newBalance,
        booking_type: newBookingType,
        court_number: newCourtNumber,
      })
      .eq("id", selectedManageBooking.id);

    if (error) { alert(error.message); return; }

    alert(`✅ Slot Extended! Duration: ${newDuration} mins, New Price: ₹${newTotal}.`);
    setShowManageModal(false);
    setSelectedManageBooking(null);
    loadBookings();
  };


  // 🔄 HALF → FULL COURT UPGRADE ------------------------------------------------
  // Price logic: minutes already inside the booked slot that switch to Full Court cost the
  // DIFFERENCE (full rate − half rate). Minutes added after the end cost the full rate.
  const upgradeCalc = (b: any) => {
    const dur = b?.duration_minutes || 60;
    const fullPerMin = livePricing.full_hour / 60;
    const halfPerMin = livePricing.half_hour / 60;
    const switchedMins = Math.max(0, dur - Number(upgradeAfterMins));
    const extra = Number(upgradeExtraMins);
    const suggested = Math.round(switchedMins * (fullPerMin - halfPerMin) + extra * fullPerMin);
    const entered = upgradeAmountInput === "" ? suggested : Math.max(0, Math.round(Number(upgradeAmountInput) || 0));
    return { dur, switchedMins, extra, suggested, amount: entered, newDur: dur + extra };
  };

  const handleUpgradeToFull = async (otpVerified = false) => {
    const b = selectedManageBooking;
    if (!b) return;

    const { dur, extra, amount, newDur } = upgradeCalc(b);
    const after = Number(upgradeAfterMins);

    if (!Number.isFinite(amount) || amount < 0) { alert("⚠️ Please enter a valid extra amount."); return; }
    if (after < 30 || after > dur) { alert("⚠️ Please choose how long they played on Half Court."); return; }
    if (after === dur && extra === 0) { alert("⚠️ Nothing to upgrade: add extra Full Court time, or choose an earlier switch point."); return; }

    const bDate = b.booking_date?.split("T")[0];
    const startMins = convertToMins(b.start_time);
    const checkStart = startMins + after;
    const newEnd = startMins + newDur;

    if (newEnd > 23 * 60) { alert("⚠️ Upgrade Failed: The turf closes strictly at 11:00 PM."); return; }

    // The OTHER half must be free from the switch point until the new end
    const { data: existingBookings } = await supabase.from("bookings").select("*").eq("booking_date", bDate);
    const { data: existingBlocks } = await supabase.from("blocked_slots").select("*").eq("booking_date", bDate);
    const busy = [
      ...(existingBookings || []).filter((x: any) => x.id !== b.id),
      ...(existingBlocks || []),
    ];
    const isOverlapping = busy.some((item: any) => {
      const itemStart = convertToMins(item.start_time);
      const itemEnd = itemStart + (item.duration_minutes || 60);
      return checkStart < itemEnd && newEnd > itemStart;
    });
    if (isOverlapping) {
      alert("⚠️ Upgrade Failed: The other half of the court is booked or blocked during that time, so Full Court is not possible.");
      return;
    }

    if (!otpVerified) {
      const ok = confirm(
        `Upgrade "${b.customer_name}" to FULL COURT?\n\n` +
        `Extra amount to collect: ₹${amount}\n` +
        `New end time: ${getTimeRangeLabel(b.start_time, newDur).split(" to ")[1]}`
      );
      if (!ok) return;
      await triggerOtpProtection("upgrade_full");
      return;
    }

    const newTotal = (b.total_amount || 0) + amount;
    const newBalance = (b.balance_amount || 0) + amount;

    const { error } = await supabase
      .from("bookings")
      .update({
        duration_minutes: newDur,
        total_amount: newTotal,
        balance_amount: newBalance,
        booking_type: "Full Court",
        court_number: "Full Court",
        // extra money is now due, so the booking must show up as "to collect" again
        ...(amount > 0 ? { payment_completed: false } : {}),
      })
      .eq("id", b.id);

    if (error) { alert(error.message); return; }

    alert(`✅ Upgraded to Full Court. Extra ₹${amount} added — collect it with "Collect Payment". New total: ₹${newTotal}.`);
    setShowManageModal(false);
    setSelectedManageBooking(null);
    loadBookings();
  };

  /* ========================================================================= */

  /* -------- DYNAMIC EXCEL EXPORT (FIXED MATH & DOUBLE COUNT) -------- */
  const exportToExcel = async () => {
    const { data: dbBookings, error: dbError } = await supabase
      .from("bookings")
      .select("*")
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (dbError) {
      alert("Failed to fetch full booking history for export.");
      return;
    }
    const fullBookings = (dbBookings || []).map((b: any) => ({
      ...b,
      advance_amount: b.customer_name === "Offline Booking" ? 0 : b.advance_amount
    }));

    const { data: dbStudents } = await supabase
      .from("students")
      .select(`*, student_payments(*), student_attendance(*)`)
      .order("name", { ascending: true });

    // Payment log (only exists after the staff SQL has been run; ignore errors)
    const { data: dbLog } = await supabase.from("payment_log").select("*").order("created_at", { ascending: false }).limit(5000);
    const who = await getCurrentStaff();

    try {
      await downloadMasterReport({
        bookings: fullBookings,
        students: dbStudents || [],
        paymentLog: dbLog || [],
        todayStr: getTodayStr(),
        exportedBy: who ? who.name : "Unknown",
        exportedByRole: who ? ROLE_LABEL[who.role] : "-",
        fixedFee: FIXED_COACHING_FEE,
        isNewStudent: (s: any) => istMonthOfTimestamp(s.created_at) === currentMonthYear,
      });
    } catch (err: any) {
      console.log("Excel export failed:", err);
      alert("Excel export failed: " + (err?.message || err) + "\n\nMake sure the 'exceljs' package is installed (npm install exceljs).");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut({ scope: "local" });
    localStorage.removeItem("adminLoggedIn");
    localStorage.removeItem("adminLoginTime");
    router.push("/staff");
  };

  const savePayment = async () => {
    if (!selectedBooking) return;
    const who = await requireStaff();
    if (!who) return;
    const balance = Number(selectedBooking.balance_amount || 0);
    
    let addCash = 0;
    let addUpi = 0;

    if (paymentType === "Full Cash") addCash = balance;
    if (paymentType === "Full UPI") addUpi = balance;
    if (paymentType === "Cash + UPI") {
      addCash = Number(cashAmount || 0);
      addUpi = Number(upiAmount || 0);
      if (addCash + addUpi !== balance) { 
        alert(`Cash + UPI must exactly equal the due balance of ₹${balance}`); 
        return; 
      }
    }

    const newCash = Number(selectedBooking.cash_received || 0) + addCash;
    const newUpi = Number(selectedBooking.upi_received || 0) + addUpi;

    let finalMethod = selectedBooking.payment_method || " Cash + UPI ";
    if (selectedBooking.payment_method === "UPI" && paymentType === "Full Cash") finalMethod = "Cash + UPI";
    else if (selectedBooking.payment_method === "Cash" && paymentType === "Full UPI") finalMethod = "Cash + UPI";
    else if (paymentType === "Cash + UPI") finalMethod = "Cash + UPI";
    else if (!selectedBooking.payment_method) finalMethod = paymentType;

    const { error } = await supabase
      .from("bookings")
      .update({
        cash_received: newCash,
        upi_received: newUpi,
        payment_method: finalMethod,
        payment_completed: true,
        balance_amount: 0,
        collected_by: who.name, collected_by_role: who.role, collected_at: new Date().toISOString(),
        payment_date: getTodayStr(), 
      })
      .eq("id", selectedBooking.id);
      
    if (error) { alert(error.message); return; }

    await logPayment({ staff: who, kind: "booking_balance", amount: balance, method: finalMethod, bookingId: selectedBooking.id, note: `${selectedBooking.customer_name} · ${selectedBooking.booking_date?.split("T")[0]}` });
    alert("✅ Payment Collected & Saved Successfully");
    setShowPaymentModal(false);
    setCashAmount("");
    setUpiAmount("");
    loadBookings();
  };

  const resetPayment = async (booking: any) => {
    const confirmed = confirm("Reset this payment? The advance will remain untouched, but the remaining balance will be marked as DUE again.");
    if (!confirmed) return;
    const who = await requireStaff();
    if (!who) return;
    
    const originalBalance = (booking.total_amount || 0) - (booking.advance_amount || 0);
    
    const { error = null } = await supabase
      .from("bookings")
      .update({
        cash_received: 0,
        upi_received: booking.advance_amount || 0,
        payment_method: booking.advance_amount > 0 ? "UPI" : null,
        payment_completed: false,
        balance_amount: originalBalance, 
        payment_date: null,
        collected_by: null,
        collected_by_role: null,
        collected_at: null,
      })
      .eq("id", booking.id);
      
    if (error) { alert(error.message); return; }

    await logPayment({ staff: who, kind: "booking_reset", amount: Number(booking.total_amount || 0) - Number(booking.balance_amount || 0) - Number(booking.advance_amount || 0), bookingId: booking.id, note: `Payment reset for ${booking.customer_name}` });
    alert("✅ Payment Reset Successfully");
    loadBookings();
  };

  const deleteBlockedSlot = async (id: number) => {
    const confirmed = confirm("Delete this blocked slot?");
    if (!confirmed) return;
    const { error } = await supabase.from("blocked_slots").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    alert("✅ Blocked slot deleted");
    loadBookings();
  };

  /* -------- HELPER: AUTO-HIDE PAST COMPLETED BOOKINGS -------- */
  const isBookingCompletedAndPassed = (booking: any) => {
    if (Number(booking.balance_amount || 0) > 0) return false;
    
    const bDate = booking.booking_date?.split("T")[0];
    const todayStr = getTodayStr();
    
    if (!bDate) return false;
    if (bDate < todayStr) return true;
    if (bDate > todayStr) return false;

    const now = new Date();
    const istTimeStr = now.toLocaleTimeString("en-US", { timeZone: "Asia/Kolkata", hour12: false });
    const [currentHours, currentMins] = istTimeStr.split(":").map(Number);
    const currentMinutes = currentHours * 60 + currentMins;

    const timeParts = (booking.start_time || "").trim().split(" ");
    if (!timeParts[0]) return false;

    const [hStr, mStr] = timeParts[0].split(":");
    let h = Number(hStr);
    const m = parseInt(mStr || "0", 10);

    if (timeParts[1]) {
      const ampm = timeParts[1].toUpperCase();
      if (ampm === "PM" && h !== 12) h += 12;
      if (ampm === "AM" && h === 12) h = 0;
    }

    const durationMins = Number(booking.duration_minutes || 60);
    const endMinutes = (h * 60 + m) + durationMins;
    
    return endMinutes <= currentMinutes;
  };

  const filteredBookings = bookings
    .filter((booking) => {
      if (searchTerm.trim() !== "") return true;

      if (filterDate) {
        if (booking.booking_date?.split("T")[0] !== filterDate) return false;
      } else {
        if (isBookingCompletedAndPassed(booking)) return false;
      }
      return true;
    })
    .filter((booking, _, currentFiltered) => {
      let search = searchTerm.toLowerCase().trim();
      if (!search) return true;

      const cleanIdSearch = search.replace("#", "");

      const exactMatchExists = currentFiltered.some(b => b.id?.toString() === cleanIdSearch);
      if (exactMatchExists) {
        return booking.id?.toString() === cleanIdSearch;
      }

      return (
        booking.customer_name?.toLowerCase().includes(search) ||
        booking.phone?.toLowerCase().includes(search) ||
        booking.email?.toLowerCase().includes(search) || 
        booking.booking_date?.toLowerCase().includes(search) ||
        booking.booking_reference?.toLowerCase().includes(search) ||
        booking.id?.toString().includes(cleanIdSearch) 
      );
    });

  const filteredAcademyStudents = useMemo(() => {
    const q = academySearch.trim().toLowerCase();
    return academyStudents.filter(s =>
      s.batch === rosterTab &&
      (!q || s.name?.toLowerCase().includes(q) || s.phone?.includes(q))
    );
  }, [academyStudents, rosterTab, academySearch]);

  // 📊 Per-batch strength (students, fees paid/due, present today)
  const academyStats = useMemo(() => {
    const today = getTodayStr();
    const calc = (batch: BatchTabType) => {
      const list = academyStudents.filter(s => s.batch === batch);
      const paid = list.filter(s => s.payment_status === "settled").length;
      const present = list.filter(s =>
        s.student_attendance?.some((a: any) => a.date === today && a.status === "Present")
      ).length;
      const collected = list.reduce(
        (sum: number, s: any) => sum + (s.payment_status === "settled" ? Number(s.amount_paid || 0) : 0), 0
      );
      return { total: list.length, paid, due: list.filter(isDue).length, present, collected };
    };
    return { morning: calc("Morning Batch"), evening: calc("Evening Batch") };
  }, [academyStudents]);

  // 🔢 Serial numbers: 1, 2, 3... separately for Morning and Evening batch
  const academySerials = useMemo(() => {
    const map: Record<string, number> = {};
    (["Morning Batch", "Evening Batch"] as BatchTabType[]).forEach((batch) => {
      academyStudents
        .filter((s) => s.batch === batch)
        .forEach((s, i) => { map[s.id] = i + 1; });
    });
    return map;
  }, [academyStudents]);

  // 🧾 Payment-history sheet data
  const historyStudent = historyStudentId ? academyStudents.find((st) => st.id === historyStudentId) : null;
  const historyRows: { ym: string; rec: any }[] = (() => {
    if (!historyStudent) return [];
    const payments: any[] = historyStudent.student_payments || [];
    const joinYm = istMonthOfTimestamp(historyStudent.created_at) || currentMonthYear;
    const rawEarliest = [joinYm, ...payments.map((p: any) => p.month_year)].filter(Boolean).sort()[0];
    const earliest = rawEarliest < COACHING_START_MONTH ? COACHING_START_MONTH : rawEarliest;
    const rows: { ym: string; rec: any }[] = [];
    for (let ym = currentMonthYear; ym >= earliest && rows.length < 60; ym = shiftMonth(ym, -1)) {
      rows.push({ ym, rec: payments.find((p: any) => p.month_year === ym) });
    }
    return rows;
  })();
  const historyPaidCount = historyRows.filter((r) => r.rec && r.rec.status === "settled").length;
  const historyTotalPaid = historyRows.reduce(
    (sum, r) => sum + (r.rec && r.rec.status === "settled" ? Number(r.rec.amount_paid || 0) : 0), 0
  );

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 font-sans tracking-tight antialiased relative w-full overflow-x-hidden selection:bg-lime-400 selection:text-black">

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

      <div className="relative z-10 max-w-[1600px] mx-auto p-4 sm:p-6 md:p-10">

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
              // Control Center Tower
            </div>
            <h1 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter text-white leading-none">
              <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-neutral-400">
                SMES Admin Panel
              </span>
            </h1>
            <p className="text-neutral-400 text-sm mt-2 font-mono">
              Live control · Real-time sync · <span className="text-lime-400">{currentMonthLabel}</span>
            </p>
            {staff && (
              <p className="text-[11px] font-mono text-neutral-500 mt-1">
                👤 Signed in as <span className="text-white font-bold">{staff.name}</span> · {ROLE_LABEL[staff.role]}
              </p>
            )}
          </motion.div>

          <motion.button
            variants={fadeUp}
            whileHover={{ y: -2, boxShadow: "0 12px 30px rgba(239,68,68,0.25)" }}
            whileTap={{ scale: 0.97 }}
            onClick={handleLogout}
            className="bg-neutral-900 hover:bg-red-950 border border-neutral-800 hover:border-red-900 text-neutral-300 hover:text-white px-6 py-4 font-mono text-xs uppercase tracking-widest font-black transition-colors flex items-center gap-2"
          >
            🚪 End Session
          </motion.button>
        </motion.div>

        {/* ---------- Stat Cards ---------- */}
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 sm:gap-4 mb-10"
        >
          {dashboardStats.map((s) => (
            <motion.div
              key={s.label}
              variants={fadeUp}
              whileHover={{ y: -3, borderColor: "rgba(163,230,53,0.4)" }}
              className="border border-neutral-900 bg-neutral-900/30 backdrop-blur p-4 transition-colors"
            >
              <span className="text-[10px] font-mono text-neutral-600 block mb-2">{s.tag} //</span>
              <p className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">
                {s.label}
              </p>
              <AnimatePresence mode="wait">
                <motion.div
                  key={String(s.value)}
                  initial={{ opacity: 0, y: -6, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.9 }}
                  transition={{ duration: 0.25, ease: easeOut }}
                  className={`text-2xl font-black mt-1 ${s.accent}`}
                >
                  {s.value}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          ))}
        </motion.div>

        {/* ---------- Toolbar ---------- */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="flex flex-col md:flex-row items-stretch justify-between gap-4 mb-6"
        >
          <div className="w-full md:w-96 relative">
            <input
              type="text"
              placeholder="🔍 Filter by ID, name, email, phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-4 bg-neutral-900/60 text-white border border-neutral-800 focus:border-lime-400 outline-none placeholder:text-neutral-600 text-sm font-mono transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 md:flex md:items-center">
            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              className="bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-mono text-xs uppercase tracking-widest px-5 py-4 font-black transition-colors"
              onClick={() => {
                setShowManageSlots(true);
                setSlotDate(getTodayStr());
              }}
            >
              ⚙️ Manage Slots
            </motion.button>

            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              className={`font-mono text-xs uppercase tracking-widest px-5 py-4 font-black transition-colors ${showSettingsPanel ? 'bg-amber-400 text-black' : 'bg-amber-600 hover:bg-amber-500 text-white'}`}
              onClick={() => {
                const next = !showSettingsPanel;
                setShowSettingsPanel(next);
                if (next) loadSettings();
              }}
            >
              💰 Pricing & Hours
            </motion.button>

            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              className={`font-mono text-xs uppercase tracking-widest px-5 py-4 font-black transition-colors ${showCoachingPanel ? 'bg-lime-400 text-black' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
              onClick={() => {
                const nextState = !showCoachingPanel;
                setShowCoachingPanel(nextState);
                if (nextState) {
                  setAcademyTab("existing");
                  setShowAcademyRoster(false);
                  setAcademySearch("");
                }
              }}
            >
              ⚽ Football Coaching
            </motion.button>

            <motion.button
              whileHover={{ y: -2, boxShadow: "0 12px 30px rgba(163,230,53,0.35)" }}
              whileTap={{ scale: 0.97 }}
              onClick={exportToExcel}
              className="bg-lime-400 hover:bg-lime-300 text-black font-mono text-xs uppercase tracking-widest px-5 py-4 font-black transition-colors"
            >
              📊 Export Excel
            </motion.button>
          </div>
        </motion.div>

        {/* ---------- Football Coaching Panel (mobile-first) ---------- */}
        <AnimatePresence>
          {showCoachingPanel && (
            <motion.div
              initial={{ opacity: 0, y: -12, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -12, height: 0 }}
              transition={{ duration: 0.35, ease: easeOut }}
              className="overflow-hidden mb-8"
            >
              <div className="space-y-3 sm:space-y-4 p-3 sm:p-6 border border-neutral-900 bg-neutral-900/30 backdrop-blur relative">
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-lime-400 to-emerald-500" />

                {/* Header */}
                <div className="flex items-start justify-between gap-3 pt-1">
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">
                      A1 — Football Coaching
                    </span>
                    <h2 className="text-lg sm:text-xl font-black uppercase text-white leading-tight">
                      Coaching Ledger
                    </h2>
                    <p className="text-[11px] font-mono text-lime-400 mt-0.5">{currentMonthLabel}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCoachingPanel(false)}
                    aria-label="Close coaching panel"
                    className="w-10 h-10 shrink-0 flex items-center justify-center border border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white hover:border-neutral-600 transition-colors text-sm"
                  >
                    ✕
                  </button>
                </div>

                {/* New student requests (from the public registration link) */}
                <StudentApplications role="admin" onAccepted={loadAcademyData} />

                {/* Fee month picker — check or settle any past month */}
                <div className="space-y-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">Fee Month</span>
                  <div className="flex items-stretch gap-2">
                    <button
                      type="button"
                      aria-label="Previous month"
                      disabled={feeMonth <= COACHING_START_MONTH}
                      onClick={() => setFeeMonth(shiftMonth(feeMonth, -1))}
                      className="w-12 min-h-[48px] shrink-0 flex items-center justify-center bg-neutral-950 border border-neutral-800 text-lime-400 text-2xl active:bg-neutral-900 disabled:opacity-30"
                    >
                      ‹
                    </button>
                    <select
                      value={feeMonth}
                      onChange={(e) => setFeeMonth(e.target.value)}
                      className={`${coachingInputCls} flex-1 text-center font-black uppercase tracking-wide`}
                    >
                      {feeMonthOptions.map((ym) => (
                        <option key={ym} value={ym}>
                          {monthLabelOf(ym)}{ym === currentMonthYear ? " (Current)" : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      aria-label="Next month"
                      disabled={feeMonth >= currentMonthYear}
                      onClick={() => setFeeMonth(shiftMonth(feeMonth, 1))}
                      className="w-12 min-h-[48px] shrink-0 flex items-center justify-center bg-neutral-950 border border-neutral-800 text-lime-400 text-2xl active:bg-neutral-900 disabled:opacity-30"
                    >
                      ›
                    </button>
                  </div>
                  {feeMonth !== currentMonthYear && (
                    <div className="flex items-center justify-between gap-2 p-2.5 bg-amber-500/10 border border-amber-500/30 text-[11px] font-mono text-amber-300">
                      <span>📅 Viewing {feeMonthLabel} — fee status below is for this month</span>
                      <button
                        type="button"
                        onClick={() => setFeeMonth(currentMonthYear)}
                        className="px-2.5 py-1.5 border border-amber-500/40 font-black uppercase shrink-0"
                      >
                        Current
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 items-start">
                  {/* ---------- Actions (below roster on phones) ---------- */}
                  <div className="lg:col-span-1 border border-neutral-900 bg-neutral-900/50 p-4 space-y-4 h-fit">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block mb-0.5">
                        Ledger Actions
                      </span>
                      <h3 className="text-base font-black uppercase text-white">Fees & Enrollment</h3>
                    </div>

                    <LayoutGroup>
                      <div className="grid grid-cols-2 gap-1.5 p-1 border border-neutral-800 bg-neutral-950">
                        {[
                          { id: "existing", label: "🔄 Log Old Fee" },
                          { id: "new", label: "👶 Enroll" },
                        ].map((t) => (
                          <motion.button
                            key={t.id}
                            type="button"
                            whileTap={{ scale: 0.97 }}
                            onClick={() => setAcademyTab(t.id as any)}
                            className={`relative min-h-[44px] text-[11px] font-mono uppercase tracking-widest transition-colors ${
                              academyTab === t.id ? "text-black font-black" : "text-neutral-400 hover:text-white"
                            }`}
                          >
                            {academyTab === t.id && (
                              <motion.span
                                layoutId="academy-tab-highlight"
                                className="absolute inset-0 bg-lime-400 -z-0"
                                transition={{ type: "spring", stiffness: 350, damping: 30 }}
                              />
                            )}
                            <span className="relative z-10">{t.label}</span>
                          </motion.button>
                        ))}
                      </div>
                    </LayoutGroup>

                    <AnimatePresence mode="wait">
                      {academyTab === "new" ? (
                        <motion.form
                          key="new-form"
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 8 }}
                          onSubmit={handleAdminEnrollStudent}
                          className="space-y-3"
                        >
                          <div className="space-y-1.5">
                            <label className={coachingLabelCls}>Student Name</label>
                            <input
                              type="text"
                              placeholder="Enter player name"
                              value={adminNewStudentName}
                              onChange={(e) => setAdminNewStudentName(e.target.value)}
                              className={coachingInputCls}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className={coachingLabelCls}>Phone (10 Digits)</label>
                            <input
                              type="tel"
                              inputMode="numeric"
                              placeholder="10-digit number"
                              value={adminNewStudentPhone}
                              onChange={(e) => {
                                const numericValue = e.target.value.replace(/\D/g, "");
                                if (numericValue.length <= 10) setAdminNewStudentPhone(numericValue);
                              }}
                              maxLength={10}
                              className={`${coachingInputCls} font-mono`}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className={coachingLabelCls}>Date of Birth</label>
                            <input
                              type="date"
                              value={adminNewStudentDOB}
                              onChange={(e) => setAdminNewStudentDOB(e.target.value)}
                              className={coachingInputCls}
                              style={{ colorScheme: "dark" }}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className={coachingLabelCls}>Email ID</label>
                            <input
                              type="email"
                              inputMode="email"
                              placeholder="example@email.com"
                              value={adminNewStudentEmail}
                              onChange={(e) => setAdminNewStudentEmail(e.target.value)}
                              className={coachingInputCls}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                              <label className={coachingLabelCls}>Batch</label>
                              <select
                                value={adminNewStudentBatch}
                                onChange={(e) => setAdminNewStudentBatch(e.target.value as BatchTabType)}
                                className={coachingInputCls}
                              >
                                <option value="Morning Batch">🌅 Morning</option>
                                <option value="Evening Batch">🌙 Evening</option>
                              </select>
                            </div>
                            <div className="space-y-1.5">
                              <label className={coachingLabelCls}>Payment</label>
                              <select
                                value={adminNewStudentMethod}
                                onChange={(e) => setAdminNewStudentMethod(e.target.value)}
                                className={coachingInputCls}
                              >
                                <option value="UPI">UPI</option>
                                <option value="Cash">Cash</option>
                              </select>
                            </div>
                          </div>
                          {isHalfFeeEligible ? (
                            <div className="space-y-2.5 p-3 bg-amber-500/10 border border-amber-500/30">
                              <p className="text-[11px] font-mono text-amber-200 leading-relaxed">
                                📅 Joining after the 12th: you can collect half the fee for this first month. From next month it is the full fee.
                              </p>
                              <div className="grid grid-cols-2 gap-2">
                                {([
                                  { id: "full", label: "Full Fee", amt: FIXED_COACHING_FEE },
                                  { id: "half", label: "Half Fee", amt: HALF_COACHING_FEE },
                                ] as const).map((o) => (
                                  <button
                                    key={o.id}
                                    type="button"
                                    onClick={() => setAdminNewStudentFeeType(o.id)}
                                    className={`min-h-[56px] border font-mono font-black uppercase transition-colors ${
                                      adminNewStudentFeeType === o.id
                                        ? "bg-lime-400 text-black border-lime-400"
                                        : "bg-neutral-950 text-neutral-300 border-neutral-700"
                                    }`}
                                  >
                                    <span className="block text-[10px] tracking-widest">{o.label}</span>
                                    <span className="block text-base">₹{o.amt.toLocaleString("en-IN")}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 bg-neutral-950 border border-neutral-800 text-xs font-mono font-black text-lime-400">
                              Fixed Fee Rate: ₹{FIXED_COACHING_FEE.toLocaleString("en-IN")}
                            </div>
                          )}
                          <motion.button
                            whileTap={{ scale: 0.97 }}
                            type="submit"
                            className="w-full min-h-[52px] bg-lime-400 hover:bg-lime-300 text-black font-mono font-black text-xs uppercase tracking-widest transition-colors"
                          >
                            Enroll & Mark Paid · ₹{enrollFee.toLocaleString("en-IN")}
                          </motion.button>
                        </motion.form>
                      ) : (
                        <motion.form
                          key="existing-form"
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 8 }}
                          onSubmit={handleAdminOldPayment}
                          className="space-y-3"
                        >
                          <div className="space-y-1.5">
                            <label className={coachingLabelCls}>Select Due Student · {feeMonthLabel}</label>
                            <select
                              value={adminSelectedStudentId}
                              onChange={(e) => { setAdminSelectedStudentId(e.target.value); setAdminExistingFeeType("full"); }}
                              className={coachingInputCls}
                            >
                              <option value="">-- Select Due Student --</option>
                              {academyStudents.filter(isDue).map(s => (
                                <option key={s.id} value={s.id}>{s.name} ({s.phone})</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <label className={coachingLabelCls}>Payment Method</label>
                            <select
                              value={adminExistingMethod}
                              onChange={(e) => setAdminExistingMethod(e.target.value)}
                              className={coachingInputCls}
                            >
                              <option value="UPI">UPI</option>
                              <option value="Cash">Cash</option>
                            </select>
                          </div>
                          {(() => {
                            const sel = academyStudents.find((x) => x.id === adminSelectedStudentId);
                            if (sel && halfFeeAllowed(sel, feeMonth)) {
                              return (
                                <div className="space-y-2.5 p-3 bg-amber-500/10 border border-amber-500/30">
                                  <p className="text-[11px] font-mono text-amber-200 leading-relaxed">
                                    📅 {sel.name} joined on {fmtAddedOn(sel.created_at)} (after the 12th). Choose full or half fee for this month.
                                  </p>
                                  <div className="grid grid-cols-2 gap-2">
                                    {([
                                      { id: "full", label: "Full Fee", amt: FIXED_COACHING_FEE },
                                      { id: "half", label: "Half Fee", amt: HALF_COACHING_FEE },
                                    ] as const).map((o) => (
                                      <button
                                        key={o.id}
                                        type="button"
                                        onClick={() => setAdminExistingFeeType(o.id)}
                                        className={`min-h-[56px] border font-mono font-black uppercase transition-colors ${
                                          adminExistingFeeType === o.id
                                            ? "bg-lime-400 text-black border-lime-400"
                                            : "bg-neutral-950 text-neutral-300 border-neutral-700"
                                        }`}
                                      >
                                        <span className="block text-[10px] tracking-widest">{o.label}</span>
                                        <span className="block text-base">₹{o.amt.toLocaleString("en-IN")}</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <div className="p-3 bg-neutral-950 border border-neutral-800 text-xs font-mono font-black text-lime-400">
                                Enforced Rate: ₹2,500
                              </div>
                            );
                          })()}
                          <motion.button
                            whileTap={{ scale: 0.97 }}
                            type="submit"
                            className="w-full min-h-[52px] bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-mono font-black text-xs uppercase tracking-widest transition-colors"
                          >
                            Settle {feeMonthLabel}
                          </motion.button>
                        </motion.form>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="lg:col-span-2 space-y-3 sm:space-y-4">
                    {/* Football Academy — tap to open batches & roster */}
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setShowAcademyRoster((v) => !v)}
                      aria-expanded={showAcademyRoster}
                      className={`w-full text-left p-4 border transition-colors relative overflow-hidden ${
                        showAcademyRoster
                          ? "bg-lime-400/10 border-lime-400/60 shadow-[0_0_24px_rgba(163,230,53,0.12)]"
                          : "bg-neutral-950 border-neutral-800 hover:border-lime-400/40"
                      }`}
                    >
                      {showAcademyRoster && <span className="absolute top-0 inset-x-0 h-0.5 bg-lime-400" />}
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 shrink-0 rounded-full bg-lime-400/10 border border-lime-400/40 flex items-center justify-center text-2xl">
                          ⚽
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">A2 — Academy</span>
                          <h3 className="text-base font-black uppercase text-white leading-tight">Football Academy</h3>
                          <p className="text-[11px] font-mono text-neutral-400 mt-0.5">
                            {showAcademyRoster ? "Tap to close" : "Tap to view batches & roster"}
                          </p>
                        </div>
                        <motion.span
                          animate={{ rotate: showAcademyRoster ? 180 : 0 }}
                          className="text-lime-400 text-xl shrink-0 leading-none"
                        >
                          ▾
                        </motion.span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-mono font-black uppercase">
                        <span className="px-2 py-1 bg-neutral-900 border border-neutral-800 text-neutral-200">🌅 Morning {academyStats.morning.total}</span>
                        <span className="px-2 py-1 bg-neutral-900 border border-neutral-800 text-neutral-200">🌙 Evening {academyStats.evening.total}</span>
                        {academyStats.morning.due + academyStats.evening.due > 0 && (
                          <span className="px-2 py-1 bg-red-500/10 border border-red-500/30 text-red-400">
                            ⚠️ {academyStats.morning.due + academyStats.evening.due} due
                          </span>
                        )}
                      </div>
                    </motion.button>

                    <AnimatePresence initial={false}>
                      {showAcademyRoster && (
                        <motion.div
                          key="academy-open"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3, ease: easeOut }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-3 sm:space-y-4">
                {/* Batch Strength Cards (tap to open that batch) */}
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  {([
                    { id: "Morning Batch", icon: "🌅", label: "Morning", stats: academyStats.morning },
                    { id: "Evening Batch", icon: "🌙", label: "Evening", stats: academyStats.evening },
                  ] as const).map((b) => {
                    const active = rosterTab === b.id;
                    return (
                      <motion.button
                        key={b.id}
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setRosterTab(b.id)}
                        className={`relative text-left p-3.5 sm:p-4 border transition-colors overflow-hidden ${
                          active
                            ? "bg-lime-400/10 border-lime-400/60 shadow-[0_0_24px_rgba(163,230,53,0.12)]"
                            : "bg-neutral-950 border-neutral-800 hover:border-neutral-600"
                        }`}
                      >
                        {active && <span className="absolute top-0 inset-x-0 h-0.5 bg-lime-400" />}
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-neutral-400 font-black">
                            {b.icon} {b.label}
                          </span>
                          {active && <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" />}
                        </div>
                        <div className="flex items-baseline gap-1.5 mt-2">
                          <span className={`text-4xl sm:text-5xl font-black leading-none ${active ? "text-lime-400" : "text-white"}`}>
                            {b.stats.total}
                          </span>
                          <span className="text-[10px] font-mono uppercase text-neutral-500">
                            {b.stats.total === 1 ? "student" : "students"}
                          </span>
                        </div>
                        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono">
                          <span className="text-lime-400">✅ {b.stats.paid} paid</span>
                          <span className={b.stats.due > 0 ? "text-red-400" : "text-neutral-600"}>⚠️ {b.stats.due} due</span>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Overall strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="p-2.5 bg-neutral-950 border border-neutral-900">
                    <span className="block text-lg sm:text-xl font-black text-white leading-none">{academyStats.morning.total + academyStats.evening.total}</span>
                    <span className="block text-[9px] font-mono uppercase tracking-widest text-neutral-500 mt-1">Total</span>
                  </div>
                  <div className="p-2.5 bg-neutral-950 border border-neutral-900">
                    <span className="block text-lg sm:text-xl font-black text-lime-400 leading-none">{academyStats.morning.paid + academyStats.evening.paid}</span>
                    <span className="block text-[9px] font-mono uppercase tracking-widest text-neutral-500 mt-1">Fees Paid</span>
                  </div>
                  <div className="p-2.5 bg-neutral-950 border border-neutral-900">
                    <span className="block text-lg sm:text-xl font-black text-red-400 leading-none">{academyStats.morning.due + academyStats.evening.due}</span>
                    <span className="block text-[9px] font-mono uppercase tracking-widest text-neutral-500 mt-1">Fees Due</span>
                  </div>
                  <div className="p-2.5 bg-neutral-950 border border-neutral-900">
                    <span className="block text-lg sm:text-xl font-black text-emerald-400 leading-none">₹{(academyStats.morning.collected + academyStats.evening.collected).toLocaleString("en-IN")}</span>
                    <span className="block text-[9px] font-mono uppercase tracking-widest text-neutral-500 mt-1">Collected</span>
                  </div>
                </div>

                  {/* ---------- Roster (first on phones) ---------- */}
                  <div className="border border-neutral-900 bg-neutral-900/30 overflow-hidden flex flex-col">
                    <div className="p-3 sm:p-4 border-b border-neutral-900 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">A2 — Master Roster</span>
                          <h3 className="text-sm font-black uppercase text-white truncate">
                            {rosterTab} · <span className="text-lime-400">{filteredAcademyStudents.length}</span>
                            <span className="text-neutral-500 font-mono text-[10px] normal-case ml-1.5">
                              ({rosterTab === "Morning Batch" ? academyStats.morning.present : academyStats.evening.present} present today)
                            </span>
                          </h3>
                        </div>
                      </div>

                      {/* Batch switch with counts */}
                      <LayoutGroup id="admin-roster-tabs">
                        <div className="grid grid-cols-2 gap-1.5 p-1 border border-neutral-800 bg-neutral-950">
                          {[
                            { id: "Morning Batch", label: "🌅 Morning", count: academyStats.morning.total },
                            { id: "Evening Batch", label: "🌙 Evening", count: academyStats.evening.total },
                          ].map((t) => (
                            <motion.button
                              key={t.id}
                              type="button"
                              whileTap={{ scale: 0.97 }}
                              onClick={() => setRosterTab(t.id as BatchTabType)}
                              className={`relative min-h-[44px] text-[11px] font-mono uppercase tracking-widest transition-colors ${
                                rosterTab === t.id ? "text-black font-black" : "text-neutral-400 hover:text-white"
                              }`}
                            >
                              {rosterTab === t.id && (
                                <motion.span
                                  layoutId="admin-roster-tab-highlight"
                                  className="absolute inset-0 bg-lime-400 -z-0"
                                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                                />
                              )}
                              <span className="relative z-10">{t.label} ({t.count})</span>
                            </motion.button>
                          ))}
                        </div>
                      </LayoutGroup>

                      {/* Search + reminders */}
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          inputMode="search"
                          placeholder="🔍 Search name or phone"
                          value={academySearch}
                          onChange={(e) => setAcademySearch(e.target.value)}
                          className={`${coachingInputCls} sm:flex-1`}
                        />
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.97 }}
                          onClick={sendEmailReminders}
                          disabled={isSendingEmails}
                          className={`min-h-[48px] bg-neutral-900 border border-neutral-800 text-red-400 hover:bg-red-950 hover:border-red-900 hover:text-white font-mono text-[11px] uppercase tracking-widest px-4 font-black transition-colors flex items-center justify-center gap-2 ${isSendingEmails ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          {isSendingEmails ? "⏳ Dispatching..." : "📧 Email Due Reminders"}
                        </motion.button>
                      </div>
                    </div>

                    {/* Empty state */}
                    {filteredAcademyStudents.length === 0 && (
                      <div className="py-10 px-4 text-center space-y-2">
                        <span className="text-3xl block">⚽</span>
                        <p className="text-xs font-mono font-black uppercase tracking-widest text-neutral-400">
                          {academySearch ? "No students match your search" : `No students in ${rosterTab}`}
                        </p>
                      </div>
                    )}

                    {/* Phone cards */}
                    <div className="block sm:hidden max-h-[70vh] overflow-y-auto p-3 space-y-2.5">
                      {filteredAcademyStudents.map((s) => {
                        const isUnpaid = isDue(s);
                        const notEnrolled = s.payment_status === "not_enrolled";
                        const todayAtt = s.student_attendance?.find((a: any) => a.date === getTodayStr());
                        const isPresent = todayAtt?.status === "Present";
                        const isAbsent = todayAtt?.status === "Absent";

                        return (
                          <motion.div
                            key={s.id}
                            layout
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`p-3 border space-y-3 ${
                              isUnpaid ? "bg-red-500/[0.06] border-red-500/25" : "bg-neutral-950/60 border-neutral-800"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center font-black text-lg border ${
                                isUnpaid ? "bg-red-500/10 border-red-500/40 text-red-400" : "bg-lime-400/10 border-lime-400/40 text-lime-400"
                              }`}>
                                {academySerials[s.id] ?? "-"}
                              </div>
                              <div className="min-w-0 flex-1">
                                <h4 className="text-sm font-black text-white truncate">{s.name}</h4>
                                <a href={`tel:${s.phone}`} className="text-[12px] font-mono text-lime-400/90 block mt-0.5">
                                  📞 {s.phone}
                                </a>
                              </div>
                              {notEnrolled ? (
                                <span className="px-2 py-1 text-[10px] font-mono uppercase bg-neutral-900 border border-neutral-700 text-neutral-400 font-black shrink-0 whitespace-nowrap">Joined later</span>
                              ) : isUnpaid ? (
                                <motion.span
                                  animate={{ opacity: [1, 0.55, 1] }}
                                  transition={{ duration: 2, repeat: Infinity }}
                                  className="px-2 py-1 text-[10px] font-mono uppercase bg-red-500/15 border border-red-500/40 text-red-400 font-black shrink-0"
                                >
                                  ⚠️ Due
                                </motion.span>
                              ) : (
                                <span className="px-2 py-1 text-[10px] font-mono uppercase bg-lime-400/10 border border-lime-400/30 text-lime-400 font-black shrink-0">
                                  ✅ {s.payment_method}{s.collected_by ? ` · ${s.collected_by}` : ""}
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => markAttendance(s.id, "Present")}
                                className={`h-11 text-[11px] font-mono font-black uppercase tracking-widest border transition-all ${
                                  isPresent ? "bg-lime-500 text-black border-lime-500 shadow-[0_0_15px_rgba(132,204,22,0.45)]" : "bg-lime-500/10 text-lime-400 border-lime-500/30 active:bg-lime-500/30"
                                }`}
                              >
                                ✓ Present
                              </button>
                              <button
                                type="button"
                                onClick={() => markAttendance(s.id, "Absent")}
                                className={`h-11 text-[11px] font-mono font-black uppercase tracking-widest border transition-all ${
                                  isAbsent ? "bg-red-600 text-white border-red-600 shadow-[0_0_15px_rgba(220,38,38,0.5)]" : "bg-red-500/10 text-red-400 border-red-500/30 active:bg-red-500/30"
                                }`}
                              >
                                ✕ Absent
                              </button>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                              <button
                                type="button"
                                onClick={() => openEditStudent(s)}
                                className="h-10 text-[10px] font-mono font-black uppercase tracking-wider bg-neutral-900 border border-neutral-800 text-neutral-200 active:bg-neutral-800"
                              >
                                ✏️ Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setHistoryStudentId(s.id)}
                                className="h-10 text-[10px] font-mono font-black uppercase tracking-wider bg-neutral-900 border border-neutral-800 text-neutral-200 active:bg-neutral-800"
                              >
                                🧾 History
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteStudent(s.id, s.name)}
                                className="h-10 text-[10px] font-mono font-black uppercase tracking-wider bg-neutral-900 border border-neutral-800 text-red-400 active:bg-red-950"
                              >
                                🗑️ Remove
                              </button>
                            </div>

                            <p className="text-[10px] font-mono text-neutral-500 truncate">
                              DOB {s.dob ? new Date(s.dob).toLocaleDateString("en-GB") : "-"} · {s.email || "No email"}
                            </p>
                          </motion.div>
                        );
                      })}
                    </div>

                    {/* Desktop / tablet table */}
                    <div className="hidden sm:block overflow-x-auto max-h-[460px] overflow-y-auto">
                      <table className="w-full text-left border-collapse min-w-[520px]">
                        <thead>
                          <tr className="border-b border-neutral-900 text-[10px] font-mono uppercase tracking-widest text-neutral-500 bg-neutral-950/40 sticky top-0 backdrop-blur z-20">
                            <th className="p-4 w-12 text-center">#</th>
                            <th className="p-4">Student Profile</th>
                            <th className="p-4">Contact Logs</th>
                            <th className="p-4 text-center">Status</th>
                            <th className="p-4 text-center">Attendance</th>
                          </tr>
                        </thead>
                        <motion.tbody
                          variants={stagger}
                          initial="hidden"
                          animate="show"
                          className="divide-y divide-neutral-900 text-xs font-medium"
                        >
                          {filteredAcademyStudents.map((s) => {
                            const isUnpaid = isDue(s);
                        const notEnrolled = s.payment_status === "not_enrolled";
                            const todayAtt = s.student_attendance?.find((a: any) => a.date === getTodayStr());
                            const isPresent = todayAtt?.status === "Present";
                            const isAbsent = todayAtt?.status === "Absent";

                            return (
                              <motion.tr
                                key={s.id}
                                variants={rowItem}
                                layout
                                className={`transition-colors ${isUnpaid ? "bg-red-500/[0.04] hover:bg-red-500/[0.08]" : "hover:bg-lime-400/[0.03]"}`}
                              >
                                <td className="p-4 text-center">
                                  <span className="inline-flex w-8 h-8 items-center justify-center rounded-full bg-neutral-950 border border-neutral-800 text-lime-400 font-mono font-black text-xs">
                                    {academySerials[s.id] ?? "-"}
                                  </span>
                                </td>
                                <td className="p-4">
                                  <div className="font-black text-white flex flex-wrap items-center gap-2">
                                    <span>{s.name}</span>
                                    <span className="flex flex-wrap gap-1.5">
                                      <button
                                        onClick={() => openEditStudent(s)}
                                        className="px-2 py-0.5 text-[9px] font-mono uppercase bg-neutral-900 hover:bg-neutral-700 border border-neutral-800 text-neutral-200 transition-colors"
                                      >
                                        ✏️ Edit
                                      </button>
                                      <button
                                        onClick={() => setHistoryStudentId(s.id)}
                                        className="px-2 py-0.5 text-[9px] font-mono uppercase bg-neutral-900 hover:bg-neutral-700 border border-neutral-800 text-neutral-200 transition-colors"
                                      >
                                        🧾 History
                                      </button>
                                      <button
                                        onClick={() => deleteStudent(s.id, s.name)}
                                        className="px-2 py-0.5 text-[9px] font-mono uppercase bg-neutral-900 hover:bg-red-600 border border-neutral-800 hover:border-red-500 text-red-400 hover:text-white transition-colors"
                                      >
                                        🗑️ Remove
                                      </button>
                                    </span>
                                  </div>
                                  <div className="text-[10px] font-mono text-neutral-500 mt-0.5">
                                    DOB: {s.dob ? new Date(s.dob).toLocaleDateString("en-GB") : "-"}
                                  </div>
                                </td>
                                <td className="p-4 space-y-0.5">
                                  <div className="font-mono text-neutral-300">{s.phone}</div>
                                  <div className="text-[11px] text-neutral-500 truncate max-w-[180px]">{s.email || "-"}</div>
                                </td>
                                <td className="p-4 text-center">
                                  {notEnrolled ? (
                                <span className="px-2 py-1 text-[10px] font-mono uppercase bg-neutral-900 border border-neutral-700 text-neutral-400 font-black shrink-0 whitespace-nowrap">Joined later</span>
                              ) : isUnpaid ? (
                                    <motion.span
                                      animate={{ opacity: [1, 0.55, 1] }}
                                      transition={{ duration: 2, repeat: Infinity }}
                                      className="px-2 py-0.5 text-[10px] font-mono uppercase bg-red-500/15 border border-red-500/40 text-red-400 font-black whitespace-nowrap"
                                    >
                                      ⚠️ Unpaid
                                    </motion.span>
                                  ) : (
                                    <span className="px-2 py-0.5 text-[10px] font-mono uppercase bg-lime-400/10 border border-lime-400/30 text-lime-400 font-black whitespace-nowrap">
                                      ✅ Paid ({s.payment_method}{s.collected_by ? ` · ${s.collected_by}` : ""})
                                    </span>
                                  )}
                                </td>
                                <td className="p-4 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      onClick={() => markAttendance(s.id, "Present")}
                                      className={`w-8 h-8 flex items-center justify-center text-sm font-mono font-black transition-all rounded border ${
                                        isPresent ? "bg-lime-500 text-black border-lime-500 shadow-[0_0_15px_rgba(132,204,22,0.5)] scale-110" : "bg-lime-500/10 text-lime-500 border-lime-500/30 hover:bg-lime-500/30"
                                      }`}
                                    >P</button>
                                    <button
                                      onClick={() => markAttendance(s.id, "Absent")}
                                      className={`w-8 h-8 flex items-center justify-center text-sm font-mono font-black transition-all rounded border ${
                                        isAbsent ? "bg-red-600 text-white border-red-600 shadow-[0_0_15px_rgba(220,38,38,0.6)] scale-110" : "bg-red-500/10 text-red-500 border-red-500/30 hover:bg-red-500/30"
                                      }`}
                                    >A</button>
                                  </div>
                                </td>
                              </motion.tr>
                            );
                          })}
                        </motion.tbody>
                      </table>
                    </div>
                  </div>

                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---------- Pricing & Academy Hours (OTP protected) ---------- */}
        <AnimatePresence>
          {showSettingsPanel && (
            <motion.div
              initial={{ opacity: 0, y: -12, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -12, height: 0 }}
              transition={{ duration: 0.35, ease: easeOut }}
              className="overflow-hidden mb-8"
            >
              <div className="space-y-4 p-3 sm:p-6 border border-neutral-900 bg-neutral-900/30 backdrop-blur relative">
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-400 to-lime-400" />

                <div className="flex items-start justify-between gap-3 pt-1">
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">A4 — Turf Settings</span>
                    <h2 className="text-lg sm:text-xl font-black uppercase text-white leading-tight">Pricing & Academy Hours</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSettingsPanel(false)}
                    aria-label="Close settings"
                    className="w-10 h-10 shrink-0 flex items-center justify-center border border-neutral-800 bg-neutral-950 text-neutral-400 text-sm"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-3 border border-amber-500/30 bg-amber-500/10 text-[11px] font-mono text-amber-200 leading-relaxed">
                  🔒 Saving needs an OTP sent to the master admin email. Changes show for customers the next time they load the booking page. Bookings already made are not changed.
                </div>

                {/* Price per hour */}
                <div className="p-4 bg-neutral-950 border border-neutral-800 space-y-4">
                  <h3 className="text-sm font-black uppercase text-white">💰 Price per Hour</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {([
                      { title: "Full Court", offer: "full_hour", regular: "full_regular" },
                      { title: "Half Court", offer: "half_hour", regular: "half_regular" },
                    ] as const).map((g) => (
                      <div key={g.title} className="space-y-3 p-3 border border-neutral-800 bg-neutral-900/40">
                        <span className="text-[11px] font-mono uppercase tracking-widest text-lime-400 font-black block">{g.title}</span>
                        <div className="space-y-1.5">
                          <label className={coachingLabelCls}>Customer pays (₹ / hr)</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={pricingForm[g.offer]}
                            onChange={(e) => setPricingForm({ ...pricingForm, [g.offer]: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                            className={`${coachingInputCls} font-mono`}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className={coachingLabelCls}>Crossed-out regular price (₹ / hr)</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={pricingForm[g.regular]}
                            onChange={(e) => setPricingForm({ ...pricingForm, [g.regular]: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                            className={`${coachingInputCls} font-mono`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] font-mono text-neutral-400 leading-relaxed">
                    Customers will see: <span className="line-through text-neutral-500">₹{pricingForm.full_regular || 0}</span>{" "}
                    <span className="text-lime-400 font-black">₹{pricingForm.full_hour || 0} / Hr</span> · 1.5 hrs full court = ₹
                    {Math.round(1.5 * Number(pricingForm.full_hour || 0)).toLocaleString("en-IN")}
                  </p>
                </div>

                {/* Academy hours */}
                <div className="p-4 bg-neutral-950 border border-neutral-800 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-black uppercase text-white">⚽ Academy Hours</h3>
                      <p className="text-[11px] font-mono text-neutral-400 mt-0.5">Slots blocked for customers because of coaching</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={academyForm.enabled}
                      onClick={() => setAcademyForm({ ...academyForm, enabled: !academyForm.enabled })}
                      className={`shrink-0 min-h-[44px] px-4 border font-mono font-black text-[11px] uppercase tracking-widest transition-colors ${
                        academyForm.enabled ? "bg-lime-400 text-black border-lime-400" : "bg-neutral-900 text-neutral-400 border-neutral-700"
                      }`}
                    >
                      {academyForm.enabled ? "ON" : "OFF"}
                    </button>
                  </div>

                  <div className={`space-y-4 transition-opacity ${academyForm.enabled ? "" : "opacity-40 pointer-events-none"}`}>
                    <div className="space-y-1.5">
                      <label className={coachingLabelCls}>Blocking starts from</label>
                      <input
                        type="date"
                        value={academyForm.start_date}
                        onChange={(e) => setAcademyForm({ ...academyForm, start_date: e.target.value })}
                        className={coachingInputCls}
                        style={{ colorScheme: "dark" }}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className={coachingLabelCls}>Days</label>
                      <div className="grid grid-cols-7 gap-1.5">
                        {DAY_NAMES.map((d, i) => {
                          const on = academyForm.days.includes(i);
                          return (
                            <button
                              key={d}
                              type="button"
                              onClick={() =>
                                setAcademyForm({
                                  ...academyForm,
                                  days: on ? academyForm.days.filter((x) => x !== i) : [...academyForm.days, i],
                                })
                              }
                              className={`min-h-[44px] text-[10px] font-mono font-black uppercase border transition-colors ${
                                on ? "bg-lime-400 text-black border-lime-400" : "bg-neutral-900 text-neutral-400 border-neutral-800"
                              }`}
                            >
                              {d}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className={coachingLabelCls}>Academy hours (from → to)</label>
                      {academyRanges.map((r, idx) => (
                        <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                          <div className="space-y-1">
                            <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">From</span>
                            <select
                              value={r.from}
                              onChange={(e) => {
                                const from = Number(e.target.value);
                                const to = r.to <= from ? Math.min(from + 60, RANGE_MAX) : r.to;
                                updateAcademyRanges(academyRanges.map((x, i) => (i === idx ? { from, to } : x)));
                              }}
                              className={coachingInputCls}
                            >
                              {FROM_OPTIONS.map((m) => (
                                <option key={m} value={m}>{minsToLabel(m)}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">To</span>
                            <select
                              value={r.to}
                              onChange={(e) =>
                                updateAcademyRanges(academyRanges.map((x, i) => (i === idx ? { ...x, to: Number(e.target.value) } : x)))
                              }
                              className={coachingInputCls}
                            >
                              {TO_OPTIONS.filter((m) => m > r.from).map((m) => (
                                <option key={m} value={m}>{minsToLabel(m)}</option>
                              ))}
                            </select>
                          </div>
                          <button
                            type="button"
                            aria-label="Remove this time range"
                            onClick={() => updateAcademyRanges(academyRanges.filter((_, i) => i !== idx))}
                            className="min-h-[48px] min-w-[48px] border border-red-500/40 text-red-300 font-mono font-black text-sm active:bg-red-500/10"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const last = academyRanges[academyRanges.length - 1];
                          const from = last ? Math.min(last.to, RANGE_MAX - 60) : 6 * 60;
                          updateAcademyRanges([...academyRanges, { from, to: from + 60 }]);
                        }}
                        className="w-full min-h-[44px] border border-dashed border-neutral-700 text-neutral-300 font-mono font-black text-[11px] uppercase tracking-widest active:bg-neutral-800"
                      >
                        + Add another time range
                      </button>
                      <p className="text-[11px] font-mono text-neutral-400">
                        {academyRanges.length
                          ? `Blocked ${rangesText(academyRanges)} on `
                          : "No hours set on "}
                        {academyForm.days.length ? [...academyForm.days].sort().map((d) => DAY_NAMES[d]).join(", ") : "no days"}
                      </p>
                    </div>
                  </div>
                </div>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={requestSaveSettings}
                  disabled={isSavingSettings || isSendingOtp}
                  className={`w-full min-h-[56px] bg-amber-400 hover:bg-amber-300 text-black font-mono font-black text-xs uppercase tracking-widest transition-colors ${
                    isSavingSettings || isSendingOtp ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  {isSavingSettings ? "Saving..." : isSendingOtp ? "Sending OTP..." : "🔒 Save Changes (OTP)"}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results count */}
        <p className="mb-3 text-[11px] font-mono text-neutral-500 tracking-widest uppercase px-1">
          // Showing {filteredBookings.length} booking(s) active
        </p>

        {/* ---------- COMPACT BOOKINGS TABLE ---------- */}
        <motion.section
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.05 }}
          className="border border-neutral-900 bg-neutral-900/30 backdrop-blur overflow-hidden"
        >
          <div className="p-4 border-b border-neutral-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-neutral-500 block">
                01 — Bookings Matrix
              </span>
              <h2 className="text-base font-black uppercase text-white mt-0.5">
                Active Orders · <span className="text-lime-400">Live Feed</span>
              </h2>
            </div>
            
            <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 p-1.5 px-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                📅 Date Sort:
              </span>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                style={{ colorScheme: "dark" }}
                className="bg-transparent text-white text-xs font-mono outline-none cursor-pointer"
              />
              {filterDate && (
                <button
                  onClick={() => setFilterDate("")}
                  className="text-[10px] uppercase font-black tracking-widest text-red-400 hover:text-red-300 ml-2"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-neutral-900 bg-neutral-950/40 text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                  <th className="p-4">Order & Client</th>
                  <th className="p-4">Schedule Info</th>
                  <th className="p-4">Arena Details</th>
                  <th className="p-4">Financials</th>
                  <th className="p-4 text-center">Operations</th>
                </tr>
              </thead>
              <motion.tbody
                variants={stagger}
                initial="hidden"
                animate="show"
                className="divide-y divide-neutral-900 text-sm font-medium text-neutral-300"
              >
                <AnimatePresence>
                  {filteredBookings.map((booking) => {
                    const bookingDate = booking.booking_date?.split("T")[0];
                    let rowColor = "bg-transparent";
                    if (bookingDate === getTodayStr()) rowColor = "bg-lime-500/[0.05]";
                    else if (bookingDate === getTomorrowStr()) rowColor = "bg-amber-500/[0.04]";

                    return (
                      <motion.tr
                        key={booking.id}
                        variants={rowItem}
                        layout
                        className={`${rowColor} hover:bg-white/[0.03] transition-colors`}
                      >
                        <td className="p-4 align-top">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-white text-sm whitespace-nowrap">{booking.customer_name}</span>
                              <span className="px-1.5 py-0.5 bg-neutral-900 border border-neutral-800 text-[9px] font-mono text-neutral-400 uppercase whitespace-nowrap">
                                #{booking.id} {booking.booking_reference ? `| REF: ${booking.booking_reference}` : ""}
                              </span>
                            </div>
                            <span className="font-mono text-[11px] text-neutral-400 truncate max-w-[200px]">
                              {booking.email || "No Email Provided"}
                            </span>
                            <span className="font-mono text-xs text-neutral-500 whitespace-nowrap">
                              {booking.phone}
                            </span>
                          </div>
                        </td>

                        <td className="p-4 align-top">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <span className="text-neutral-200 font-mono text-xs">
                                {new Date(bookingDate).toLocaleDateString("en-GB")}
                              </span>
                              {bookingDate === getTodayStr() && (
                                <span className="px-2 py-0.5 bg-lime-400/10 border border-lime-400/30 text-lime-400 text-[9px] font-black uppercase tracking-widest">
                                  Today
                               </span>
                              )}
                              {bookingDate === getTomorrowStr() && (
                                <span className="px-2 py-0.5 bg-amber-400/10 border border-amber-400/30 text-amber-400 text-[9px] font-black uppercase tracking-widest">
                                  Tomorrow
                               </span>
                              )}
                            </div>
                            <span className="font-mono text-xs text-white whitespace-nowrap">
                              {getTimeRangeLabel(booking.start_time, booking.duration_minutes || 60)}
                            </span>
                            <span className="text-[11px] text-neutral-500 font-mono whitespace-nowrap">
                              {formatDurationLabel(booking.duration_minutes || 60)}
                            </span>
                          </div>
                        </td>

                        <td className="p-4 align-top">
                          <div className="flex flex-col gap-1 items-start whitespace-nowrap">
                            <span className="text-xs uppercase tracking-widest font-black text-neutral-300">
                              {booking.sport}
                            </span>
                            <span className={`px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest ${
                              booking.booking_type === "Half Court"
                                ? "bg-cyan-500/10 border border-cyan-500/30 text-cyan-400"
                                : "bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-400"
                            }`}>
                              {booking.booking_type || "Full Court"}
                            </span>
                            <span className="font-mono text-[11px] text-neutral-500">
                              {booking.court_number || "-"}
                            </span>
                          </div>
                        </td>

                        <td className="p-4 align-top">
                          <div className="flex flex-col gap-1 font-mono text-xs min-w-[120px] whitespace-nowrap">
                            <div className="flex justify-between">
                              <span className="text-neutral-500">Total:</span> 
                              <span className="text-neutral-200">₹{booking.total_amount}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-neutral-500">Paid:</span> 
                              <span className="text-emerald-400">₹{(booking.total_amount || 0) - (booking.balance_amount || 0)}</span>
                            </div>
                            <div className="flex justify-between border-t border-neutral-800 pt-1 mt-0.5">
                              <span className="text-neutral-500">Due:</span> 
                              {Number(booking.balance_amount || 0) > 0 ? (
                                <span className="text-red-400 font-black">₹{booking.balance_amount}</span>
                              ) : (
                                <span className="text-lime-400 font-black">₹0</span>
                              )}
                            </div>
                            {booking.collected_by && (
                              <div className="flex justify-between border-t border-neutral-800 pt-1 mt-0.5">
                                <span className="text-neutral-500">By:</span>
                                <span className="text-fuchsia-400 font-black">👤 {booking.collected_by}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="p-4 align-top text-center">
                          <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                            {Number(booking.balance_amount || 0) > 0 ? (
                              <motion.button
                                whileHover={{ y: -1 }}
                                whileTap={{ scale: 0.96 }}
                                onClick={() => { setSelectedBooking(booking); setShowPaymentModal(true); }}
                                className="bg-lime-400 hover:bg-lime-300 text-black text-xs font-mono uppercase font-black px-3 py-1.5 transition-colors whitespace-nowrap"
                              >
                                💰 Collect
                              </motion.button>
                            ) : (
                              booking.customer_name !== "Offline Booking" && (
                                <motion.button
                                  whileHover={{ y: -1 }}
                                  whileTap={{ scale: 0.96 }}
                                  onClick={() => resetPayment(booking)}
                                  className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-amber-400 text-xs font-mono uppercase font-black px-3 py-1.5 transition-colors whitespace-nowrap"
                                >
                                  🔄 Reset
                                </motion.button>
                              )
                            )}

                            {/* ⚙️ MANAGE BUTTON */}
                            <motion.button
                              whileHover={{ y: -1 }}
                              whileTap={{ scale: 0.96 }}
                              onClick={() => {
                                setSelectedManageBooking(booking);
                                setManageMode("options");
                                setExtendMinutes(30);
                                setExtendCourtSize(false);
                                setUpgradeAfterMins(30);
                                setUpgradeExtraMins(0);
                                setUpgradeAmountInput("");
                                setOverrideAmount("");

                                const bDate = booking.booking_date?.split("T")[0] || getTodayStr();
                                const bDur = booking.duration_minutes || 60;
                                const bCourt = booking.court_number || "Full Court";

                                setRescheduleDate(bDate);
                                setRescheduleTime(booking.start_time || "");
                                setRescheduleDuration(bDur);
                                setRescheduleCourt(bCourt);

                                loadRescheduleAvailableSlots(bDate, bDur, bCourt);
                                setShowManageModal(true);
                              }}
                              className="bg-neutral-900 hover:bg-fuchsia-950 border border-neutral-800 hover:border-fuchsia-800 text-fuchsia-400 hover:text-white text-xs font-mono uppercase font-black px-3 py-1.5 transition-colors whitespace-nowrap"
                            >
                              ⚙️ Manage
                            </motion.button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </motion.tbody>
            </table>
          </div>
        </motion.section>

        {/* ---------- Blocked Slots Table ---------- */}
        <motion.section
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.05 }}
          className="border border-neutral-900 bg-neutral-900/30 backdrop-blur overflow-hidden mt-8"
        >
          <div className="p-4 border-b border-neutral-900">
            <span className="text-[11px] font-mono uppercase tracking-widest text-neutral-500 block">
              02 — Field Blocks
            </span>
            <h2 className="text-base font-black uppercase text-white mt-0.5">
              🚫 Excluded Field Blocks
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[720px]">
              <thead>
                <tr className="border-b border-neutral-900 bg-neutral-950/40 text-[10px] font-mono uppercase tracking-widest text-neutral-500">
                  <th className="p-4">Target Date</th>
                  <th className="p-4">Time Block Range</th>
                  <th className="p-4">Duration</th>
                  <th className="p-4">Court Section</th>
                  <th className="p-4">Block Reason</th>
                  <th className="p-4 text-center">Operations</th>
                </tr>
              </thead>
              <motion.tbody
                variants={stagger}
                initial="hidden"
                animate="show"
                className="divide-y divide-neutral-900 text-sm font-medium text-neutral-300"
              >
                <AnimatePresence>
                  {blockedSlots.map((slot) => (
                    <motion.tr
                      key={slot.id}
                      variants={rowItem}
                      layout
                      className="hover:bg-red-500/[0.03] transition-colors"
                    >
                      <td className="p-4 font-mono text-xs text-neutral-200">
                        {new Date(slot.booking_date).toLocaleDateString("en-GB")}
                      </td>
                      <td className="p-4 font-mono text-xs text-white font-black whitespace-nowrap">
                        {getTimeRangeLabel(slot.start_time, slot.duration_minutes || 60)}
                      </td>
                      <td className="p-4 text-xs font-mono">{formatDurationLabel(slot.duration_minutes)}</td>
                      <td className="p-4 font-mono text-xs font-black text-cyan-400">{slot.court_number}</td>
                      <td className="p-4 font-mono text-xs text-neutral-400 uppercase tracking-widest">{slot.reason}</td>
                      <td className="p-4 text-center whitespace-nowrap">
                        <motion.button
                          whileHover={{ y: -1 }}
                          whileTap={{ scale: 0.96 }}
                          onClick={() => deleteBlockedSlot(slot.id)}
                          className="bg-neutral-900 hover:bg-red-950 border border-neutral-800 hover:border-red-900 text-red-400 hover:text-white text-xs font-mono uppercase font-black px-3 py-1.5 transition-colors"
                        >
                          🗑️ Release
                        </motion.button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </motion.tbody>
            </table>
          </div>
        </motion.section>

        {/* Footer */}
        <div className="text-[10px] font-mono text-neutral-600 uppercase tracking-widest text-center pt-8">
          // SMES Sports Academy · Admin Terminal · Live Sync Enabled
        </div>
      </div>

      {/* ---------- MANAGE BOOKING MODAL ---------- */}
      <AnimatePresence>
        {showManageModal && selectedManageBooking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]"
          >
            <motion.div
              initial={{ scale: 0.9, y: 12, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 12, opacity: 0 }}
              transition={{ duration: 0.3, ease: easeOut }}
              className="bg-neutral-950 border border-neutral-800 p-4 sm:p-6 w-full max-w-md space-y-4 relative overflow-y-auto max-h-[90vh] rounded-lg shadow-2xl"
            >
              <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-fuchsia-500/10 to-transparent pointer-events-none" />

              <div className="relative">
                <span className="text-[10px] font-mono uppercase tracking-widest text-fuchsia-400 block mb-1">
                  // Order Management Node
                </span>
                <h2 className="text-xl font-black uppercase tracking-tight text-white">
                  ⚙️ Manage Booking
                </h2>
                <p className="text-neutral-400 text-xs mt-1 font-mono">
                  Client: <span className="text-white font-bold">{selectedManageBooking.customer_name}</span> ({selectedManageBooking.phone})
                </p>
              </div>

              {manageMode === "options" ? (
                <div className="space-y-2.5 relative">
                  <div className="p-3 bg-neutral-900/80 border border-neutral-800 text-xs font-mono space-y-1">
                    <div className="flex justify-between text-neutral-400">
                      <span>Total Amount:</span>
                      <span className="text-white font-bold">₹{selectedManageBooking.total_amount}</span>
                    </div>
                    <div className="flex justify-between text-emerald-400 font-bold">
                      <span>Amount Paid:</span>
                      <span>₹{(selectedManageBooking.total_amount || 0) - (selectedManageBooking.balance_amount || 0)}</span>
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.01, borderColor: "rgba(34, 197, 94, 0.6)" }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSendWhatsApp}
                    disabled={isSendingWhatsApp}
                    className="w-full text-left p-3.5 bg-neutral-900 border border-neutral-800 hover:bg-green-950/30 transition-colors group"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-green-400 group-hover:text-green-300">
                        {isSendingWhatsApp ? "⏳ Sending..." : "💬 Send WhatsApp Confirmation"}
                      </span>
                      <span className="text-xs font-mono text-green-400 font-black flex items-center gap-2">
                        Send →
                      </span>
                    </div>
                    <p className="text-[10px] text-neutral-500 mt-0.5 font-mono">
                      Manually trigger confirmation receipt to customer's phone.
                    </p>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.01, borderColor: "rgba(239, 68, 68, 0.6)" }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleCancelWithRefund(false)}
                    className="w-full text-left p-3.5 bg-neutral-900 border border-neutral-800 hover:bg-red-950/40 transition-colors group"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-red-400 group-hover:text-red-300">
                        ❌ Cancel & Refund
                      </span>
                      <span className="text-xs font-mono text-emerald-400 font-black flex items-center gap-2">
                        🔒 OTP Required
                      </span>
                    </div>
                    <p className="text-[10px] text-neutral-500 mt-0.5 font-mono">
                      Cancels order completely & returns paid amount.
                    </p>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.01, borderColor: "rgba(163, 230, 53, 0.6)" }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setManageMode("reschedule")}
                    className="w-full text-left p-3.5 bg-neutral-900 border border-neutral-800 hover:bg-lime-950/30 transition-colors group"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-lime-400 group-hover:text-lime-300">
                        📅 Reschedule / Modify Slot
                      </span>
                      <span className="text-xs font-mono text-neutral-400">Modify time & amount →</span>
                    </div>
                    <p className="text-[10px] text-neutral-500 mt-0.5 font-mono">
                      Shift time, reduce/extend duration, or edit total amount.
                    </p>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.01, borderColor: "rgba(245, 158, 11, 0.6)" }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleCancelWithoutRefund(false)}
                    className="w-full text-left p-3.5 bg-neutral-900 border border-neutral-800 hover:bg-amber-950/30 transition-colors group"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-amber-400 group-hover:text-amber-300">
                        ⛔ Cancel Without Refund
                      </span>
                      <span className="text-xs font-mono text-amber-400 flex items-center gap-2">
                        🔒 OTP Required
                      </span>
                    </div>
                    <p className="text-[10px] text-neutral-500 mt-0.5 font-mono">
                      Cancels order but retains advance deposit.
                    </p>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.01, borderColor: "rgba(6, 182, 212, 0.6)" }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setManageMode("extend")}
                    className="w-full text-left p-3.5 bg-neutral-900 border border-neutral-800 hover:bg-cyan-950/30 transition-colors group"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-cyan-400 group-hover:text-cyan-300">
                        ⏱️ Extend Slot (Check & Extend)
                      </span>
                      <span className="text-xs font-mono text-cyan-400">Extend →</span>
                    </div>
                    <p className="text-[10px] text-neutral-500 mt-0.5 font-mono">
                      Check next slot availability and extend match duration.
                    </p>
                  </motion.button>

                  {/* Half → Full Court upgrade (only for Half Court bookings) */}
                  {selectedManageBooking.booking_type === "Half Court" && (
                    <motion.button
                      whileHover={{ scale: 1.01, borderColor: "rgba(168, 85, 247, 0.6)" }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => { setUpgradeAfterMins(Math.min(30, selectedManageBooking.duration_minutes || 60)); setUpgradeExtraMins(0); setUpgradeAmountInput(""); setManageMode("upgrade"); }}
                      className="w-full text-left p-3.5 bg-neutral-900 border border-neutral-800 hover:bg-purple-950/30 transition-colors group"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-black uppercase text-purple-400 group-hover:text-purple-300">
                          🔄 Upgrade Half → Full Court
                        </span>
                        <span className="text-xs font-mono text-purple-400">Upgrade →</span>
                      </div>
                      <p className="text-[10px] text-neutral-500 mt-0.5 font-mono">
                        Customer playing on Half Court wants the full court for the rest of the time.
                      </p>
                    </motion.button>
                  )}
                </div>
              ) : manageMode === "reschedule" ? (
                <div className="space-y-3 relative">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase text-neutral-400">New Date</label>
                    <input
                      type="date"
                      min={getTodayStr()}
                      value={rescheduleDate}
                      onChange={(e) => {
                        const newDate = e.target.value;
                        setRescheduleDate(newDate);
                        if (newDate) loadRescheduleAvailableSlots(newDate, rescheduleDuration, rescheduleCourt);
                      }}
                      style={{ colorScheme: "dark" }}
                      className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase text-neutral-400">Court (Locked)</label>
                      <input
                        type="text"
                        value={selectedManageBooking.court_number || selectedManageBooking.booking_type || "Full Court"}
                        disabled
                        className="w-full p-3 bg-neutral-900/50 text-neutral-500 border border-neutral-800 outline-none text-xs font-mono cursor-not-allowed"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase text-neutral-400">Duration (Extend or Reduce)</label>
                      <select
                        value={rescheduleDuration}
                        onChange={(e) => {
                          const newDur = Number(e.target.value);
                          setRescheduleDuration(newDur);
                          if (rescheduleDate) loadRescheduleAvailableSlots(rescheduleDate, newDur, rescheduleCourt);
                        }}
                        className="w-full p-3 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none text-xs font-mono transition-colors"
                      >
                        {[30, 60, 90, 120, 150, 180].map((d) => (
                          <option key={d} value={d}>{formatDurationLabel(d)}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase text-neutral-400">New Time Slot</label>
                    <select
                      value={rescheduleTime}
                      onChange={(e) => setRescheduleTime(e.target.value)}
                      className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none text-sm font-mono font-medium transition-colors"
                    >
                      <option value="">-- Select Time Slot --</option>
                      {availableRescheduleSlots.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  {/* ⚡ NEW: Manual Override Total Amount Option */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase text-neutral-400">Edit / Override Total Amount (₹)</label>
                    <input
                      type="number"
                      placeholder={`Default: ₹${Math.round((selectedManageBooking.total_amount / (selectedManageBooking.duration_minutes || 60)) * rescheduleDuration)}`}
                      value={overrideAmount}
                      onChange={(e) => setOverrideAmount(e.target.value)}
                      className="w-full p-3 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none text-xs font-mono transition-colors"
                    />
                  </div>

                  <div className="p-3 bg-lime-950/30 border border-lime-800/50 text-xs font-mono text-lime-400">
                    Calculated New Price Matrix:<br />
                    <span className="font-bold text-white text-sm">
                      Total: ₹{overrideAmount !== "" ? overrideAmount : Math.round((selectedManageBooking.total_amount / (selectedManageBooking.duration_minutes || 60)) * rescheduleDuration)} 
                      {" "}| Pending Due: ₹{Math.max(0, (overrideAmount !== "" ? Number(overrideAmount) : Math.round((selectedManageBooking.total_amount / (selectedManageBooking.duration_minutes || 60)) * rescheduleDuration)) - ((selectedManageBooking.total_amount || 0) - (selectedManageBooking.balance_amount || 0)))}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <motion.button
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleRescheduleBooking(false)}
                      className="w-full bg-lime-400 hover:bg-lime-300 text-black font-mono text-xs uppercase tracking-widest py-3 font-black transition-colors flex items-center justify-center gap-2"
                    >
                      🔒 OTP & Modify
                    </motion.button>

                    <button
                      type="button"
                      onClick={() => setManageMode("options")}
                      className="w-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 font-mono text-xs uppercase tracking-widest py-3 font-black transition-colors"
                    >
                      ← Back
                    </button>
                  </div>
                </div>
              ) : manageMode === "upgrade" ? (
                /* Half → Full Court Upgrade View */
                (() => {
                  const c = upgradeCalc(selectedManageBooking);
                  const stepOptions: number[] = [];
                  for (let m = 30; m <= c.dur; m += 30) stepOptions.push(m);
                  const clockAt = (mins: number) => getTimeRangeLabel(selectedManageBooking.start_time, mins).split(" to ")[1];
                  return (
                    <div className="space-y-3 relative">
                      <div className="p-3 bg-neutral-900 border border-neutral-800 text-xs font-mono space-y-1">
                        <div className="flex justify-between text-neutral-400">
                          <span>Booked Slot:</span>
                          <span className="text-white font-bold">{getTimeRangeLabel(selectedManageBooking.start_time, c.dur)}</span>
                        </div>
                        <div className="flex justify-between text-neutral-400">
                          <span>Current Court:</span>
                          <span className="text-purple-400 font-bold">Half Court · {c.dur} mins</span>
                        </div>
                        <div className="flex justify-between text-neutral-400">
                          <span>Total / Balance Due:</span>
                          <span className="text-white font-bold">₹{selectedManageBooking.total_amount} / ₹{selectedManageBooking.balance_amount || 0}</span>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono uppercase text-neutral-400">Played on Half Court for</label>
                        <select
                          value={upgradeAfterMins}
                          onChange={(e) => { setUpgradeAfterMins(Number(e.target.value)); setUpgradeAmountInput(""); }}
                          className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-purple-400 outline-none text-sm font-mono font-medium transition-colors"
                        >
                          {stepOptions.map((m) => (
                            <option key={m} value={m}>
                              {m} min — Full Court starts at {clockAt(m)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono uppercase text-neutral-400">Extra Full Court time after the booked end</label>
                        <select
                          value={upgradeExtraMins}
                          onChange={(e) => { setUpgradeExtraMins(Number(e.target.value)); setUpgradeAmountInput(""); }}
                          className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-purple-400 outline-none text-sm font-mono font-medium transition-colors"
                        >
                          <option value={0}>None — only the rest of the booked time</option>
                          <option value={30}>+ 30 minutes</option>
                          <option value={60}>+ 60 minutes (1 hour)</option>
                          <option value={90}>+ 90 minutes (1.5 hours)</option>
                          <option value={120}>+ 120 minutes (2 hours)</option>
                        </select>
                      </div>

                      <div className="p-3 bg-purple-950/30 border border-purple-800/50 text-xs font-mono text-purple-200 space-y-1">
                        <div className="flex justify-between"><span>Half Court until</span><span className="font-bold text-white">{clockAt(Number(upgradeAfterMins))}</span></div>
                        <div className="flex justify-between"><span>Full Court until</span><span className="font-bold text-white">{clockAt(c.newDur)}</span></div>
                        <div className="flex justify-between"><span>Booked time switched to Full</span><span className="font-bold text-white">{c.switchedMins} min</span></div>
                        <div className="flex justify-between"><span>Extra time added</span><span className="font-bold text-white">{c.extra} min</span></div>
                        <div className="flex justify-between border-t border-purple-800/50 pt-1 mt-1"><span>Calculated extra amount</span><span className="font-black text-white">₹{c.suggested}</span></div>
                        <p className="text-[10px] text-purple-300/70 pt-1">
                          Based on ₹{livePricing.half_hour}/hr Half and ₹{livePricing.full_hour}/hr Full. Switched time costs the difference; extra time costs the full rate.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono uppercase text-neutral-400">Extra amount to collect (₹) — you can change it</label>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={upgradeAmountInput === "" ? String(c.suggested) : upgradeAmountInput}
                          onChange={(e) => setUpgradeAmountInput(e.target.value)}
                          className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-purple-400 outline-none text-lg font-mono font-black transition-colors"
                        />
                        {upgradeAmountInput !== "" && Number(upgradeAmountInput) !== c.suggested && (
                          <button type="button" onClick={() => setUpgradeAmountInput("")} className="text-[10px] font-mono uppercase text-purple-400 underline">
                            Reset to calculated ₹{c.suggested}
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <motion.button
                          whileHover={{ y: -1 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => handleUpgradeToFull(false)}
                          className="w-full bg-purple-500 hover:bg-purple-400 text-black font-mono text-xs uppercase tracking-widest py-3 font-black transition-colors"
                        >
                          🔒 Upgrade · +₹{c.amount}
                        </motion.button>
                        <button
                          type="button"
                          onClick={() => setManageMode("options")}
                          className="w-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 font-mono text-xs uppercase tracking-widest py-3 font-black transition-colors"
                        >
                          ← Back
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="space-y-3 relative">
                  <div className="p-3 bg-neutral-900 border border-neutral-800 text-xs font-mono space-y-1">
                    <div className="flex justify-between text-neutral-400">
                      <span>Current Slot Range:</span>
                      <span className="text-white font-bold">
                        {getTimeRangeLabel(selectedManageBooking.start_time, selectedManageBooking.duration_minutes || 60)}
                      </span>
                    </div>
                    <div className="flex justify-between text-neutral-400">
                      <span>Current Duration:</span>
                      <span className="text-cyan-400 font-bold">{formatDurationLabel(selectedManageBooking.duration_minutes || 60)}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase text-neutral-400">Extend Duration By</label>
                    <select
                      value={extendMinutes}
                      onChange={(e) => setExtendMinutes(Number(e.target.value))}
                      className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-cyan-400 outline-none text-sm font-mono font-medium transition-colors"
                    >
                      <option value={30}>+ 30 Mins</option>
                      <option value={60}>+ 60 Mins (1 Hour)</option>
                      <option value={90}>+ 90 Mins (1.5 Hours)</option>
                      <option value={120}>+ 120 Mins (2 Hours)</option>
                      <option value={150}>+ 150 Mins (2.5 Hours)</option>
                      <option value={180}>+ 180 Mins (3 Hours)</option>
                    </select>
                  </div>

                  {selectedManageBooking.booking_type === "Half Court" && (
                    <div className="space-y-1.5 border-t border-neutral-800 pt-3 mt-3">
                      <label className="text-[10px] font-mono uppercase text-neutral-400">Court Size Upgrade</label>
                      <button
                        type="button"
                        onClick={() => setExtendCourtSize(!extendCourtSize)}
                        className="flex items-center gap-3 w-full p-2 bg-neutral-900 border border-neutral-800 transition-colors hover:bg-neutral-800"
                      >
                        <div className={`relative w-10 h-5 rounded-full transition-colors ${extendCourtSize ? 'bg-cyan-400' : 'bg-neutral-700'}`}>
                          <motion.div
                            layout
                            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm ${extendCourtSize ? 'translate-x-5' : 'translate-x-0'}`}
                            transition={{ type: "spring", stiffness: 400, damping: 25 }}
                          />
                        </div>
                        <span className={`text-[11px] font-mono font-bold uppercase tracking-widest ${extendCourtSize ? 'text-cyan-400' : 'text-neutral-500'}`}>
                          {extendCourtSize ? "Upgrading to 7v7 Full Arena" : "Keep 5v5 Half Court"}
                        </span>
                      </button>
                    </div>
                  )}

                  <div className="p-3 bg-cyan-950/30 border border-cyan-800/50 text-xs font-mono text-cyan-300 mt-3">
                    Projected Target Range:<br />
                    <span className="font-bold text-white text-sm">
                      {getTimeRangeLabel(
                        selectedManageBooking.start_time,
                        (selectedManageBooking.duration_minutes || 60) + Number(extendMinutes)
                      )}
                    </span>
                    <br /><br />
                    Projected Added Cost:<br />
                    <span className="font-bold text-white text-sm">
                       + ₹{extendCourtSize 
                         ? Math.round(((selectedManageBooking.total_amount / (selectedManageBooking.duration_minutes || 60)) * 2) * Number(extendMinutes))
                         : Math.round((selectedManageBooking.total_amount / (selectedManageBooking.duration_minutes || 60)) * Number(extendMinutes))}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <motion.button
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => checkAndExtendBooking(false)}
                      className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-mono text-xs uppercase tracking-widest py-3 font-black transition-colors flex items-center justify-center gap-2"
                    >
                      🔒 Check & Extend
                    </motion.button>

                    <button
                      type="button"
                      onClick={() => setManageMode("options")}
                      className="w-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 font-mono text-xs uppercase tracking-widest py-3 font-black transition-colors"
                    >
                      ← Back
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-neutral-900 flex justify-end">
                <button
                  onClick={() => { setShowManageModal(false); setSelectedManageBooking(null); }}
                  className="text-xs font-mono uppercase text-neutral-500 hover:text-white transition-colors"
                >
                  Close Modal
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- Payment Modal ---------- */}
      <AnimatePresence>
        {showPaymentModal && selectedBooking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]"
          >
            <motion.div
              initial={{ scale: 0.9, y: 12, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 12, opacity: 0 }}
              transition={{ duration: 0.3, ease: easeOut }}
              className="bg-neutral-950 border border-neutral-800 p-4 sm:p-6 w-full max-w-sm space-y-4 relative overflow-y-auto max-h-[90vh] rounded-lg shadow-2xl"
            >
              <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-lime-500/10 to-transparent pointer-events-none" />
              <div className="relative">
                <span className="text-[10px] font-mono uppercase tracking-widest text-lime-400 block mb-1">
                  // Payment Node
                </span>
                <h2 className="text-xl font-black uppercase tracking-tight text-white">
                  💰 Balance Clearing
                </h2>
                <p className="text-neutral-400 text-xs mt-1 font-mono">
                  Collect the remaining match dues directly below.
                </p>
              </div>

              <div className="p-4 bg-neutral-900 border border-neutral-800 flex justify-between items-center relative">
                <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Outstanding Balance</span>
                <span className="text-lg font-black text-red-400 font-mono">
                  ₹{selectedBooking?.balance_amount || 0}
                </span>
              </div>

              <div className="space-y-3 relative">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-neutral-400">
                    Payment Route
                  </label>
                  <select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value)}
                    className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors"
                  >
                    <option value="Full Cash">Full Cash</option>
                    <option value="Full UPI">Full UPI</option>
                    <option value="Cash + UPI">Cash + UPI</option>
                  </select>
                </div>

                {(paymentType === "Full UPI" || paymentType === "Cash + UPI") && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex flex-col gap-3"
                  >
                    <div className="flex flex-col items-center justify-center p-4 bg-neutral-900 border border-neutral-800 rounded-md mt-2">
                      <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest mb-3">Scan to Pay</span>
                      <img src="/scanner.jpeg" alt="UPI QR Code" className="w-48 h-48 object-contain rounded-md border border-neutral-700 shadow-[0_0_15px_rgba(163,230,53,0.1)]" />
                    </div>

                    {paymentType === "Cash + UPI" && (
                      <div className="grid grid-cols-2 gap-2 p-3 bg-neutral-900 border border-neutral-800">
                        <input
                          type="number"
                          placeholder="Cash Amount"
                          value={cashAmount}
                          onChange={(e) => setCashAmount(e.target.value)}
                          className="w-full p-3 bg-neutral-950 text-white border border-neutral-800 focus:border-lime-400 outline-none text-sm font-mono font-medium transition-colors"
                        />
                        <input
                          type="number"
                          placeholder="UPI Amount"
                          value={upiAmount}
                          onChange={(e) => setUpiAmount(e.target.value)}
                          className="w-full p-3 bg-neutral-950 text-white border border-neutral-800 focus:border-lime-400 outline-none text-sm font-mono font-medium transition-colors"
                        />
                      </div>
                    )}
                  </motion.div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 relative">
                <motion.button
                  whileHover={{ y: -2, boxShadow: "0 12px 30px rgba(163,230,53,0.3)" }}
                  whileTap={{ scale: 0.97 }}
                  onClick={savePayment}
                  className="w-full bg-lime-400 hover:bg-lime-300 text-black font-mono text-xs uppercase tracking-widest py-3.5 font-black transition-colors"
                >
                  Save Payment
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { setShowPaymentModal(false); setSelectedBooking(null); }}
                  className="w-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 font-mono text-xs uppercase tracking-widest py-3.5 font-black transition-colors"
                >
                  Cancel
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- Manage Slots Modal ---------- */}
      <AnimatePresence>
        {showManageSlots && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]"
          >
            <motion.div
              initial={{ scale: 0.9, y: 12, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 12, opacity: 0 }}
              transition={{ duration: 0.3, ease: easeOut }}
              className="bg-neutral-950 border border-neutral-800 p-4 sm:p-6 w-full max-w-lg space-y-4 relative overflow-y-auto max-h-[85vh] rounded-lg shadow-2xl"
            >
              <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-fuchsia-500/10 to-transparent pointer-events-none" />
              <div className="relative">
                <span className="text-[10px] font-mono uppercase tracking-widest text-fuchsia-400 block mb-1">
                  // Slot Manager
                </span>
                <h2 className="text-xl font-black uppercase tracking-tight text-white">
                  ⚙️ Manage Turf Slots
                </h2>
                <p className="text-neutral-400 text-xs mt-1 font-mono">
                  Log offline bookings or block field slots for tournaments & maintenance.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase text-neutral-400">Reason</label>
                  <select
                    value={slotReason}
                    onChange={(e) => setSlotReason(e.target.value)}
                    className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors"
                  >
                    <option value="OFFLINE BOOKING">OFFLINE BOOKING</option>
                    <option value="TOURNAMENT">TOURNAMENT</option>
                    <option value="MAINTENANCE">MAINTENANCE</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase text-neutral-400">Date</label>
                  <input
                    type="date"
                    value={slotDate}
                    min={getTodayStr()}
                    onChange={(e) => {
                      setSlotDate(e.target.value);
                    }}
                    style={{ colorScheme: "dark" }}
                    className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase text-neutral-400">Court Section</label>
                  <select
                    value={slotCourt}
                    onChange={(e) => setSlotCourt(e.target.value)}
                    className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors"
                  >
                    <option value="Full Court">Full Court</option>
                    <option value="Court 1">Court 1</option>
                    <option value="Court 2">Court 2</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase text-neutral-400">Start Time</label>
                  <select
                    value={slotTime}
                    onChange={(e) => setSlotTime(e.target.value)}
                    className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none text-sm font-mono font-medium transition-colors"
                  >
                    <option value="">-- Select Time --</option>
                    {availableAdminSlots.length === 0 ? (
                      <option value="" disabled>No slots available</option>
                    ) : (
                      availableAdminSlots.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))
                    )}
                  </select>
                </div>

                {slotReason === "TOURNAMENT" || slotReason === "MAINTENANCE" ? (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase text-neutral-400">End Time (Optional)</label>
                    <select
                      value={slotEndTime}
                      onChange={(e) => setSlotEndTime(e.target.value)}
                      className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors"
                    >
                      <option value="">-- Select End Time --</option>
                      {adminTimeSlots.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase text-neutral-400">Duration (Minutes)</label>
                    <select
                      value={slotDuration}
                      onChange={(e) => setSlotDuration(Number(e.target.value))}
                      className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors"
                    >
                      <option value={30}>30 mins</option>
                      <option value={60}>60 Mins (1 Hour)</option>
                      <option value={90}>90 Mins (1.5 Hours)</option>
                      <option value={120}>120 Mins (2 Hours)</option>
                      <option value={150}>150 Mins (2.5 Hours)</option>
                      <option value={180}>180 Mins (3 Hours)</option>
                    </select>
                  </div>
                )}

                {(slotReason === "OFFLINE BOOKING" || slotReason === "TOURNAMENT" || slotReason === "MAINTENANCE") && (
                  <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-neutral-800 mt-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase text-neutral-400">Name (Optional)</label>
                      <input
                        type="text"
                        placeholder="Customer/Team Name"
                        value={offlineName}
                        onChange={(e) => setOfflineName(e.target.value)}
                        className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-cyan-400 outline-none text-xs font-mono transition-colors"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase text-neutral-400">Phone Number (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. 9876543210"
                        value={offlinePhone}
                        onChange={(e) => {
                           const numeric = e.target.value.replace(/\D/g, "");
                           if (numeric.length <= 10) setOfflinePhone(numeric);
                        }}
                        className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-cyan-400 outline-none text-xs font-mono transition-colors"
                      />
                    </div>
                    {slotReason === "OFFLINE BOOKING" && (
                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-[10px] font-mono uppercase text-neutral-400">Email (Optional)</label>
                        <input
                          type="email"
                          placeholder="example@email.com"
                          value={offlineEmail}
                          onChange={(e) => setOfflineEmail(e.target.value)}
                          className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-cyan-400 outline-none text-xs font-mono transition-colors"
                        />
                      </div>
                    )}
                  </div>
                )}

                {slotReason === "OFFLINE BOOKING" && (
                  <div className="sm:col-span-2 p-3 bg-neutral-900 border border-neutral-800 space-y-3 relative mt-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase text-neutral-400">Total Turf Cost</label>
                      <input
                        type="number"
                        placeholder="Total Amount (e.g. 1200)"
                        value={offlineAmount}
                        onChange={(e) => setOfflineAmount(e.target.value)}
                        className="w-full p-3 bg-neutral-950 text-white border border-neutral-800 focus:border-lime-400 outline-none text-xs font-mono transition-colors"
                      />
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-neutral-800">
                      <label className="text-[10px] font-mono uppercase text-neutral-400">Advance Collected & Payment Route</label>
                      <select
                        value={offlinePaymentMethod}
                        onChange={(e) => setOfflinePaymentMethod(e.target.value)}
                        className="w-full p-3 bg-neutral-950 text-white border border-neutral-800 focus:border-lime-400 outline-none text-xs font-medium transition-colors mb-2"
                      >
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Cash + UPI">Cash + UPI</option>
                      </select>

                      {offlinePaymentMethod === "Cash + UPI" ? (
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="number"
                            placeholder="Cash Advance (₹)"
                            value={offlineCashAmount}
                            onChange={(e) => setOfflineCashAmount(e.target.value)}
                            className="w-full p-3 bg-neutral-950 text-white border border-neutral-800 focus:border-lime-400 outline-none text-xs font-mono transition-colors"
                          />
                          <input
                            type="number"
                            placeholder="UPI Advance (₹)"
                            value={offlineUpiAmount}
                            onChange={(e) => setOfflineUpiAmount(e.target.value)}
                            className="w-full p-3 bg-neutral-950 text-white border border-neutral-800 focus:border-lime-400 outline-none text-xs font-mono transition-colors"
                          />
                        </div>
                      ) : (
                        <input
                          type="number"
                          placeholder="Advance Received (Enter 0 if none)"
                          value={offlineAdvanceAmount}
                          onChange={(e) => setOfflineAdvanceAmount(e.target.value)}
                          className="w-full p-3 bg-neutral-950 text-white border border-neutral-800 focus:border-lime-400 outline-none text-xs font-mono transition-colors"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 relative">
                <motion.button
                  whileHover={{ y: -2, boxShadow: "0 12px 30px rgba(217,70,239,0.3)" }}
                  whileTap={{ scale: 0.97 }}
                  onClick={saveBlockedSlot}
                  className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-mono text-xs uppercase tracking-widest py-3.5 font-black transition-colors"
                >
                  Save Field Block
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    setShowManageSlots(false);
                    setOfflineName("");
                    setOfflinePhone("");
                    setOfflineEmail("");
                  }}
                  className="w-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 font-mono text-xs uppercase tracking-widest py-3.5 font-black transition-colors"
                >
                  Cancel
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- STUDENT PAYMENT HISTORY (bottom sheet) ---------- */}
      <AnimatePresence>
        {historyStudent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9990] flex items-end sm:items-center justify-center"
            onClick={() => setHistoryStudentId(null)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ duration: 0.3, ease: easeOut }}
              onClick={(e) => e.stopPropagation()}
              className="bg-neutral-950 border border-neutral-800 w-full sm:max-w-md max-h-[88vh] flex flex-col relative overflow-hidden"
            >
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-lime-400 to-emerald-500" />
              <div className="p-4 pt-5 border-b border-neutral-900 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">Payment History</span>
                    <h3 className="text-lg font-black text-white truncate">{historyStudent.name}</h3>
                    <p className="text-[11px] font-mono text-neutral-400">{historyStudent.batch} · {historyStudent.phone}</p>
                    <p className="text-[11px] font-mono text-lime-400 mt-0.5">🗓️ Added on {fmtAddedOn(historyStudent.created_at)}</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => setHistoryStudentId(null)}
                    className="w-10 h-10 shrink-0 flex items-center justify-center border border-neutral-800 bg-neutral-900 text-neutral-400 text-sm"
                  >
                    ✕
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-neutral-900 border border-neutral-800">
                    <span className="block text-lg font-black text-lime-400 leading-none">{historyPaidCount}</span>
                    <span className="block text-[9px] font-mono uppercase tracking-widest text-neutral-500 mt-1">Months Paid</span>
                  </div>
                  <div className="p-2 bg-neutral-900 border border-neutral-800">
                    <span className="block text-lg font-black text-white leading-none">₹{historyTotalPaid.toLocaleString("en-IN")}</span>
                    <span className="block text-[9px] font-mono uppercase tracking-widest text-neutral-500 mt-1">Total Paid</span>
                  </div>
                  <div className="p-2 bg-neutral-900 border border-neutral-800">
                    <span className={`block text-lg font-black leading-none ${historyRows.length - historyPaidCount > 0 ? "text-red-400" : "text-neutral-500"}`}>
                      {historyRows.length - historyPaidCount}
                    </span>
                    <span className="block text-[9px] font-mono uppercase tracking-widest text-neutral-500 mt-1">Months Due</span>
                  </div>
                </div>
              </div>

              <div className="overflow-y-auto p-3 space-y-2">
                {historyRows.map(({ ym, rec }) => {
                  const paid = rec && rec.status === "settled";
                  const when = rec ? (rec.updated_at || rec.created_at) : null;
                  return (
                    <div
                      key={ym}
                      className={`p-3 border space-y-2.5 ${paid ? "bg-lime-400/[0.04] border-lime-400/20" : "bg-red-500/[0.05] border-red-500/25"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-black text-white">{monthLabelOf(ym)}</span>
                        {paid ? (
                          <span className="px-2 py-1 text-[10px] font-mono uppercase bg-lime-400/10 border border-lime-400/30 text-lime-400 font-black">
                            ✅ Paid ₹{Number(rec.amount_paid || 0).toLocaleString("en-IN")}{Number(rec.amount_paid || 0) < FIXED_COACHING_FEE ? " (half)" : ""}
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-[10px] font-mono uppercase bg-red-500/15 border border-red-500/40 text-red-400 font-black">
                            ⚠️ Due ₹{FIXED_COACHING_FEE.toLocaleString("en-IN")}
                            {halfFeeAllowed(historyStudent, ym) ? ` / ₹${HALF_COACHING_FEE.toLocaleString("en-IN")} half` : ""}
                          </span>
                        )}
                      </div>
                      {paid ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-mono text-neutral-400">
                            {rec.payment_method}{rec.collected_by ? ` · by ${rec.collected_by}` : ""}
                            {when ? ` · ${new Date(when).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" })}` : ""}
                          </span>
                          <button
                            type="button"
                            onClick={() => undoPaymentMonth(historyStudent, ym)}
                            className="h-9 px-3 border border-neutral-700 text-neutral-300 text-[10px] font-mono font-black uppercase tracking-widest active:bg-neutral-800"
                          >
                            ↩️ Undo
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {halfFeeAllowed(historyStudent, ym) && (() => {
                            const key = `${historyStudent.id}:${ym}`;
                            const choice = historyFeeChoice[key] || "full";
                            return (
                              <div className="space-y-1.5 p-2 bg-amber-500/10 border border-amber-500/30">
                                <p className="text-[10px] font-mono text-amber-200">Joined after the 12th: pick the fee to collect.</p>
                                <div className="grid grid-cols-2 gap-2">
                                  {([
                                    { id: "full", label: "Full", amt: FIXED_COACHING_FEE },
                                    { id: "half", label: "Half", amt: HALF_COACHING_FEE },
                                  ] as const).map((o) => (
                                    <button
                                      key={o.id}
                                      type="button"
                                      onClick={() => setHistoryFeeChoice((prev) => ({ ...prev, [key]: o.id }))}
                                      className={`h-10 border font-mono font-black text-[11px] uppercase ${
                                        choice === o.id ? "bg-lime-400 text-black border-lime-400" : "bg-neutral-950 text-neutral-300 border-neutral-700"
                                      }`}
                                    >
                                      {o.label} · ₹{o.amt.toLocaleString("en-IN")}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        <div className="grid grid-cols-2 gap-2">
                          {["UPI", "Cash"].map((method) => (
                            <button
                              key={method}
                              type="button"
                              onClick={async () => {
                                const amount =
                                  halfFeeAllowed(historyStudent, ym) && historyFeeChoice[`${historyStudent.id}:${ym}`] === "half"
                                    ? HALF_COACHING_FEE
                                    : FIXED_COACHING_FEE;
                                const ok = await settleStudentMonth(historyStudent.id, ym, method, amount);
                                if (!ok) return;
                                showUndo(`💸 ${historyStudent.name}: ${monthLabelOf(ym)} paid ₹${amount.toLocaleString("en-IN")} (${method})`, async () => {
                                  await supabase.from("student_payments").delete().eq("student_id", historyStudent.id).eq("month_year", ym);
                                });
                                loadAcademyData();
                              }}
                              className="h-11 bg-lime-400 text-black font-mono font-black text-[11px] uppercase tracking-widest active:bg-lime-300"
                            >
                              Paid · {method}
                            </button>
                          ))}
                        </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- EDIT STUDENT (bottom sheet) ---------- */}
      <AnimatePresence>
        {editStudentId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9990] flex items-end sm:items-center justify-center"
            onClick={() => setEditStudentId(null)}
          >
            <motion.form
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ duration: 0.3, ease: easeOut }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={saveStudentEdit}
              className="bg-neutral-950 border border-neutral-800 w-full sm:max-w-md max-h-[90vh] overflow-y-auto p-4 pt-5 space-y-3 relative"
            >
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-lime-400 to-emerald-500" />
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-black uppercase text-white">Edit Student</h3>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setEditStudentId(null)}
                  className="w-10 h-10 flex items-center justify-center border border-neutral-800 bg-neutral-900 text-neutral-400 text-sm"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-1.5">
                <label className={coachingLabelCls}>Student Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className={coachingInputCls}
                />
              </div>
              <div className="space-y-1.5">
                <label className={coachingLabelCls}>Phone (10 Digits)</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                  className={`${coachingInputCls} font-mono`}
                />
              </div>
              <div className="space-y-1.5">
                <label className={coachingLabelCls}>Date of Birth</label>
                <input
                  type="date"
                  value={editForm.dob}
                  onChange={(e) => setEditForm({ ...editForm, dob: e.target.value })}
                  className={coachingInputCls}
                  style={{ colorScheme: "dark" }}
                />
              </div>
              <div className="space-y-1.5">
                <label className={coachingLabelCls}>Email ID</label>
                <input
                  type="email"
                  inputMode="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className={coachingInputCls}
                />
              </div>
              <div className="space-y-1.5">
                <label className={coachingLabelCls}>Batch</label>
                <select
                  value={editForm.batch}
                  onChange={(e) => setEditForm({ ...editForm, batch: e.target.value as BatchTabType })}
                  className={coachingInputCls}
                >
                  <option value="Morning Batch">🌅 Morning Batch</option>
                  <option value="Evening Batch">🌙 Evening Batch</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditStudentId(null)}
                  className="min-h-[52px] border border-neutral-700 text-neutral-300 font-mono font-black text-xs uppercase tracking-widest active:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[52px] bg-lime-400 text-black font-mono font-black text-xs uppercase tracking-widest active:bg-lime-300"
                >
                  Save Changes
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- UNDO TOAST ---------- */}
      <AnimatePresence>
        {undoToast && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            className="fixed bottom-4 inset-x-3 sm:inset-x-auto sm:right-6 sm:w-96 z-[10001] flex items-center justify-between gap-3 p-3 bg-neutral-900 border border-lime-400/40 shadow-2xl"
          >
            <span className="text-xs font-mono text-white leading-snug">{undoToast.message}</span>
            <button
              type="button"
              onClick={runUndo}
              className="shrink-0 min-h-[40px] px-4 bg-lime-400 text-black font-mono font-black text-xs uppercase tracking-widest active:bg-lime-300"
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- MASTER SECURITY OTP MODAL ---------- */}
      <AnimatePresence>
        {showOtpModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-[10000]"
          >
            <motion.div
              initial={{ scale: 0.9, y: 12, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 12, opacity: 0 }}
              transition={{ duration: 0.3, ease: easeOut }}
              className="bg-neutral-950 border border-red-500/50 p-6 w-full max-w-sm space-y-5 relative overflow-y-auto max-h-[90vh] shadow-[0_0_50px_rgba(239,68,68,0.15)] rounded-lg"
            >
              <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-red-500/10 to-transparent pointer-events-none" />

              <div className="relative text-center">
                <div className="mx-auto w-10 h-10 bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mb-3 rounded-full">
                  🔒
                </div>
                <h2 className="text-xl font-black uppercase tracking-tight text-white">
                  Security Check
                </h2>
                <p className="text-neutral-400 text-[11px] mt-2 font-mono leading-relaxed">
                  To authorize this modification, please enter the 6-digit OTP sent to the <span className="text-white font-bold">master admin emails</span>.
                </p>
              </div>

              {isSendingOtp ? (
                <div className="py-6 text-center text-xs font-mono text-lime-400 animate-pulse font-black uppercase tracking-widest">
                  Dispatching OTP to Master Email...
                </div>
              ) : (
                <div className="space-y-4 relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="••••••"
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full p-4 bg-neutral-900 text-center text-white text-2xl tracking-[0.5em] border border-neutral-800 focus:border-red-500 outline-none font-mono font-black transition-colors"
                  />

                  <button
                    type="button"
                    onClick={pasteOtpFromClipboard}
                    className="w-full min-h-[44px] border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 font-mono text-[11px] uppercase tracking-widest font-black transition-colors"
                  >
                    📋 Paste code from clipboard
                  </button>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <motion.button
                      whileHover={{ y: -2, boxShadow: "0 10px 25px rgba(239,68,68,0.3)" }}
                      whileTap={{ scale: 0.97 }}
                      onClick={verifyOtpAndExecute}
                      disabled={isVerifyingOtp || otpInput.length !== 6}
                      className={`w-full font-mono text-xs uppercase tracking-widest py-3.5 font-black transition-colors ${
                        otpInput.length === 6 
                          ? "bg-red-500 hover:bg-red-400 text-white" 
                          : "bg-neutral-900 text-neutral-600 cursor-not-allowed border border-neutral-800"
                      }`}
                    >
                      {isVerifyingOtp ? "Verifying..." : "Authorize"}
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        setShowOtpModal(false);
                        setOtpInput("");
                        setPendingAction(null);
                      }}
                      className="w-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 font-mono text-xs uppercase tracking-widest py-3.5 font-black transition-colors"
                    >
                      Abort
                    </motion.button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </main>
  );
}