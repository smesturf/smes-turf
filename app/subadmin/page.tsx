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

  const loadAvailableCourts = async (date: string, time: string) => {
    const { data: bookings } = await supabase.from("bookings").select("*").eq("booking_date", date);
    const { data: blocked } = await supabase.from("blocked_slots").select("*").eq("booking_date", date);

    let courts = ["Full Court", "Court 1", "Court 2"];

    const convertToMins = (t: string) => {
      if (!t) return 0;
      const [timePart, ampm] = t.split(" ");
      let [h, m] = timePart.split(":").map(Number);
      if (ampm === "PM" && h !== 12) h += 12;
      if (ampm === "AM" && h === 12) h = 0;
      return h * 60 + m;
    };

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
    // Basic protection (You can set up a real login for subadmin later)
    const loggedIn = localStorage.getItem("subadminLoggedIn");
    if (loggedIn !== "true") {
      router.push("/subadmin/login"); // Fallback to a login page you can build
      return;
    }

    loadBookings();

    const bookingsChannel = supabase.channel("bookings-realtime-sub").on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => loadBookings()).subscribe();
    const blockedChannel = supabase.channel("blocked-slots-realtime-sub").on("postgres_changes", { event: "*", schema: "public", table: "blocked_slots" }, () => loadBookings()).subscribe();

    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(blockedChannel);
    };
  }, [router]);

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
    const { data: bookings } = await supabase.from("bookings").select("start_time,duration_minutes,booking_type,court_number").eq("booking_date", date);
    const { data: blocked } = await supabase.from("blocked_slots").select("start_time,duration_minutes,court_number").eq("booking_date", date);

    const availableTimes: string[] = [];
    const convertToMins = (t: string) => {
      const [timePart, ampm] = t.split(" ");
      let [h, m] = timePart.split(":").map(Number);
      if (ampm === "PM" && h !== 12) h += 12;
      if (ampm === "AM" && h === 12) h = 0;
      return h * 60 + m;
    };

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

  const saveOfflineBooking = async () => {
    if (!slotDate || !slotTime) { alert("Please select date and time"); return; }

    const { data: existingBookings } = await supabase.from("bookings").select("*").eq("booking_date", slotDate);
    const { data: existingBlocks } = await supabase.from("blocked_slots").select("*").eq("booking_date", slotDate);

    const convertToMins = (time: string) => {
      const [timePart, ampm] = time.split(" ");
      let [hours, minutes] = timePart.split(":").map(Number);
      if (ampm === "PM" && hours !== 12) hours += 12;
      if (ampm === "AM" && hours === 12) hours = 0;
      return hours * 60 + minutes;
    };

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

    // STRICTLY OFFLINE BOOKING LOGIC FOR SUB-ADMIN
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
    router.push("/subadmin/login");
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

      {/* Staff Financial Overview - Removed Gross Revenue blocks to protect owner info */}
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
        <button onClick={() => setShowManageSlots(true)} className="bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs uppercase tracking-wider px-6 py-4 rounded-xl transition-all font-bold min-h-[52px]">
          ➕ Walk-in Booking
        </button>
      </div>

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

      <div className="bg-slate-900/40 border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative z-10 backdrop-blur-xl">
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-white/10">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-slate-900/80 text-[10px] font-mono uppercase tracking-widest text-slate-400">
                <th className="p-4 font-bold">Client</th>
                <th className="p-4 font-bold">Schedule</th>
                <th className="p-4 font-bold">Court</th>
                <th className="p-4 font-bold">Total</th>
                <th className="p-4 font-bold">Advance</th>
                <th className="p-4 font-bold">Due Balance</th>
                <th className="p-4 font-bold text-center">Payment Options</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm font-medium">
              {bookings.filter((b) => b.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) || b.phone?.includes(searchTerm)).map((booking) => {
                const bookingDate = booking.booking_date?.split("T")[0];
                return (
                  <tr key={booking.id} className="hover:bg-white/[0.02] transition-colors text-slate-300">
                    <td className="p-4">
                      <div className="font-bold text-white">{booking.customer_name}</div>
                      <div className="font-mono text-[10px] text-slate-400 mt-0.5">{booking.phone}</div>
                    </td>
                    <td className="p-4 font-mono text-xs">
                      <div>{new Date(bookingDate).toLocaleDateString("en-GB")}</div>
                      <div className="text-white mt-0.5">{new Date(`2000-01-01T${booking.start_time}`).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })}</div>
                    </td>
                    <td className="p-4 font-mono text-xs">
                      <div>{booking.booking_type}</div>
                      <div className="text-slate-400 mt-0.5">{booking.court_number}</div>
                    </td>
                    <td className="p-4 text-slate-200 font-mono">₹{booking.total_amount}</td>
                    <td className="p-4 text-emerald-400 font-mono">₹{booking.advance_amount || 0}</td>
                    <td className="p-4 font-mono">
                      {booking.balance_amount > 0 ? (
                        <span className="text-red-400 font-bold">₹{booking.balance_amount}</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono uppercase tracking-widest">Paid</span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {/* NO CANCEL BUTTON FOR SUB-ADMIN */}
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

      {/* Blocked Slots List - NO RELEASE BUTTON */}
      <div className="bg-slate-900/40 border border-white/10 rounded-2xl overflow-hidden shadow-2xl mt-8 relative z-10 backdrop-blur-xl">
        <div className="p-4 bg-slate-900/80 border-b border-white/10">
          <h2 className="text-lg font-black uppercase tracking-wide text-white">🚫 Admin Field Blocks</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-slate-950/40 text-[10px] font-mono uppercase tracking-widest text-slate-400">
                <th className="p-4 font-bold">Date</th>
                <th className="p-4 font-bold">Time</th>
                <th className="p-4 font-bold">Court</th>
                <th className="p-4 font-bold">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm font-medium text-slate-300">
              {blockedSlots.map((slot) => (
                <tr key={slot.id}>
                  <td className="p-4 font-mono text-xs">{new Date(slot.booking_date).toLocaleDateString("en-GB")}</td>
                  <td className="p-4 font-mono text-xs">{new Date(`2000-01-01T${slot.start_time}`).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })}</td>
                  <td className="p-4 font-mono text-xs font-bold text-cyan-400">{slot.court_number}</td>
                  <td className="p-4 font-mono text-xs text-slate-400">{slot.reason}</td>
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
              <h2 className="text-xl font-black uppercase tracking-wide text-white">💰 Balance Clearing</h2>
            </div>
            <div className="p-4 bg-slate-950 border border-white/5 rounded-xl flex justify-between items-center">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Outstanding Balance</span>
              <span className="text-lg font-black text-red-400">₹{selectedBooking?.balance_amount || 0}</span>
            </div>
            <div className="space-y-3.5">
              <select value={paymentType} onChange={(e) => setPaymentType(e.target.value)} className="w-full p-3.5 rounded-xl bg-slate-950 text-white border border-white/5 outline-none font-medium">
                <option value="Full Cash">Full Cash</option><option value="Full UPI">Full UPI</option><option value="Cash + UPI">Cash + UPI</option>
              </select>
              {paymentType === "Cash + UPI" && (
                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-950 border border-white/5 rounded-xl">
                  <input type="number" placeholder="Cash Amount" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} className="w-full p-3 rounded-lg bg-slate-900 text-white border border-white/5 outline-none" />
                  <input type="number" placeholder="UPI Amount" value={upiAmount} onChange={(e) => setUpiAmount(e.target.value)} className="w-full p-3 rounded-lg bg-slate-900 text-white border border-white/5 outline-none" />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button onClick={savePayment} className="w-full bg-lime-400 text-slate-950 font-mono text-xs uppercase tracking-wider py-3 font-black rounded-lg">Save Payment</button>
              <button onClick={() => { setShowPaymentModal(false); setSelectedBooking(null); }} className="w-full bg-neutral-800 text-slate-300 font-mono text-xs uppercase tracking-wider py-3 rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}