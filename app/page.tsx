"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./lib/supabase";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";

/* ------------------------------------------------------------------ */
/* Motion Presets                                                    */
/* ------------------------------------------------------------------ */
const easeOut = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: easeOut } },
};

const slotItem = {
  hidden: { opacity: 0, scale: 0.9, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.25, ease: easeOut } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

/* ------------------------------------------------------------------ */
/* Main Component                                                    */
/* ------------------------------------------------------------------ */
export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [instaHandle, setInstaHandle] = useState("");
  const [sport, setSport] = useState("Football");
  const [bookingDate, setBookingDate] = useState("");
  const [startTime, setStartTime] = useState("");
  
  // ⏳ LIVE DYNAMIC PROMO TIMELINE TICKER CONFIGURATION
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [countdownLabel, setCountdownLabel] = useState("⏰ BOOKINGS OPEN IN:");

  // 📲 TEAM WHATSAPP OVERLAY POPUP MODAL STATE
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [savedBooking, setSavedBooking] = useState({ date: "", time: "" });

  // 🔒 LAUNCH PROMO PARAMETERS
  const bookingType = "Half Court";
  const duration = "60";
  const totalAmount = 205;
  const advanceAmount = 205;
  
  // 📸 INSTAGRAM MANDATORY VERIFICATION STATE
  const [instaAgreed, setInstaAgreed] = useState(false);

  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffRole, setStaffRole] = useState("Admin");
  const [staffPassword, setStaffPassword] = useState("");

  // 🔒 DATE CONSTRAINT VALIDATION ENGINE
  const getKolkataDateString = () =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  const isBookingOpen = () => {
    return getKolkataDateString() >= "2026-07-30";
  };

  /* -------- Live Countdown Loop Execution -------- */
  useEffect(() => {
    const ticker = setInterval(() => {
      const todayStr = getKolkataDateString();
      const isBeforeLaunch = todayStr < "2026-07-30";
      
      // Target changes based on whether we are counting down to the opening or closing milestone
      const targetIso = isBeforeLaunch ? "2026-07-30T00:00:00+05:30" : "2026-08-05T23:59:59+05:30";
      setCountdownLabel(isBeforeLaunch ? "⏰ BOOKINGS OPEN IN:" : "⏰ PROMO CLOSES IN:");

      const targetTime = new Date(targetIso).getTime();
      const now = new Date().getTime();
      const diff = targetTime - now;
      
      if (diff <= 0) {
        setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      } else {
        setCountdown({
          days: Math.floor(diff / (1000 * 60 * 60 * 24)),
          hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((diff % (1000 * 60)) / 1000)
        });
      }
    }, 1000);

    return () => clearInterval(ticker);
  }, []);

  /* -------- Load Razorpay -------- */
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  useEffect(() => {
    if (bookingDate) loadBookedSlots(bookingDate);
  }, [bookingDate]);

  /* -------- Slot Grid Layout Generator -------- */
  const allSlots = Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2);
    const m = i % 2 === 0 ? "00" : "30";
    const ampm = h >= 12 ? "PM" : "AM";
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${String(displayH).padStart(2, "0")}:${m} ${ampm}`;
  });

  const convert12to24 = (time12: string) => {
    const [time, ampm] = time12.split(" ");
    let [hours, minutes] = time.split(":").map(Number);
    if (ampm === "PM" && hours !== 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
  };

  const isSlotAvailable = (slot: string) => {
    if (!bookingDate) return false;
    const segmentsNeeded = Number(duration) / 30;
    const slotIndex = allSlots.indexOf(slot);
    for (let i = 0; i < segmentsNeeded; i++) {
      const targetIndex = slotIndex + i;
      if (targetIndex < allSlots.length) {
        const nextSlot = allSlots[targetIndex];
        if (bookedSlots.includes(nextSlot)) return false;
      }
    }
    const today = getKolkataDateString();
    if (bookingDate < today) return false;
    if (bookingDate !== today) return true;

    const now = new Date();
    const istTimeStr = now.toLocaleTimeString("en-US", {
      timeZone: "Asia/Kolkata",
      hour12: false,
    });
    const [currentHours, currentMins] = istTimeStr.split(":").map(Number);
    const currentMinutes = currentHours * 60 + currentMins;

    const [time, ampm] = slot.split(" ");
    let [hours, minutes] = time.split(":").map(Number);
    if (ampm === "PM" && hours !== 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    const slotMinutes = hours * 60 + minutes;

    return slotMinutes > currentMinutes;
  };

  /* -------- Supabase Load Booked Slots -------- */
  const loadBookedSlots = async (date: string) => {
    const { data: bookingsData, error } = await supabase
      .from("bookings")
      .select("start_time, duration_minutes, booking_type, court_number")
      .eq("booking_date", date);

    const { data: blockedData } = await supabase
      .from("blocked_slots")
      .select("start_time, duration_minutes")
      .eq("booking_date", date);

    if (error) {
      console.log(error);
      return;
    }

    const blocked: string[] = [];
    const slotCounts: Record<string, number> = {};

    if (bookingsData) {
      bookingsData.forEach((booking: any) => {
        if (!booking.start_time) return;
        const time = booking.start_time.substring(0, 5);
        const [h, m] = time.split(":");
        let minutes = Number(h) * 60 + Number(m);
        const slotsToBlock = booking.duration_minutes / 30;

        for (let i = 0; i < slotsToBlock; i++) {
          const current = minutes + i * 30;
          if (current >= 24 * 60) continue;
          const hour24 = Math.floor(current / 60);
          const minute = current % 60;
          const ampm = hour24 >= 12 ? "PM" : "AM";
          const hour12 = hour24 % 12 || 12;
          const slotLabel = `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${ampm}`;

          if (booking.booking_type === "Full Court") {
            slotCounts[slotLabel] = 999;
          } else {
            slotCounts[slotLabel] = (slotCounts[slotLabel] || 0) + 1;
          }
        }
      });

      Object.entries(slotCounts).forEach(([slot, count]) => {
        if (count >= 2 || count === 999) blocked.push(slot);
      });
    }

    if (blockedData) {
      blockedData.forEach((slot: any) => {
        if (!slot.start_time) return;
        const time = slot.start_time.substring(0, 5);
        const [h, m] = time.split(":");
        let minutes = Number(h) * 60 + Number(m);
        const slotsToBlock = (slot.duration_minutes || 60) / 30;

        for (let i = 0; i < slotsToBlock; i++) {
          const current = minutes + i * 30;
          if (current >= 24 * 60) continue;
          const hour24 = Math.floor(current / 60);
          const minute = current % 60;
          const ampm = hour24 >= 12 ? "PM" : "AM";
          const hour12 = hour24 % 12 || 12;
          blocked.push(`${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${ampm}`);
        }
      });
    }

    setBookedSlots(blocked);
  };

  /* -------- Razorpay Transaction Gateway Execution -------- */
  const openRazorpay = async () => {
    try {
      if (!isBookingOpen()) {
        alert("🔒 Promo bookings open on 30th July!");
        return;
      }
      if (!name || !phone || !instaHandle || !bookingDate || !startTime || !instaAgreed) {
        alert("Please fulfill registration fields, specify your Instagram handle, pick a kickoff slot, and accept the launch promo agreement.");
        return;
      }

      const { data: duplicatePromoCheck } = await supabase
        .from("bookings")
        .select("id")
        .eq("phone", phone);

      if (duplicatePromoCheck && duplicatePromoCheck.length > 0) {
        alert("❌ Promo Limit Exceeded: This phone number has already reserved a promotional slot. To ensure fairness, players or teams are strictly restricted to 1 promo booking.");
        return;
      }

      const availabilityCheck = await handleBooking("CHECK_ONLY");
      if (!availabilityCheck) return;

      const response = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: advanceAmount }),
      });

      const order = await response.json();

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: "SMES Turf Launch Offer",
        description: "Special Promo Court Entry Fee",
        order_id: order.id,
        handler: async function (res: any) {
          await handleBooking(res);
        },
        prefill: { name, contact: phone },
      };

      if ((window as any).Razorpay) {
        const razor = new (window as any).Razorpay(options);
        razor.open();
      } else {
        alert("Payment gateway script still loading. Please try again in a moment.");
      }
    } catch (error) {
      console.error(error);
      alert("Failed to open payment gateway");
    }
  };

  /* -------- Booking Logic Processing Framework -------- */
  const handleBooking = async (paymentData?: any) => {
    const { data: doubleCheckPromo } = await supabase
      .from("bookings")
      .select("id")
      .eq("phone", phone);

    if (doubleCheckPromo && doubleCheckPromo.length > 0) {
      alert("❌ Limit Exceeded: This player line has already filled a promo allocation.");
      return false;
    }

    const { data: existingBookings } = await supabase
      .from("bookings")
      .select("*")
      .eq("booking_date", bookingDate);

    const selectedDuration = Number(duration);
    const convertToMinutes = (time: string) => {
      if (!time) return 0;
      const [timePart, ampm] = time.split(" ");
      let [hours, minutes] = timePart.split(":").map(Number);
      if (ampm === "PM" && hours !== 12) hours += 12;
      if (ampm === "AM" && hours === 12) hours = 0;
      return hours * 60 + minutes;
    };

    const selectedStart = convertToMinutes(startTime);
    const selectedEnd = selectedStart + selectedDuration;

    let courtNumber = "";
    const overlappingBookings =
      existingBookings?.filter((booking) => {
        if (!booking.start_time) return false;
        const [hours, minutes] = booking.start_time.substring(0, 5).split(":").map(Number);
        const bookingStart = hours * 60 + minutes;
        const bookingEnd = bookingStart + booking.duration_minutes;
        return selectedStart < bookingEnd && selectedEnd > bookingStart;
      }) || [];

    const court1Taken = overlappingBookings.some((b) => b.court_number === "Court 1");
    const court2Taken = overlappingBookings.some((b) => b.court_number === "Court 2");
    if (!court1Taken) courtNumber = "Court 1";
    else if (!court2Taken) courtNumber = "Court 2";
    else { alert("❌ No Half Court Available."); return; }

    if (paymentData === "CHECK_ONLY") return true;

    const { error } = await supabase.from("bookings").insert([
      {
        customer_name: `${name} (IG: ${instaHandle})`,
        phone,
        booking_type: bookingType,
        court_number: courtNumber,
        sport: sport.toLowerCase(),
        booking_date: bookingDate,
        start_time: convert12to24(startTime),
        duration_minutes: Number(duration),
        total_amount: totalAmount,
        advance_amount: totalAmount,
        balance_amount: 0,
        razorpay_order_id: paymentData?.razorpay_order_id,
        razorpay_payment_id: paymentData?.razorpay_payment_id,
        payment_status: "paid",
      },
    ]);

    if (error) { console.error(error); alert(error.message); return; }

    // 📲 CACHE BOOKING DETAILS FOR THE WHATSAPP SHARE ENGINE INDUCTION LAYER BEFORE CLEARDOWN
    setSavedBooking({ date: bookingDate, time: startTime });
    setShowSuccessModal(true);

    setName("");
    setPhone("");
    setInstaHandle("");
    setBookingDate("");
    setStartTime("");
    setInstaAgreed(false);
  };

  /* -------- Staff Login Gateway Link -------- */
  const handleStaffLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (staffRole === "Admin" && staffPassword === "SMES@2026") {
      localStorage.setItem("adminLoggedIn", "true");
      router.push("/admin");
    } else if (staffRole === "Sub-Admin" && staffPassword === "1234") {
      localStorage.setItem("subadminLoggedIn", "true");
      router.push("/subadmin");
    } else if (staffRole === "Coach" && staffPassword === "2468") {
      localStorage.setItem("subAdminLoggedIn", "true");
      router.push("/coach");
    } else {
      alert("❌ Invalid Passkey Code Entry");
    }
    setShowStaffModal(false);
    setStaffPassword("");
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 font-sans tracking-tight antialiased relative w-full overflow-x-hidden">
      
      {/* Aurora Background Context Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 inset-x-0 h-[400px] sm:h-[640px] bg-gradient-to-b from-lime-500/10 via-transparent to-transparent" />
      </div>

      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="absolute top-6 right-4 z-[100]">
        <button suppressHydrationWarning={true} onClick={() => setShowStaffModal(true)} className="text-neutral-400 hover:text-lime-400 p-2 cursor-pointer text-xl">⚙️</button>
      </motion.div>

      <header className="max-w-7xl mx-auto px-4 pt-16 pb-6 text-center relative z-10 flex flex-col items-center">
        <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 text-xs font-semibold uppercase tracking-widest text-lime-400 mb-6">
          🚀 AUGUST LAUNCH PROMO CELEBRATION
        </div>
        <h1 className="text-4xl sm:text-6xl md:text-8xl font-black tracking-tighter uppercase text-white">SMES TURF</h1>
        <p className="text-base sm:text-lg text-neutral-400 mt-4 font-mono uppercase tracking-wider">
          💥 Launch Special: Half Court Match Slots at <span className="text-lime-400 font-black">₹205 Fixed Rate</span>
        </p>

        {/* ⏳ TWO-PHASE COUNTDOWN TICKER LAYOUT */}
        <div className="mt-6 px-6 py-3 bg-neutral-900/60 border border-neutral-800/80 font-mono text-xs text-white uppercase tracking-widest flex items-center gap-4 shadow-xl">
          <span className="text-amber-400 font-bold animate-pulse">{countdownLabel}</span>
          <div className="flex gap-2 text-sm font-black text-white">
            <span>{String(countdown.days).padStart(2, '0')}d</span>:
            <span>{String(countdown.hours).padStart(2, '0')}h</span>:
            <span>{String(countdown.minutes).padStart(2, '0')}m</span>:
            <span className="text-lime-400">{String(countdown.seconds).padStart(2, '0')}s</span>
          </div>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-4 py-12 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          
          {/* Form Processing Console */}
          <div className="lg:col-span-7 space-y-6">
            <h2 className="text-2xl font-black uppercase tracking-tight text-white border-b border-neutral-900 pb-2">1. Secure Your Match Setup</h2>
            
            <div className="space-y-4">
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase text-neutral-400">Full Name</label>
                  <input type="text" disabled={!isBookingOpen()} placeholder="Athlete name" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-4 bg-neutral-900/50 border border-neutral-800 text-xs font-medium outline-none text-white focus:border-lime-400 disabled:opacity-30 disabled:cursor-not-allowed" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase text-neutral-400">Phone Number</label>
                  <input type="tel" disabled={!isBookingOpen()} placeholder="10 Digits contact" value={phone} onChange={(e) => { const s = e.target.value.replace(/\D/g, ""); if (s.length <= 10) setPhone(s); }} className="w-full p-4 bg-neutral-900/50 border border-neutral-800 text-xs font-mono outline-none text-white focus:border-lime-400 disabled:opacity-30 disabled:cursor-not-allowed" />
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase text-neutral-400">Instagram Handle</label>
                  <input 
                    type="text" 
                    disabled={!isBookingOpen()}
                    placeholder="@username" 
                    value={instaHandle} 
                    onChange={(e) => {
                      let val = e.target.value;
                      if (val && !val.startsWith("@")) val = "@" + val;
                      setInstaHandle(val);
                    }} 
                    className="w-full p-4 bg-neutral-900/50 border border-neutral-800 text-xs font-mono outline-none text-lime-400 font-bold focus:border-lime-400 placeholder-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase text-neutral-400">Sport</label>
                  <select disabled={!isBookingOpen()} value={sport} onChange={(e) => setSport(e.target.value)} className="w-full p-4 bg-neutral-900 border border-neutral-800 text-sm font-medium outline-none text-white disabled:opacity-30 disabled:cursor-not-allowed">
                    <option value="Football">Football</option>
                    <option value="Cricket">Cricket</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase text-neutral-400">Scale Locked</label>
                  <div className="p-4 bg-neutral-950 border border-neutral-900 font-mono text-xs text-lime-400 font-bold uppercase">⚡ Half Court Launch Offer Only</div>
                </div>
              </div>

              {/* Date Input - 🔒 RESTRICTED AUGUST CAMPAIGN WINDOW LIMITS */}
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase text-neutral-400">Calendar Date</label>
                <input 
                  type="date" 
                  min="2026-08-01" // 🔒 Absolute Campaign Window Boundaries
                  max="2026-08-05" 
                  disabled={!isBookingOpen()}
                  value={bookingDate} 
                  onChange={(e) => setBookingDate(e.target.value)} 
                  className="w-full p-4 bg-neutral-900 text-white border border-neutral-800 font-medium text-sm outline-none disabled:opacity-30 disabled:cursor-not-allowed" 
                  style={{ colorScheme: "dark" }} 
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-mono uppercase text-neutral-400">Duration Timeframe</label>
                <div className="p-4 bg-neutral-950 border border-neutral-900 font-mono text-xs text-slate-300 font-bold uppercase">⏱ 60 Minutes Standard Arena Booking</div>
              </div>

              {/* Dynamic Kickoff Selector Dashboard Grid */}
              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <label className="text-xs font-mono uppercase text-neutral-400">Kickoff Slot Grid</label>
                  
                  {bookingDate && (
                    <span className="text-[10px] font-mono font-bold text-amber-400 tracking-wider bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 uppercase animate-pulse">
                      🔥 Only {allSlots.filter((slot) => isSlotAvailable(slot)).length} Promo Slots Left!
                    </span>
                  )}
                </div>
                
                <div className={`grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 p-4 bg-neutral-900/30 border border-neutral-800 max-h-[260px] overflow-y-auto ${!bookingDate || !isBookingOpen() ? "opacity-30 pointer-events-none" : ""}`}>
                  {allSlots.map((slot) => {
                    const available = isSlotAvailable(slot);
                    const selected = startTime === slot;
                    return (
                      <button key={slot} disabled={!available || !isBookingOpen()} onClick={() => setStartTime(slot)} className={`py-3 text-[11px] font-mono font-bold uppercase border ${selected ? "bg-red-600 border-red-500 text-white" : available ? "bg-lime-500/10 border-lime-500/30 text-lime-400 hover:bg-lime-500 hover:text-black" : "bg-neutral-950 border-neutral-900 text-neutral-600 opacity-40 cursor-not-allowed"}`}>
                        {slot}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Receipt Breakdowns & Summary Matrix */}
          <div className="lg:col-span-5 bg-neutral-900/50 border border-neutral-900 p-6 space-y-6 lg:sticky lg:top-6">
            <div className="border-b border-neutral-800 pb-4">
              <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Receipt Pipeline Summary</span>
              <h3 className="text-lg font-black uppercase text-white mt-1">Pitch Bill Receipt</h3>
            </div>

            <div className="space-y-2 text-xs font-mono text-neutral-400">
              <div className="flex justify-between"><span>SPORT:</span><span className="text-white font-bold uppercase">{sport}</span></div>
              <div className="flex justify-between"><span>SCALE:</span><span className="text-white font-bold">Half Court Arena</span></div>
              <div className="flex justify-between"><span>TARGET DATE:</span><span className="text-lime-400 font-bold">{bookingDate || "Unselected"}</span></div>
              <div className="flex justify-between"><span>MATCH KICKOFF:</span><span className="text-white font-bold">{startTime || "Unselected"}</span></div>
              <div className="flex justify-between"><span>DURATION:</span><span className="text-white font-bold">60 Mins Lineup</span></div>
            </div>

            <div className="bg-black p-4 border border-neutral-800 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-mono text-white font-black tracking-wider">GROSS FIELD VALUE:</span>
                <span className="text-[20px] font-black text-white">₹{totalAmount}</span>
              </div>
              
              <div className="h-px bg-neutral-800" />
              
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono text-neutral-400 font-bold tracking-wider">LOCKDOWN RESERVATION FEE:</span>
                <span className="text-[17.7px] font-black text-lime-400">₹200 + Convenience Fee</span>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-black border border-neutral-800">
              <input 
                type="checkbox" 
                id="insta-verification-checkbox" 
                disabled={!isBookingOpen()}
                checked={instaAgreed} 
                onChange={(e) => setInstaAgreed(e.target.checked)} 
                className="w-5 h-5 accent-lime-400 mt-0.5 cursor-pointer flex-shrink-0 disabled:opacity-30" 
              />
              <label htmlFor="insta-verification-checkbox" className="text-[11px] font-mono text-neutral-300 cursor-pointer leading-relaxed select-none disabled:opacity-30">
                I agree that my teamates will follow <span className="text-white font-bold">@smesturf</span> on Instagram, post a story of the SMES Turf handle post in their story, mention us, and use <span className="text-lime-400 font-bold">#SMESTurf</span>. ⚠️ <span className="text-white font-bold underline">Main Condition:</span> I confirm no player from my team has booked or will book another slot under this launch offer.
              </label>
            </div>

            {/* 🔒 MAIN SUBMIT TRIGGER GATED LOGIC CONTROLS */}
            <button 
              disabled={!isBookingOpen() || !startTime || !instaAgreed || !instaHandle} 
              onClick={openRazorpay} 
              className={`w-full font-mono text-xs uppercase tracking-widest py-4 font-black transition-all ${!isBookingOpen() || !startTime || !instaAgreed || !instaHandle ? "bg-neutral-800 text-neutral-500 cursor-not-allowed" : "bg-lime-400 hover:bg-lime-300 text-black cursor-pointer"}`}
            >
              {!isBookingOpen() ? "Bookings Open on 30th July" : !startTime ? "Select Kickoff Slot" : !instaHandle ? "Provide Instagram Handle" : !instaAgreed ? "Accept Terms & Conditions" : "Confirm Launch Booking"}
            </button>
          </div>

        </div>
      </section>

      {/* 📲 UPGRADED WHATSAPP INTERACTION BLAST POPUP OVERLAY */}
      <AnimatePresence>
        {showSuccessModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-[99999]">
            <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-2xl w-full max-w-md text-center space-y-6">
              <div className="text-4xl text-lime-400">🎉</div>
              <h3 className="text-xl font-black uppercase text-white tracking-tight">Match Slot Reserved!</h3>
              
              <p className="text-xs font-mono text-neutral-400">
                Your lineup on <span className="text-white font-bold">{savedBooking.date}</span> at <span className="text-lime-400 font-bold">{savedBooking.time}</span> is securely locked.
              </p>
              
              <div className="p-4 bg-black border border-neutral-800/80 text-left rounded-xl">
                <p className="text-[11px] font-mono text-neutral-400 leading-relaxed">
                  📢 <span className="text-white font-bold">Important Strategy Note:</span> Pass this blast link onto your team group chat right now so all players can follow, post, and mention <span className="text-white font-bold">@smesturf</span> before arrival!
                </p>
              </div>

              <button
                onClick={() => {
                  const message = `Match Locked! 🏟️ SMES Turf | 📅 ${savedBooking.date} | 🕒 ${savedBooking.time}. Reminder: Everyone needs to follow @smesturf and post/tag the story before kickoff to keep our promo rate! #SMESTurf`;
                  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, "_blank");
                }}
                className="w-full bg-lime-400 hover:bg-lime-300 text-black font-mono text-xs uppercase tracking-widest py-4 font-black transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-lime-400/10"
              >
                📲 Share with Team (WhatsApp)
              </button>
              
              <button onClick={() => setShowSuccessModal(false)} className="text-xs font-mono text-neutral-500 hover:text-white underline block mx-auto cursor-pointer transition-colors">
                Close Window
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Access Gate Modal Management Blocks */}
      <AnimatePresence>
        {showStaffModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[99999]" onClick={() => setShowStaffModal(false)}>
            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-center text-sm font-mono uppercase tracking-widest text-lime-400">// Gateway Panel</h3>
              <form onSubmit={handleStaffLogin} className="space-y-4">
                <select value={staffRole} onChange={(e) => setStaffRole(e.target.value)} className="w-full p-3 bg-neutral-950 border border-neutral-800 text-xs text-white">
                  <option value="Admin">Admin</option>
                  <option value="Sub-Admin">Sub-Admin</option>
                  <option value="Coach">Coach</option>
                </select>
                <input type="password" placeholder="Passkey code" value={staffPassword} onChange={(e) => setStaffPassword(e.target.value)} className="w-full p-3 bg-neutral-950 border border-neutral-800 text-xs text-white outline-none" />
                <button type="submit" className="w-full bg-lime-400 text-black py-2.5 font-mono text-xs uppercase font-black">Verify Node</button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}