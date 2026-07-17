"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./lib/supabase";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { getPrice } from "./lib/booking-rules";

/* ------------------------------------------------------------------ */
/* Motion Presets                                                    */
/* ------------------------------------------------------------------ */
const easeOut = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: easeOut } },
};

const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.8, ease: easeOut } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const slotItem = {
  hidden: { opacity: 0, scale: 0.9, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.25, ease: easeOut } },
};

/* ------------------------------------------------------------------ */
/* Main Component                                                    */
/* ------------------------------------------------------------------ */
export default function Home() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sport, setSport] = useState("Football");
  const [bookingDate, setBookingDate] = useState("");

  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState(""); 
  const [bookingType, setBookingType] = useState("Full Court");

  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  
  // 🔒 CLIENT DATE STATE: Fixes server-side pre-render hydration leaks completely
  const [minDate, setMinDate] = useState("");

  // 🌤️ DYNAMIC WEATHER WIDGET STATE
  const [weather, setWeather] = useState<{ temp: number; condition: string } | null>(null);

  // 🎨 DYNAMIC UI THEME ENGINE
  const theme = useMemo(() => {
    const isRainy = weather?.condition.includes("Rain") || weather?.condition.includes("Drizzle") || weather?.condition.includes("Thunderstorm");
    const isHot = weather?.temp ? weather.temp >= 28 && !isRainy : false;

    if (isRainy) return {
      emoji: "🌧️",
      aurora1: "from-cyan-500/15", aurora2: "bg-blue-500/15", aurora3: "bg-cyan-500/15",
      ticketBar: "from-cyan-500 to-blue-400", textAccent: "text-cyan-400", 
      glow: "drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]", pulse: "bg-cyan-400", iconShadow: "shadow-[0_0_15px_rgba(34,211,238,0.15)]"
    };
    if (isHot) return {
      emoji: "☀️",
      aurora1: "from-orange-500/15", aurora2: "bg-rose-500/15", aurora3: "bg-orange-500/15",
      ticketBar: "from-orange-500 to-rose-400", textAccent: "text-orange-400",
      glow: "drop-shadow-[0_0_8px_rgba(251,146,60,0.5)]", pulse: "bg-orange-400", iconShadow: "shadow-[0_0_15px_rgba(251,146,60,0.15)]"
    };
    // Default / Perfect Weather (Signature Lime)
    return {
      emoji: "🌤️",
      aurora1: "from-lime-500/10", aurora2: "bg-emerald-500/10", aurora3: "bg-lime-500/10",
      ticketBar: "from-lime-500 to-emerald-400", textAccent: "text-lime-400",
      glow: "drop-shadow-[0_0_8px_rgba(163,230,53,0.5)]", pulse: "bg-lime-400", iconShadow: "shadow-[0_0_15px_rgba(163,230,53,0.15)]"
    };
  }, [weather]);

  // Staff Auth
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffRole, setStaffRole] = useState("Admin");

  const [staffPassword, setStaffPassword] = useState("");

  /* -------- Fetch Live Mysuru Weather (Open-Meteo API) -------- */
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        // Hitting live free coordinates for Vijayanagar 2nd Stage, Mysuru
        const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=12.3400&longitude=76.6100&current_weather=true");
        const data = await res.json();
        
        if (data?.current_weather) {
          const temp = Math.round(data.current_weather.temperature);
          const code = data.current_weather.weathercode;
          
          let condition = "Clear Conditions";
          if (code >= 1 && code <= 3) condition = "Partly Cloudy";
          if (code >= 45 && code <= 48) condition = "Fog Warning";
          if (code >= 51 && code <= 67) condition = "Light Drizzle";
          if (code >= 71 && code <= 82) condition = "Heavy Rain";
          if (code >= 95) condition = "Thunderstorm Warning";

          setWeather({ temp, condition });
        }
      } catch (e) {
        console.log("Weather node sync isolated.");
      }
    };
    fetchWeather();
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

  // 🔒 CLIENT-SIDE ACTIVATION: Safely computes current local date to override server html cache
  useEffect(() => {
    setMinDate(getLocalDateString());
  }, []);

  useEffect(() => {
    if (bookingDate) loadBookedSlots(bookingDate);
  }, [bookingDate, bookingType]);

  /* -------- Dynamic Launch Offer Pricing Engine (Extracted Pure Function) -------- */
  const { totalAmount, regularAmount, advanceAmount } = useMemo(
    () => getPrice(duration, bookingType),
    [duration, bookingType]
  );

  /* -------- Slot Grid -------- */
  const allSlots = Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2);
    const m = i % 2 === 0 ? "00" : "30";
    const ampm = h >= 12 ? "PM" : "AM";
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${String(displayH).padStart(2, "0")}:${m} ${ampm}`;
  });

  const getLocalDateString = () =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  const convert12to24 = (time12: string) => {
    const [time, ampm] = time12.split(" ");
    let [hours, minutes] = time.split(":").map(Number);
    if (ampm === "PM" && hours !== 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
  };

  const isSlotAvailable = (slot: string) => {
    if (!bookingDate || !duration) return false;
    const segmentsNeeded = Number(duration) / 30;
    const slotIndex = allSlots.indexOf(slot);
    
    for (let i = 0; i < segmentsNeeded; i++) {
      // ✅ FIX: Use modulo (%) to wrap the index around to the next day
      const targetIndex = (slotIndex + i) % allSlots.length;
      const nextSlot = allSlots[targetIndex];
      if (bookedSlots.includes(nextSlot)) return false;
    }
    
    const today = getLocalDateString();
    if (bookingDate && bookingDate < today) return false;
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

  useEffect(() => {
    if (startTime && !isSlotAvailable(startTime)) setStartTime("");
  }, [bookingDate, bookedSlots, duration]);

  /* -------- Supabase Load Booked Slots -------- */
  const loadBookedSlots = async (dateStr: string) => {
    // 1. Calculate today and yesterday to catch cross-day midnight bookings
    const selectedDate = new Date(dateStr);
    const prevDate = new Date(selectedDate);
    prevDate.setDate(prevDate.getDate() - 1);

    const currentDateStr = dateStr;
    const prevDateStr = prevDate.toISOString().split("T")[0];

    // 2. Fetch bookings and blocks for BOTH days
    const { data: bookingsData, error } = await supabase
      .from("bookings")
      .select("start_time, duration_minutes, booking_type, court_number, booking_date")
      .in("booking_date", [prevDateStr, currentDateStr]);

    const { data: blockedData } = await supabase
      .from("blocked_slots")
      .select("start_time, duration_minutes, court_number, booking_date") 
      .in("booking_date", [prevDateStr, currentDateStr]);

    if (error) {
      console.log(error);
      return;
    }

    const slotCounts: Record<string, number> = {};

    // Helper function to process slots correctly across midnight and court types
    const processSlots = (dataArray: any[] | null, isBlock = false) => {
      if (!dataArray) return;
      
      dataArray.forEach((slot: any) => {
        if (!slot.start_time) return;
        const time = slot.start_time.substring(0, 5);
        const [h, m] = time.split(":");
        let startMinutes = Number(h) * 60 + Number(m);
        const slotsToBlock = (slot.duration_minutes || 60) / 30;

        for (let i = 0; i < slotsToBlock; i++) {
          let currentMinute = startMinutes + i * 30;
          let isSlotForToday = false;

          // Cross-day logic: Does this 30-min segment fall on the day we are looking at?
          if (slot.booking_date === currentDateStr) {
            if (currentMinute < 24 * 60) isSlotForToday = true;
          } else if (slot.booking_date === prevDateStr) {
            if (currentMinute >= 24 * 60) {
              isSlotForToday = true;
              currentMinute = currentMinute - (24 * 60); // Reset clock to 00:00 for today
            }
          }

          if (isSlotForToday) {
            const hour24 = Math.floor(currentMinute / 60);
            const minute = currentMinute % 60;
            const ampm = hour24 >= 12 ? "PM" : "AM";
            const hour12 = hour24 % 12 || 12;
            const slotLabel = `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${ampm}`;

            // Determine if this is a Full Court or Half Court reservation/block
            let type = slot.booking_type; 
            if (isBlock) {
               // Admin blocks usually use court_number. If it's a specific court, it's Half.
               if (slot.court_number === "Both Courts" || !slot.court_number) {
                  type = "Full Court";
               } else {
                  type = "Half Court";
               }
            }

            if (type === "Full Court") {
              slotCounts[slotLabel] = 999; // 999 means totally blocked
            } else {
              slotCounts[slotLabel] = (slotCounts[slotLabel] || 0) + 1; // +1 means one half is taken
            }
          }
        }
      });
    };

    // Process both regular bookings and admin blocks through the same secure logic
    processSlots(bookingsData, false);
    processSlots(blockedData, true);

    // 3. Finalize fully booked slots based on what the user is currently trying to book
    const blocked: string[] = [];
    Object.entries(slotCounts).forEach(([slot, count]) => {
      if (bookingType === "Full Court") {
        if (count >= 1) blocked.push(slot); // If even one half is taken, full court is blocked
      } else {
        if (count >= 2 || count === 999) blocked.push(slot); // Half court only blocked if both halves are taken
      }
    });

    setBookedSlots(blocked);
  };

  /* -------- Secure Razorpay Intent -------- */
  const openRazorpay = async () => {
    try {
      if (!name || !phone || !bookingDate || !startTime) {
        alert("⚠️ Please fill all fields and select a valid time slot.");
        return;
      }
      if (phone.length !== 10) {
        alert("⚠️ Invalid Phone Number: Please enter exactly 10 digits.");
        return;
      }

      // 1. Ask Server to Check Availability & Generate Order
      const response = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingDate,
          startTime,
          duration,
          bookingType,
          amount: 205 // ₹200 Advance + ₹5 Razorpay Convenience Fee
        })
      });

      const orderData = await response.json();

      if (!response.ok) {
        alert(`❌ ${orderData.error || "Slot is no longer available. Please select another time."}`);
        loadBookedSlots(bookingDate); // Refresh UI to show it's locked
        return;
      }

      // 2. Open Razorpay securely
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "SMES Turf",
        description: "Advance Booking Payment",
        order_id: orderData.id,
        handler: async function (paymentRes: any) {
          await handleBooking(paymentRes);
        },
        prefill: { name, contact: phone },
      };

      if ((window as any).Razorpay) {
        const razor = new (window as any).Razorpay(options);
        razor.open();
      } else {
        alert("Payment gateway script still loading. Please try again.");
      }
    } catch (error) {
      console.error("Order creation failed:", error);
      alert("Failed to initiate secure checkout.");
    }
  };

  /* -------- Secure Server Booking Handler -------- */
  const handleBooking = async (paymentData: any) => {
    try {
      // 3. Send payment tokens & booking details to the Server for Verification & DB Insertion
      const response = await fetch("/api/verify-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentData,
          bookingDetails: {
            name, phone, sport, bookingType, bookingDate, startTime, duration, totalAmount
          }
        }),
      });

      const verifyData = await response.json();

      if (!response.ok) {
        alert(`❌ ${verifyData.error || "Payment verification failed."}`);
        return;
      }

      // 4. Dispatch Notifications (Now that server confirmed insertion)
      const balanceAmount = totalAmount - 200;
      const bookingId = verifyData.booking?.id ? `#${verifyData.booking.id.toString().slice(-4)}` : "#----";
      
      const clientText = `🏟️ *SMES Sports Academy Booking Confirmed*\n\nHello ${name},\n\nYour booking has been successfully confirmed.\n\n📅 *Date:* ${bookingDate}\n🕒 *Time:* ${startTime}\n⏱ *Duration:* ${duration} Minutes\n🏏 *Sport:* ${sport}\n🏟 *Court:* ${bookingType}\n\n💰 *Total Amount:* ₹${totalAmount}\n✅ *Advance Paid:* ₹200\n💳 *Balance Due:* ₹${balanceAmount}\n\n📍 *Location:*\nSMES Sports Academy, Mysuru\n\n⚠️ Please arrive 10 minutes before your slot.\n⚠️ Balance payment must be completed before play starts.\n\nThank you for choosing SMES Sports Academy.\n\n📞 *Support:* 8453095258`;
      const adminText = `🔔 *NEW BOOKING RECEIVED*\n\n*SMES Sports Academy*\n\n👤 *Customer:* ${name}\n📞 *Phone:* ${phone}\n\n📅 *Date:* ${bookingDate}\n🕒 *Time:* ${startTime}\n⏱ *Duration:* ${duration} Minutes\n\n🏟 *Court:* ${verifyData.booking?.court_number || bookingType}\n🏏 *Sport:* ${sport}\n\n💰 *Total Amount:* ₹${totalAmount}\n✅ *Advance Paid:* ₹200\n💳 *Balance:* ₹${balanceAmount}\n\n💳 *Payment Status:* PAID\n\n*Booking ID:* ${bookingId}`;

      await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerPhone: `91${phone}`,
          customerMessage: clientText,
          adminMessage: adminText,
        }),
      });

      alert("✅ Payment Successful & Booking Secured!");

      setName("");
      setPhone("");
      setBookingDate("");
      setStartTime("");
      setDuration("");
      loadBookedSlots(bookingDate); 

    } catch (error) {
      console.error(error);
      alert("A network error occurred during confirmation.");
    }
  };

  /* -------- Staff Login (Real Cryptographic Auth with Shared Email) -------- */
  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    let staffEmail = "";
    if (staffRole === "Admin") staffEmail = "sports+admin@smestuff.com";
    if (staffRole === "Sub-Admin") staffEmail = "sports+subadmin@smestuff.com";
    if (staffRole === "Coach") staffEmail = "sports+coach@smestuff.com";

    if (!staffEmail) return;

    const { data, error } = await supabase.auth.signInWithPassword({
      email: staffEmail,
      password: staffPassword,
    });

    if (error) {
      alert(`❌ Authorization Refused: ${error.message}`);
      return;
    }

    if (data.session) {
      if (staffRole === "Admin") {
        localStorage.setItem("adminLoggedIn", "true");
        localStorage.setItem("adminLoginTime", Date.now().toString());
        router.push("/admin");
      } else if (staffRole === "Sub-Admin") {
        localStorage.setItem("subadminLoggedIn", "true");
        router.push("/subadmin");
      } else if (staffRole === "Coach") {
        localStorage.setItem("subAdminLoggedIn", "true");
        router.push("/coach");
      }
      setShowStaffModal(false);
      setStaffPassword("");
    }
  };

  const scrollToBooking = () => {
    const el = document.getElementById("booking-engine-section");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  /* ================================================================ */
  /* RENDER                                                          */
  /* ================================================================ */
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 font-sans tracking-tight antialiased relative w-full overflow-x-hidden">

      {/* ---------- Animated Aurora Background ---------- */}
     
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 inset-x-0 h-[400px] sm:h-[640px] bg-gradient-to-b from-lime-500/10 via-transparent to-transparent" />
        <motion.div
          animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-5%] left-[-10%] w-[60%] h-[40%] bg-emerald-500/10 rounded-full blur-[80px] sm:blur-[120px]"
        />
      
        <motion.div
          animate={{ x: [0, -50, 0], y: [0, 40, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[15%] right-[-10%] w-[50%] h-[50%] bg-lime-500/10 rounded-full blur-[80px] sm:blur-[120px]"
        />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
     
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      {/* ---------- Hamburger ---------- */}
      <motion.div
    
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="absolute top-6 right-4 sm:top-8 sm:right-6 z-[100]"
      >
        <motion.button
          suppressHydrationWarning={true}
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.95 }}
  
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          onClick={() => setShowStaffModal(true)}
          className="text-neutral-400 hover:text-lime-400 p-2 transition-colors cursor-pointer flex items-center justify-center"
          title="Staff Login"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 
12h16M4 18h16" />
          </svg>
        </motion.button>
      </motion.div>

      {/* ---------- Header ---------- */}
      <motion.header
        variants={stagger}
        initial="hidden"
        animate="show"
        className="max-w-7xl mx-auto px-4 pt-12 pb-6 sm:pt-16 sm:pb-8 relative z-10 text-center"
      >
        <motion.div
   
          variants={fadeUp}
          className="inline-flex items-center gap-1.5 px-3 py-1 sm:px-4 sm:py-1.5 rounded-full bg-slate-900/80 backdrop-blur border border-slate-800 text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-lime-400 mb-4 sm:mb-6 mt-4"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" />
          Elite Sports Venue
        </motion.div>

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 sm:gap-8">
    
          <div className="text-center lg:text-left">
            <motion.h1
              variants={fadeUp}
              className="text-4xl sm:text-6xl md:text-8xl font-black tracking-tighter uppercase leading-none text-white"
            >
              <span className="inline-block bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-neutral-400">
            
                SMES TURF
              </span>
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="text-base sm:text-lg md:text-xl font-medium tracking-normal text-neutral-400 mt-3 sm:mt-4 max-w-xl mx-auto lg:mx-0"
            >
       
               Premium multisport arena built for high-performance{" "}
              <span className="text-lime-400">Football</span> &{" "}
              <span className="text-lime-400">Cricket</span> action.
            </motion.p>
          </div>

          <motion.div
            variants={fadeUp}
            className="grid grid-cols-1 gap-2 w-full max-w-md mx-auto lg:max-w-none lg:mx-0 lg:flex lg:w-auto lg:gap-3"
          >
            <motion.button
              suppressHydrationWarning={true}
          
              whileHover={{ y: -2, boxShadow: "0 12px 30px rgba(163,230,53,0.35)" }}
              whileTap={{ scale: 0.97 }}
              onClick={scrollToBooking}
              type="button"
              className="bg-lime-400 hover:bg-lime-300 text-black text-xs font-mono uppercase tracking-wider p-4 rounded-none transition-colors font-black text-center shadow-lg shadow-lime-400/10 cursor-pointer flex items-center justify-center gap-2"
           
             >
              📅 BOOK NOW
            </motion.button>
            {[
              { href: "https://wa.me/918453095258", label: "WhatsApp" },
              { href: "https://instagram.com/smesturf", label: "Instagram" }, 
              { href: "https://maps.google.com/?q=12.329329,76.612008", label: "Find Arena" 
              },
              { href: "tel:+918453095258", label: "Call Desk" },
            ].map((btn) => (
              <motion.a
                key={btn.label}
                whileHover={{ y: -2, borderColor: "rgba(163,230,53,0.6)" }}
               
                whileTap={{ scale: 0.97 }}
                href={btn.href}
                className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white text-xs font-mono uppercase tracking-wider p-4 rounded-none transition-colors text-center flex items-center justify-center"
              >
                {btn.label}
              </motion.a>
     
               ))}
          </motion.div>
        </div>

        {/* ⚡ PRICING PROMO NODE */}
        <motion.div
          variants={fadeUp}
          className="mt-8 sm:mt-12 inline-flex items-center gap-3 sm:gap-4 bg-neutral-900/70 backdrop-blur border border-neutral-800 px-4 py-3 rounded-none w-full sm:w-auto"
        >
          <span className="flex 
h-2 w-2 relative flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500" />
          </span>
          <p className="text-[11px] sm:text-xs font-mono uppercase tracking-wide text-neutral-300">
            ⚡ Launch Offer: <span className="text-neutral-500 line-through mr-1 font-medium">₹2400</span> <span className="text-lime-400 font-bold">₹1200 / Hr</span>
       
           </p>
        </motion.div>

      </motion.header>

      {/* ---------- Disciplines ---------- */}
      <motion.section
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="max-w-7xl mx-auto px-4 py-12 sm:px-6 sm:py-20 border-b border-neutral-900 relative z-10"
      >
       
         <motion.span variants={fadeUp} className="text-[11px] font-mono uppercase tracking-widest text-neutral-500 block mb-2">
          01 — Disciplines
        </motion.span>
        <motion.h2 variants={fadeUp} className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white mb-8 sm:mb-12">
          Sports Arena Layout
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
          {[
           
             {
              tag: "01 // TRACK FIELD",
              title: "Football Arena",
              desc: "From fast-paced 7-A-side tactical clashes to open-field training drills.",
            },
            {
              tag: "02 // NET BOX",
              title: "Box Cricket",
              desc: "High-bounce, entirely enclosed system built for maximum velocity cricket action.",
            },
          ].map((card) => (
            <motion.div
              key={card.title}
          
              variants={fadeUp}
              whileHover={{ y: -4, borderColor: "rgba(163,230,53,0.4)" }}
              transition={{ duration: 0.3, ease: easeOut }}
              className="border border-neutral-900 bg-neutral-900/20 p-6 sm:p-8 flex flex-col justify-between group transition-colors min-h-[180px] sm:min-h-[220px]"
            >
              <div>
       
                 <span className="text-[11px] font-mono text-neutral-600 block mb-3 sm:mb-4">
                  {card.tag}
                </span>
                <h3 className="text-xl sm:text-2xl font-bold uppercase tracking-tight text-white group-hover:text-lime-400 transition-colors">
                  {card.title}
         
                </h3>
                <p className="text-neutral-400 text-xs sm:text-sm mt-2 max-w-sm">{card.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ---------- Booking Engine ---------- */}
      <section
     
         id="booking-engine-section"
        className="max-w-7xl mx-auto px-4 py-12 sm:px-6 sm:py-20 relative z-10 scroll-mt-6"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">

          {/* -------- Form Side -------- */}
          <motion.div
            variants={stagger}
            initial="hidden"
            
whileInView="show"
            viewport={{ once: true, amount: 0.15 }}
            className="lg:col-span-7 space-y-6 sm:space-y-8"
          >
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-widest text-neutral-500 block mb-2">
   
                 02 — Reservation
                </span>
                <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
                  Select and Secure Pitch
                </h2>
        
              </div>
              
              {/* 🌤️ NEW WEATHER WIDGET PLACEMENT */}
              {weather && (
                <div className="bg-neutral-900/40 border border-neutral-800 px-4 py-2.5 inline-flex items-center gap-3">
                  <span className="text-xl">🌤️</span>
 
                  <div>
                    <span className="block text-[9px] font-mono uppercase tracking-widest text-neutral-500">
                      Vijayanagar 2nd Stage
                    </span>
             
        <span className="text-xs font-mono text-white font-bold">
                      {weather.temp}°C — <span className="text-lime-400">{weather.condition}</span>
                    </span>
                  </div>
                </div>
          
              )}
            </motion.div>

            <div className="space-y-4 sm:space-y-6">
              {/* Name + Phone */}
              <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-2">
               
                   <label className="text-xs font-mono uppercase text-neutral-400">Full Name</label>
                  <input
                    suppressHydrationWarning={true}
                    type="text"
                    placeholder="Enter athlete name"
            
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full p-4 bg-neutral-900/50 text-lime-400 font-bold border border-neutral-800 focus:border-lime-400 outline-none rounded-none transition-all text-base md:text-sm"
                  />
                </div>
    
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase text-neutral-400">Phone Number</label>
                  <input
                    suppressHydrationWarning={true}
                    type="tel"
      
                    placeholder="Active phone contact"
                    value={phone}
                    onChange={(e) => {
                      const sanitized = e.target.value.replace(/\D/g, "");
if (sanitized.length <= 10) setPhone(sanitized);
                    }}
                    className="w-full p-4 bg-neutral-900/50 text-white font-mono border border-neutral-800 focus:border-lime-400 outline-none rounded-none transition-all text-base md:text-sm"
                  />
                </div>
              </motion.div>

              {/* Sport + Pitch Config (Interactive UI Upgrade) */}
              <motion.div variants={fadeUp} className="space-y-6">
                
                {/* Discipline Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase text-neutral-400">Sport Discipline</label>
  
                  <div className="relative">
                    <select
                      suppressHydrationWarning={true}
                      value={sport}
                      onChange={(e) => setSport(e.target.value)}
                      className="w-full p-4 bg-neutral-900 text-lime-400 font-bold border border-neutral-800 focus:border-lime-400 outline-none rounded-none appearance-none text-base md:text-sm transition-colors"
                    >
                      <option value="Football">⚽ Football</option>
                      <option value="Cricket">🏏 Cricket</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 text-xs">▼</div>
                  </div>
                </div>

           
                {/* Interactive Field Configurator (UX Upgraded) */}
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase text-neutral-400 flex justify-between items-center">
                    <span>Arena Scale Configuration</span>
                    <span className="text-lime-400 tracking-wider font-black">{bookingType.toUpperCase()}</span>
                  </label>
                  
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 bg-neutral-900/40 p-3 sm:p-4 border border-neutral-800">
                    
                    {/* Visual Graphic Pitch (Purely a Visual Indicator) */}
                    <div className="relative w-full sm:w-2/3 h-32 sm:h-40 bg-[#0d2a13] border-2 border-neutral-700 rounded-sm overflow-hidden flex shadow-inner group">
                      
                      {/* Field Lines Overlay */}
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-40 group-hover:opacity-70 transition-opacity duration-300 z-10">
                        <div className="w-0.5 h-full bg-white" />
                        <div className="absolute w-14 sm:w-20 h-14 sm:h-20 border-2 border-white rounded-full" />
                        <div className="absolute w-1.5 h-1.5 bg-white rounded-full" />
                        <div className="absolute left-0 w-8 sm:w-12 h-16 sm:h-24 border-2 border-l-0 border-white top-1/2 -translate-y-1/2" />
                        <div className="absolute right-0 w-8 sm:w-12 h-16 sm:h-24 border-2 border-r-0 border-white top-1/2 -translate-y-1/2" />
                      </div>

                      {/* Visual Indicator Overlay */}
                      <div className="absolute inset-0 z-20 pointer-events-none flex">
                        {bookingType === "Half Court" ? (
                          <>
                            {/* Highlighted Left Half */}
                            <motion.div 
                              initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
                              className="w-1/2 h-full bg-lime-400/30 flex items-center justify-center border-r-2 border-lime-400 border-dashed backdrop-blur-[1px]"
                            >
                              <span className="text-lime-400 text-[10px] sm:text-xs font-black tracking-widest font-mono bg-black/80 px-2.5 py-1.5 shadow-lg border border-lime-400/30 uppercase">
                                5v5 Half
                              </span>
                            </motion.div>
                            {/* Dimmed Right Half */}
                            <motion.div 
                              initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
                              className="w-1/2 h-full bg-black/70 flex items-center justify-center"
                            >
                              <span className="text-neutral-500 text-[9px] font-bold tracking-widest font-mono uppercase bg-black/60 px-2 py-0.5 border border-neutral-800">
                                Unused Space
                              </span>
                            </motion.div>
                          </>
                        ) : (
                          <>
                            {/* Highlighted Full Court */}
                            <motion.div 
                              initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
                              className="w-full h-full bg-lime-400/20 flex items-center justify-center backdrop-blur-[1px]"
                            >
                              <span className="text-lime-400 text-xs sm:text-sm font-black tracking-widest font-mono bg-black/80 px-4 py-2 shadow-[0_0_20px_rgba(163,230,53,0.3)] border border-lime-400/50 uppercase">
                                7v7 Full Arena
                              </span>
                            </motion.div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Quick Toggle Buttons (The interactive controls) */}
                    <div className="flex flex-row sm:flex-col w-full sm:w-1/3 gap-2">
                      <motion.button
                        type="button"
                        whileHover={{ x: 2 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => setBookingType("Half Court")}
                        className={`flex-1 flex flex-col items-center justify-center py-2.5 px-3 transition-all border ${
                          bookingType === "Half Court" 
                            ? "bg-lime-400 text-black border-lime-400 shadow-[0_0_20px_rgba(163,230,53,0.3)]" 
                            : "bg-neutral-950 text-neutral-500 border-neutral-800 hover:border-neutral-700 hover:text-white"
                        }`}
                      >
                        <span className="text-[9px] uppercase tracking-widest mb-0.5 font-bold opacity-80">5v5 Mode</span>
                        <span className="font-mono font-black text-xs sm:text-sm uppercase tracking-wider">Half Court</span>
                      </motion.button>
                      <motion.button
                        type="button"
                        whileHover={{ x: 2 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => setBookingType("Full Court")}
                        className={`flex-1 flex flex-col items-center justify-center py-2.5 px-3 transition-all border ${
                          bookingType === "Full Court" 
                            ? "bg-lime-400 text-black border-lime-400 shadow-[0_0_20px_rgba(163,230,53,0.3)]" 
                            : "bg-neutral-950 text-neutral-500 border-neutral-800 hover:border-neutral-700 hover:text-white"
                        }`}
                      >
                        <span className="text-[9px] uppercase tracking-widest mb-0.5 font-bold opacity-80">7v7 Mode</span>
                        <span className="font-mono font-black text-xs sm:text-sm uppercase tracking-wider">Full Arena</span>
                      </motion.button>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Date */}
              <motion.div variants={fadeUp} className="space-y-2">
                <label className="text-xs font-mono uppercase text-neutral-400">Calendar Date</label>
              
                <input
                  suppressHydrationWarning={true}
                  type="date"
                  min={minDate}
                  value={bookingDate}
                  onChange={(e) => {
      
                    setBookingDate(e.target.value);
                    loadBookedSlots(e.target.value);
}}
                  className="w-full p-4 bg-neutral-900 text-lime-400 font-bold font-mono border border-neutral-800 focus:border-lime-400 outline-none rounded-none text-base md:text-sm"
                  style={{ colorScheme: "dark" }}
                />
              </motion.div>

              {/* 🕒 DYNAMIC PRICE SCALER 
*/}
              <motion.div variants={fadeUp} className="space-y-2 relative">
                <label className="text-xs font-mono uppercase text-neutral-400">Session Length</label>
                <div className="relative">
                  <select
                    disabled={!bookingDate} 
      
                    suppressHydrationWarning={true}
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className={`w-full p-4 bg-neutral-900 text-white border outline-none rounded-none appearance-none text-base md:text-sm transition-all ${
             
                         !bookingDate ?
"border-neutral-800/50 opacity-40 cursor-not-allowed text-neutral-500" : "border-neutral-800 focus:border-lime-400"
                    }`}
                  >
                    <option value="" disabled hidden>-- Select Session Length --</option> 
                    <option value="60">60 Minutes (- ₹{bookingType === "Half Court" 
? 700 : 1200})</option>
                    <option value="90">90 Minutes (- ₹{bookingType === "Half Court" ? 1050 : 1800})</option>
                    <option value="120">120 Minutes (- ₹{bookingType === "Half Court" ? 1400 : 2400})</option>
                  </select>
                 
                  <div className={`pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-xs transition-all ${
                    !bookingDate ?
"text-neutral-700 opacity-40" : "text-neutral-500"
                  }`}>▼</div>
                </div>
              </motion.div>

              {/* Slot Grid */}
              <motion.div variants={fadeUp} className="space-y-2 relative">
               
                 <label className="text-xs font-mono uppercase text-neutral-400">Kickoff Slot</label>
                <div className="relative">
                  <LayoutGroup>
                    <motion.div
                      variants={stagger}
                 
                      initial="hidden"
                      animate="show"
                      className={`grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 p-3 sm:p-4 bg-neutral-900/30 border border-neutral-800 max-h-[320px] overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-700 transition-all ${
                        !bookingDate ||
!duration ? "opacity-40 pointer-events-none select-none" : ""
                      }`}
                    >
                      {allSlots.map((slot) => {
                        const available = isSlotAvailable(slot);
 
                       const selected = startTime === slot;

                        return (
                          <motion.button
                     
                           suppressHydrationWarning={true}
                            key={slot}
                            variants={slotItem}
                            whileHover={available && !selected && bookingDate && duration ? { 
scale: 1.06 } : {}}
                            whileTap={available && bookingDate && duration ? { scale: 0.94 } : {}}
                            type="button"
                            disabled={!available 
|| !bookingDate || !duration} 
                            onClick={() => setStartTime(slot)}
                            className={`relative py-3 px-1 text-[11px] sm:text-xs font-mono font-bold uppercase transition-colors border ${
                            
                              selected
                                ?
"bg-red-600 border-red-500 text-white"
                                : available && bookingDate && duration
                                ?
"bg-lime-500/10 border-lime-500/30 text-lime-400 hover:bg-lime-500 hover:text-black cursor-pointer"
                                : "bg-neutral-950 border-neutral-900 text-neutral-600 opacity-50 cursor-not-allowed"
                            }`}
                          >
    
                            {selected && (
                              <motion.span
                                layoutId="slot-selected-glow"
            
                                className="absolute inset-0 bg-red-600 -z-0 shadow-[0_0_18px_rgba(220,38,38,0.55)]"
                                transition={{ type: "spring", stiffness: 350, damping: 30 }}
                              />
       
                             )}
                            <span className="relative z-10">{slot}</span>
                          </motion.button>
                       
                        );
                      })}
                    </motion.div>
                  </LayoutGroup>
                </div>
              </motion.div>
            </div>
          </motion.div>

        
          {/* -------- Summary Side (VIP Match Ticket Upgrade) -------- */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.7, ease: easeOut }}
           
             className="lg:col-span-5 lg:sticky lg:top-6"
          >
            {/* 🎟️ TICKET CONTAINER */}
            <div className="relative bg-[#0a0a0a] border border-neutral-800 flex flex-col shadow-2xl overflow-hidden">
              
              {/* Top Bar Accent */}
              <div className="h-2 w-full bg-gradient-to-r from-lime-500 
to-emerald-400" />
              
              {/* Ticket Header (Motion UI Upgraded) */}
              <div className="p-5 sm:p-6 pb-4 flex justify-between items-start">
                <div>
                  <motion.div
           
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    className="flex items-center gap-2 mb-1.5"
                  >
                  
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-lime-500"></span>
                    </span>
                
                    <span className="text-[10px] font-mono text-lime-400 uppercase tracking-[0.2em] drop-shadow-[0_0_8px_rgba(163,230,53,0.5)]">
                      Official Access Pass
                    </span>
                  </motion.div>
                  <h3 className="text-xl font-black uppercase text-white tracking-tight">SMES Turf Arena</h3>
   
                 </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-neutral-900 border border-neutral-800 flex items-center justify-center rotate-3 shrink-0 shadow-[0_0_15px_rgba(163,230,53,0.15)]">
                  <span className="text-lime-400 text-xl sm:text-2xl font-black">{sport === "Cricket" ?
"🏏" : "⚽"}</span>
                </div>
              </div>

              {/* Match Details Grid (Randomized Accent Colors) */}
              <div className="px-5 sm:px-6 py-4 grid grid-cols-2 gap-y-5 gap-x-4 bg-neutral-900/30">
                <div className="col-span-2 sm:col-span-1">
       
                   <span className="text-[9px] text-neutral-500 font-mono uppercase block mb-1">Pass Holder</span>
                  <span className="text-xs sm:text-sm font-bold text-lime-400 uppercase tracking-wider truncate block">
                    {name ||
"GUEST"}
                  </span>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <span className="text-[9px] text-neutral-500 font-mono uppercase block mb-1">Contact</span>
                  <span className="text-xs sm:text-sm font-bold text-white uppercase 
tracking-wider">
                    {phone ?
`+91 ${phone}` : "REQUIRED"}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-neutral-500 font-mono uppercase block mb-1">Sport</span>
                  <span className="text-xs sm:text-sm font-bold text-lime-400 
uppercase tracking-wider">{sport}</span>
                </div>
                <div>
                  <span className="text-[9px] text-neutral-500 font-mono uppercase block mb-1">Scale</span>
                  <span className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">{bookingType}</span>
                </div>
   
                 <div>
                  <span className="text-[9px] text-neutral-500 font-mono uppercase block mb-1">Date</span>
                  <span className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                    {bookingDate ?
new Date(bookingDate).toLocaleDateString("en-GB") : "TBD"}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-neutral-500 font-mono uppercase block mb-1">Kickoff</span>
                  <span className="text-xs sm:text-sm font-bold text-lime-400 
uppercase tracking-wider">{startTime || "TBD"}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-[9px] text-neutral-500 font-mono uppercase block mb-1">Timeframe</span>
                  <span className="text-xs sm:text-sm font-bold text-lime-400 uppercase tracking-wider">
                
                    {duration ? `${duration} Minutes` : "TBD"}
                  </span>
                </div>
              </div>

              {/* Perforated Tear Line */}
              <div className="relative w-full h-8 flex items-center justify-center my-1">
    
                 <div className="absolute left-[-16px] w-8 h-8 bg-neutral-950 rounded-full border border-neutral-800 z-10" />
                <div className="absolute left-[-20px] w-10 h-10 bg-neutral-950 z-20" /> 
                <div className="absolute left-[-16px] w-8 h-8 rounded-full border-r border-neutral-800 z-30" />
                
             
                <div className="w-full border-t-2 border-dashed border-neutral-800 relative z-0 mx-4" />
                
                <div className="absolute right-[-16px] w-8 h-8 bg-neutral-950 rounded-full border border-neutral-800 z-10" />
                <div className="absolute right-[-20px] w-10 h-10 bg-neutral-950 z-20" /> 
                <div className="absolute right-[-16px] w-8 h-8 rounded-full border-l 
border-neutral-800 z-30" />
              </div>

              {/* Pricing Breakdown */}
              <div className="px-5 sm:px-6 py-2 space-y-4">
                <div className="flex justify-between items-end">
                  <div>
            
                    <span className="text-[10px] text-neutral-500 font-mono uppercase block">Gross Value</span>
                    {totalAmount > 0 && (
                      <span className="text-[11px] text-neutral-600 line-through font-mono tracking-widest block mt-0.5">
                        ₹{regularAmount}
         
                      </span>
                    )}
                  </div>
                  <AnimatePresence mode="wait">
                    <motion.span
          
                      key={totalAmount}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2 }}
         
                      className="text-2xl font-black text-lime-400 leading-none"
                    >
                      ₹{totalAmount}
                    </motion.span>
                  </AnimatePresence>
    
                 </div>

                <div className="p-3 bg-lime-400/5 border border-lime-400/20 flex justify-between items-center">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-lime-400 uppercase tracking-widest block">Lockdown Advance</span>
                   
                    <span className="text-[9px] font-mono text-neutral-500 mt-0.5 block hidden sm:block">Reserves slot instantly</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black text-white block leading-none">₹200</span>
                    <span className="text-[8px] font-mono text-neutral-500 uppercase tracking-widest mt-1 block">+ 
Convenience Fee</span>
                  </div>
                </div>
              </div>

              {/* Digital Barcode (Interactive & Animated) */}
              <div className="px-5 sm:px-6 pt-4 pb-6 flex flex-col items-center opacity-30">
                <div className="w-full h-8 flex justify-between items-end gap-[2px]">
                  {Array.from({ length: 35 }).map((_, i) => {
                    const deterministicWidth = (i % 4) + 1.5;
                    
                    // Create a dynamic seed that changes whenever ANY form field changes
                    const inputSeed = name.length + phone.length + sport.length + bookingType.length + bookingDate.length + startTime.length + duration.length;
                    
                    // Mix the static index with the dynamic seed to calculate a shifting height between 20% and 100%
                    const dynamicHeight = 20 + (((i * 29) + (inputSeed * 17)) % 80);

                    return (
                      <motion.div 
                        key={i} 
                        className="bg-white rounded-t-sm" 
                        initial={false}
                        animate={{ height: `${dynamicHeight}%` }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        style={{ width: `${deterministicWidth}px` }} 
                      />
                    );
                  })}
                </div>
                <span className="text-[8px] font-mono text-white tracking-[0.3em] mt-2">
                  SMES-{bookingDate ? bookingDate.replace(/-/g, "") : "XXXXXXXX"}-{startTime ? startTime.substring(0, 5).replace(":", "") : "XXXX"}
                </span>
              </div>
            </div>

            {/* Premium Checkout Button */}
            <motion.button
              suppressHydrationWarning={true}
         
              whileHover={startTime && name && phone.length === 10 ?
                { y: -2, boxShadow: "0 12px 30px rgba(163,230,53,0.35)" } : {}}
              whileTap={startTime && name && phone.length === 10 ?
                { scale: 0.97 } : {}}
              type="button"
              onClick={openRazorpay}
              disabled={!startTime ||
                !name || phone.length !== 10}
              className={`w-full mt-4 font-mono text-xs sm:text-sm uppercase tracking-widest py-4 sm:py-5 transition-all font-black shadow-lg flex items-center justify-center gap-3 ${
                !startTime ||
                !name || phone.length !== 10
                  ?
                  "bg-neutral-900 border border-neutral-800 text-neutral-600 cursor-not-allowed"
                  : "bg-lime-400 hover:bg-lime-300 text-black border border-lime-400 shadow-lime-400/20"
              }`}
            >
              {!name ||
                phone.length !== 10 
                ?
                  "Enter Name & 10-Digit Phone" 
                : !startTime 
                ?
                  "Select Kickoff Time" 
                : "⚡ Confirm Match Slot"}
            </motion.button>
          </motion.div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <motion.footer
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
   
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="w-full border-t border-neutral-900 pt-8 pb-32 px-4 sm:px-6 relative z-10"
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center md:items-start gap-6 text-center md:text-left">
          <div className="space-y-1.5">
            <p className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">
            
              SMES Sports Academy Ground Hub
            </p>
            <p className="text-[9px] text-neutral-600 font-mono">
              © 2026 Built for competitive team sports action and weekend fun.
            </p>
          </div>
          <div className="flex flex-wrap justify-center md:justify-end gap-x-6 gap-y-2 font-mono text-[9px] sm:text-[10px] text-neutral-400 uppercase tracking-widest">
            <div><span className="text-lime-500">P:</span> +91 8453095258</div>
            <div><span className="text-lime-500">E:</span> sports@smesturf.com</div>
            <div><span className="text-lime-500">L:</span> Mysuru, Karnataka</div>
          </div>
        </div>
      
      </motion.footer>

      {/* ---------- Floating CTA ---------- */}
      <motion.button
        suppressHydrationWarning={true}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.5, ease: easeOut }}
        whileHover={{ scale: 1.05, boxShadow: "0 0 30px rgba(163,230,53,0.5)" }}
        whileTap={{ scale: 0.95 }}
       
        onClick={scrollToBooking}
        className="fixed bottom-6 right-4 md:bottom-8 md:right-8 z-[9000] bg-lime-400 hover:bg-lime-300 text-black px-6 py-3.5 rounded-full transition-colors shadow-[0_0_20px_rgba(163,230,53,0.3)] cursor-pointer flex items-center gap-2 text-[12px] font-mono font-black uppercase tracking-widest"
        title="Book Now"
      >
        <motion.span
          animate={{ rotate: [0, 15, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
        >
     
          ⚡
        </motion.span>
        <span>Book Now</span>
      </motion.button>

      {/* ---------- Staff Modal ---------- */}
      <AnimatePresence>
        {showStaffModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
     
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[99999]"
            onClick={() => setShowStaffModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, 
                y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl 
                w-full max-w-sm shadow-2xl space-y-4"
            >
              <div className="text-center">
                <span className="text-[10px] font-mono uppercase tracking-widest text-lime-400">
                  // Secure Node Terminal
                </span>
            
                <h3 className="text-lg font-black uppercase text-white mt-1">System Gateway</h3>
              </div>

              <form onSubmit={handleStaffLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-neutral-400">
                   
                    Target Role
                  </label>
                  <LayoutGroup>
                    <div className="grid grid-cols-3 gap-2">
                      {["Admin", "Sub-Admin", "Coach"].map((role) => (
             
                        <motion.button
                          suppressHydrationWarning={true}
                          key={role}
                          type="button"
           
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setStaffRole(role)}
                          className={`relative py-2.5 text-[11px] font-mono uppercase tracking-wider transition-colors border ${
                    
                            staffRole === role
                              ?
                              "bg-lime-400 border-lime-400 text-black font-black"
                              : "bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white"
                          }`}
                        >
             
                          {staffRole === role && (
                            <motion.span
                              layoutId="role-highlight"
                         
                              className="absolute inset-0 bg-lime-400 -z-0"
                              transition={{ type: "spring", stiffness: 350, damping: 30 }}
                            />
                          )}
 
                          <span className="relative z-10">{role}</span>
                        </motion.button>
                      ))}
                    </div>
       
                  </LayoutGroup>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    Access Keycode
           
                  </label>
                  <input
                    suppressHydrationWarning={true}
                    type="password"
                    placeholder="Enter password"
              
                    value={staffPassword}
                    onChange={(e) => setStaffPassword(e.target.value)}
                    className="w-full p-3.5 rounded-xl bg-neutral-950 text-white border border-neutral-800 focus:border-lime-400 outline-none text-sm font-medium"
                    autoFocus
                  />
    
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <motion.button
                    suppressHydrationWarning={true}
                    whileHover={{ y: -1 }}
       
                    whileTap={{ scale: 0.97 }}
                    type="submit"
                    className="w-full bg-gradient-to-r from-lime-400 to-lime-300 text-neutral-950 font-mono text-xs uppercase tracking-wider py-3 font-black transition-all min-h-[44px]"
                  >
              
                    Authorize
                  </motion.button>
                  <motion.button
                    suppressHydrationWarning={true}
                    whileHover={{ y: -1 }}
               
                    whileTap={{ scale: 0.97 }}
                    type="button"
                    onClick={() => {
                      setShowStaffModal(false);
                      setStaffPassword("");
                    }}
                    className="w-full bg-neutral-800 hover:bg-neutral-700 text-slate-300 font-mono text-xs uppercase tracking-wider py-3 transition-colors min-h-[44px]"
                  >
                    Cancel
                  </motion.button>
             
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}