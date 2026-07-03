"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function SubAdminPage() {
  const router = useRouter();

  const [bookings, setBookings] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [blockedSlots, setBlockedSlots] = useState<any[]>([]);
  const [todaySlots, setTodaySlots] = useState(0);
  const [tomorrowSlots, setTomorrowSlots] = useState(0);
  const [todayCashCollection, setTodayCashCollection] = useState(0);
  const [todayUpiCollection, setTodayUpiCollection] = useState(0);
  const [todayTotalCollection, setTodayTotalCollection] = useState(0);
  const [showManageSlots, setShowManageSlots] = useState(false);

  // ⚽ Synchronized Academy Coaching Parameters from Admin Panel
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
  
  const [slotTime, setSlotTime] = useState("");
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

  const [availableAdminSlots, setAvailableAdminSlots] = useState<string[]>([]);
  const [slotDuration, setSlotDuration] = useState(60);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);

  const [paymentType, setPaymentType] = useState("Full Cash");
  const [cashAmount, setCashAmount] = useState("");
  const [upiAmount, setUpiAmount] = useState("");

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  };

  const today = formatDate(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = formatDate(tomorrowDate);

  useEffect(() => {
    const loggedIn = localStorage.getItem("subadminLoggedIn");
    if (loggedIn !== "true") {
      router.push("/"); 
      return;
    }

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
  }, [router]);

  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeout);

      timeout = setTimeout(() => {
        localStorage.removeItem("subadminLoggedIn");
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

    const todaysBookings = data?.filter((booking) => booking.booking_date?.split("T")[0] === today) || [];
    const tomorrowsBookings = data?.filter((booking) => booking.booking_date?.split("T")[0] === tomorrow) || [];

    setTodaySlots(todaysBookings.length);
    setTomorrowSlots(tomorrowsBookings.length);

    const cashCollectedToday = todaysBookings.reduce((sum, booking) => sum + Number(booking.cash_received || 0), 0);
    const upiCollectedToday = todaysBookings.reduce((sum, booking) => sum + Number(booking.upi_received || 0), 0);

    setTodayCashCollection(cashCollectedToday);
    setTodayUpiCollection(upiCollectedToday);
    setTodayTotalCollection(Number(cashCollectedToday) + Number(upiCollectedToday));
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
    localStorage.removeItem("subadminLoggedIn");
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

  const todaysAdvance = bookings
    .filter((booking) => booking.created_at?.split("T")[0] === today)
    .reduce((sum, booking) => sum + (booking.advance_amount || 0), 0);

  const todaysBalance = bookings
    .filter((booking) => booking.booking_date?.split("T")[0] === today)
    .reduce((sum, booking) => sum + (booking.balance_amount || 0), 0);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-lime-400 selection:text-slate-950 p-4 sm:p-6 md:p-8 relative overflow-x-hidden">
      <div className="absolute top-0 inset-x-0 h-48 bg-gradient-to-b from-blue-500/10 via-transparent to-transparent pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 mb-8 border-b border-white/10 z-10">
        <div className="text-center sm:text-left">
          <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400">// Ground Staff Terminal</span>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight uppercase italic text-white mt-1">
            SMES Staff Panel
          </h1>
        </div>

        <button onClick={handleLogout} className="w-full sm:w-auto bg-neutral-900 hover:bg-red-950 border border-neutral-800 hover:border-red-900 text-slate-300 hover:text-white px-5 py-3 rounded-xl font-mono text-xs uppercase tracking-wider transition-all min-h-[48px] flex items-center justify-center gap-2">
          🚪 Logout
        </button>
      </div>

      {/* Staff Financial Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4 mb-8 relative z-10">
        <div className="bg-slate-900/60 border border-white/5 p-4 rounded-xl flex flex-col justify-between min-h-[100px]">
          <h3 className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Today Slots</h3>
          <p className="text-2xl font-black text-cyan-400 mt-2">{todaySlots}</p>
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
      </div>

      <div className="flex flex-col md:flex-row items-stretch justify-between gap-4 mb-6 relative z-10">
        <div className="w-full md:w-96 relative">
          <input
            type="text"
            placeholder="🔍 Filter by name, phone or date..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-4 pl-10 rounded-xl bg-slate-900 text-white border border-white/5 focus:border-cyan-400 outline-none placeholder:text-slate-600 text-base md:text-sm min-h-[52px]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => setShowManageSlots(true)} className="bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs uppercase tracking-wider px-6 py-4 rounded-xl transition-all font-bold min-h-[52px]">
            ➕ Walk-in Booking
          </button>
          
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

          {/* MASTER ACADEMY ROSTER WORKSPACE GRID */}
          <div className="lg:col-span-2 bg-slate-900/20 border border-white/10 rounded-xl overflow-hidden shadow-inner flex flex-col">
            <div className="p-4 bg-slate-900/80 border-b border-white/10">
              <h2 className="text-sm font-black uppercase text-white tracking-wide">🏆 Master Academy Coaching Roster — {currentMonthLabel}</h2>
            </div>

            {/* Mobile Layout Grid Container */}
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

            {/* Desktop View Matrix */}
            <div className="hidden sm:block overflow-x-auto max-h-[350px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] font-mono uppercase tracking-widest text-slate-400 bg-slate-955/40 sticky top-0 backdrop-blur z-20">
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

      {showManageSlots && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
          <div className="bg-slate-900 border border-white/10 p-5 sm:p-6 rounded-2xl w-full max-w-md shadow-2xl space-y-4">
            <div>
              <h2 className="text-xl font-black uppercase tracking-wide text-white">Register Walk-in</h2>
              <p className="text-slate-400 text-xs mt-0.5">Log a manual offline booking into the system.</p>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Target Date</label>
                <input type="date" min={new Date().toISOString().split("T")[0]} value={slotDate} onChange={(e) => { setSlotDate(e.target.value); loadAvailableAdminSlots(e.target.value); }} className="w-full p-3.5 rounded-xl bg-slate-950 text-white border border-white/5 focus:border-cyan-400 outline-none text-base md:text-sm font-medium" style={{ colorScheme: "dark" }} />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Launch Time</label>
                <select value={slotTime} onChange={(e) => { setSlotTime(e.target.value); if (slotDate) loadAvailableCourts(slotDate, e.target.value); }} className="w-full p-3.5 rounded-xl bg-slate-950 text-white border border-white/5 focus:border-cyan-400 outline-none text-base md:text-sm font-medium">
                  <option value="">Select Time</option>
                  {availableAdminSlots.map((slot) => (<option key={slot} value={slot}>{slot}</option>))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Duration</label>
                  <select value={slotDuration} onChange={(e) => setSlotDuration(Number(e.target.value))} className="w-full p-3.5 rounded-xl bg-slate-950 text-white border border-white/5 focus:border-cyan-400 outline-none text-base md:text-sm font-medium">
                    <option value={60}>60 Minutes</option>
                    <option value={90}>90 Minutes</option>
                    <option value={120}>120 Minutes</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Court</label>
                  <select value={slotCourt} onChange={(e) => setSlotCourt(e.target.value)} className="w-full p-3.5 rounded-xl bg-slate-950 text-white border border-white/5 focus:border-cyan-400 outline-none text-base md:text-sm font-medium">
                    {availableCourts.map((c) => (<option key={c} value={c}>{c}</option>))}
                  </select>
                </div>
              </div>

              <div className="p-4 bg-slate-950 border border-white/5 rounded-xl space-y-3">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-cyan-400 mb-1.5">Payment Collection</label>
                
                {offlinePaymentMethod !== "Cash + UPI" && (
                  <input type="number" placeholder="Total Received (₹)" value={offlineAmount} onChange={(e) => setOfflineAmount(e.target.value)} className="w-full p-3 rounded-lg bg-slate-900 text-white border border-white/5 outline-none text-base md:text-sm font-medium" />
                )}

                <select value={offlinePaymentMethod} onChange={(e) => setOfflinePaymentMethod(e.target.value)} className="w-full p-3 rounded-lg bg-slate-900 text-white border border-white/5 outline-none text-base md:text-sm font-medium">
                  <option value="Cash">Cash</option><option value="UPI">UPI</option><option value="Cash + UPI">Cash + UPI Split</option>
                </select>

                {offlinePaymentMethod === "Cash + UPI" && (
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" placeholder="Cash Split" value={offlineCashAmount} onChange={(e) => setOfflineCashAmount(e.target.value)} className="w-full p-3 rounded-lg bg-slate-900 text-white border border-white/5 outline-none text-base md:text-sm" />
                    <input type="number" placeholder="UPI Split" value={offlineUpiAmount} onChange={(e) => setOfflineUpiAmount(e.target.value)} className="w-full p-3 rounded-lg bg-slate-900 text-white border border-white/5 outline-none text-base md:text-sm" />
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button onClick={saveOfflineBooking} className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono text-xs uppercase tracking-wider py-3 font-black transition-all rounded-lg">Save Booking</button>
              <button onClick={() => setShowManageSlots(false)} className="w-full bg-neutral-800 hover:bg-neutral-700 text-slate-300 font-mono text-xs uppercase tracking-wider py-3 transition-all rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <p className="mb-3 text-xs font-mono text-slate-400 tracking-wide uppercase px-1">
        Showing {bookings.filter((b) => b.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) || b.phone?.includes(searchTerm)).length} booking(s) active
      </p>

      {/* Active Bookings Table */}
      <div className="bg-slate-900/40 border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative z-10 backdrop-blur-xl">
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-white/10">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-white/10 bg-slate-900/80 text-[10px] font-mono uppercase tracking-widest text-slate-400">
                <th className="p-4 font-bold">Client</th>
                <th className="p-4 font-bold">Schedule</th>
                <th className="p-4 font-bold">Duration</th>
                <th className="p-4 font-bold">Court</th>
                <th className="p-4 font-bold">Total</th>
                <th className="p-4 font-bold">Advance</th>
                <th className="p-4 font-bold">Due Balance</th>
                <th className="p-4 font-bold text-center">Payment Options</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm font-medium text-slate-300">
              {bookings.filter((b) => b.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) || b.phone?.includes(searchTerm)).map((booking) => {
                const bookingDate = booking.booking_date?.split("T")[0];
                const isToday = bookingDate === today;
                const isTomorrow = bookingDate === tomorrow;
                const duration = booking.duration_minutes || 60;

                let rowColor = "bg-transparent";
                if (isToday) rowColor = "bg-lime-500/[0.04]";
                else if (isTomorrow) rowColor = "bg-amber-500/[0.03]";

                return (
                  <tr key={booking.id} className={`${rowColor} hover:bg-white/[0.02] transition-colors text-slate-300`}>
                    <td className="p-4">
                      <div className="font-bold text-white">{booking.customer_name}</div>
                      <div className="font-mono text-[10px] text-slate-400 mt-0.5">{booking.phone}</div>
                    </td>
                    <td className="p-4 font-mono text-xs whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-200">{new Date(bookingDate).toLocaleDateString("en-GB")}</span>
                        {isToday && (
                          <span className="px-2 py-0.5 rounded-full bg-lime-400/10 border border-lime-400/30 text-lime-400 text-[9px] font-black uppercase tracking-wide">
                            Today
                          </span>
                        )}
                        {isTomorrow && (
                          <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-400 text-[9px] font-black uppercase tracking-wide">
                            Tomorrow
                          </span>
                        )}
                      </div>
                      <div className="text-white mt-1 font-bold">
                        {getTimeRangeLabel(booking.start_time, duration)}
                      </div>
                    </td>
                    <td className="p-4 font-mono text-xs text-slate-300 whitespace-nowrap">{duration} Mins</td>
                    <td className="p-4 font-mono text-xs whitespace-nowrap">
                      <div className="mb-1">
                        <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-mono uppercase tracking-wider ${
                          booking.booking_type === "Half Court"
                            ? "bg-cyan-500/10 border border-cyan-500/20 text-cyan-400"
                            : "bg-purple-500/10 border border-purple-500/20 text-purple-400"
                        }`}>
                          {booking.booking_type || "Full Court"}
                        </span>
                      </div>
                      <div className="text-slate-400 mt-0.5">{booking.court_number}</div>
                    </td>
                    <td className="p-4 text-slate-200 font-mono whitespace-nowrap">₹{booking.total_amount}</td>
                    <td className="p-4 text-emerald-400 font-mono whitespace-nowrap">₹{booking.advance_amount || 0}</td>
                    <td className="p-4 font-mono whitespace-nowrap">
                      {booking.balance_amount > 0 ? (
                        <span className="text-red-400 font-bold">₹{booking.balance_amount}</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono uppercase tracking-widest">Paid</span>
                      )}
                    </td>
                    <td className="p-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2">
                        {booking.balance_amount > 0 ? (
                          <button onClick={() => { setSelectedBooking(booking); setShowPaymentModal(true); }} className="bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-mono uppercase font-black px-4 py-2 transition-all rounded">💰 Collect</button>
                        ) : (
                          booking.customer_name !== "Offline Booking" && (
                            <button onClick={() => resetPayment(booking)} className="bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-amber-400 text-xs font-mono uppercase px-4 py-2 transition-all rounded">🔄 Reset</button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Excluded Field Blocks Summary */}
      <div className="bg-slate-900/40 border border-white/10 rounded-2xl overflow-hidden shadow-2xl mt-8 relative z-10 backdrop-blur-xl">
        <div className="p-4 bg-slate-900/80 border-b border-white/10">
          <h2 className="text-lg font-black uppercase tracking-wide text-white">🚫 Admin Field Blocks</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="border-b border-white/10 bg-slate-900/40 text-[10px] font-mono uppercase tracking-widest text-slate-400">
                <th className="p-4 font-bold">Date</th>
                <th className="p-4 font-bold">Schedule</th>
                <th className="p-4 font-bold">Duration</th>
                <th className="p-4 font-bold">Court</th>
                <th className="p-4 font-bold">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm font-medium text-slate-300">
              {blockedSlots.map((slot) => {
                if (!slot.start_time) return null;
                const bookingDate = slot.booking_date?.split("T")[0];
                const blockDuration = slot.duration_minutes || 60;

                return (
                  <tr key={slot.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="p-4 font-mono text-xs text-slate-200">
                      {new Date(bookingDate).toLocaleDateString("en-GB")}
                    </td>
                    <td className="p-4 font-mono text-xs text-white font-bold whitespace-nowrap">
                      {getTimeRangeLabel(slot.start_time, blockDuration)}
                    </td>
                    <td className="p-4 text-xs font-mono">{blockDuration} mins</td>
                    <td className="p-4 font-mono text-xs font-bold text-cyan-400">{slot.court_number}</td>
                    <td className="p-4 font-mono text-xs text-slate-400 uppercase">{slot.reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showPaymentModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
          <div className="bg-slate-900 border border-white/10 p-5 sm:p-6 rounded-2xl w-full max-w-sm shadow-2xl space-y-4">
            <div>
              <h2 className="text-xl font-black uppercase tracking-wide text-white">💰 Balance Clearing</h2>
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
                  <select value={paymentType} onChange={(e) => setPaymentType(e.target.value)} className="w-full p-3.5 rounded-xl bg-slate-950 text-white border border-white/5 focus:border-cyan-400 outline-none appearance-none text-base md:text-sm font-medium">
                    <option value="Full Cash">Full Cash</option>
                    <option value="Full UPI">Full UPI</option>
                    <option value="Cash + UPI">Cash + UPI</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 text-xs">▼</div>
                </div>
              </div>

              {paymentType === "Cash + UPI" && (
                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-950 border border-white/5 rounded-xl">
                  <input type="number" placeholder="Cash Amount" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} className="w-full p-3 rounded-lg bg-slate-900 text-white border border-white/5 focus:border-cyan-400 outline-none text-base md:text-sm font-medium" />
                  <input type="number" placeholder="UPI Amount" value={upiAmount} onChange={(e) => setUpiAmount(e.target.value)} className="w-full p-3 rounded-lg bg-slate-900 text-white border border-white/5 focus:border-cyan-400 outline-none text-base md:text-sm font-medium" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button onClick={savePayment} className="w-full bg-lime-400 hover:bg-lime-300 text-slate-950 font-mono text-xs uppercase tracking-wider py-3 font-black transition-all min-h-[44px]">Save Payment</button>
              <button onClick={() => { setShowPaymentModal(false); setSelectedBooking(null); }} className="w-full bg-neutral-800 hover:bg-neutral-700 text-slate-300 font-mono text-xs uppercase tracking-wider py-3 transition-all min-h-[44px]">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}