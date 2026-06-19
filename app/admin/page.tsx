"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import * as XLSX from "xlsx";

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
  
  // Tactical sheet panel toggle to structure display densities on phone devices
  const [activeTabPanel, setActiveTabPanel] = useState<"LIVE" | "BLOCKED">("LIVE");

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
  const [slotReason, setSlotReason] = useState("MAINTENANCE");
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

  const convert12To24 = (time12: string) => {
    if (!time12) return "";
    const [timePart, ampm] = time12.split(" ");
    let [hours, minutes] = timePart.split(":").map(Number);
    if (ampm === "PM" && hours !== 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
  };

  const parseTimeToMinutes = (timeString: string) => {
    if (!timeString) return 0;
    if (timeString.includes("AM") || timeString.includes("PM")) {
      const [timePart, ampm] = timeString.split(" ");
      let [hours, minutes] = timePart.split(":").map(Number);
      if (ampm === "PM" && hours !== 12) hours += 12;
      if (ampm === "AM" && hours === 12) hours = 0;
      return hours * 60 + minutes;
    } else {
      const [hours, minutes] = timeString.split(":").map(Number);
      return hours * 60 + minutes;
    }
  };

  const loadAvailableCourts = async (date: string, time: string) => {
    const { data } = await supabase
      .from("blocked_slots")
      .select("*")
      .eq("booking_date", date);

    let courts = ["Full Court", "Court 1", "Court 2"];
    const selectedMinutes = parseTimeToMinutes(time);

    data?.forEach((b: any) => {
      const startMinutes = parseTimeToMinutes(b.start_time);
      const endMinutes = startMinutes + (b.duration_minutes || 60);
      const overlaps = selectedMinutes >= startMinutes && selectedMinutes < endMinutes;

      if (!overlaps) return;

      if (b.court_number === "Court 1") {
        courts = courts.filter((c) => c !== "Court 1" && c !== "Full Court");
      }
      if (b.court_number === "Court 2") {
        courts = courts.filter((c) => c !== "Court 2" && c !== "Full Court");
      }
      if (b.court_number === "Full Court") {
        courts = [];
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
    return date.toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
  };

  const today = formatDate(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = formatDate(tomorrowDate);

  const userRole = typeof window !== "undefined" ? localStorage.getItem("adminRole") : "admin";

  useEffect(() => {
    const loggedIn = localStorage.getItem("adminLoggedIn");

    if (loggedIn !== "true") {
      router.push("/admin/login");
      return;
    }

    loadBookings();

    const bookingsChannel = supabase
      .channel("bookings-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => { loadBookings(); })
      .subscribe();

    const blockedChannel = supabase
      .channel("blocked-slots-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "blocked_slots" }, () => { loadBookings(); })
      .subscribe();

    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(blockedChannel);
    };
  }, [router]);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const resetTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        localStorage.removeItem("adminLoggedIn");
        localStorage.removeItem("adminLoginTime");
        localStorage.removeItem("adminRole");
        alert("Logged out due to inactivity");
        router.push("/admin/login");
      }, 15 * 60 * 1000);
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

  const loadBookings = async () => {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .gte("booking_date", today)
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      console.log(error);
      return;
    }

    setBookings(data || []);
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const thisMonthBookings = data?.filter((booking) => {
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
      const selectedMinutes = parseTimeToMinutes(slot);
      let court1Available = true;
      let court2Available = true;

      bookings?.forEach((b: any) => {
        const startMinutes = parseTimeToMinutes(b.start_time);
        const endMinutes = startMinutes + (b.duration_minutes || 60);
        const overlaps = selectedMinutes >= startMinutes && selectedMinutes < endMinutes;

        if (!overlaps) return;

        if (b.booking_type === "Full Court" || b.court_number === "Full Court") {
          court1Available = false;
          court2Available = false;
        }
        if (b.court_number === "Court 1") court1Available = false;
        if (b.court_number === "Court 2") court2Available = false;
      });

      blocked?.forEach((b: any) => {
        const startMinutes = parseTimeToMinutes(b.start_time);
        const endMinutes = startMinutes + (b.duration_minutes || 60);
        const overlaps = selectedMinutes >= startMinutes && selectedMinutes < endMinutes;

        if (!overlaps) return;

        if (b.court_number === "Full Court") {
          court1Available = false;
          court2Available = false;
        }
        if (b.court_number === "Court 1") court1Available = false;
        if (b.court_number === "Court 2") court2Available = false;
      });

      if (court1Available || court2Available) {
        availableTimes.push(slot);
      }
    });

    const todayDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

    if (date === todayDate) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const futureSlots = availableTimes.filter((slot) => {
        return parseTimeToMinutes(slot) > currentMinutes;
      });

      setAvailableAdminSlots(futureSlots);
      return;
    }
    setAvailableAdminSlots(availableTimes);
  };

  const saveBlockedSlot = async () => {
    if (!slotDate || !slotTime) {
      alert("Please select date and time");
      return;
    }

    const backend24HTime = convert12To24(slotTime);

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
            start_time: backend24HTime,
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
      setSlotReason("MAINTENANCE");
      setSlotCourt("Full Court");
      setOfflineAmount("");
      setOfflineCashAmount("");
      setOfflineUpiAmount("");
      setShowManageSlots(false);
      return;
    }

    const { data: existing } = await supabase
        .from("blocked_slots")
        .select("*")
        .eq("booking_date", slotDate)
        .eq("start_time", backend24HTime)
        .eq("court_number", slotCourt);

    if (existing && existing.length > 0) {
      alert("⚠️ This court is already blocked at that time");
      return;
    }

    const { error } = await supabase
      .from("blocked_slots")
      .insert([
        {
          booking_date: slotDate,
          start_time: backend24HTime,
          duration_minutes: Number(slotDuration),
          reason: slotReason,
          court_number: slotCourt,
        },
      ]);

    if (error) {
      alert(error.message);
      return;
    }

    alert("✅ Slot saved");
    await loadBookings();

    if (slotDate) {
      loadAvailableAdminSlots(slotDate);
    }

    setSlotDate("");
    setSlotTime("");
    setSlotDuration(60);
    setSlotReason("MAINTENANCE");
    setSlotCourt("Full Court");
    setShowManageSlots(false);
  };

  const deleteBooking = async (id: number) => {
    const confirmed = confirm("Cancel this booking?");
    if (!confirmed) return;

    const { error } = await supabase.from("bookings").delete().eq("id", id);
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

  const exportToExcel = () => {
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

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Roster System Records");
    XLSX.writeFile(workbook, `SMES_Production_Report_${today}.xlsx`);
  };

  const handleLogout = () => {
    localStorage.removeItem("adminLoggedIn");
    localStorage.removeItem("adminLoginTime");
    localStorage.removeItem("adminRole");
    router.push("/admin/login");
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

    const { error } = await supabase
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

    const { error } = await supabase.from("blocked_slots").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }

    alert("✅ Blocked slot deleted");
    loadBookings();
  };

  return (
    <main className="min-h-screen bg-[#080a10] text-slate-100 font-sans antialiased p-4 sm:p-6 lg:p-8 relative selection:bg-purple-500 selection:text-white">
      <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-purple-500/5 via-transparent to-transparent pointer-events-none" />

      {/* Corporate Dashboard Header Block */}
      <header className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 mb-8 border-b border-slate-800 z-10">
        <div className="text-left">
          <span className="text-[10px] font-mono uppercase tracking-widest text-purple-400 font-bold">// SECURE OPERATIONS HUB</span>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase italic text-white mt-0.5">
            SMES COMMAND TOWER {userRole === "sub_manager" && <span className="text-xs font-mono font-normal tracking-normal text-slate-500 not-italic ml-2 bg-slate-900 px-2 py-1 border border-slate-800">SUB-MANAGER SECURITY ACCESS</span>}
          </h1>
        </div>

        <button onClick={handleLogout} className="w-full md:w-auto bg-neutral-900 hover:bg-red-950 border border-neutral-800 hover:border-red-900/60 text-slate-300 hover:text-white px-5 py-3 rounded-xl font-mono text-xs uppercase tracking-wider transition-all min-h-[48px] flex items-center justify-center gap-2">
          Term Session Access
        </button>
      </header>

      {/* Fluid Real-time Analytics Cards Grid Framework */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3 sm:gap-4 mb-8 relative z-10">
        {[
          { label: "Gross Orders", val: bookings.length, cls: "text-white" },
          { label: "Today Slots", val: todaySlots, cls: "text-lime-400" },
          { label: "Tomorrow Slots", val: tomorrowSlots, cls: "text-slate-400" }
        ].map((card, i) => (
          <div key={i} className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl flex flex-col justify-between min-h-[105px]">
            <h3 className="text-[9px] font-mono uppercase tracking-wider text-slate-500 font-bold">{card.label}</h3>
            <p className={`text-2xl font-black mt-2 ${card.cls}`}>{card.val}</p>
          </div>
        ))}

        {userRole !== "sub_manager" && [
          { label: "Today Advance", val: `₹${todaysAdvance}`, cls: "text-emerald-400" },
          { label: "Today Balance", val: `₹${todaysBalance}`, cls: "text-red-400" },
          { label: "Cash Vault", val: `₹${todayCashCollection}`, cls: "text-amber-400" },
          { label: "UPI Nodes", val: `₹${todayUpiCollection}`, cls: "text-cyan-400" },
          { label: "Total Collected", val: `₹${todayTotalCollection}`, cls: "text-purple-400" }
        ].map((card, i) => (
          <div key={i} className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl flex flex-col justify-between min-h-[105px]">
            <h3 className="text-[9px] font-mono uppercase tracking-wider text-slate-500 font-bold">{card.label}</h3>
            <p className={`text-2xl font-black mt-2 ${card.cls}`}>{card.val}</p>
          </div>
        ))}
      </section>

      {/* Control Action Toolbar Bar */}
      <section className="flex flex-col lg:flex-row items-stretch justify-between gap-4 mb-8 relative z-10">
        <input
          type="text"
          placeholder="🔍 Scan global schedules (Name, phone, or ISO timeline data)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full lg:w-96 p-4 rounded-xl bg-slate-900/60 text-white border border-slate-800 focus:border-purple-500 outline-none placeholder:text-slate-600 text-base md:text-sm min-h-[52px]"
        />

        {/* Unified Layout Display Segment Toggles (Excellent UX optimization on Mobile viewports) */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-950 p-1 border border-slate-800 rounded-xl font-mono text-xs">
            <button onClick={() => setActiveTabPanel("LIVE")} className={`px-4 py-2 rounded-lg font-bold transition-all ${activeTabPanel === "LIVE" ? "bg-slate-800 text-purple-400" : "text-slate-500 hover:text-slate-300"}`}>
              Active Rosters
            </button>
            <button onClick={() => setActiveTabPanel("BLOCKED")} className={`px-4 py-2 rounded-lg font-bold transition-all ${activeTabPanel === "BLOCKED" ? "bg-slate-800 text-purple-400" : "text-slate-500 hover:text-slate-300"}`}>
              Ground Locks
            </button>
          </div>

          <button className="bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs uppercase tracking-wider px-5 py-3 rounded-xl transition-all font-bold min-h-[44px]" onClick={() => setShowManageSlots(true)}>
            ⚙️ Manage Slots
          </button>
          {userRole !== "sub_manager" && (
            <button onClick={exportToExcel} className="bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs uppercase tracking-wider px-5 py-3 rounded-xl transition-all font-bold min-h-[44px]">
              📊 Export Sheet
            </button>
          )}
        </div>
      </section>

      {/* PANEL CANVAS SWITCHER SHEET */}
      <div className="relative z-10">
        {activeTabPanel === "LIVE" ? (
          <div className="bg-slate-900/20 border border-slate-800 rounded-xl overflow-hidden shadow-2xl backdrop-blur-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80 text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold">
                    <th className="p-4">Captain / Client</th>
                    <th className="p-4">Contact</th>
                    <th className="p-4">Match Date</th>
                    <th className="p-4">Clock Window</th>
                    <th className="p-4">Scope</th>
                    <th className="p-4">Scale</th>
                    <th className="p-4">Court Mapping</th>
                    <th className="p-4">Total</th>
                    <th className="p-4">Token</th>
                    <th className="p-4">Due State</th>
                    <th className="p-4 text-center">Execution Operations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/60 text-xs font-mono font-medium">
                  {bookings
                    .filter((b) => {
                      const s = searchTerm.toLowerCase();
                      return b.customer_name?.toLowerCase().includes(s) || b.phone?.toLowerCase().includes(s) || b.booking_date?.toLowerCase().includes(s);
                    })
                    .map((booking) => {
                      const isToday = booking.booking_date?.split("T")[0] === today;
                      return (
                        <tr key={booking.id} className={`hover:bg-white/[0.01] transition-colors text-slate-400 ${isToday ? "bg-purple-500/[0.02]" : ""}`}>
                          <td className="p-4 font-sans text-sm font-bold text-white">{booking.customer_name}</td>
                          <td className="p-4 text-slate-500">{booking.phone}</td>
                          <td className="p-4 text-slate-300">{new Date(booking.booking_date).toLocaleDateString("en-GB")}</td>
                          <td className="p-4 text-white font-bold">{new Date(`2000-01-01T${booking.start_time}`).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase()}</td>
                          <td className="p-4 text-slate-400">{booking.duration_minutes}m</td>
                          <td className="p-4 uppercase text-slate-500">{booking.sport}</td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${booking.booking_type === "Half Court" ? "bg-cyan-500/10 border border-cyan-500/20 text-cyan-400" : "bg-purple-500/10 border border-purple-500/20 text-purple-400"}`}>
                              {booking.booking_type || "Full Court"}
                            </span>
                          </td>
                          <td className="p-4 text-slate-500">{booking.court_number || "-"}</td>
                          <td className="p-4 text-slate-300 font-sans font-bold">₹{booking.total_amount}</td>
                          <td className="p-4 text-emerald-400 font-sans">₹{booking.advance_amount || 0}</td>
                          <td className="p-4 font-sans">
                            {booking.balance_amount > 0 ? <span className="text-red-400 font-bold">₹{booking.balance_amount}</span> : <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded">SETTLED</span>}
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-1.5 font-sans">
                              {booking.balance_amount > 0 && <button onClick={() => { setSelectedBooking(booking); setShowPaymentModal(true); }} className="bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-all">Collect</button>}
                              {booking.payment_completed && booking.customer_name !== "Offline Booking" && userRole !== "sub_manager" && <button onClick={() => resetPayment(booking)} className="bg-slate-800 hover:bg-slate-700 text-amber-400 text-[11px] px-2.5 py-1.5 rounded-lg font-mono uppercase tracking-wider">Reset</button>}
                              {userRole !== "sub_manager" && <button onClick={() => deleteBooking(booking.id)} className="bg-slate-800 hover:bg-red-950 text-red-400 hover:text-white text-[11px] px-2.5 py-1.5 rounded-lg font-mono uppercase tracking-wider">Drop</button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900/20 border border-slate-800 rounded-xl overflow-hidden shadow-2xl backdrop-blur-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80 text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold">
                    <th className="p-4">Target Calendar Date</th>
                    <th className="p-4">Time Block Window</th>
                    <th className="p-4">Duration Range</th>
                    <th className="p-4">Court Exclusion Mapping</th>
                    <th className="p-4">Lock Rationale</th>
                    {userRole !== "sub_manager" && <th className="p-4 text-center">Operational Releases</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/60 text-xs font-mono font-medium text-slate-400">
                  {blockedSlots.map((slot) => (
                    <tr key={slot.id} className="hover:bg-white/[0.01] transition-colors">
                      <td className="p-4 text-slate-300">{new Date(slot.booking_date).toLocaleDateString("en-GB")}</td>
                      <td className="p-4 text-white font-bold">{new Date(`2000-01-01T${slot.start_time}`).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase()}</td>
                      <td className="p-4">{slot.duration_minutes}m</td>
                      <td className="p-4 text-cyan-400 font-bold">{slot.court_number}</td>
                      <td className="p-4 font-sans text-slate-500">{slot.reason}</td>
                      {userRole !== "sub_manager" && (
                        <td className="p-4 text-center">
                          <button onClick={() => deleteBlockedSlot(slot.id)} className="bg-slate-800 hover:bg-red-950 border border-slate-700 text-red-400 hover:text-white text-[11px] font-mono uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all">Release</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Advanced System Management Control Overlay Sheet Modal */}
      {showManageSlots && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-md shadow-2xl space-y-4">
            <div>
              <h2 className="text-lg font-black uppercase tracking-wide text-white">Turf Ground Management</h2>
              <p className="text-slate-500 text-xs">Register ground maintenance logs, system blocks, or walk-in offline bookings.</p>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Target Date</label>
                <input type="date" min={new Date().toISOString().split("T")[0]} value={slotDate} onChange={(e) => { setSlotDate(e.target.value); loadAvailableAdminSlots(e.target.value); }} className="w-full p-3.5 rounded-xl bg-slate-950 text-white border border-slate-800 outline-none font-medium text-base md:text-sm" style={{ colorScheme: "dark" }} />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Launch clock</label>
                <div className="relative">
                  <select value={slotTime} onChange={(e) => { setSlotTime(e.target.value); if (slotDate) { loadAvailableCourts(slotDate, e.target.value); } }} className="w-full p-3.5 rounded-xl bg-slate-950 text-white border border-slate-800 outline-none appearance-none text-base md:text-sm font-medium">
                    <option value="">Select Target Clock Window</option>
                    {availableAdminSlots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">▼</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Window Length</label>
                  <div className="relative">
                    <select value={slotDuration} onChange={(e) => setSlotDuration(Number(e.target.value))} className="w-full p-3.5 rounded-xl bg-slate-950 text-white border border-slate-800 outline-none appearance-none text-base md:text-sm font-medium">
                      <option value={60}>60 Min Grid</option>
                      <option value={90}>90 Min Grid</option>
                      <option value={120}>120 Min Grid</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">▼</div>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Target Court</label>
                  <div className="relative">
                    <select value={slotCourt} onChange={(e) => setSlotCourt(e.target.value)} className="w-full p-3.5 rounded-xl bg-slate-950 text-white border border-slate-800 outline-none appearance-none text-base md:text-sm font-medium">
                      {availableCourts.length === 0 ? <option value="">None Available</option> : availableCourts.map((court) => <option key={court} value={court}>{court}</option>)}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">▼</div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Lock Profile Strategy</label>
                <div className="relative">
                  <select value={slotReason} onChange={(e) => setSlotReason(e.target.value)} className="w-full p-3.5 rounded-xl bg-slate-950 text-white border border-slate-800 outline-none appearance-none text-base md:text-sm font-medium">
                    <option value="MAINTENANCE">Scheduled Maintenance Work</option>
                    <option value="TOURNAMENT">Tournament Bracket Reservation</option>
                    <option value="OFFLINE BOOKING">On-Field Offline Booking Allocation</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">▼</div>
                </div>
              </div>

              {slotReason === "OFFLINE BOOKING" && (
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                  {offlinePaymentMethod !== "Cash + UPI" && (
                    <input type="number" placeholder="Total Amount Captured (₹)" value={offlineAmount} onChange={(e) => setOfflineAmount(e.target.value)} className="w-full p-3 rounded-lg bg-slate-900 text-white border border-slate-800 outline-none text-base md:text-sm font-medium" />
                  )}
                  <div className="relative">
                    <select value={offlinePaymentMethod} onChange={(e) => setOfflinePaymentMethod(e.target.value)} className="w-full p-3 rounded-lg bg-slate-900 text-white border border-slate-800 outline-none appearance-none text-base md:text-sm font-medium">
                      <option value="Cash">Pure Cash Ledger</option>
                      <option value="UPI">Direct UPI Node</option>
                      <option value="Cash + UPI">Split Settlement Route (Cash + UPI)</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">▼</div>
                  </div>
                  {offlinePaymentMethod === "Cash + UPI" && (
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" placeholder="Cash Fraction" value={offlineCashAmount} onChange={(e) => setOfflineCashAmount(e.target.value)} className="w-full p-3 rounded-lg bg-slate-900 text-white border border-slate-800 outline-none text-base md:text-sm font-medium" />
                      <input type="number" placeholder="UPI Fraction" value={offlineUpiAmount} onChange={(e) => setOfflineUpiAmount(e.target.value)} className="w-full p-3 rounded-lg bg-slate-900 text-white border border-slate-800 outline-none text-base md:text-sm font-medium" />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 font-mono text-xs">
              <button onClick={saveBlockedSlot} className="w-full bg-purple-600 hover:bg-purple-500 text-white uppercase tracking-wider py-3.5 font-bold transition-all rounded-xl">Commit Log</button>
              <button onClick={() => setShowManageSlots(false)} className="w-full bg-neutral-800 hover:bg-neutral-700 text-slate-300 uppercase tracking-wider py-3.5 transition-all rounded-xl">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Settlement Modal Gateway Panel Overlay */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-sm shadow-2xl space-y-4">
            <div>
              <h2 className="text-base font-black uppercase tracking-wide text-white">💰 Execute Balance Ledger</h2>
              <p className="text-slate-500 text-xs mt-0.5">Collect the remaining match outstanding dues directly below.</p>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex justify-between items-center font-mono text-xs">
              <span className="text-slate-400 uppercase tracking-wider">Unsettled Balance</span>
              <span className="text-base font-black text-red-400">₹{selectedBooking?.balance_amount || 0}</span>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Collection Route</label>
                <div className="relative">
                  <select value={paymentType} onChange={(e) => setPaymentType(e.target.value)} className="w-full p-3.5 rounded-xl bg-slate-950 text-white border border-slate-800 outline-none appearance-none text-base md:text-sm font-medium">
                    <option value="Full Cash">Cash Ledger Settlement</option>
                    <option value="Full UPI">UPI Endpoint Settlement</option>
                    <option value="Cash + UPI">Split Fraction Ledger (Cash + UPI)</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">▼</div>
                </div>
              </div>

              {paymentType === "Cash + UPI" && (
                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <input type="number" placeholder="Cash Vol" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} className="w-full p-3 rounded-lg bg-slate-900 text-white border border-slate-800 outline-none text-base md:text-sm font-medium" />
                  <input type="number" placeholder="UPI Vol" value={upiAmount} onChange={(e) => setUpiAmount(e.target.value)} className="w-full p-3 rounded-lg bg-slate-900 text-white border border-slate-800 outline-none text-base md:text-sm font-medium" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 font-mono text-xs">
              <button onClick={savePayment} className="w-full bg-purple-600 hover:bg-purple-500 text-white uppercase tracking-wider py-3.5 font-bold transition-all rounded-xl">Save Settlement</button>
              <button onClick={() => { setShowPaymentModal(false); setSelectedBooking(null); }} className="w-full bg-neutral-800 hover:bg-neutral-700 text-slate-300 uppercase tracking-wider py-3.5 transition-all rounded-xl">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}