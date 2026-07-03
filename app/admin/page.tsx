"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function AdminPage() {
  const router = useRouter();

  const [bookings, setBookings] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
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

  // 🏆 Added Academy Coating Toggled State Parameters - Updated default view state to "existing"
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

  const FIXED_COACHING_FEE = 3500;
  const currentMonthYear = new Date().toISOString().slice(0, 7); // Format: YYYY-MM
  const currentMonthLabel = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

  // Global Time Conversion Helper
  const convertToMins = (t: string) => {
    if (!t) return 0;
    const [timePart, ampm] = t.split(" ");
    let [h, m] = timePart.split(":").map(Number);
    if (ampm?.toUpperCase() === "PM" && h !== 12) h += 12;
    if (ampm?.toUpperCase() === "AM" && h === 12) h = 0;
    return h * 60 + m;
  };

  // Helper to calculate and format a clear 12-hour time range (e.g., 4:00 pm to 5:30 pm)
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
  const adminTimeSlots = Array.from({ length: 48 }, (_, i) => {
    const hours = Math.floor(i / 2);
    const minutes = i % 2 === 0 ? "00" : "30";
    const date = new Date();
    date.setHours(hours);
    date.setMinutes(Number(minutes));

    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  });

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

    let courts = [
      "Full Court",
      "Court 1",
      "Court 2",
    ];
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

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
  };

  const today = formatDate(new Date());

  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);

  const tomorrow = formatDate(tomorrowDate);

  useEffect(() => {
    const loggedIn = localStorage.getItem("adminLoggedIn");

    if (loggedIn !== "true") {
      router.push("/"); 
      return;
    }

    loadBookings();
    loadAcademyData();

    const bookingsChannel = supabase
      .channel("bookings-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => { loadBookings(); })
      .subscribe();

    const blockedChannel = supabase
      .channel("blocked-slots-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "blocked_slots" }, () => { loadBookings(); })
      .subscribe();

    // Realtime Hooks for coaching sync components
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

  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeout);

      timeout = setTimeout(() => {
        localStorage.removeItem("adminLoggedIn");
        localStorage.removeItem("adminLoginTime");

        alert("Session Expired. Please authorize via the Staff Node on the Home Page.");
        router.push("/"); 
      }, 12 * 60 * 1000 * 60);
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
  }, [router]);

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

  const clearStudentFeeInline = async (student: any, method: string) => {
    if (student.payment_record_id) {
      await supabase
        .from("student_payments")
        .update({ status: "settled", amount_paid: FIXED_COACHING_FEE, payment_method: method, updated_at: new Date().toISOString() })
        .eq("id", student.payment_record_id);
    } else {
      await supabase
        .from("student_payments")
        .insert([{ student_id: student.id, month_year: currentMonthYear, status: "settled", amount_paid: FIXED_COACHING_FEE, payment_method: method }]);
    }
    alert("✅ Balance Ledger Cleared");
    loadAcademyData();
  };

  // 🗑️ Safely purges student profiles and links ledger logs across relational nodes
  const deleteStudent = async (studentId: string, studentName: string) => {
    const confirmDelete = window.confirm(
      `⚠️ CRITICAL WARNING:\n\nAre you sure you want to completely delete "${studentName}"?\n\nThis will permanently destroy this student's profile and delete their entire multi-month payment history from the master system. This action cannot be undone.`
    );
    if (!confirmDelete) return;

    try {
      // 1. Wipe out nested mapping records first to satisfy foreign key rules
      const { error: paymentError } = await supabase
        .from("student_payments")
        .delete()
        .eq("student_id", studentId);

      if (paymentError) throw paymentError;

      // 2. Clear out the main root profile
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
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .or(`booking_date.gte.${today},balance_amount.gt.0`)
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      console.log(error);
      return;
    }

    setBookings(data || []);
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const thisMonthBookings =
      data?.filter((booking) => {
        const d = new Date(booking.booking_date);
        return (
          d.getMonth() + 1 === currentMonth &&
          d.getFullYear() === currentYear
        );
      }) || [];

    setMonthlyBookings(thisMonthBookings.length);

    setMonthlyRevenue(
      thisMonthBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0)
    );
    setMonthlyAdvance(
      thisMonthBookings.reduce((sum, b) => sum + (b.advance_amount || 0), 0)
    );
    setMonthlyBalance(
      thisMonthBookings.reduce((sum, b) => sum + (b.balance_amount || 0), 0)
    );
    const { data: blockedData } = await supabase
      .from("blocked_slots")
      .select("*")
      .gte("booking_date", today)
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true });

    setBlockedSlots(blockedData || []);
    const todaysBookings =
      data?.filter((booking) => booking.booking_date?.split("T")[0] === today) || [];
    const tomorrowsBookings =
      data?.filter((booking) => booking.booking_date?.split("T")[0] === tomorrow) || [];

    setTodaySlots(todaysBookings.length);
    setTomorrowSlots(tomorrowsBookings.length);
    const cashCollectedToday = todaysBookings.reduce(
      (sum, booking) => sum + Number(booking.cash_received || 0),
      0
    );
    const upiCollectedToday = todaysBookings.reduce(
      (sum, booking) => sum + Number(booking.upi_received || 0),
      0
    );
    setTodayCashCollection(cashCollectedToday);
    setTodayUpiCollection(upiCollectedToday);
    setTodayTotalCollection(
      Number(cashCollectedToday) + Number(upiCollectedToday)
    );
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
          court1Available = false;
          court2Available = false;
        } else if (b.court_number === "Court 1") {
          court1Available = false;
        } else if (b.court_number === "Court 2") {
          court2Available = false;
        }
      });

      if (court1Available || court2Available) {
        availableTimes.push(slot);
      }
    });
    setAvailableAdminSlots(availableTimes);
  };

  const saveBlockedSlot = async () => {
    if (!slotDate || !slotTime) {
      alert("Please select date and time");
      return;
    }

    const { data: existingBookings } = await supabase
      .from("bookings")
      .select("*")
      .eq("booking_date", slotDate);
    const { data: existingBlocks } = await supabase
      .from("blocked_slots")
      .select("*")
      .eq("booking_date", slotDate);
    const selectedStart = convertToMins(slotTime);
    let selectedEnd = selectedStart + Number(slotDuration);
    if (slotReason === "TOURNAMENT" || slotReason === "MAINTENANCE") {
      if (!slotEndTime) {
        alert("Please select an End Time for the block");
        return;
      }
      selectedEnd = convertToMins(slotEndTime);
      if (selectedEnd <= selectedStart) {
        alert("End time must be after the launch time");
        return;
      }
    }

    const actualCalculatedDuration = selectedEnd - selectedStart;
    const allBusyItems = [...(existingBookings || []), ...(existingBlocks || [])];
    
    const isOverlapping = allBusyItems.some((item) => {
      const itemStart = convertToMins(item.start_time);
      const itemEnd = itemStart + (item.duration_minutes || 60);
      
      const overlaps = selectedStart < itemEnd && selectedEnd > itemStart;
      if (!overlaps) return false;

      if (slotCourt === "Full Court" || slotCourt === "Both Courts") return true;
      if (item.booking_type === "Full Court" || item.court_number === "Full Court" || 
          item.court_number === "Both Courts") return true;
      return item.court_number === slotCourt;
    });
    if (isOverlapping) {
      alert("⚠️ This court is already booked or blocked during the selected time period.");
      return;
    }

    if (slotReason === "OFFLINE BOOKING") {
      let totalAmount = 0;
      let cashReceived = 0;
      let upiReceived = 0;

      if (offlinePaymentMethod === "Cash") {
        totalAmount = Number(offlineAmount);
        cashReceived = totalAmount;
      }

      if (offlinePaymentMethod === "UPI") {
        totalAmount = Number(offlineAmount);
        upiReceived = totalAmount;
      }

      if (offlinePaymentMethod === "Cash + UPI") {
        cashReceived = Number(offlineCashAmount || 0);
        upiReceived = Number(offlineUpiAmount || 0);
        totalAmount = cashReceived + upiReceived;
      }

      if (totalAmount <= 0) {
        alert("Enter amount received");
        return;
      }

      const { error } = await supabase
        .from("bookings")
        .insert([
          {
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
          },
        ]);
      if (error) {
        alert(error.message);
        return;
      }

      alert("✅ Offline Booking Saved");

      await loadBookings();

      setSlotDate("");
      setSlotTime("");
      setSlotDuration(60);
      setSlotEndTime("");
      setSlotReason("OFFLINE BOOKING");
      setSlotCourt("Full Court");
      setOfflineAmount("");
      setOfflineCashAmount("");
      setOfflineUpiAmount("");
      setShowManageSlots(false);
      return;
    }

    const { error } = await supabase
      .from("blocked_slots")
      .insert([
        {
          booking_date: slotDate,
          start_time: slotTime,
          duration_minutes: actualCalculatedDuration,
          reason: slotReason,
          court_number: slotCourt,
        },
      ]);

    if (error) {
      alert(error.message);
      return;
    }

    alert("✅ Field Block Saved Successfully");

    await loadBookings();

    if (slotDate) {
      loadAvailableAdminSlots(slotDate);
    }

    setSlotDate("");
    setSlotTime("");
    setSlotEndTime("");
    setSlotDuration(60);
    setSlotReason("OFFLINE BOOKING");
    setSlotCourt("Full Court");
    setShowManageSlots(false);
  };

  const deleteBooking = async (id: number) => {
    const confirmed = confirm("Cancel this booking?");
    if (!confirmed) return;
    const { error } = await supabase
      .from("bookings")
      .delete()
      .eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }

    loadBookings();
  };

  const todaysAdvance = bookings
    .filter((booking) => booking.created_at?.split("T")[0] === today)
    .reduce((sum, booking) => sum + (booking.advance_amount || 0), 0);
  const todaysBalance = bookings
    .filter((booking) => booking.booking_date?.split("T")[0] === today)
    .reduce((sum, booking) => sum + (booking.balance_amount || 0), 0);

  // 🚀 Fixed pre-render build failure via dynamic package loading architecture
  const exportToExcel = async () => {
    const XLSX = await import("xlsx"); // 👈 Inline dynamic loader avoids global SSR compilation failures

    const exportData = bookings.map((booking) => ({
      Name: booking.customer_name,
      Phone: booking.phone,
      Date: booking.booking_date?.split("T")[0],
      Time: booking.start_time,
      Duration: booking.duration_minutes || 60,
      Sport: booking.sport,
      Type: booking.booking_type,
      Court: booking.court_number || "-",
      Total: booking.total_amount,
      Advance: booking.advance_amount,
      Balance: booking.balance_amount,
      Status: booking.payment_status,
      Payment_Method: booking.payment_method || "-",
      Cash_Received: booking.cash_received || 0,
      UPI_Received: booking.upi_received || 0,
      Payment_Status: booking.payment_completed ? "Paid" : "Pending",
    }));

    const currentMonthYear = new Date().toISOString().slice(0, 7);
    const currentMonthNum = new Date().getMonth();
    const currentYearNum = new Date().getFullYear();
    const { data: dbStudents } = await supabase.from("students").select(`*, student_payments(*)`).order("name", { ascending: true });
    
    // Extract every unique payment month available in database across all system history
    const uniqueMonths = Array.from(
      new Set([
        ...((dbStudents || []).flatMap((s: any) => (s.student_payments || []).map((p: any) => p.month_year))),
        currentMonthYear
      ])
    ).sort();

    // Readable label converter (e.g., "2026-07" -> "July 2026")
    const formatMonthLabel = (my: string) => {
      const [year, month] = my.split("-");
      const date = new Date(Number(year), Number(month) - 1, 1);
      return date.toLocaleString("en-US", { month: "long", year: "numeric" });
    };

    const academyWorksheetData = (dbStudents || []).map((s: any) => {
      const joinDate = new Date(s.created_at);
      const isNew = joinDate.getMonth() === currentMonthNum && joinDate.getFullYear() === currentYearNum;

      const row: any = {
        "Student Name": s.name + (isNew ? " (NEW)" : ""),
        "Phone Number": s.phone,
        "Date of Birth": s.dob ? new Date(s.dob).toLocaleDateString("en-GB") : "-",
        "Email ID": s.email || "-",
        "Monthly Fee (₹)": s.monthly_fee,
        "Type": isNew ? "NEW REGISTRATION" : "EXISTING"
      };

      // Append historical dynamic month status tracks requested by the administration desk
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
    const todayStr = new Date().toISOString().split("T")[0];
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
      [],
      [],
    ]);
    XLSX.utils.sheet_add_json(worksheet, exportData, { origin: "A14" });
    worksheet["!cols"] = [
      { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 15 },
      { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 },
      { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
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
      ["TODAY'S COLLECTION"],
      [],
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
      ["MONTHLY COLLECTION"],
      [],
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
    dailySheet["!cols"] = [
      { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 22 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 28 }, { wch: 38 }, { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(workbook, dailySheet, "Daily Summary");

    const academySheet = XLSX.utils.json_to_sheet(academyWorksheetData);
    academySheet["!cols"] = [
      { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 18 },
      ...uniqueMonths.map(() => ({ wch: 22 }))
    ];
    XLSX.utils.book_append_sheet(workbook, academySheet, "Football Coaching");

    XLSX.writeFile(workbook, `SMES_Master_Report_${todayStr}.xlsx`);
  };

  const handleLogout = () => {
    localStorage.removeItem("adminLoggedIn");
    localStorage.removeItem("adminLoginTime");
    router.push("/"); 
  };

  const savePayment = async () => {
    if (!selectedBooking) return;

    const balance = selectedBooking.balance_amount || 0;
    let cash = 0;
    let upi = 0;

    if (paymentType === "Full Cash") {
      cash = balance;
    }

    if (paymentType === "Full UPI") {
      upi = balance;
    }

    if (paymentType === "Cash + UPI") {
      cash = Number(cashAmount);
      upi = Number(upiAmount);

      if (cash + upi !== balance) {
        alert(`Cash + UPI must equal ₹${balance}`);
        return;
      }
    }

    const { error } = await supabase
      .from("bookings")
      .update({
        cash_received: cash,
        upi_received: upi,
        payment_method: paymentType,
        payment_completed: true,
        balance_amount: 0,
      })
      .eq("id", selectedBooking.id);
    if (error) {
      alert(error.message);
      return;
    }

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
      })
      .eq("id", booking.id);
    if (error) {
      alert(error.message);
      return;
    }

    alert("✅ Payment Reset");
    loadBookings();
  };

  const deleteBlockedSlot = async (id: number) => {
    const confirmed = confirm("Delete this blocked slot?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("blocked_slots")
      .delete()
      .eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }

    alert("✅ Blocked slot deleted");
    loadBookings();
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-lime-400 selection:text-slate-950 p-4 sm:p-6 md:p-8 relative overflow-x-hidden">
      
      <div className="absolute top-0 inset-x-0 h-48 bg-gradient-to-b from-lime-500/10 via-transparent to-transparent pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 mb-8 border-b border-white/10 z-10">
        <div className="text-center sm:text-left">
          <span className="text-[10px] font-mono uppercase tracking-widest text-lime-400">// Control Center Tower</span>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight uppercase italic text-white mt-1">
            SMES Admin Panel
          </h1>
        </div>

        <button
          onClick={handleLogout}
          className="w-full sm:w-auto bg-neutral-900 hover:bg-red-950 border border-neutral-800 hover:border-red-900 text-slate-300 hover:text-white px-5 py-3 rounded-xl font-mono text-xs uppercase tracking-wider transition-all min-h-[48px] flex items-center justify-center gap-2"
        >
          🚪 End Session
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3 sm:gap-4 mb-8 relative z-10">
        <div className="bg-slate-900/60 border border-white/5 p-4 rounded-xl flex flex-col justify-between min-h-[100px]">
          <h3 className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Gross Orders</h3>
          <p className="text-2xl font-black text-white mt-2">{bookings.length}</p>
        </div>

        <div className="bg-slate-900/60 border border-white/5 p-4 rounded-xl flex flex-col justify-between min-h-[100px]">
          <h3 className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Today Slots</h3>
          <p className="text-2xl font-black text-lime-400 mt-2">{todaySlots}</p>
        </div>

        <div className="bg-slate-900/60 border border-white/5 p-4 rounded-xl flex flex-col justify-between min-h-[100px]">
          <h3 className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Tomorrow Slots</h3>
          <p className="text-2xl font-black text-slate-300 mt-2">{tomorrowSlots}</p>
        </div>

        <div className="bg-slate-900/60 border border-white/5 p-4 rounded-xl flex flex-col justify-between min-h-[100px]">
          <h3 className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Today Advance</h3>
          <p className="text-2xl font-black text-emerald-400 mt-2">₹{todaysAdvance}</p>
        </div>

        <div className="bg-slate-900/60 border border-white/5 p-4 rounded-xl flex flex-col justify-between min-h-[100px]">
          <h3 className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Today Balance</h3>
          <p className="text-2xl font-black text-red-400 mt-2">₹{todaysBalance}</p>
        </div>

        <div className="bg-slate-900/60 border border-white/5 p-4 rounded-xl flex flex-col justify-between min-h-[100px]">
          <h3 className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Cash Vault</h3>
          <p className="text-2xl font-black text-amber-400 mt-2">₹{todayCashCollection}</p>
        </div>

        <div className="bg-slate-900/60 border border-white/5 p-4 rounded-xl flex flex-col justify-between min-h-[100px]">
          <h3 className="text-[10px] font-mono uppercase tracking-wider text-slate-400">UPI Nodes</h3>
          <p className="text-2xl font-black text-cyan-400 mt-2">₹{todayUpiCollection}</p>
        </div>

        <div className="bg-slate-900/60 border border-white/5 p-4 rounded-xl flex flex-col justify-between min-h-[100px] col-span-2 sm:col-span-1">
          <h3 className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Total Collected</h3>
          <p className="text-2xl font-black text-purple-400 mt-2">₹{todayTotalCollection}</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-stretch justify-between gap-4 mb-6 relative z-10">
        <div className="w-full md:w-96 relative">
          <input
            type="text"
            placeholder="🔍 Filter by name, phone or date..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-4 pl-10 rounded-xl bg-slate-900 text-white border border-white/5 focus:border-lime-400 outline-none placeholder:text-slate-600 text-base md:text-sm min-h-[52px]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 md:flex md:items-center">
          <button
            className="bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs uppercase tracking-wider px-5 py-4 rounded-xl transition-all font-bold min-h-[52px]"
            onClick={() => setShowManageSlots(true)}
          >
            ⚙️ Manage Slots
          </button>

          {/* ⚽ ACADEMY PANEL TOGGLE CONTROL KEY - Enforces default Tab switch to 'existing' on launch */}
          <button
            className={`font-mono text-xs uppercase tracking-wider px-5 py-4 rounded-xl transition-all font-bold min-h-[52px] ${showCoachingPanel ? 'bg-lime-400 text-slate-950 font-black' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
            onClick={() => {
              const nextState = !showCoachingPanel;
              setShowCoachingPanel(nextState);
              if (nextState) setAcademyTab("existing");
            }}
          >
            ⚽ Football Coaching
          </button>

          <button
            onClick={exportToExcel}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs uppercase tracking-wider px-5 py-4 rounded-xl transition-all font-bold min-h-[52px]"
          >
            📊 Export Excel
          </button>
        </div>
      </div>

      {/* 🏆 Expanded Football Coaching Workspace Panel */}
      {showCoachingPanel && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-4 mb-8 p-4 sm:p-6 bg-slate-900/40 border border-white/10 rounded-2xl relative z-10 backdrop-blur-xl transition-all">
          <div className="lg:col-span-1 bg-slate-900/60 border border-white/5 p-5 rounded-xl space-y-4 h-fit">
            <div className="flex gap-2 border-b border-white/5 pb-3">
              <button 
                onClick={() => setAcademyTab("existing")} 
                className={`px-3 py-1.5 text-[11px] font-mono uppercase rounded transition-all ${academyTab === "existing" ? "bg-lime-400 text-slate-950 font-black" : "bg-slate-950 text-slate-400"}`}
              >
                🔄 Log Old Fee
              </button>
              <button 
                onClick={() => setAcademyTab("new")} 
                className={`px-3 py-1.5 text-[11px] font-mono uppercase rounded transition-all ${academyTab === "new" ? "bg-lime-400 text-slate-950 font-black" : "bg-slate-950 text-slate-400"}`}
              >
                👶 Enroll Student
              </button>
            </div>

            {academyTab === "new" ? (
              <form onSubmit={handleAdminEnrollStudent} className="space-y-3">
                <input type="text" placeholder="Student Name" value={adminNewStudentName} onChange={(e) => setAdminNewStudentName(e.target.value)} className="w-full p-3.5 bg-slate-950 rounded-xl border border-white/5 text-xs text-white outline-none focus:border-lime-400 font-medium" />
                <input 
                  type="text" 
                  placeholder="Phone Number (10 Digits)" 
                  value={adminNewStudentPhone} 
                  onChange={(e) => {
                    const numericValue = e.target.value.replace(/\D/g, "");
                    if (numericValue.length <= 10) setAdminNewStudentPhone(numericValue);
                  }} 
                  maxLength={10} 
                  className="w-full p-3.5 bg-slate-950 rounded-xl border border-white/5 text-xs text-white outline-none focus:border-lime-400 font-mono font-medium" 
                />
                
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Date of Birth</label>
                  <input type="date" value={adminNewStudentDOB} onChange={(e) => setAdminNewStudentDOB(e.target.value)} className="w-full p-3.5 bg-slate-950 rounded-xl border border-white/5 text-xs text-white outline-none focus:border-lime-400 font-medium" style={{ colorScheme: "dark" }} />
                </div>
                
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Email ID</label>
                  <input type="email" placeholder="example@email.com" value={adminNewStudentEmail} onChange={(e) => setAdminNewStudentEmail(e.target.value)} className="w-full p-3.5 bg-slate-950 rounded-xl border border-white/5 text-xs text-white outline-none focus:border-lime-400 font-medium" />
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Payment Method</label>
                  <select value={adminNewStudentMethod} onChange={(e) => setAdminNewStudentMethod(e.target.value)} className="w-full p-3.5 bg-slate-950 rounded-xl border border-white/5 text-xs text-slate-300 outline-none focus:border-lime-400 font-medium">
                    <option value="UPI">UPI</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-white/5 text-xs font-mono font-bold text-lime-400">Fixed Fee Rate: ₹3,500</div>
                <button type="submit" className="w-full bg-lime-400 text-slate-950 font-mono font-black text-xs py-3.5 rounded-xl uppercase tracking-wider shadow-md hover:bg-lime-300 transition-all">Enroll & Mark Paid</button>
              </form>
            ) : (
              <form onSubmit={handleAdminOldPayment} className="space-y-3">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Select Due Student</label>
                  <select value={adminSelectedStudentId} onChange={(e) => setAdminSelectedStudentId(e.target.value)} className="w-full p-3.5 bg-slate-950 rounded-xl border border-white/5 text-xs text-slate-200 outline-none focus:border-lime-400 font-medium">
                    <option value="">-- Select Due Student --</option>
                    {academyStudents.filter(s => s.payment_status !== "settled").map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.phone})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Payment Method</label>
                  <select value={adminExistingMethod} onChange={(e) => setAdminExistingMethod(e.target.value)} className="w-full p-3.5 bg-slate-950 rounded-xl border border-white/5 text-xs text-slate-300 outline-none focus:border-lime-400 font-medium">
                    <option value="UPI">UPI</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-white/5 text-xs font-mono font-bold text-lime-400">Enforced Rate: ₹3,500</div>
                <button type="submit" className="w-full bg-purple-600 text-white font-mono font-black text-xs py-3.5 rounded-xl uppercase tracking-wider shadow-md hover:bg-purple-500 transition-all">Settle Selected Student</button>
              </form>
            )}
          </div>

          {/* 🛠️ MOBILE RESPONSIVE MASTER ACADEMY ROSTER WORKSPACE GRID */}
          <div className="lg:col-span-2 bg-slate-900/20 border border-white/10 rounded-xl overflow-hidden shadow-inner flex flex-col">
            <div className="p-4 bg-slate-900/80 border-b border-white/10">
              <h2 className="text-sm font-black uppercase text-white tracking-wide">🏆 Master Academy Coaching Roster — {currentMonthLabel}</h2>
            </div>

            {/* 📱 Mobile Layout Grid Container (Hidden on tablet/desktop viewports) */}
            <div className="block sm:hidden max-h-[380px] overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-white/10">
              {academyStudents.map((s) => {
                const isUnpaid = s.payment_status !== "settled";
                return (
                  <div 
                    key={s.id} 
                    className={`p-4 rounded-xl border transition-all space-y-3.5 ${
                      isUnpaid 
                        ? 'bg-red-950/20 border-red-500/20 shadow-lg shadow-red-950/10' 
                        : 'bg-slate-900/50 border-white/5'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <h4 className="text-sm font-bold text-white tracking-tight">{s.name}</h4>
                        <p className="text-[10px] font-mono text-slate-400">DOB: {s.dob ? new Date(s.dob).toLocaleDateString("en-GB") : "-"}</p>
                      </div>
                      <button
                        onClick={() => deleteStudent(s.id, s.name)}
                        className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider bg-red-950/60 hover:bg-red-600 border border-red-500/30 hover:border-red-500 text-red-400 hover:text-white rounded-md transition-all duration-150 shrink-0"
                      >
                        🗑️ Delete
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-950/40 p-2.5 rounded-lg border border-white/5 font-mono">
                      <div>
                        <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Contact</span>
                        <span className="text-slate-300">{s.phone}</span>
                      </div>
                      <div className="truncate">
                        <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">Email</span>
                        <span className="text-slate-300 truncate block" title={s.email}>{s.email || "-"}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-white/5">
                      <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-bold">Month Fee</span>
                      <div className="flex items-center whitespace-nowrap">
                        {isUnpaid ? (
                          <span className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider bg-red-500/20 border border-red-500/40 text-red-400 font-bold rounded-md animate-pulse whitespace-nowrap">
                            ⚠️ Unpaid
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-md font-bold whitespace-nowrap">
                            ✅ Paid ({s.payment_method})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 🖥️ Traditional Desktop View Matrix (Hidden on standard mobile viewports) */}
            <div className="hidden sm:block overflow-x-auto max-h-[350px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] font-mono uppercase tracking-widest text-slate-400 bg-slate-950/40 sticky top-0 backdrop-blur z-20">
                    <th className="p-4">Student Profile</th>
                    <th className="p-4">Contact Detail Logs</th>
                    <th className="p-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs font-medium">
                  {academyStudents.map((s) => {
                    const isUnpaid = s.payment_status !== "settled";
                    return (
                      <tr key={s.id} className={`transition-colors ${isUnpaid ? 'bg-red-500/[0.04] hover:bg-red-500/[0.08]' : 'hover:bg-white/[0.01]'}`}>
                        <td className="p-4">
                          <div className="font-bold text-white flex items-center gap-2">
                            <span>{s.name}</span>
                            <button
                              onClick={() => deleteStudent(s.id, s.name)}
                              className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider bg-red-950/40 hover:bg-red-600 border border-red-500/20 hover:border-red-500 text-red-400 hover:text-white rounded transition-all duration-150 shrink-0"
                            >
                              🗑️ Delete
                            </button>
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">DOB: {s.dob ? new Date(s.dob).toLocaleDateString("en-GB") : "-"}</div>
                        </td>
                        <td className="p-4 space-y-0.5">
                          <div className="font-mono text-slate-300">{s.phone}</div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[180px]">{s.email || "-"}</div>
                        </td>
                        <td className="p-4 text-center whitespace-nowrap">
                          {isUnpaid ? (
                            <span className="px-2 py-0.5 text-[10px] font-mono uppercase bg-red-500/20 border border-red-500/40 text-red-400 font-bold rounded animate-pulse whitespace-nowrap">⚠️ Unpaid</span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-mono uppercase bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded whitespace-nowrap">✅ Paid ({s.payment_method})</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <p className="mb-3 text-xs font-mono text-slate-400 tracking-wide uppercase px-1">
        Showing {
          bookings.filter((booking) => {
            const search = searchTerm.toLowerCase();
            return (
              booking.customer_name?.toLowerCase().includes(search) ||
              booking.phone?.toLowerCase().includes(search) ||
              booking.booking_date?.toLowerCase().includes(search)
            );
          }).length
        } booking(s) active
      </p>

      {/* 🛠️ HORIZONTAL SCROLLABLE MASTER ROSTER CONTAINER */}
      <div className="bg-slate-900/40 border border-white/10 rounded-2xl overflow-hidden">
        {/* Card Header matching 1000130856.jpg */}
        <div className="p-4 bg-slate-900/80 border-b border-white/10">
          <h2 className="text-base font-black uppercase text-white">
            🏆 Master Academy Coaching Roster — <span className="text-emerald-400">{currentMonthLabel}</span>
          </h2>
        </div>

        {/* Horizontal Scroll Wrapper matching 1000130857.jpg */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-[10px] font-mono uppercase tracking-widest text-slate-400 bg-slate-950/20">
                <th className="p-4">Student Info</th>
                <th className="p-4">Contact Details</th>
                <th className="p-4">Academy Fee</th>
                <th className="p-4 text-center">Payment Status</th>
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm font-medium">
              {/* 💸 FIXED: Patched from 'students.map' to target page context state hooks */}
              {academyStudents.map((student) => {
                const joinDate = new Date(student.created_at);
                const isNew = joinDate.getMonth() === new Date().getMonth() && joinDate.getFullYear() === new Date().getFullYear();
                const isUnpaid = student.payment_status !== "settled";
                
                return (
                  <tr key={student.id} className={`transition-colors ${isUnpaid ? 'bg-red-500/[0.08] hover:bg-red-500/[0.12]' : 'hover:bg-white/[0.01]'}`}>
                    
                    {/* Column 1: Student Name & DOB */}
                    <td className="p-4">
                      <div className={`font-bold flex items-center gap-2 ${isUnpaid ? 'text-red-300' : 'text-white'}`}>
                        {student.name}
                        {isNew && (
                          <span className="px-2 py-0.5 rounded text-[9px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 tracking-wider font-black uppercase">
                            New
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        DOB: {student.dob ? new Date(student.dob).toLocaleDateString("en-GB") : "-"}
                      </div>
                    </td>

                    {/* Column 2: Contact & Email Details */}
                    <td className="p-4 space-y-0.5">
                      <div className="font-mono text-slate-300 text-xs">{student.phone}</div>
                      <div className="text-xs text-slate-400 truncate max-w-[180px]">{student.email || "-"}</div>
                    </td>

                    {/* Column 3: Fixed Fee Display */}
                    <td className="p-4 font-mono text-white">
                      ₹{student.monthly_fee || FIXED_COACHING_FEE}
                    </td>

                    {/* Column 4: Payment Badges preserving cash/UPI methods from 1000130856.jpg */}
                    <td className="p-4 text-center">
                      {student.payment_status === "settled" ? (
                        <span className="px-2 py-1 text-[10px] font-mono uppercase bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded whitespace-nowrap inline-flex items-center gap-1 justify-center">
                          ✅ Paid ({student.payment_method || "UPI"})
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-[10px] font-mono uppercase bg-red-500/20 border border-red-500/40 text-red-400 rounded font-black animate-pulse whitespace-nowrap inline-flex items-center gap-1 justify-center">
                          ⚠️ Unpaid
                        </span>
                      )}
                    </td>

                    {/* Column 5: Clean Row Deletion Action */}
                    <td className="p-4 text-center">
                      <button
                        onClick={() => deleteStudent(student.id, student.name)}
                        className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider bg-red-950/40 hover:bg-red-600 border border-red-500/30 hover:border-red-500 text-red-400 hover:text-white rounded-md transition-all duration-200 whitespace-nowrap"
                      >
                        🗑️ Delete
                      </button>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-slate-900/40 border border-white/10 rounded-2xl overflow-hidden shadow-2xl mt-8 relative z-10 backdrop-blur-xl">
        <div className="p-4 bg-slate-900/80 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-black uppercase tracking-wide text-white">
            🚫 Excluded Field Blocks
          </h2>
        </div>

        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-white/10">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-slate-955/40 text-[10px] font-mono uppercase tracking-widest text-slate-400">
                <th className="p-4 font-bold">Target Date</th>
                <th className="p-4 font-bold">Time Block Range</th>
                <th className="p-4 font-bold">Duration</th>
                <th className="p-4 font-bold">Court Section</th>
                <th className="p-4 font-bold">Block Reason</th>
                <th className="p-4 font-bold text-center">Operations</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/5 text-sm font-medium text-slate-300">
              {blockedSlots.map((slot) => (
                <tr key={slot.id} className="hover:bg-white/[0.01] transition-colors">
                  <td className="p-4 font-mono text-xs text-slate-200">
                    {new Date(slot.booking_date).toLocaleDateString("en-GB")}
                  </td>

                  <td className="p-4 font-mono text-xs text-white font-bold whitespace-nowrap">
                    {getTimeRangeLabel(slot.start_time, slot.duration_minutes || 60)}
                  </td>

                  <td className="p-4 text-xs font-mono">{slot.duration_minutes} mins</td>

                  <td className="p-4 font-mono text-xs font-bold text-cyan-400">
                    {slot.court_number}
                  </td>

                  <td className="p-4 font-mono text-xs text-slate-400 uppercase">
                    {slot.reason}
                  </td>

                  <td className="p-4 text-center whitespace-nowrap">
                    <button
                      onClick={() => deleteBlockedSlot(slot.id)}
                      className="bg-neutral-800 hover:bg-red-950 border border-neutral-700 hover:border-red-900 text-red-400 hover:text-white text-xs font-mono uppercase px-3 py-1.5 transition-all"
                    >
                      🗑️ Release
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showPaymentModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
          <div className="bg-slate-900 border border-white/10 p-5 sm:p-6 rounded-2xl w-full max-w-sm shadow-2xl space-y-4">
            <div>
              <h2 className="text-xl font-black uppercase tracking-wide text-white">
                💰 Balance Clearing
              </h2>
              <p className="text-slate-400 text-xs mt-0.5">Collect the remaining match dues directly below.</p>
            </div>

            <div className="p-4 bg-slate-950 border border-white/5 rounded-xl flex justify-between items-center">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Outstanding Balance</span>
              <span className="text-lg font-black text-red-400">₹{selectedBooking?.balance_amount || 0}</span>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Payment Route</label>
                <div className="relative">
                  <select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value)}
                    className="w-full p-3.5 rounded-xl bg-slate-950 text-white border border-white/5 focus:border-lime-400 outline-none appearance-none text-base md:text-sm font-medium"
                  >
                    <option value="Full Cash">Full Cash</option>
                    <option value="Full UPI">Full UPI</option>
                    <option value="Cash + UPI">Cash + UPI</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 text-xs">▼</div>
                </div>
              </div>

              {paymentType === "Cash + UPI" && (
                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-950 border border-white/5 rounded-xl">
                  <input
                    type="number"
                    placeholder="Cash Amount"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    className="w-full p-3 rounded-lg bg-slate-900 text-white border border-white/5 focus:border-lime-400 outline-none text-base md:text-sm font-medium"
                  />
                  <input
                    type="number"
                    placeholder="UPI Amount"
                    value={upiAmount}
                    onChange={(e) => setUpiAmount(e.target.value)}
                    className="w-full p-3 rounded-lg bg-slate-900 text-white border border-white/5 focus:border-lime-400 outline-none text-base md:text-sm font-medium"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={savePayment}
                className="w-full bg-lime-400 hover:bg-lime-300 text-slate-950 font-mono text-xs uppercase tracking-wider py-3 font-black transition-all min-h-[44px]"
              >
                Save Payment
              </button>
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setSelectedBooking(null);
                }}
                className="w-full bg-neutral-800 hover:bg-neutral-700 text-slate-300 font-mono text-xs uppercase tracking-wider py-3 transition-all min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}