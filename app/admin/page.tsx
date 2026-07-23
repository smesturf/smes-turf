"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";

/* ------------------------------------------------------------------ */
/* Motion Presets                                                    */
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

export default function AdminPage() {
  const router = useRouter();

  const [bookings, setBookings] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDate, setFilterDate] = useState<string>(""); // ⚙️ New Date Filter State
  const [blockedSlots, setBlockedSlots] = useState<any[]>([]);
  const [todaySlots, setTodaySlots] = useState(0);
  const [tomorrowSlots, setTomorrowSlots] = useState(0);
  const [monthlyBookings, setMonthlyBookings] = useState(0);
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [monthlyAdvance, setMonthlyAdvance] = useState(0);
  const [monthlyBalance, setMonthlyBalance] = useState(0);
  const [todayCashCollection, setTodayCashCollection] = useState(0);
  const [todayUpiCollection, setTodayUpiCollection] = useState(0);
  const [todayTotalCollection, setTodayTotalCollection] = useState(0);
  const [showManageSlots, setShowManageSlots] = useState(false);
  const [activeDate, setActiveDate] = useState(getTodayStr());

  // 🏆 Academy Coaching Toggled State Parameters
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
  const [isSendingEmails, setIsSendingEmails] = useState(false);

  // ⚙️ Manage Booking Pop-Up States (Master Admin - 4 Options)
  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedManageBooking, setSelectedManageBooking] = useState<any>(null);
  const [manageMode, setManageMode] = useState<"options" | "reschedule" | "extend">("options");
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleDuration, setRescheduleDuration] = useState(60);
  const [rescheduleCourt, setRescheduleCourt] = useState("Full Court");
  const [availableRescheduleSlots, setAvailableRescheduleSlots] = useState<string[]>([]);
  const [extendMinutes, setExtendMinutes] = useState(30);

  const FIXED_COACHING_FEE = 3500;
  const currentMonthYear = new Date().toISOString().slice(0, 7);
  const currentMonthLabel = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

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

  const [slotDate, setSlotDate] = useState("");
  
  // ⚙️ Hardcoded Time Slots 
  const adminTimeSlots = [
    "12:00 AM", "12:30 AM", "01:00 AM", "01:30 AM", "02:00 AM", "02:30 AM",
    "03:00 AM", "03:30 AM", "04:00 AM", "04:30 AM", "05:00 AM", "05:30 AM",
    "06:00 AM", "06:30 AM", "07:00 AM", "07:30 AM", "08:00 AM", "08:30 AM",
    "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
    "12:00 PM", "12:30 PM", "01:00 PM", "01:30 PM", "02:00 PM", "02:30 PM",
    "03:00 PM", "03:30 PM", "04:00 PM", "04:30 PM", "05:00 PM", "05:30 PM",
    "06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM", "08:00 PM", "08:30 PM",
    "09:00 PM", "09:30 PM", "10:00 PM", "10:30 PM", "11:00 PM", "11:30 PM"
  ];

  const [slotReason, setSlotReason] = useState("OFFLINE BOOKING");
  const [slotTime, setSlotTime] = useState("");
  const [slotDuration, setSlotDuration] = useState(60);
  const [slotEndTime, setSlotEndTime] = useState("");

  const [offlineAmount, setOfflineAmount] = useState("");
  const [offlinePaymentMethod, setOfflinePaymentMethod] = useState("Cash");
  const [offlineCashAmount, setOfflineCashAmount] = useState("");
  const [offlineUpiAmount, setOfflineUpiAmount] = useState("");

  const [slotCourt, setSlotCourt] = useState("Full Court");
  const [availableCourts, setAvailableCourts] = useState([
    "Full Court",
    "Court 1",
    "Court 2",
  ]);

  const loadAvailableCourts = async (date: string, time: string) => {
    const { data: bookings } = await supabase
      .from("bookings")
      .select("*")
      .eq("booking_date", date);

    const { data: blocked } = await supabase
      .from("blocked_slots")
      .select("*")
      .eq("booking_date", date);

    let courts = ["Full Court", "Court 1", "Court 2"];
    const selectedMinutes = convertToMins(time);

    [...(bookings || []), ...(blocked || [])].forEach((b: any) => {
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

  const [availableAdminSlots, setAvailableAdminSlots] = useState<string[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [paymentType, setPaymentType] = useState("Full Cash");
  const [cashAmount, setCashAmount] = useState("");
  const [upiAmount, setUpiAmount] = useState("");

  /* -------- Security Auth & Realtime Loader -------- */
  useEffect(() => {
    const verifyAuth = async () => {
      const loggedIn = localStorage.getItem("adminLoggedIn");
      
      const { data } = await supabase.auth.getSession();
      
      if (loggedIn !== "true" || !data.session) {
        router.push("/staff");
        return;
      }
      
      loadBookings();
      loadAcademyData();
    };

    verifyAuth();

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

    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(blockedChannel);
      supabase.removeChannel(studentsChannel);
      supabase.removeChannel(paymentsChannel);
    };
  }, [router]);

  /* -------- Fetch historical data seamlessly if filter changes -------- */
  useEffect(() => {
    loadBookings();
  }, [filterDate]);

  /* -------- Midnight Auto-Rollover -------- */
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

  /* -------- Inactivity Auto-Logout Timer -------- */
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const INACTIVITY_LIMIT = 15 * 60 * 1000;

    const resetTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        await supabase.auth.signOut();
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

  /* -------- Automated Email Reminders -------- */
  const sendEmailReminders = async () => {
    const pendingStudents = academyStudents.filter(s => s.payment_status !== "settled" && s.email);
    const noEmailStudents = academyStudents.filter(s => s.payment_status !== "settled" && !s.email);

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
      .insert([{
        student_id: student.id,
        month_year: currentMonthYear,
        status: "settled",
        amount_paid: FIXED_COACHING_FEE,
        payment_method: adminNewStudentMethod
      }]);

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

  const deleteStudent = async (studentId: string, studentName: string) => {
    const confirmDelete = window.confirm(
      `⚠️ CRITICAL WARNING:\n\nAre you sure you want to completely delete "${studentName}"?\n\nThis will permanently destroy this student's profile and delete their entire multi-month payment history from the master system. This action cannot be undone.`
    );
    if (!confirmDelete) return;

    try {
      const { error: paymentError } = await supabase
        .from("student_payments")
        .delete()
        .eq("student_id", studentId);

      if (paymentError) throw paymentError;

      const { error: studentError } = await supabase
        .from("students")
        .delete()
        .eq("id", studentId);

      if (studentError) throw studentError;

      alert(`✅ ${studentName} and all associated ledger history records have been purged.`);
      loadAcademyData();
    } catch (error: any) {
      console.error("Deletion matrix failure:", error);
      alert(`Database Error: ${error.message || "Failed to remove student record safely."}`);
    }
  };

  const loadBookings = async () => {
    const todayStr = getTodayStr();
    const tomorrowStr = getTomorrowStr();

    // ⚙️ Core Logic: Load everything active OR exactly the filter date
    let orQuery = `booking_date.gte.${todayStr},balance_amount.gt.0,payment_date.eq.${todayStr}`;
    if (filterDate && filterDate < todayStr) {
      orQuery += `,booking_date.eq.${filterDate}`;
    }

    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .or(orQuery)
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) { console.log(error); return; }

    setBookings(data || []);
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const thisMonthBookings =
      data?.filter((booking) => {
        const d = new Date(booking.booking_date);
        return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear;
      }) || [];

    setMonthlyBookings(thisMonthBookings.length);
    setMonthlyRevenue(thisMonthBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0));
    setMonthlyAdvance(thisMonthBookings.reduce((sum, b) => sum + (b.advance_amount || 0), 0));
    setMonthlyBalance(thisMonthBookings.reduce((sum, b) => sum + (b.balance_amount || 0), 0));

    const { data: blockedData } = await supabase
      .from("blocked_slots")
      .select("*")
      .gte("booking_date", todayStr)
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true });

    setBlockedSlots(blockedData || []);
    const todaysBookings = data?.filter((booking) => booking.booking_date?.split("T")[0] === todayStr) || [];
    const tomorrowsBookings = data?.filter((booking) => booking.booking_date?.split("T")[0] === tomorrowStr) || [];

    setTodaySlots(todaysBookings.length);
    setTomorrowSlots(tomorrowsBookings.length);

    let cashVault = 0;
    let upiNodes = 0;

    data?.forEach((booking) => {
      const createdToday = booking.created_at?.split("T")[0] === todayStr;
      const paidToday = booking.payment_date === todayStr;

      if (paidToday) {
        if (booking.payment_method === "Full Cash") {
          cashVault += Number(booking.cash_received || 0);
        } else if (booking.payment_method === "Full UPI") {
          upiNodes += Number(booking.upi_received || 0);
        } else if (booking.payment_method === "Cash + UPI") {
          cashVault += Number(booking.cash_received || 0);
          upiNodes += Number(booking.upi_received || 0);
        }
      }

      if (createdToday && booking.customer_name === "Offline Booking") {
        if (!paidToday) {
          cashVault += Number(booking.cash_received || 0);
          upiNodes += Number(booking.upi_received || 0);
        }
      }

      if (createdToday && booking.customer_name !== "Offline Booking") {
        upiNodes += Number(booking.advance_amount || 0);
      }
    });

    setTodayCashCollection(cashVault);
    setTodayUpiCollection(upiNodes);
    setTodayTotalCollection(cashVault + upiNodes);
  };

  const loadAvailableAdminSlots = async (date: string) => {
    const { data: bookings } = await supabase
      .from("bookings")
      .select("start_time,duration_minutes,booking_type,court_number")
      .eq("booking_date", date);
    const { data: blocked } = await supabase
      .from("blocked_slots")
      .select("start_time,duration_minutes,court_number")
      .eq("booking_date", date);
    const availableTimes: string[] = [];

    adminTimeSlots.forEach((slot) => {
      const selectedMinutes = convertToMins(slot);
      let court1Available = true;
      let court2Available = true;

      [...(bookings || []), ...(blocked || [])].forEach((b: any) => {
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

  // ⚙️ Load Reschedule Available Slots (Range-based & Court-aware)
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
      if (selectedEnd <= selectedStart) { alert("End time must be after the launch time"); return; }
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
      let totalAmount = 0;
      let cashReceived = 0;
      let upiReceived = 0;

      if (offlinePaymentMethod === "Cash") { totalAmount = Number(offlineAmount); cashReceived = totalAmount; }
      if (offlinePaymentMethod === "UPI") { totalAmount = Number(offlineAmount); upiReceived = totalAmount; }
      if (offlinePaymentMethod === "Cash + UPI") {
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
        duration_minutes: actualCalculatedDuration,
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
        payment_date: getTodayStr(), 
      }]);
      if (error) { alert(error.message); return; }

      alert("✅ Offline Booking Saved");
      await loadBookings();
      setSlotDate(""); setSlotTime(""); setSlotDuration(60); setSlotEndTime("");
      setSlotReason("OFFLINE BOOKING"); setSlotCourt("Full Court");
      setOfflineAmount(""); setOfflineCashAmount(""); setOfflineUpiAmount("");
      setShowManageSlots(false);
      return;
    }

    const { error } = await supabase.from("blocked_slots").insert([{
      booking_date: slotDate,
      start_time: slotTime,
      duration_minutes: actualCalculatedDuration,
      reason: slotReason,
      court_number: slotCourt,
    }]);

    if (error) { alert(error.message); return; }

    alert("✅ Field Block Saved Successfully");
    await loadBookings();
    if (slotDate) loadAvailableAdminSlots(slotDate);

    setSlotDate(""); setSlotTime(""); setSlotEndTime(""); setSlotDuration(60);
    setSlotReason("OFFLINE BOOKING"); setSlotCourt("Full Court");
    setShowManageSlots(false);
  };

  // ⚙️ MANAGE OPERATIONS HANDLERS

  // 1. Cancel with Refund Advance
  const handleCancelWithRefund = async () => {
    if (!selectedManageBooking) return;
    const advanceAmount = selectedManageBooking.advance_amount || 0;
    const confirmCancel = confirm(
      `Are you sure you want to cancel booking for "${selectedManageBooking.customer_name}"?\n\n💰 Advance Refund to return: ₹${advanceAmount}`
    );
    if (!confirmCancel) return;

    const { error } = await supabase
      .from("bookings")
      .delete()
      .eq("id", selectedManageBooking.id);

    if (error) { alert(error.message); return; }

    alert(`✅ Booking Cancelled. Refund of ₹${advanceAmount} marked to be returned.`);
    setShowManageModal(false);
    setSelectedManageBooking(null);
    loadBookings();
  };

  // 2. Reschedule Booking
  const handleRescheduleBooking = async () => {
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

    // Proportional Price Calculation
    const originalDur = selectedManageBooking.duration_minutes || 60;
    const originalTotal = selectedManageBooking.total_amount || 0;
    const pricePerMin = originalTotal / originalDur;
    const newTotal = Math.round(pricePerMin * rescheduleDuration);
    const priceDiff = newTotal - originalTotal;
    const newBalance = (selectedManageBooking.balance_amount || 0) + priceDiff;

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

    alert("✅ Booking Rescheduled Successfully with updated rates!");
    setShowManageModal(false);
    setSelectedManageBooking(null);
    loadBookings();
  };

  // 3. Cancel without Refund
  const handleCancelWithoutRefund = async () => {
    if (!selectedManageBooking) return;
    const confirmCancel = confirm(
      `Are you sure you want to cancel the booking for "${selectedManageBooking.customer_name}" WITHOUT issuing a refund?`
    );
    if (!confirmCancel) return;

    const { error } = await supabase
      .from("bookings")
      .delete()
      .eq("id", selectedManageBooking.id);

    if (error) { alert(error.message); return; }

    alert("✅ Booking Cancelled (No Refund Issued).");
    setShowManageModal(false);
    setSelectedManageBooking(null);
    loadBookings();
  };

  // 4. Extend Slot
  const checkAndExtendBooking = async () => {
    if (!selectedManageBooking) return;

    const bDate = selectedManageBooking.booking_date?.split("T")[0];
    const startMins = convertToMins(selectedManageBooking.start_time);
    const currentDur = selectedManageBooking.duration_minutes || 60;
    const extensionStart = startMins + currentDur;
    const extensionEnd = extensionStart + Number(extendMinutes);

    const { data: existingBookings } = await supabase.from("bookings").select("*").eq("booking_date", bDate);
    const { data: existingBlocks } = await supabase.from("blocked_slots").select("*").eq("booking_date", bDate);

    const allBusyItems = [
      ...(existingBookings || []).filter((b: any) => b.id !== selectedManageBooking.id),
      ...(existingBlocks || [])
    ];

    const isOverlapping = allBusyItems.some((item) => {
      const itemStart = convertToMins(item.start_time);
      const itemEnd = itemStart + (item.duration_minutes || 60);
      const overlaps = extensionStart < itemEnd && extensionEnd > itemStart;
      if (!overlaps) return false;
      const court = selectedManageBooking.court_number || "Full Court";
      if (court === "Full Court" || court === "Both Courts") return true;
      if (item.booking_type === "Full Court" || item.court_number === "Full Court" || item.court_number === "Both Courts") return true;
      return item.court_number === court;
    });

    if (isOverlapping) {
      alert("⚠️ Extension Failed: The target extended time slot is already booked or blocked.");
      return;
    }

    // Price Update Calculation
    const currentTotal = selectedManageBooking.total_amount || 0;
    const currentBalance = selectedManageBooking.balance_amount || 0;
    
    const pricePerMin = currentTotal / currentDur;
    const addedPrice = Math.round(pricePerMin * Number(extendMinutes));
    
    const newDuration = currentDur + Number(extendMinutes);
    const newTotal = currentTotal + addedPrice;
    const newBalance = currentBalance + addedPrice;

    const { error } = await supabase
      .from("bookings")
      .update({
        duration_minutes: newDuration,
        total_amount: newTotal,
        balance_amount: newBalance,
      })
      .eq("id", selectedManageBooking.id);

    if (error) { alert(error.message); return; }

    alert(`✅ Slot Extended! Duration: ${newDuration} mins, New Price: ₹${newTotal}.`);
    setShowManageModal(false);
    setSelectedManageBooking(null);
    loadBookings();
  };

  const todaysAdvance = bookings
    .filter((booking) => booking.created_at?.split("T")[0] === getTodayStr())
    .reduce((sum, booking) => sum + (booking.advance_amount || 0), 0);
  const todaysBalance = bookings
    .filter((booking) => booking.booking_date?.split("T")[0] === getTodayStr())
    .reduce((sum, booking) => sum + (booking.balance_amount || 0), 0);

  const exportToExcel = async () => {
    const XLSX = await import("xlsx");
    
    const exportData = bookings.map((booking) => ({
      "Booking ID": booking.id,
      "Barcode": booking.booking_reference || "N/A",
      "Customer Name": booking.customer_name,
      "Phone Number": booking.phone,
      "Date": booking.booking_date?.split("T")[0],
      "Time": booking.start_time,
      "Duration (Mins)": booking.duration_minutes || 60,
      "Sport": booking.sport,
      "Type": booking.booking_type,
      "Court": booking.court_number || "-",
      "Total (₹)": booking.total_amount,
      "Advance (₹)": booking.advance_amount,
      "Balance (₹)": booking.balance_amount,
      "Status": booking.payment_status,
      "Payment Method": booking.payment_method || "-",
      "Cash Received (₹)": booking.cash_received || 0,
      "UPI Received (₹)": booking.upi_received || 0,
      "Payment Status": booking.payment_completed ? "Paid" : "Pending",
    }));

    const currentMonthYear = new Date().toISOString().slice(0, 7);
    const currentMonthNum = new Date().getMonth();
    const currentYearNum = new Date().getFullYear();
    const { data: dbStudents } = await supabase.from("students").select(`*, student_payments(*)`).order("name", { ascending: true });

    const uniqueMonths = Array.from(
      new Set([
        ...((dbStudents || []).flatMap((s: any) => (s.student_payments || []).map((p: any) => p.month_year))),
        currentMonthYear
      ])
    ).sort();

    const formatMonthLabel = (my: string) => {
      const [year, month] = my.split("-");
      const date = new Date(Number(year), Number(month) - 1, 1);
      return date.toLocaleString("en-US", { month: "long", year: "numeric" });
    };

    const academyWorksheetData = (dbStudents || []).map((s: any, index: number) => {
      const joinDate = new Date(s.created_at);
      const isNew = joinDate.getMonth() === currentMonthNum && joinDate.getFullYear() === currentYearNum;
      const row: any = {
        "S.No.": index + 1,
        "Student Name": s.name + (isNew ? " (NEW)" : ""),
        "Phone Number": s.phone,
        "Date of Birth": s.dob ? new Date(s.dob).toLocaleDateString("en-GB") : "-",
        "Email ID": s.email || "-",
        "Monthly Fee (₹)": s.monthly_fee,
        "Type": isNew ? "NEW REGISTRATION" : "EXISTING"
      };
      uniqueMonths.forEach((my) => {
        const record = s.student_payments?.find((p: any) => p.month_year === my);
        const colLabel = formatMonthLabel(my);
        row[colLabel] = record?.status === "settled" ? `✅ PAID (${record.payment_method || "UPI"})` : "❌ PENDING";
      });
      return row;
    });

    const totalRevenue = bookings.reduce((sum, booking) => sum + (booking.total_amount || 0), 0);
    const totalAdvance = bookings.reduce((sum, booking) => sum + (booking.advance_amount || 0), 0);
    const totalBalance = bookings.reduce((sum, booking) => sum + (booking.balance_amount || 0), 0);
    const totalCashCollected = bookings.reduce((sum, booking) => sum + Number(booking.cash_received || 0), 0);
    const totalUpiCollected = bookings.reduce((sum, booking) => sum + Number(booking.upi_received || 0), 0);
    const totalCollection = totalCashCollected + totalUpiCollected;
    const moneyInHand = totalAdvance + totalCollection;

    const workbook = XLSX.utils.book_new();
    const todayStr = getTodayStr(); 

    const worksheet = XLSX.utils.aoa_to_sheet([
      ["SMES TURF BOOKING REPORT"],
      [`Export Date: ${new Date().toLocaleString("en-IN")}`],
      [],
      ["Total Bookings", bookings.length],
      ["Total Revenue Expected (₹)", totalRevenue],
      ["Advance Collected (₹)", totalAdvance],
      ["Pending Balance (₹)", totalBalance],
      ["Cash Collected (₹)", totalCashCollected],
      ["UPI Collected (₹)", totalUpiCollected],
      ["Total Collected (Cash + UPI) (₹)", totalCollection],
      ["Actual Money In Hand (Adv + Cash + UPI) (₹)", moneyInHand],
      [], [],
    ]);
    XLSX.utils.sheet_add_json(worksheet, exportData, { origin: "A14" });
    
    worksheet["!autofilter"] = { ref: `A14:R${14 + exportData.length}` };
    worksheet["!cols"] = [
      { wch: 12 }, { wch: 22 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, 
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, 
      { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, "Bookings");

    const todayBookings = bookings.filter((booking) => booking.booking_date?.split("T")[0] === todayStr);
    const todayRevenue = todaysAdvance + todaysBalance;
    const todayAdvance = todaysAdvance;
    const todayBalance = todaysBalance;
    const todayCash = todayBookings.reduce((sum, booking) => sum + Number(booking.cash_received || 0), 0);
    const todayUpi = todayBookings.reduce((sum, booking) => sum + Number(booking.upi_received || 0), 0);
    const todayCollection = todayCash + todayUpi;
    const todayMoneyInHand = todayAdvance + todayCollection;

    const todaySheet = XLSX.utils.aoa_to_sheet([
      ["TODAY'S COLLECTION"], [],
      ["Total Bookings", todayBookings.length],
      ["Total Revenue Expected (₹)", todayRevenue],
      ["Advance Collected (₹)", todayAdvance],
      ["Pending Balance (₹)", todayBalance],
      ["Cash Collected (₹)", todayCash],
      ["UPI Collected (₹)", todayUpi],
      ["Total Collected (Cash + UPI) (₹)", todayCollection],
      ["Actual Money In Hand (Adv + Cash + UPI) (₹)", todayMoneyInHand],
      ["Setlement Status", todayBalance > 0 ? `⚠️ ₹${todayBalance} DUE` : "✅ SETTLED"],
    ]);
    XLSX.utils.book_append_sheet(workbook, todaySheet, "Today");

    const monthlyCash = bookings.reduce((sum, booking) => sum + Number(booking.cash_received || 0), 0);
    const monthlyUpi = bookings.reduce((sum, booking) => sum + Number(booking.upi_received || 0), 0);
    const monthlyCollection = monthlyCash + monthlyUpi;
    const monthlyMoneyInHand = monthlyAdvance + monthlyCollection;

    const monthlySheet = XLSX.utils.aoa_to_sheet([
      ["MONTHLY COLLECTION"], [],
      ["Total Bookings", monthlyBookings],
      ["Total Revenue Expected (₹)", monthlyRevenue],
      ["Advance Collected (₹)", monthlyAdvance],
      ["Pending Balance (₹)", monthlyBalance],
      ["Cash Collected (₹)", monthlyCash],
      ["UPI Collected (₹)", monthlyUpi],
      ["Total Collected (Cash + UPI) (₹)", monthlyCollection],
      ["Actual Money In Hand (Adv + Cash + UPI) (₹)", monthlyMoneyInHand],
      ["Settlement Status", monthlyBalance > 0 ? `⚠️ ₹${monthlyBalance} DUE` : "✅ SETTLED"],
    ]);
    XLSX.utils.book_append_sheet(workbook, monthlySheet, "Monthly");

    const dailyStats: Record<string, any> = {};
    bookings.forEach(b => {
      const d = b.booking_date?.split("T")[0] || "Unknown";
      if (!dailyStats[d]) {
        dailyStats[d] = {
          "Date": d,
          "Total Bookings": 0,
          "Total Revenue (₹)": 0,
          "Advance Collected (₹)": 0,
          "Pending Balance (₹)": 0,
          "Cash Collected (₹)": 0,
          "UPI Collected (₹)": 0,
          "Total Collected (Cash+UPI) (₹)": 0,
          "Actual Money In Hand (Adv+Cash+UPI) (₹)": 0,
        };
      }
      const advance = b.advance_amount || 0;
      const cash = Number(b.cash_received) || 0;
      const upi = Number(b.upi_received) || 0;
      const balance = b.balance_amount || 0;

      dailyStats[d]["Total Bookings"] += 1;
      dailyStats[d]["Total Revenue (₹)"] += (b.total_amount || 0);
      dailyStats[d]["Advance Collected (₹)"] += advance;
      dailyStats[d]["Pending Balance (₹)"] += balance;
      dailyStats[d]["Cash Collected (₹)"] += cash;
      dailyStats[d]["UPI Collected (₹)"] += upi;
      dailyStats[d]["Total Collected (Cash+UPI) (₹)"] += (cash + upi);
      dailyStats[d]["Actual Money In Hand (Adv+Cash+UPI) (₹)"] += (advance + cash + upi);
    });

    const dailySummaryArray = Object.values(dailyStats).map((stat: any) => ({
      ...stat,
      "Settlement Status": stat["Pending Balance (₹)"] > 0 ? `⚠️ ₹${stat["Pending Balance (₹)"]} DUE` : `✅ SETTLED`
    })).sort((a: any, b: any) => a.Date.localeCompare(b.Date));
    const dailySheet = XLSX.utils.json_to_sheet(dailySummaryArray);
    
    dailySheet["!autofilter"] = { ref: `A1:J${1 + dailySummaryArray.length}` };
    dailySheet["!cols"] = [
      { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 22 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 28 }, { wch: 38 }, { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(workbook, dailySheet, "Daily Summary");

    const academySheet = XLSX.utils.json_to_sheet(academyWorksheetData);
    
    const totalColumns = 7 + uniqueMonths.length; 
    const endColumnChar = String.fromCharCode(64 + totalColumns); 
    
    academySheet["!autofilter"] = { ref: `A1:${endColumnChar}${1 + academyWorksheetData.length}` }; 
    academySheet["!cols"] = [
      { wch: 8 },
      { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 18 },
      ...uniqueMonths.map(() => ({ wch: 22 }))
    ];
    XLSX.utils.book_append_sheet(workbook, academySheet, "Football Coaching");

    XLSX.writeFile(workbook, `SMES_Master_Report_${todayStr}.xlsx`);
  };

  const handleLogout = () => {
    localStorage.removeItem("adminLoggedIn");
    localStorage.removeItem("adminLoginTime");
    router.push("/staff");
  };

  const savePayment = async () => {
    if (!selectedBooking) return;
    const balance = selectedBooking.balance_amount || 0;
    let cash = 0;
    let upi = 0;

    if (paymentType === "Full Cash") cash = balance;
    if (paymentType === "Full UPI") upi = balance;
    if (paymentType === "Cash + UPI") {
      cash = Number(cashAmount);
      upi = Number(upiAmount);
      if (cash + upi !== balance) { alert(`Cash + UPI must equal ₹${balance}`); return; }
    }

    const { error } = await supabase
      .from("bookings")
      .update({
        cash_received: cash,
        upi_received: upi,
        payment_method: paymentType,
        payment_completed: true,
        balance_amount: 0,
        payment_date: getTodayStr(), 
      })
      .eq("id", selectedBooking.id);
    if (error) { alert(error.message); return; }

    alert("✅ Payment Saved");
    setShowPaymentModal(false);
    setCashAmount("");
    setUpiAmount("");
    loadBookings();
  };

  const resetPayment = async (booking: any) => {
    const confirmed = confirm("Reset this payment?");
    if (!confirmed) return;
    const originalBalance = (booking.total_amount || 0) - (booking.advance_amount || 0);
    const { error = null } = await supabase
      .from("bookings")
      .update({
        cash_received: 0,
        upi_received: 0,
        payment_method: null,
        payment_completed: false,
        balance_amount: originalBalance,
        payment_date: null,
      })
      .eq("id", booking.id);
    if (error) { alert(error.message); return; }

    alert("✅ Payment Reset");
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

  // ⚙️ UPDATED SEARCH LOGIC: Filter by Email, Ref ID, Date and Exact Booking ID Preference
  const filteredBookings = bookings
    .filter((booking) => {
      // 1. Date Filter Logic
      if (filterDate && booking.booking_date?.split("T")[0] !== filterDate) {
        return false;
      }
      
      // 2. Text Search Logic
      const search = searchTerm.toLowerCase().trim();
      if (!search) return true;
      return (
        booking.customer_name?.toLowerCase().includes(search) ||
        booking.phone?.toLowerCase().includes(search) ||
        booking.email?.toLowerCase().includes(search) ||
        booking.booking_date?.toLowerCase().includes(search) ||
        booking.booking_reference?.toLowerCase().includes(search) ||
        booking.id?.toString().includes(search) 
      );
    })
    .sort((a, b) => {
      // Priority sorting: Exact ID match goes to the top
      const search = searchTerm.trim();
      if (!search) return 0;
      
      const aIsExactId = a.id?.toString() === search;
      const bIsExactId = b.id?.toString() === search;
      
      if (aIsExactId && !bIsExactId) return -1;
      if (!aIsExactId && bIsExactId) return 1;
      
      return 0; // Maintain natural time-based order otherwise
    });

  const statCards = useMemo(() => [
    { label: "Gross Orders", value: bookings.length, accent: "text-white", tag: "01" },
    { label: "Today Slots", value: todaySlots, accent: "text-lime-400", tag: "02" },
    { label: "Tomorrow Slots", value: tomorrowSlots, accent: "text-neutral-300", tag: "03" },
    { label: "Today Advance", value: `₹${todaysAdvance}`, accent: "text-emerald-400", tag: "04" },
    { label: "Today Balance", value: `₹${todaysBalance}`, accent: "text-red-400", tag: "05" },
    { label: "Cash Vault", value: `₹${todayCashCollection}`, accent: "text-amber-400", tag: "06" },
    { label: "UPI Nodes", value: `₹${todayUpiCollection}`, accent: "text-cyan-400", tag: "07" },
    { label: "Total Collected", value: `₹${todayTotalCollection}`, accent: "text-fuchsia-400", tag: "08" },
  ], [bookings.length, todaySlots, tomorrowSlots, todaysAdvance, todaysBalance, todayCashCollection, todayUpiCollection, todayTotalCollection]);

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
          {statCards.map((s) => (
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
            {/* ⚙️ Placeholder Updated */}
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
                setSlotDate(getTodayStr()); // Auto-set to today
                loadAvailableAdminSlots(getTodayStr()); // Auto-load today's time slots
              }}
            >
              ⚙️ Manage Slots
            </motion.button>

            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              className={`font-mono text-xs uppercase tracking-widest px-5 py-4 font-black transition-colors ${showCoachingPanel ? 'bg-lime-400 text-black' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
              onClick={() => {
                const nextState = !showCoachingPanel;
                setShowCoachingPanel(nextState);
                if (nextState) setAcademyTab("existing");
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

        {/* ---------- Football Coaching Panel ---------- */}
        <AnimatePresence>
          {showCoachingPanel && (
            <motion.div
              initial={{ opacity: 0, y: -12, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -12, height: 0 }}
              transition={{ duration: 0.35, ease: easeOut }}
              className="overflow-hidden mb-8"
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-5 sm:p-6 border border-neutral-900 bg-neutral-900/30 backdrop-blur">

                {/* Form Column */}
                <div className="lg:col-span-1 border border-neutral-900 bg-neutral-900/50 p-5 space-y-4 h-fit">
                  <div>
                    <span className="text-[11px] font-mono uppercase tracking-widest text-neutral-500 block mb-1">
                      A1 — Coaching Ledger
                    </span>
                    <h2 className="text-lg font-black uppercase text-white">Academy Actions</h2>
                  </div>

                  <LayoutGroup>
                    <div className="grid grid-cols-2 gap-2 p-1.5 border border-neutral-800 bg-neutral-950">
                      {[
                        { id: "existing", label: "🔄 Log Old Fee" },
                        { id: "new", label: "👶 Enroll" },
                      ].map((t) => (
                        <motion.button
                          key={t.id}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setAcademyTab(t.id as any)}
                          className={`relative py-2.5 text-[10px] font-mono uppercase tracking-widest transition-colors ${
                            academyTab === t.id ? "text-black font-black" : "text-neutral-500 hover:text-white"
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
                          <label className="text-[10px] font-mono uppercase text-neutral-400">Student Name</label>
                          <input
                            type="text"
                            placeholder="Enter player name"
                            value={adminNewStudentName}
                            onChange={(e) => setAdminNewStudentName(e.target.value)}
                            className="w-full p-3.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-xs font-medium transition-colors"
                          />
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
                            className="w-full p-3.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-xs font-mono font-medium transition-colors"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono uppercase text-neutral-400">Date of Birth</label>
                          <input
                            type="date"
                            value={adminNewStudentDOB}
                            onChange={(e) => setAdminNewStudentDOB(e.target.value)}
                            className="w-full p-3.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-xs font-medium transition-colors"
                            style={{ colorScheme: "dark" }}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono uppercase text-neutral-400">Email ID</label>
                          <input
                            type="email"
                            placeholder="example@email.com"
                            value={adminNewStudentEmail}
                            onChange={(e) => setAdminNewStudentEmail(e.target.value)}
                            className="w-full p-3.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-xs font-medium transition-colors"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono uppercase text-neutral-400">Payment Method</label>
                          <select
                            value={adminNewStudentMethod}
                            onChange={(e) => setAdminNewStudentMethod(e.target.value)}
                            className="w-full p-3.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-xs font-medium transition-colors"
                          >
                            <option value="UPI">UPI</option>
                            <option value="Cash">Cash</option>
                          </select>
                        </div>
                        <div className="p-3 bg-neutral-950 border border-neutral-800 text-xs font-mono font-black text-lime-400">
                          Fixed Fee Rate: ₹3,500
                        </div>
                        <motion.button
                          whileHover={{ y: -2, boxShadow: "0 10px 25px rgba(163,230,53,0.3)" }}
                          whileTap={{ scale: 0.97 }}
                          type="submit"
                          className="w-full bg-lime-400 hover:bg-lime-300 text-black font-mono font-black py-4 text-xs uppercase tracking-widest transition-colors"
                        >
                          Enroll & Mark Paid
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
                          <label className="text-[10px] font-mono uppercase text-neutral-400">Select Due Student</label>
                          <select
                            value={adminSelectedStudentId}
                            onChange={(e) => setAdminSelectedStudentId(e.target.value)}
                            className="w-full p-3.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-xs font-medium transition-colors"
                          >
                            <option value="">-- Select Due Student --</option>
                            {academyStudents.filter(s => s.payment_status !== "settled").map(s => (
                              <option key={s.id} value={s.id}>{s.name} ({s.phone})</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono uppercase text-neutral-400">Payment Method</label>
                          <select
                            value={adminExistingMethod}
                            onChange={(e) => setAdminExistingMethod(e.target.value)}
                            className="w-full p-3.5 bg-neutral-950 border border-neutral-800 focus:border-lime-400 outline-none text-xs font-medium transition-colors"
                          >
                            <option value="UPI">UPI</option>
                            <option value="Cash">Cash</option>
                          </select>
                        </div>
                        <div className="p-3 bg-neutral-950 border border-neutral-800 text-xs font-mono font-black text-lime-400">
                          Enforced Rate: ₹3,500
                        </div>
                        <motion.button
                          whileHover={{ y: -2, boxShadow: "0 10px 25px rgba(217,70,239,0.3)" }}
                          whileTap={{ scale: 0.97 }}
                          type="submit"
                          className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-mono font-black py-4 text-xs uppercase tracking-widest transition-colors"
                        >
                          Settle Selected Student
                        </motion.button>
                      </motion.form>
                    )}
                  </AnimatePresence>
                </div>

                {/* Roster Column */}
                <div className="lg:col-span-2 border border-neutral-900 bg-neutral-900/30 overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-neutral-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                      <span className="text-[11px] font-mono uppercase tracking-widest text-neutral-500 block">
                        A2 — Master Roster
                      </span>
                      <h2 className="text-sm font-black uppercase text-white mt-0.5">
                        Academy Coaching Roster · <span className="text-lime-400">{currentMonthLabel}</span>
                      </h2>
                    </div>
                    
                    <motion.button
                      whileHover={{ y: -2, boxShadow: "0 8px 25px rgba(239,68,68,0.25)" }}
                      whileTap={{ scale: 0.97 }}
                      onClick={sendEmailReminders}
                      disabled={isSendingEmails}
                      className={`bg-neutral-900 border border-neutral-800 text-red-400 hover:bg-red-950 hover:border-red-900 hover:text-white font-mono text-[10px] uppercase tracking-widest px-4 py-2.5 font-black transition-colors flex items-center gap-2 ${isSendingEmails ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      {isSendingEmails ? "⏳ Dispatching..." : "📧 Email Due Reminders"}
                    </motion.button>
                  </div>

                  {/* Mobile View */}
                  <div className="block sm:hidden max-h-[380px] overflow-y-auto p-3 space-y-3">
                    {academyStudents.map((s) => {
                      const isUnpaid = s.payment_status !== "settled";
                      return (
                        <motion.div
                          key={s.id}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`p-4 border transition-colors space-y-3 ${
                            isUnpaid ? 'bg-red-500/[0.06] border-red-500/20' : 'bg-neutral-950/60 border-neutral-800'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-black text-white">{s.name}</h4>
                              <p className="text-[10px] font-mono text-neutral-500 mt-0.5">
                                DOB: {s.dob ? new Date(s.dob).toLocaleDateString("en-GB") : "-"}
                              </p>
                            </div>
                            <button
                              onClick={() => deleteStudent(s.id, s.name)}
                              className="px-2.5 py-1 text-[10px] font-mono uppercase bg-neutral-900 hover:bg-red-950 border border-neutral-800 hover:border-red-900 text-red-400 hover:text-white transition-colors shrink-0"
                            >
                              🗑️ Delete
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[11px] bg-neutral-950/60 p-2.5 border border-neutral-900 font-mono">
                            <div>
                              <span className="block text-[9px] uppercase tracking-widest text-neutral-500 font-black mb-0.5">Contact</span>
                              <span className="text-neutral-300">{s.phone}</span>
                            </div>
                            <div className="truncate">
                              <span className="block text-[9px] uppercase tracking-widest text-neutral-500 font-black mb-0.5">Email</span>
                              <span className="text-neutral-300 truncate block">{s.email || "-"}</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-neutral-900">
                            <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest font-black">Month Fee</span>
                            {isUnpaid ? (
                              <motion.span
                                animate={{ opacity: [1, 0.55, 1] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                className="px-2.5 py-1 text-[10px] font-mono uppercase bg-red-500/15 border border-red-500/40 text-red-400 font-black"
                              >
                                ⚠️ Unpaid
                              </motion.span>
                            ) : (
                              <span className="px-2.5 py-1 text-[10px] font-mono uppercase bg-lime-400/10 border border-lime-400/30 text-lime-400 font-black">
                                ✅ Paid ({s.payment_method})
                              </span>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Desktop View */}
                  <div className="hidden sm:block overflow-x-auto max-h-[420px] overflow-y-auto">
                    <table className="w-full text-left border-collapse min-w-[520px]">
                      <thead>
                        <tr className="border-b border-neutral-900 text-[10px] font-mono uppercase tracking-widest text-neutral-500 bg-neutral-950/40 sticky top-0 backdrop-blur z-20">
                          <th className="p-4">Student Profile</th>
                          <th className="p-4">Contact Logs</th>
                          <th className="p-4 text-center">Status</th>
                        </tr>
                      </thead>
                      <motion.tbody
                        variants={stagger}
                        initial="hidden"
                        animate="show"
                        className="divide-y divide-neutral-900 text-xs font-medium"
                      >
                        {academyStudents.map((s) => {
                          const isUnpaid = s.payment_status !== "settled";
                          return (
                            <motion.tr
                              key={s.id}
                              variants={rowItem}
                              layout
                              className={`transition-colors ${isUnpaid ? 'bg-red-500/[0.04] hover:bg-red-500/[0.08]' : 'hover:bg-lime-400/[0.03]'}`}
                            >
                              <td className="p-4">
                                <div className="font-black text-white flex items-center gap-2">
                                  <span>{s.name}</span>
                                  <button
                                    onClick={() => deleteStudent(s.id, s.name)}
                                    className="px-2 py-0.5 text-[9px] font-mono uppercase bg-neutral-900 hover:bg-red-600 border border-neutral-800 hover:border-red-500 text-red-400 hover:text-white transition-colors"
                                  >
                                    🗑️ Delete
                                  </button>
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
                                {isUnpaid ? (
                                  <motion.span
                                    animate={{ opacity: [1, 0.55, 1] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                    className="px-2 py-0.5 text-[10px] font-mono uppercase bg-red-500/15 border border-red-500/40 text-red-400 font-black whitespace-nowrap"
                                  >
                                    ⚠️ Unpaid
                                  </motion.span>
                                ) : (
                                  <span className="px-2 py-0.5 text-[10px] font-mono uppercase bg-lime-400/10 border border-lime-400/30 text-lime-400 font-black whitespace-nowrap">
                                    ✅ Paid ({s.payment_method})
                                  </span>
                                )}
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

        {/* Results count */}
        <p className="mb-3 text-[11px] font-mono text-neutral-500 tracking-widest uppercase px-1">
          // Showing {filteredBookings.length} booking(s) active
        </p>

        {/* ---------- COMPACT BOOKINGS TABLE (Scrolls on mobile natively) ---------- */}
        <motion.section
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.05 }}
          className="border border-neutral-900 bg-neutral-900/30 backdrop-blur overflow-hidden"
        >
          {/* ⚙️ Header with Date Filter Button */}
          <div className="p-4 border-b border-neutral-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-neutral-500 block">
                01 — Bookings Matrix
              </span>
              <h2 className="text-base font-black uppercase text-white mt-0.5">
                Active Orders · <span className="text-lime-400">Live Feed</span>
              </h2>
            </div>
            
            {/* ⚙️ Interactive Date Filter */}
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
                        {/* 1. COMPACT COLUMN: Client, Booking ID & Reference */}
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

                        {/* 2. COMPACT COLUMN: Schedule & Time */}
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
                              {booking.duration_minutes || 60} mins
                            </span>
                          </div>
                        </td>

                        {/* 3. COMPACT COLUMN: Arena Details */}
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

                        {/* 4. COMPACT COLUMN: Financials */}
                        <td className="p-4 align-top">
                          <div className="flex flex-col gap-1 font-mono text-xs min-w-[120px] whitespace-nowrap">
                            <div className="flex justify-between">
                              <span className="text-neutral-500">Total:</span> 
                              <span className="text-neutral-200">₹{booking.total_amount}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-neutral-500">Adv:</span> 
                              <span className="text-emerald-400">₹{booking.advance_amount || 0}</span>
                            </div>
                            <div className="flex justify-between border-t border-neutral-800 pt-1 mt-0.5">
                              <span className="text-neutral-500">Due:</span> 
                              {booking.balance_amount > 0 ? (
                                <span className="text-red-400 font-black">₹{booking.balance_amount}</span>
                              ) : (
                                <span className="text-lime-400 font-black">₹0</span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 5. COMPACT COLUMN: Operations */}
                        <td className="p-4 align-top text-center">
                          <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                            {booking.balance_amount > 0 ? (
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

                            {/* ⚙️ MASTER ADMIN MANAGE BUTTON */}
                            <motion.button
                              whileHover={{ y: -1 }}
                              whileTap={{ scale: 0.96 }}
                              onClick={() => {
                                setSelectedManageBooking(booking);
                                setManageMode("options");
                                setExtendMinutes(30);

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
                      <td className="p-4 text-xs font-mono">{slot.duration_minutes} mins</td>
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

      {/* ---------- MANAGE BOOKING MODAL (INTEGRATED POP-UP) ---------- */}
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
              className="bg-neutral-950 border border-neutral-800 p-6 w-full max-w-md space-y-5 relative overflow-hidden"
            >
              <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-fuchsia-500/10 to-transparent pointer-events-none" />

              {/* Modal Header */}
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

              {/* Mode Switcher */}
              {manageMode === "options" ? (
                <div className="space-y-2.5 relative">
                  <div className="p-3 bg-neutral-900/80 border border-neutral-800 text-xs font-mono space-y-1">
                    <div className="flex justify-between text-neutral-400">
                      <span>Total Amount:</span>
                      <span className="text-white font-bold">₹{selectedManageBooking.total_amount}</span>
                    </div>
                    <div className="flex justify-between text-emerald-400 font-bold">
                      <span>Advance Paid:</span>
                      <span>₹{selectedManageBooking.advance_amount || 0}</span>
                    </div>
                  </div>

                  {/* Option 1: Cancel and Refund Advance */}
                  <motion.button
                    whileHover={{ scale: 1.01, borderColor: "rgba(239, 68, 68, 0.6)" }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleCancelWithRefund}
                    className="w-full text-left p-3.5 bg-neutral-900 border border-neutral-800 hover:bg-red-950/40 transition-colors group"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-red-400 group-hover:text-red-300">
                        ❌ Cancel & Refund Advance
                      </span>
                      <span className="text-xs font-mono text-emerald-400 font-black">
                        Refund: ₹{selectedManageBooking.advance_amount || 0}
                      </span>
                    </div>
                    <p className="text-[10px] text-neutral-500 mt-0.5 font-mono">
                      Cancels order completely & returns advance payment.
                    </p>
                  </motion.button>

                  {/* Option 2: Reschedule Time Slot */}
                  <motion.button
                    whileHover={{ scale: 1.01, borderColor: "rgba(163, 230, 53, 0.6)" }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setManageMode("reschedule")}
                    className="w-full text-left p-3.5 bg-neutral-900 border border-neutral-800 hover:bg-lime-950/30 transition-colors group"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-lime-400 group-hover:text-lime-300">
                        📅 Reschedule Time Slot
                      </span>
                      <span className="text-xs font-mono text-neutral-400">Change slot →</span>
                    </div>
                    <p className="text-[10px] text-neutral-500 mt-0.5 font-mono">
                      Shift this booking to a new time slot or date.
                    </p>
                  </motion.button>

                  {/* Option 3: Cancel Without Refund */}
                  <motion.button
                    whileHover={{ scale: 1.01, borderColor: "rgba(245, 158, 11, 0.6)" }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleCancelWithoutRefund}
                    className="w-full text-left p-3.5 bg-neutral-900 border border-neutral-800 hover:bg-amber-950/30 transition-colors group"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-amber-400 group-hover:text-amber-300">
                        ⛔ Cancel Without Refund
                      </span>
                      <span className="text-xs font-mono text-amber-400">Forfeit advance</span>
                    </div>
                    <p className="text-[10px] text-neutral-500 mt-0.5 font-mono">
                      Cancels order but retains advance deposit.
                    </p>
                  </motion.button>

                  {/* Option 4: Extend Slot (Check & Extend) */}
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
                </div>
              ) : manageMode === "reschedule" ? (
                /* Reschedule View */
                <div className="space-y-3 relative">
                  {/* Field 1: Date */}
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

                  {/* Fields 2 & 3: Court and Duration */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase text-neutral-400">Court</label>
                      <select
                        value={rescheduleCourt}
                        onChange={(e) => {
                          const newCourt = e.target.value;
                          setRescheduleCourt(newCourt);
                          if (rescheduleDate) loadRescheduleAvailableSlots(rescheduleDate, rescheduleDuration, newCourt);
                        }}
                        className="w-full p-3 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none text-xs font-mono transition-colors"
                      >
                        <option value="Full Court">Full Court</option>
                        <option value="Court 1">Court 1</option>
                        <option value="Court 2">Court 2</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase text-neutral-400">Duration</label>
                      <select
                        value={rescheduleDuration}
                        onChange={(e) => {
                          const newDur = Number(e.target.value);
                          setRescheduleDuration(newDur);
                          if (rescheduleDate) loadRescheduleAvailableSlots(rescheduleDate, newDur, rescheduleCourt);
                        }}
                        className="w-full p-3 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none text-xs font-mono transition-colors"
                      >
                        <option value={30}>30 mins</option>
                        <option value={60}>60 mins</option>
                        <option value={90}>90 mins</option>
                        <option value={120}>120 mins</option>
                      </select>
                    </div>
                  </div>

                  {/* Field 4: Time Slot */}
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

                  {/* Projected Reschedule Pricing Box */}
                  <div className="p-3 bg-lime-950/30 border border-lime-800/50 text-xs font-mono text-lime-400">
                    Calculated New Price Matrix:<br />
                    <span className="font-bold text-white text-sm">
                      Total: ₹{Math.round((selectedManageBooking.total_amount / (selectedManageBooking.duration_minutes || 60)) * rescheduleDuration)} | Pending Due: ₹{(selectedManageBooking.balance_amount || 0) + (Math.round((selectedManageBooking.total_amount / (selectedManageBooking.duration_minutes || 60)) * rescheduleDuration) - selectedManageBooking.total_amount)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <motion.button
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={handleRescheduleBooking}
                      className="w-full bg-lime-400 hover:bg-lime-300 text-black font-mono text-xs uppercase tracking-widest py-3 font-black transition-colors"
                    >
                      Confirm Reschedule
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
              ) : (
                /* Extend Slot View */
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
                      <span className="text-cyan-400 font-bold">{selectedManageBooking.duration_minutes || 60} mins</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase text-neutral-400">Extend Duration By</label>
                    <select
                      value={extendMinutes}
                      onChange={(e) => setExtendMinutes(Number(e.target.value))}
                      className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-cyan-400 outline-none text-sm font-mono font-medium transition-colors"
                    >
                      <option value={30}>+ 30 minutes</option>
                      <option value={60}>+ 60 minutes (1 hour)</option>
                      <option value={90}>+ 90 minutes (1.5 hours)</option>
                      <option value={120}>+ 120 minutes (2 hours)</option>
                    </select>
                  </div>

                  <div className="p-3 bg-cyan-950/30 border border-cyan-800/50 text-xs font-mono text-cyan-300">
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
                       + ₹{Math.round((selectedManageBooking.total_amount / (selectedManageBooking.duration_minutes || 60)) * Number(extendMinutes))}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <motion.button
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={checkAndExtendBooking}
                      className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-mono text-xs uppercase tracking-widest py-3 font-black transition-colors"
                    >
                      Check & Extend
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

              {/* Close Button */}
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
        {showPaymentModal && (
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
              className="bg-neutral-950 border border-neutral-800 p-6 w-full max-w-sm space-y-4 relative overflow-hidden"
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

                {paymentType === "Cash + UPI" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="grid grid-cols-2 gap-2 p-3 bg-neutral-900 border border-neutral-800"
                  >
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
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.9, y: 12, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 12, opacity: 0 }}
              transition={{ duration: 0.3, ease: easeOut }}
              className="bg-neutral-950 border border-neutral-800 p-6 w-full max-w-lg space-y-4 relative overflow-hidden my-8"
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
                    min={getTodayStr()} 
                    value={slotDate}
                    onChange={(e) => {
                      setSlotDate(e.target.value);
                      if (e.target.value) {
                        loadAvailableAdminSlots(e.target.value);
                        loadAvailableCourts(e.target.value, slotTime);
                      }
                    }}
                    style={{ colorScheme: "dark" }}
                    className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono uppercase text-neutral-400">Start Time</label>
                  <select
                    value={slotTime}
                    onChange={(e) => {
                      setSlotTime(e.target.value);
                      if (slotDate) loadAvailableCourts(slotDate, e.target.value);
                    }}
                    className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none text-sm font-mono font-medium transition-colors"
                  >
                    <option value="">-- Select Time --</option>
                    {availableAdminSlots.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {(slotReason === "TOURNAMENT" || slotReason === "MAINTENANCE") ? (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase text-neutral-400">End Time</label>
                    <select
                      value={slotEndTime}
                      onChange={(e) => setSlotEndTime(e.target.value)}
                      className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none text-sm font-mono font-medium transition-colors"
                    >
                      <option value="">-- Select End --</option>
                      {adminTimeSlots.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase text-neutral-400">Duration (mins)</label>
                    <select
                      value={slotDuration}
                      onChange={(e) => setSlotDuration(Number(e.target.value))}
                      className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none text-sm font-mono font-medium transition-colors"
                    >
                      <option value={30}>30 mins</option>
                      <option value={60}>60 mins</option>
                      <option value={90}>90 mins</option>
                      <option value={120}>120 mins</option>
                    </select>
                  </div>
                )}

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-[10px] font-mono uppercase text-neutral-400">Court</label>
                  <select
                    value={slotCourt}
                    onChange={(e) => setSlotCourt(e.target.value)}
                    className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors"
                  >
                    {availableCourts.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {slotReason === "OFFLINE BOOKING" && (
                  <>
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-[10px] font-mono uppercase text-neutral-400">Payment Method</label>
                      <select
                        value={offlinePaymentMethod}
                        onChange={(e) => setOfflinePaymentMethod(e.target.value)}
                        className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium transition-colors"
                      >
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Cash + UPI">Cash + UPI</option>
                      </select>
                    </div>

                    {offlinePaymentMethod === "Cash + UPI" ? (
                      <>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono uppercase text-neutral-400">Cash Amount</label>
                          <input
                            type="number"
                            placeholder="₹"
                            value={offlineCashAmount}
                            onChange={(e) => setOfflineCashAmount(e.target.value)}
                            className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none text-sm font-mono font-medium transition-colors"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono uppercase text-neutral-400">UPI Amount</label>
                          <input
                            type="number"
                            placeholder="₹"
                            value={offlineUpiAmount}
                            onChange={(e) => setOfflineUpiAmount(e.target.value)}
                            className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none text-sm font-mono font-medium transition-colors"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-[10px] font-mono uppercase text-neutral-400">Amount Received</label>
                        <input
                          type="number"
                          placeholder="₹"
                          value={offlineAmount}
                          onChange={(e) => setOfflineAmount(e.target.value)}
                          className="w-full p-3.5 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none text-sm font-mono font-medium transition-colors"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 relative">
                <motion.button
                  whileHover={{ y: -2, boxShadow: "0 12px 30px rgba(163,230,53,0.3)" }}
                  whileTap={{ scale: 0.97 }}
                  onClick={saveBlockedSlot}
                  className="w-full bg-lime-400 hover:bg-lime-300 text-black font-mono text-xs uppercase tracking-widest py-3.5 font-black transition-colors"
                >
                  Save Slot
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setShowManageSlots(false)}
                  className="w-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 font-mono text-xs uppercase tracking-widest py-3.5 font-black transition-colors"
                >
                  Cancel
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}