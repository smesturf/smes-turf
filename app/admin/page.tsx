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
  const loadAvailableCourts = async (date: string, time: string) => {
    const { data } = await supabase
      .from("blocked_slots")
      .select("*")
      .eq("booking_date", date);

    let courts = [
      "Full Court",
      "Court 1",
      "Court 2",
    ];

    const selected = new Date(`2000-01-01 ${time}`);

    const selectedMinutes = selected.getHours() * 60 + selected.getMinutes();

    data?.forEach((b: any) => {
      const start = new Date(`2000-01-01T${b.start_time}`);

      const startMinutes = start.getHours() * 60 + start.getMinutes();

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

  useEffect(() => {
    const loggedIn = localStorage.getItem("adminLoggedIn");

    if (loggedIn !== "true") {
      router.push("/admin/login");
      return;
    }

    loadBookings();

    const bookingsChannel = supabase
      .channel("bookings-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
        },
        () => {
          loadBookings();
        }
      )
      .subscribe();

    const blockedChannel = supabase
      .channel("blocked-slots-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "blocked_slots",
        },
        () => {
          loadBookings();
        }
      )
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
      data?.filter((booking) => {
        const normDate = new Date(booking.booking_date).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        return normDate === today;
      }) || [];

    const tomorrowsBookings =
      data?.filter((booking) => {
        const normDate = new Date(booking.booking_date).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        return normDate === tomorrow;
      }) || [];

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
      const selected = new Date(`2000-01-01 ${slot}`);

      const selectedMinutes = selected.getHours() * 60 + selected.getMinutes();

      let court1Available = true;
      let court2Available = true;

      // CHECK BOOKINGS
      bookings?.forEach((b: any) => {
        const start = new Date(`2000-01-01T${b.start_time}`);

        const startMinutes = start.getHours() * 60 + start.getMinutes();

        const endMinutes = startMinutes + (b.duration_minutes || 60);

        const overlaps = selectedMinutes >= startMinutes && selectedMinutes < endMinutes;

        if (!overlaps) return;

        if (b.booking_type === "Full Court" || b.court_number === "Full Court") {
          court1Available = false;
          court2Available = false;
        }

        if (b.court_number === "Court 1") {
          court1Available = false;
        }

        if (b.court_number === "Court 2") {
          court2Available = false;
        }
      });

      // CHECK BLOCKED SLOTS
      blocked?.forEach((b: any) => {
        const start = new Date(`2000-01-01T${b.start_time}`);

        const startMinutes = start.getHours() * 60 + start.getMinutes();

        const endMinutes = startMinutes + (b.duration_minutes || 60);

        const overlaps = selectedMinutes >= startMinutes && selectedMinutes < endMinutes;

        if (!overlaps) return;

        if (b.court_number === "Full Court") {
          court1Available = false;
          court2Available = false;
        }

        if (b.court_number === "Court 1") {
          court1Available = false;
        }

        if (b.court_number === "Court 2") {
          court2Available = false;
        }
      });

      if (court1Available || court2Available) {
        availableTimes.push(slot);
      }
    });

    const todayDate = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });

    if (date === todayDate) {
      const now = new Date();

      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const futureSlots = availableTimes.filter((slot) => {
        const parsed = new Date(`2000-01-01 ${slot}`);

        const slotMinutes = parsed.getHours() * 60 + parsed.getMinutes();

        return slotMinutes > currentMinutes;
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

    // OFFLINE BOOKING
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

      const { data: insertedData, error } = await supabase
        .from("bookings")
        .insert([
          {
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
          },
        ]).select();

      if (error) {
        alert(error.message);
        return;
      }

      const bookingId = insertedData?.[0]?.id ? `#${insertedData[0].id.toString().slice(-4)}` : "#----";

      // FIXED: Applied structural templates to offline dashboard blocks
      const offlineManagementText = `🏟️ *SMES Sports Academy*\n\nThis slot has been reserved by the management.\n\n📅 *Date:* ${slotDate}\n🕒 *Time:* ${slotTime}\n⏱ *Duration:* ${slotDuration} Minutes\n🏟 *Court:* ${slotCourt}\n\n*Reason:* Offline Booking\n\nFor enquiries:\n📞 8453095258`;

      const adminAlertText = `🔔 *NEW BOOKING RECEIVED*\n\n🏟️ *SMES Sports Academy*\n\n👤 *Customer:* Offline Booking\n📞 *Phone:* -\n\n📅 *Date:* ${slotDate}\n🕒 *Time:* ${slotTime}\n⏱ *Duration:* ${slotDuration} Minutes\n\n🏟 *Court:* ${slotCourt}\n🏏 *Sport:* FOOTBALL\n\n💰 *Total Amount:* ₹${totalAmount}\n✅ *Advance Paid:* ₹${totalAmount}\n💳 *Balance:* ₹0\n\n💳 *Payment Status:* PAID\n\n*Booking ID:* ${bookingId}`;

      try {
        await fetch("/api/whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerPhone: "8453095258",
            customerMessage: offlineManagementText,
            adminMessage: adminAlertText
          })
        });
      } catch (e) {
        console.log("Notification link split bypass.");
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

    // MAINTENANCE / TOURNAMENT
    const { data: existing } = await supabase
        .from("blocked_slots")
        .select("*")
        .eq("booking_date", slotDate)
        .eq("start_time", slotTime)
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
          start_time: slotTime,
          duration_minutes: Number(slotDuration),
          reason: slotReason,
          court_number: slotCourt,
        },
      ]);

    if (error) {
      alert(error.message);
      return;
    }

    // FIXED: Formatted management blocks to send alerts directly for tracking updates
    const managementNoticeText = `🏟️ *SMES Sports Academy*\n\nThis slot has been reserved by the management.\n\n📅 *Date:* ${slotDate}\n🕒 *Time:* ${slotTime}\n⏱ *Duration:* ${slotDuration} Minutes\n🏟 *Court:* ${slotCourt}\n\n*Reason:* ${slotReason === "MAINTENANCE" ? "Maintenance" : "Tournament"}\n\nFor enquiries:\n📞 8453095258`;

    try {
      await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerPhone: "8453095258",
          customerMessage: managementNoticeText,
          adminMessage: managementNoticeText
        })
      });
    } catch (e) {
      console.log("Notification route connection failed.");
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
    .filter((booking) => {
      const normDate = new Date(booking.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      return normDate === today;
    })
    .reduce((sum, booking) => sum + (booking.advance_amount || 0), 0);

  const todaysBalance = bookings
    .filter((booking) => {
      const normDate = new Date(booking.booking_date).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      return normDate === today;
    })
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

    const totalRevenue = bookings.reduce((sum, booking) => sum + (booking.total_amount || 0), 0);
    const totalAdvance = bookings.reduce((sum, booking) => sum + (booking.advance_amount || 0), 0);
    const totalBalance = bookings.reduce((sum, booking) => sum + (booking.balance_amount || 0), 0);
    const totalCashCollected = bookings.reduce((sum, booking) => sum + Number(booking.cash_received || 0), 0);
    const totalUpiCollected = bookings.reduce((sum, booking) => sum + Number(booking.upi_received || 0), 0);
    const totalCollection = totalCashCollected + totalUpiCollected;

    const workbook = XLSX.utils.book_new();
    const today = new Date().toISOString().split("T")[0];

    const worksheet = XLSX.utils.aoa_to_sheet([
      ["SMES TURF BOOKING REPORT"],
      [`Export Date: ${new Date().toLocaleString("en-IN")}`],
      [],
      ["Total Bookings", bookings.length],
      ["Total Revenue (₹)", totalRevenue],
      ["Total Advance Collected (₹)", totalAdvance],
      ["Total Pending Balance (₹)", totalBalance],
      ["Total Cash Collected (₹)", totalCashCollected],
      ["Total UPI Collected (₹)", totalUpiCollected],
      ["Total Collection (₹)", totalCollection],
      [],
      [],
    ]);

    XLSX.utils.sheet_add_json(worksheet, exportData, { origin: "A13" });

    worksheet["!cols"] = [
      { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 15 },
      { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 },
      { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, "Bookings");

    // TODAY SUMMARY
    const todayBookings = bookings.filter((booking) => {
      const normDate = new Date(booking.booking_date).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      return normDate === today;
    });
    const todayRevenue = todaysAdvance + todaysBalance;
    const todayAdvance = todaysAdvance;
    const todayBalance = todaysBalance;
    const todayCash = todayBookings.reduce((sum, booking) => sum + Number(booking.cash_received || 0), 0);
    const todayUpi = todayBookings.reduce((sum, booking) => sum + Number(booking.upi_received || 0), 0);
    const todayCollection = todayCash + todayUpi;

    const todaySheet = XLSX.utils.aoa_to_sheet([
      ["TODAY'S COLLECTION"],
      [],
      ["Total Bookings", todayBookings.length],
      ["Total Revenue (₹)", todayRevenue],
      ["Advance Collected (₹)", todayAdvance],
      ["Pending Balance (₹)", todayBalance],
      ["Cash Collected (₹)", todayCash],
      ["UPI Collected (₹)", todayUpi],
      ["Total Collection (₹)", todayCollection],
    ]);

    XLSX.utils.book_append_sheet(workbook, todaySheet, "Today");

    // MONTHLY SUMMARY
    const monthlyCash = bookings.reduce((sum, booking) => sum + Number(booking.cash_received || 0), 0);
    const monthlyUpi = bookings.reduce((sum, booking) => sum + Number(booking.upi_received || 0), 0);
    const monthlyCollection = monthlyCash + monthlyUpi;

    const monthlySheet = XLSX.utils.aoa_to_sheet([
      ["MONTHLY COLLECTION"],
      [],
      ["Total Bookings", monthlyBookings],
      ["Total Revenue (₹)", monthlyRevenue],
      ["Advance Collected (₹)", monthlyAdvance],
      ["Pending Balance (₹)", monthlyBalance],
      ["Cash Collected (₹)", monthlyCash],
      ["UPI Collected (₹)", monthlyUpi],
      ["Total Collection (₹)", monthlyCollection],
    ]);

    XLSX.utils.book_append_sheet(workbook, monthlySheet, "Monthly");

    XLSX.writeFile(workbook, `SMES_Bookings_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const handleLogout = () => {
    localStorage.removeItem("adminLoggedIn");
    localStorage.removeItem("adminLoginTime");
    router.push("/admin/login");
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
      
      {/* Visual Top Glow FX */}
      <div className="absolute top-0 inset-x-0 h-48 bg-gradient-to-b from-lime-500/10 via-transparent to-transparent pointer-events-none" />

      {/* Corporate Dashboard Header Block */}
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

      {/* Financial Analytics Grid - Optimized into pairs for mobile viewports */}
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

      {/* Control Action Toolbar Bar */}
      <div className="flex flex-col md:flex-row items-stretch justify-between gap-4 mb-6 relative z-10">
        <div className="w-full md:w-96 relative">
          <input
            type="text"
            placeholder="🔍 Filter by name, phone or date..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full p-4 pl-10 rounded-xl bg-slate-900 text-white border border-white/5 focus:border-lime-400 outline-none placeholder:text-slate-600 text-base md:text-sm min-h-[52px]"
          />
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600 text-sm pointer-events-none"></span>
        </div>

        {/* Tactical Action Buttons Row */}
        <div className="grid grid-cols-2 gap-3 md:flex md:items-center">
          <button
            className="bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs uppercase tracking-wider px-5 py-4 rounded-xl transition-all font-bold min-h-[52px]"
            onClick={() => setShowManageSlots(true)}
          >
            ⚙️ Manage Slots
          </button>

          <button
            onClick={exportToExcel}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs uppercase tracking-wider px-5 py-4 rounded-xl transition-all font-bold min-h-[52px]"
          >
            📊 Export Excel
          </button>
        </div>
      </div>

      {/* Operational Modal Overlay: Slot Configuration Panel */}
      {showManageSlots && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
          <div className="bg-slate-900 border border-white/10 p-5 sm:p-6 rounded-2xl w-full max-w-md shadow-2xl space-y-4">
            <div>
              <h2 className="text-xl font-black uppercase tracking-wide text-white">
                Slot Management
              </h2>
              <p className="text-slate-400 text-xs mt-0.5">Toggle field lock schedules or insert localized manual offline metrics.</p>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Target Date</label>
                <input
                  type="date"
                  min={new Date().toISOString().split("T")[0]}
                  value={slotDate}
                  onChange={(e) => {
                    setSlotDate(e.target.value);
                    loadAvailableAdminSlots(e.target.value);
                  }}
                  className="w-full p-3.5 rounded-xl bg-slate-950 text-white border border-white/5 focus:border-lime-400 outline-none text-base md:text-sm font-medium"
                  style={{ colorScheme: "dark" }}
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Launch Time</label>
                <div className="relative">
                  <select
                    value={slotTime}
                    onChange={(e) => {
                      setSlotTime(e.target.value);
                      if (slotDate) {
                        loadAvailableCourts(slotDate, e.target.value);
                      }
                    }}
                    className="w-full p-3.5 rounded-xl bg-slate-950 text-white border border-white/5 focus:border-lime-400 outline-none appearance-none text-base md:text-sm font-medium"
                  >
                    <option value="">Select Time</option>
                    {availableAdminSlots.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 text-xs">▼</div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Duration Segment</label>
                <div className="relative">
                  <select
                    value={slotDuration}
                    onChange={(e) => setSlotDuration(Number(e.target.value))}
                    className="w-full p-3.5 rounded-xl bg-slate-950 text-white border border-white/5 focus:border-lime-400 outline-none appearance-none text-base md:text-sm font-medium"
                  >
                    <option value={60}>60 Minutes</option>
                    <option value={90}>90 Minutes</option>
                    <option value={120}>120 Minutes</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 text-xs">▼</div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Allocated Court</label>
                <div className="relative">
                  <select
                    value={slotCourt}
                    onChange={(e) => setSlotCourt(e.target.value)}
                    className="w-full p-3.5 rounded-xl bg-slate-950 text-white border border-white/5 focus:border-lime-400 outline-none appearance-none text-base md:text-sm font-medium"
                  >
                    {availableCourts.length === 0 ? (
                      <option value="">No Courts Available</option>
                    ) : (
                      availableCourts.map((court) => (
                        <option key={court} value={court}>
                          {court}
                        </option>
                      ))
                    )}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 text-xs">▼</div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Reason Profile</label>
                <div className="relative">
                  <select
                    value={slotReason}
                    onChange={(e) => setSlotReason(e.target.value)}
                    className="w-full p-3.5 rounded-xl bg-slate-950 text-white border border-white/5 focus:border-lime-400 outline-none appearance-none text-base md:text-sm font-medium"
                  >
                    <option value="MAINTENANCE">Maintenance</option>
                    <option value="TOURNAMENT">Tournament</option>
                    <option value="OFFLINE BOOKING">Offline Booking</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 text-xs">▼</div>
                </div>
              </div>

              {slotReason === "OFFLINE BOOKING" && (
                <div className="p-3 bg-slate-950 border border-white/5 rounded-xl space-y-3">
                  {offlinePaymentMethod !== "Cash + UPI" && (
                    <input
                      type="number"
                      placeholder="Amount Received (₹)"
                      value={offlineAmount}
                      onChange={(e) => setOfflineAmount(e.target.value)}
                      className="w-full p-3 rounded-lg bg-slate-900 text-white border border-white/5 focus:border-lime-400 outline-none text-base md:text-sm font-medium"
                    />
                  )}

                  <div className="relative">
                    <select
                      value={offlinePaymentMethod}
                      onChange={(e) => setOfflinePaymentMethod(e.target.value)}
                      className="w-full p-3 rounded-lg bg-slate-900 text-white border border-white/5 focus:border-lime-400 outline-none appearance-none text-base md:text-sm font-medium"
                    >
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="Cash + UPI">Cash + UPI</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 text-xs">▼</div>
                  </div>

                  {offlinePaymentMethod === "Cash + UPI" && (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        placeholder="Cash Split"
                        value={offlineCashAmount}
                        onChange={(e) => setOfflineCashAmount(e.target.value)}
                        className="w-full p-3 rounded-lg bg-slate-900 text-white border border-white/5 focus:border-lime-400 outline-none text-base md:text-sm font-medium"
                      />
                      <input
                        type="number"
                        placeholder="UPI Split"
                        value={offlineUpiAmount}
                        onChange={(e) => setOfflineUpiAmount(e.target.value)}
                        className="w-full p-3 rounded-lg bg-slate-900 text-white border border-white/5 focus:border-lime-400 outline-none text-base md:text-sm font-medium"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={saveBlockedSlot}
                className="w-full bg-lime-400 hover:bg-lime-300 text-slate-950 font-mono text-xs uppercase tracking-wider py-3 font-black transition-all min-h-[44px]"
              >
                Save
              </button>
              <button
                onClick={() => setShowManageSlots(false)}
                className="w-full bg-neutral-800 hover:bg-neutral-700 text-slate-300 font-mono text-xs uppercase tracking-wider py-3 transition-all min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Readout Status Label */}
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

      {/* Main Responsive Dashboard Manifest Table */}
      <div className="bg-slate-900/40 border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative z-10 backdrop-blur-xl">
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-white/10">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-slate-900/80 text-[10px] font-mono uppercase tracking-widest text-slate-400">
                <th className="p-4 font-bold">Client</th>
                <th className="p-4 font-bold">Phone</th>
                <th className="p-4 font-bold">Schedule</th>
                <th className="p-4 font-bold">Time</th>
                <th className="p-4 font-bold">Length</th>
                <th className="p-4 font-bold">Sport</th>
                <th className="p-4 font-bold">Scale</th>
                <th className="p-4 font-bold">Court</th>
                <th className="p-4 font-bold">Total</th>
                <th className="p-4 font-bold">Advance</th>
                <th className="p-4 font-bold">Due Balance</th>
                <th className="p-4 font-bold text-center">Operations</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/5 text-sm font-medium">
              {bookings
                .filter((booking) => {
                  const search = searchTerm.toLowerCase();
                  return (
                    booking.customer_name?.toLowerCase().includes(search) ||
                    booking.phone?.toLowerCase().includes(search) ||
                    booking.booking_date?.toLowerCase().includes(search)
                  );
                })
                .map((booking) => {
                  const bookingDate = booking.booking_date?.split("T")[0];

                  let rowColor = "bg-transparent";
                  const normDate = new Date(booking.booking_date).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
                  if (normDate === today) {
                    rowColor = "bg-lime-500/[0.04]";
                  } else if (normDate === tomorrow) {
                    rowColor = "bg-amber-500/[0.03]";
                  }

                  return (
                    <tr key={booking.id} className={`${rowColor} hover:bg-white/[0.02] transition-colors text-slate-300`}>
                      <td className="p-4 font-bold text-white whitespace-nowrap">
                        {booking.customer_name}
                      </td>

                      <td className="p-4 font-mono text-xs whitespace-nowrap text-slate-400">{booking.phone}</td>

                      <td className="p-4 font-mono text-xs whitespace-nowrap">
                        <span className="text-slate-200">{new Date(bookingDate).toLocaleDateString("en-GB")}</span>
                        {normDate === today && (
                          <span className="ml-2 px-2 py-0.5 rounded-full bg-lime-400/10 border border-lime-400/30 text-lime-400 text-[9px] font-black uppercase tracking-wide">
                            Today
                          </span>
                        )}
                        {normDate === tomorrow && (
                          <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-400 text-[9px] font-black uppercase tracking-wide">
                            Tomorrow
                          </span>
                        )}
                      </td>

                      <td className="p-4 font-mono text-xs text-white whitespace-nowrap">
                        {new Date(`2000-01-01T${booking.start_time}`).toLocaleTimeString("en-IN", {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </td>

                      <td className="p-4 text-xs whitespace-nowrap">{booking.duration_minutes || 60} mins</td>

                      <td className="p-4 text-xs uppercase tracking-wider font-semibold text-slate-400 whitespace-nowrap">
                        {booking.sport}
                      </td>

                      <td className="p-4 whitespace-nowrap">
                        <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-mono uppercase tracking-wider ${
                          booking.booking_type === "Half Court"
                            ? "bg-cyan-500/10 border border-cyan-500/20 text-cyan-400"
                            : "bg-purple-500/10 border border-purple-500/20 text-purple-400"
                        }`}>
                          {booking.booking_type || "Full Court"}
                        </span>
                      </td>

                      <td className="p-4 font-mono text-xs text-slate-400 whitespace-nowrap">{booking.court_number || "-"}</td>
                      
                      <td className="p-4 text-slate-200 font-mono whitespace-nowrap">₹{booking.total_amount}</td>

                      <td className="p-4 text-emerald-400 font-mono whitespace-nowrap">₹{booking.advance_amount || 0}</td>

                      <td className="p-4 font-mono whitespace-nowrap">
                        {booking.balance_amount > 0 ? (
                          <span className="text-red-400 font-bold">₹{booking.balance_amount}</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono uppercase tracking-widest">
                            Paid
                          </span>
                        )}
                      </td>

                      <td className="p-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-2">
                          {booking.balance_amount > 0 && (
                            <button
                              onClick={() => {
                                setSelectedBooking(booking);
                                setShowPaymentModal(true);
                              }}
                              className="bg-lime-400 hover:bg-lime-300 text-slate-950 text-xs font-mono uppercase font-black px-2.5 py-1.5 transition-all"
                            >
                              💰 Collect
                            </button>
                          )}

                          {booking.payment_completed && booking.customer_name !== "Offline Booking" && (
                            <button
                              onClick={() => resetPayment(booking)}
                              className="bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-amber-400 text-xs font-mono uppercase px-2.5 py-1.5 transition-all"
                            >
                              🔄 Reset
                            </button>
                          )}

                          <button
                            onClick={() => deleteBooking(booking.id)}
                            className="bg-neutral-800 hover:bg-red-950 border border-neutral-700 hover:border-red-900 text-red-400 hover:text-white text-xs font-mono uppercase px-2.5 py-1.5 transition-all"
                          >
                            ❌ Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Blocked Slots Matrix List */}
      <div className="bg-slate-900/40 border border-white/10 rounded-2xl overflow-hidden shadow-2xl mt-8 relative z-10 backdrop-blur-xl">
        <div className="p-4 bg-slate-900/80 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-black uppercase tracking-wide text-white">
            🚫 Excluded Field Blocks
          </h2>
        </div>

        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-white/10">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-slate-950/40 text-[10px] font-mono uppercase tracking-widest text-slate-400">
                <th className="p-4 font-bold">Target Date</th>
                <th className="p-4 font-bold">Time Block</th>
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

                  <td className="p-4 font-mono text-xs text-white">
                    {new Date(`2000-01-01T${slot.start_time}`).toLocaleTimeString("en-IN", {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </td>

                  <td className="p-4 text-xs font-mono">{slot.duration_minutes} mins</td>

                  <td className="p-4 font-mono text-xs font-bold text-cyan-400">
                    {slot.court_number}
                  </td>

                  <td className="p-4 font-mono text-xs text-slate-400">
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

      {/* Operational Modal Overlay: Payment Capture Gateway */}
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