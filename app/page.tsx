"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import Image from "next/image";
import { supabase } from "./lib/supabase";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";

/* ------------------------------------------------------------------ */
/* Motion Presets & Constants                                        */
/* ------------------------------------------------------------------ */
const easeOut = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: easeOut } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const slotItem = {
  hidden: { opacity: 0, scale: 0.9, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.25, ease: easeOut } },
};

const ALL_KICKOFF_SLOTS = [
  "06:00 AM", "07:00 AM", "08:00 AM", "09:00 AM", "10:00 AM",
  "11:00 AM", "12:00 PM", "01:00 PM", "02:00 PM", "03:00 PM",
  "04:00 PM", "05:00 PM", "06:00 PM", "07:00 PM", "08:00 PM",
  "09:00 PM", "10:00 PM", "11:00 PM"
];

/* -------- HELPER: CALCULATE BLOCKED SLOTS FOR A SPECIFIC DATE -------- */
const calculateBlockedSlots = (
  dateStr: string,
  currentType: string,
  bookingsData: any[],
  blockedData: any[]
) => {
  const timeToMinutes = (timeStr: string) => {
    if (!timeStr) return 0;
    const clean = timeStr.trim().toUpperCase();
    if (clean.includes("AM") || clean.includes("PM")) {
      const parts = clean.split(" ");
      const timePart = parts[0];
      const ampm = parts[1];
      let [h, m] = timePart.split(":").map(Number);
      if (ampm === "PM" && h !== 12) h += 12;
      if (ampm === "AM" && h === 12) h = 0;
      return h * 60 + (m || 0);
    } else {
      const [h, m] = clean.split(":").map(Number);
      return h * 60 + (m || 0);
    }
  };

  const blockedList: string[] = [];

  ALL_KICKOFF_SLOTS.forEach((slot) => {
    const slotStart = timeToMinutes(slot);
    const slotEnd = slotStart + 60; // 60 mins promo duration
    let count = 0;

    const checkOverlapAndCount = (items: any[]) => {
      items
        .filter((item) => item.booking_date === dateStr)
        .forEach((item) => {
          if (!item.start_time) return;
          const bStart = timeToMinutes(item.start_time);
          const bEnd = bStart + (Number(item.duration_minutes) || 60);

          if (slotStart < bEnd && slotEnd > bStart) {
            const isFull =
              item.booking_type === "Full Court" ||
              item.court_number === "Full Court" ||
              item.court_number === "Both Courts";

            if (isFull) {
              count = 999;
            } else {
              count += 1;
            }
          }
        });
    };

    checkOverlapAndCount(bookingsData);
    checkOverlapAndCount(blockedData);

    if (currentType === "Full Court") {
      if (count >= 1) blockedList.push(slot);
    } else {
      if (count >= 2 || count === 999) blockedList.push(slot);
    }
  });

  return blockedList;
};


/* ------------------------------------------------------------------ */
/* Main Component (INDEPENDENCE DAY MEGA PROMO)                      */
/* ------------------------------------------------------------------ */
export default function Home() {
  const router = useRouter();

  // 📝 USER INPUT STATE
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [instaHandle, setInstaHandle] = useState("");
  const [sport, setSport] = useState(""); 
  
  const [bookingDate, setBookingDate] = useState(""); 
  const [startTime, setStartTime] = useState("");
  const duration = "60"; 
  const [bookingType, setBookingType] = useState(""); 
  
  // 🚫 BOOKED / BLOCKED SLOTS STATE
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  
  // 🔒 PROMO DATES AVAILABILITY (Checks if day is entirely sold out)
  const [promoDatesStatus, setPromoDatesStatus] = useState<Record<string, boolean>>({
    "2026-08-15": true,
    "2026-08-16": true,
    "2026-08-17": true,
    "2026-08-18": true,
    "2026-08-19": true,
  });

  // 💰 DYNAMIC PRICING CONFIGURATION (FULL PAYMENT)
  const totalAmount = bookingType === "Half Court" ? 205 : (bookingType === "Full Court" ? 410 : 0); 
  const regularAmount = bookingType === "Half Court" ? 1200 : (bookingType === "Full Court" ? 2400 : 0); 
  
  // 📸 INSTAGRAM MANDATORY VERIFICATION STATE
  const [instaAgreed, setInstaAgreed] = useState(false);

  // 📲 TEAM WHATSAPP OVERLAY POPUP MODAL STATE
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [savedBooking, setSavedBooking] = useState({ date: "", time: "" });
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);
  const [isProcessingBooking, setIsProcessingBooking] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [successData, setSuccessData] = useState<any>(null);

  const [weather, setWeather] = useState<{ temp: number; condition: string } | null>(null);
  const autoPassRef = useRef<HTMLDivElement>(null);


  /* -------- HELPER: TIME RANGE FORMATTER -------- */
  const getTimeRangeLabel = (startTimeStr: string, durationMins: number | string) => {
    if (!startTimeStr) return "";
    const parts = startTimeStr.split(" ");
    if (parts.length < 2) return startTimeStr;

    const [time, ampm] = parts;
    let [h, m] = time.split(":").map(Number);
    if (ampm === "PM" && h !== 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;

    const startTotal = h * 60 + m;
    const endTotal = startTotal + Number(durationMins || 60);

    const formatString = (t: number) => {
      const hours24 = Math.floor(t / 60) % 24;
      const mins = t % 60;
      const displayH = hours24 % 12 === 0 ? 12 : hours24 % 12;
      const displayAMPM = hours24 >= 12 ? "PM" : "AM";
      return `${String(displayH).padStart(2, "0")}:${String(mins).padStart(2, "0")} ${displayAMPM}`;
    };

    return `${startTimeStr} - ${formatString(endTotal)}`;
  };

  /* -------- FETCH PROMO DATES AVAILABILITY OVERVIEW -------- */
  useEffect(() => {
    const checkPromoDates = async () => {
      if (!bookingType) return;
      
      const datesToCheck = ["2026-08-15", "2026-08-16", "2026-08-17", "2026-08-18", "2026-08-19"];
      
      const { data: bookingsData } = await supabase
        .from("bookings")
        .select("start_time, duration_minutes, booking_type, court_number, booking_date")
        .in("booking_date", datesToCheck);

      const { data: blockedData } = await supabase
        .from("blocked_slots")
        .select("start_time, duration_minutes, court_number, booking_date")
        .in("booking_date", datesToCheck);

      const newStatus: Record<string, boolean> = {};

      datesToCheck.forEach(dateStr => {
        const blocked = calculateBlockedSlots(dateStr, bookingType, bookingsData || [], blockedData || []);
        // If the amount of blocked slots is less than the total available slots, the day is available
        newStatus[dateStr] = blocked.length < ALL_KICKOFF_SLOTS.length; 
      });

      setPromoDatesStatus(newStatus);
    };

    checkPromoDates();
  }, [bookingType]);


  /* -------- RE-FETCH BOOKED SLOTS FOR SELECTED DATE -------- */
  useEffect(() => {
    const loadSlotsForDate = async () => {
      if (!bookingDate || !bookingType) {
        setBookedSlots([]);
        return;
      }

      const { data: bookingsData } = await supabase
        .from("bookings")
        .select("start_time, duration_minutes, booking_type, court_number, booking_date")
        .eq("booking_date", bookingDate);

      const { data: blockedData } = await supabase
        .from("blocked_slots")
        .select("start_time, duration_minutes, court_number, booking_date")
        .eq("booking_date", bookingDate);

      const blocked = calculateBlockedSlots(bookingDate, bookingType, bookingsData || [], blockedData || []);
      setBookedSlots(blocked);
    };
    
    loadSlotsForDate();
  }, [bookingDate, bookingType]);


  /* -------- RESET START TIME OR DATE IF IT BECOMES BLOCKED -------- */
  useEffect(() => {
    // If selected date becomes entirely blocked because of a scale change
    if (bookingDate && promoDatesStatus[bookingDate] === false) {
      setBookingDate("");
      setStartTime("");
    }
    // If selected time becomes blocked
    else if (startTime && bookedSlots.includes(startTime)) {
      setStartTime("");
    }
  }, [bookedSlots, startTime, promoDatesStatus, bookingDate]);


  /* -------- AUTOMATIC PASS DOWNLOAD TRIGGER -------- */
  useEffect(() => {
    if (successData) {
      const triggerAutoDownload = async () => {
        try {
          await new Promise((resolve) => setTimeout(resolve, 600));
          if (!autoPassRef.current) return;
          const { toPng } = await import("html-to-image");

          const dataUrl = await toPng(autoPassRef.current, {
            quality: 0.95,
            pixelRatio: 2,
            backgroundColor: "#0a0a0a",
            cacheBust: true,
          });

          const link = document.createElement("a");
          link.download = `SMES_Freedom_Pass_${successData.referenceId || successData.bookingId}.png`;
          link.href = dataUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } catch (err) {
          console.error("Auto-download error:", err);
        }
      };
      triggerAutoDownload();
    }
  }, [successData]);

  /* -------- Fetch Live Mysuru Weather -------- */
  useEffect(() => {
    const fetchWeather = async () => {
      try {
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

  /* -------- Secure Razorpay Intent -------- */
  const openRazorpay = async () => {
    try {
      if (!name || !phone || !email || !instaHandle || !sport || !bookingType || !bookingDate || !startTime || !instaAgreed) {
        alert("Please fulfill all registration fields, select a sport, select a court type, pick a kickoff slot, and accept the promo agreement.");
        return;
      }

      // 🛑 ENFORCEMENT: Check for duplicate promo entries via phone OR email
      const { data: duplicatePromoCheck } = await supabase
        .from("bookings")
        .select("id")
        .or(`phone.eq.${phone},email.eq.${email}`);

      if (duplicatePromoCheck && duplicatePromoCheck.length > 0) {
        alert("❌ Promo Limit Exceeded: This phone number or email ID has already reserved a promotional slot. To ensure fairness, players are restricted to 1 promo booking.");
        return;
      }

      setIsPaymentLoading(true);

      const response = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          bookingDate,
          startTime,
          duration,
          bookingType,
          amount: totalAmount 
        }),
      });

      const orderData = await response.json();

      if (!response.ok) {
        setIsPaymentLoading(false);
        alert(`❌ ${orderData.error || "Slot is no longer available. Please select another time."}`);
        return;
      }

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "SMES Turf Freedom Offer",
        description: `${bookingType} Promo Entry`,
        order_id: orderData.id,
        handler: async function (paymentRes: any) {
          await handleBooking(paymentRes);
        },
        prefill: { 
          name: name,
          email: email, 
          contact: `+91${phone}` 
        },
        readonly: {
          name: true,
          email: true,
          contact: true, 
        },
      };

      if ((window as any).Razorpay) {
        const razor = new (window as any).Razorpay(options);
        razor.open();
        setIsPaymentLoading(false);
      } else {
        setIsPaymentLoading(false);
        alert("Payment gateway script still loading. Please try again in a moment.");
      }
    } catch (error) {
      setIsPaymentLoading(false);
      console.error(error);
      alert("Failed to open payment gateway");
    }
  };

  /* -------- Secure Server Booking Handler (WhatsApp & DB Sync) -------- */
  const handleBooking = async (paymentData: any) => {
    setIsProcessingBooking(true);

    try {
      const response = await fetch("/api/verify-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentData,
          bookingDetails: {
            name: `${name} (IG: ${instaHandle})`, 
            phone, 
            email, 
            sport: sport.toLowerCase(), 
            bookingType, 
            bookingDate, 
            startTime, 
            duration, 
            totalAmount
          }
        }),
      });

      const verifyData = await response.json();

      if (!response.ok) {
        setIsProcessingBooking(false);
        alert(`❌ ${verifyData.error || "Payment verification failed."}`);
        return;
      }

      const balanceAmount = 0; // Total is paid upfront for promo
      const bookingId = verifyData.booking?.id ? `#${verifyData.booking.id}` : "#----";
      const referenceId = verifyData.booking?.booking_reference || paymentData.razorpay_payment_id || "N/A";
      const advancePaid = totalAmount;
      
      const formattedTimeSlot = getTimeRangeLabel(startTime, duration);

      // Trigger WhatsApp API Notification
      const whatsappRes = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerPhone: phone,    
          customerName: name, 
          email: email,                            
          date: bookingDate,
          time: formattedTimeSlot, 
          duration: duration,                      
          sport: sport,                            
          court: verifyData.booking?.court_number || bookingType, 
          bookingId: bookingId,
          referenceId: referenceId,
          totalAmount: totalAmount,
          advanceAmount: advancePaid,
          balanceAmount: balanceAmount
        }),
      });

      const whatsappData = await whatsappRes.json();
      
      if (!whatsappRes.ok) {
         console.error("CRITICAL WHATSAPP API ERROR:", whatsappData);
      }

      setIsProcessingBooking(false);

      // Set Success states
      setSavedBooking({ date: bookingDate, time: startTime });
      setSuccessData({
        bookingId,
        referenceId,
        name,
        phone,
        sport,
        bookingType,
        date: bookingDate,
        time: startTime,
        duration,
        totalAmount,
        advancePaid,
        balance: balanceAmount
      });
      setShowSuccessModal(true);

      // Reset form
      setName("");
      setPhone("");
      setEmail("");
      setInstaHandle("");
      setBookingDate("");
      setStartTime("");
      setBookingType(""); // Reset to empty
      setSport(""); // Reset to empty
      setInstaAgreed(false);

    } catch (error) {
      console.error(error);
      setIsProcessingBooking(false);
      alert("A network error occurred during confirmation.");
    }
  };

  const scrollToBooking = () => {
    const el = document.getElementById("booking-engine-section");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  // ✅ SMART BUTTON VALIDATION VARIABLE 
  const isFormComplete = Boolean(name && phone && email && instaHandle && sport && bookingType && bookingDate && startTime && instaAgreed);

  /* ================================================================ */
  /* RENDER                                                          */
  /* ================================================================ */
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 font-sans tracking-tight antialiased relative w-full overflow-x-hidden">
      
      {/* 🚀 Next.js Optimized External Script Loading */}
      <Script id="razorpay-js" src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      {/* ---------- Animated Aurora Background (Tricolor + Ashoka Navy Theme) ---------- */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 inset-x-0 h-[400px] sm:h-[640px] bg-gradient-to-b from-white/5 via-transparent to-transparent" />
        
        {/* Saffron Glow */}
        <motion.div
          animate={{ x: [0, 50, 0], y: [0, 35, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-5%] left-[-10%] w-[60%] h-[45%] bg-[#FF9933]/15 rounded-full blur-[90px] sm:blur-[130px]"
        />
        
        {/* India Green Glow */}
        <motion.div
          animate={{ x: [0, -50, 0], y: [0, 40, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[15%] right-[-10%] w-[55%] h-[55%] bg-[#138808]/15 rounded-full blur-[90px] sm:blur-[130px]"
        />

        {/* Ashoka Navy Blue Subtle Ambient Center Glow */}
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.1, 0.2, 0.1] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[25%] left-[25%] w-[50%] h-[40%] bg-[#1e3a8a]/15 rounded-full blur-[100px]"
        />
        
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      {/* ---------- Header (PROMO MODE) ---------- */}
      <motion.header
        variants={stagger}
        initial="hidden"
        animate="show"
        className="max-w-7xl mx-auto px-4 pt-12 pb-6 sm:pt-16 sm:pb-8 relative z-10 flex flex-col lg:items-start"
      >
        {/* Tricolor Hero Badge */}
        <motion.div
          variants={fadeUp}
          className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-slate-900/90 backdrop-blur border border-white/20 text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-white mb-3 sm:mb-6 mt-1 sm:mt-4 mx-auto lg:mx-0 shadow-[0_0_20px_rgba(255,153,51,0.2)]"
        >
          <span>🇮🇳</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF9933] animate-pulse" />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#FF9933] via-white to-[#138808] font-black">
            INDEPENDENCE DAY MEGA PROMO
          </span>
        </motion.div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 sm:gap-12 w-full">
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left w-full lg:w-auto">
            
            <motion.div variants={fadeUp} className="flex items-center justify-center lg:justify-start gap-3 sm:gap-6 w-full">
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 shrink-0 rounded-full overflow-hidden border-2 border-white/40 shadow-[0_0_25px_rgba(255,255,255,0.2)] bg-neutral-900">
                <Image 
                  src="/photos/logo.png" 
                  alt="SMES Turf Logo" 
                  fill 
                  className="object-cover" 
                  priority 
                  unoptimized={true}
                />
              </div>

              <div className="flex flex-col items-start text-left">
                <h1 className="text-5xl sm:text-7xl md:text-8xl font-black tracking-tighter uppercase leading-none text-white whitespace-nowrap">
                  <span className="inline-block bg-clip-text text-transparent bg-gradient-to-b from-white via-neutral-200 to-neutral-400">
                    SMES TURF
                  </span>
                </h1>

                <div className="flex items-center justify-start gap-1.5 text-[10px] sm:text-sm font-mono text-lime-400 uppercase tracking-wider mt-1 sm:mt-3 font-bold">
                  <span className="text-xs sm:text-base">📍</span>
                  <span>Vijayanagar, 2nd Stage, Mysuru</span>
                </div>
              </div>
            </motion.div>

            <motion.p
              variants={fadeUp}
              className="text-base sm:text-lg md:text-xl font-medium tracking-normal text-neutral-400 mt-5 sm:mt-6 max-w-xl mx-auto lg:mx-0 text-center lg:text-left px-2 lg:px-0"
            >
               Premium multisport arena built for high-performance{" "}
              <span className="text-[#FF9933]">Football</span> &{" "}
              <span className="text-[#138808]">Cricket</span> action.
            </motion.p>
          </div>

          <motion.div
            variants={fadeUp}
            className="w-full max-w-md mx-auto lg:max-w-sm lg:mx-0 flex flex-col gap-3 mt-4 lg:mt-0 shrink-0"
          >
            <motion.button
              whileHover={{ y: -2, boxShadow: "0 10px 25px rgba(255,153,51,0.25)" }}
              onClick={scrollToBooking}
              type="button"
              className="w-full text-black text-xs font-mono uppercase tracking-wider p-4 rounded-none transition-all font-black text-center cursor-pointer flex items-center justify-center gap-2 bg-gradient-to-r from-[#FF9933] via-white to-[#138808] hover:opacity-90 border-0 shadow-lg"
            >
              🇮🇳 RESERVE YOUR FREEDOM SLOT
            </motion.button>

            <div className="grid grid-cols-2 gap-2 w-full">
              <motion.a
                whileHover={{ y: -2, borderColor: "rgba(255,255,255,0.6)" }}
                whileTap={{ scale: 0.97 }}
                href="/my-booking"
                className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white text-[10px] sm:text-xs font-mono uppercase tracking-wider p-3 rounded-none transition-colors text-center flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4 fill-white shrink-0" viewBox="0 0 24 24">
                  <path d="M22 10V6c0-1.11-.9-2-2-2H4c-1.1 0-1.99.89-1.99 2v4c1.1 0 1.99.9 1.99 2s-.89 2-2 2v4c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-4c-1.1 0-2-.9-2-2s.9-2 2-2zm-2-1.46c-1.19.69-2 1.99-2 3.46s.81 2.77 2 3.46V18H4v-2.54c1.19-.69 2-1.99 2-3.46s-.81-2.77-2-3.46V6h16v2.54zM11 7h2v2h-2zm0 4h2v2h-2zm0 4h2v2h-2z"/>
                </svg>
                <span>MY BOOKINGS</span>
              </motion.a>

              <motion.a
                whileHover={{ y: -2, borderColor: "rgba(19, 136, 8, 0.6)" }}
                whileTap={{ scale: 0.97 }}
                href="https://wa.me/918073064676"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white text-[10px] sm:text-xs font-mono uppercase tracking-wider p-3 rounded-none transition-colors text-center flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4 fill-[#138808] shrink-0" viewBox="0 0 24 24">
                  <path d="M12.012 2c-5.506 0-9.969 4.458-9.969 9.968 0 1.764.453 3.487 1.313 5.013l-1.396 5.099 5.234-1.365c1.472.802 3.137 1.222 4.818 1.222l.004-.001c5.505 0 9.967-4.457 9.967-9.968 0-2.663-1.038-5.168-2.923-7.051-1.884-1.884-4.388-2.92-7.048-2.92zm5.834 14.161c-.247.693-1.229 1.272-1.996 1.423-.523.103-1.205.186-3.504-.76-2.942-1.21-4.839-4.204-4.986-4.401-.147-.197-1.198-1.593-1.198-3.038 0-1.445.759-2.158 1.028-2.451.269-.293.587-.366.783-.366.196 0 .392.001.564.01.185.009.434-.07.679.529.245.599.833 2.032.906 2.18.073.148.122.321.024.518-.098.197-.147.321-.293.494-.147.173-.309.387-.441.52-.147.148-.302.309-.13.576.173.268.767 1.267 1.648 2.051 1.134 1.009 2.091 1.321 2.385 1.469.294.148.465.123.637-.074.172-.197.735-.856.932-1.15.196-.294.392-.246.661-.148.269.098 1.714.808 2.008.955.294.148.49.222.563.346.073.123.073.717-.174 1.41z"/>
                </svg>
                <span>WHATSAPP</span>
              </motion.a>

              <motion.a
                whileHover={{ y: -2, borderColor: "rgba(255, 153, 51, 0.6)" }}
                whileTap={{ scale: 0.97 }}
                href="https://instagram.com/smesturf"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white text-[10px] sm:text-xs font-mono uppercase tracking-wider p-3 transition-colors text-center flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4 fill-[#FF9933] shrink-0" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
                <span>INSTAGRAM</span>
              </motion.a>

              <motion.a
                whileHover={{ y: -2, borderColor: "rgba(255,255,255,0.6)" }}
                whileTap={{ scale: 0.97 }}
                href="https://maps.google.com/?q=12.329329,76.612008"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white text-[10px] sm:text-xs font-mono uppercase tracking-wider p-3 transition-colors text-center flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4 fill-white shrink-0" viewBox="0 0 24 24">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
                <span>FIND ARENA</span>
              </motion.a>

              <motion.a
                whileHover={{ y: -2, borderColor: "rgba(255,255,255,0.6)" }}
                whileTap={{ scale: 0.97 }}
                href="tel:+918073064676"
                className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white text-[10px] sm:text-xs font-mono uppercase tracking-wider p-3 transition-colors text-center flex items-center justify-center gap-2 col-span-2"
              >
                <svg className="w-4 h-4 fill-white shrink-0" viewBox="0 0 24 24">
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                </svg>
                <span>CALL DESK</span>
              </motion.a>
            </div>
          </motion.div>
        </div>

        {/* ⚡ INDEPENDENCE DAY MEGA PROMO BANNER */}
        <motion.div
          variants={fadeUp}
          className="mt-8 sm:mt-12 w-full flex justify-center lg:justify-start"
        >
          <div className="inline-flex flex-col sm:flex-row items-center gap-3 sm:gap-4 bg-white/5 backdrop-blur border-t-2 border-t-[#FF9933] border-b-2 border-b-[#138808] border-x border-white/20 px-6 py-4 shadow-[0_0_30px_rgba(255,153,51,0.15)] text-center sm:text-left">
            <span className="flex h-3 w-3 relative flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF9933] opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[#FF9933]" />
            </span>
            <p className="text-xs sm:text-sm font-mono uppercase tracking-wide text-neutral-200">
              💥 Grand Freedom Offer: <span className="text-neutral-500 line-through mr-1 font-medium">₹1200/Hr</span> <span className="text-white font-black text-base">From ₹205</span>
              <span className="block sm:inline sm:ml-3 text-[#FF9933] mt-1 sm:mt-0 font-black animate-pulse">— Aug 15 to Aug 19 Limited!</span>
             </p>
          </div>
        </motion.div>
      </motion.header>

      {/* ---------- Disciplines ---------- */}
      <motion.section
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="max-w-7xl mx-auto px-4 py-12 sm:px-6 sm:py-16 border-b border-neutral-900 relative z-10"
      >
         <motion.span variants={fadeUp} className="text-[11px] font-mono uppercase tracking-widest text-[#FF9933] block mb-2 font-bold">
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
              desc: "From fast-paced 5-A-side tactical clashes to open-field full court training drills.",
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
              whileHover={{ y: -4, borderColor: "rgba(255, 153, 51, 0.4)" }}
              transition={{ duration: 0.3, ease: easeOut }}
              className="border border-neutral-900 bg-neutral-900/20 p-6 sm:p-8 flex flex-col justify-between group transition-colors min-h-[180px] sm:min-h-[220px]"
            >
              <div>
                 <span className="text-[11px] font-mono text-neutral-600 block mb-3 sm:mb-4">
                  {card.tag}
                </span>
                <h3 className="text-xl sm:text-2xl font-bold uppercase tracking-tight text-white group-hover:text-[#FF9933] transition-colors">
                  {card.title}
                </h3>
                <p className="text-neutral-400 text-xs sm:text-sm mt-2 max-w-sm">{card.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ---------- Media Gallery ---------- */}
      <motion.section
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="max-w-7xl mx-auto px-4 py-12 sm:px-6 sm:py-16 border-b border-neutral-900 relative z-10"
      >
        <motion.span variants={fadeUp} className="text-[11px] font-mono uppercase tracking-widest text-neutral-400 block mb-2 font-bold">
          02 — Media
        </motion.span>
        <motion.h2 variants={fadeUp} className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white mb-8">
          Turf Gallery
        </motion.h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            "20260709_154856.jpg",
            "20260709_154916.jpg",
            "20260715_190724.jpg",
            "IMG-20260608-WA0005.jpg",
            "IMG-20260608-WA0007.jpg",
            "arena-1.jpg", 
            "arena-2.jpg"  
          ].map((imgSrc, idx) => (
            <motion.div key={imgSrc} variants={fadeUp} className={`relative h-40 sm:h-48 rounded-md overflow-hidden border border-neutral-800 bg-neutral-900/50 ${idx === 6 ? "col-span-2 sm:col-span-1 lg:col-span-2" : ""}`}>
              <Image 
                src={`/photos/${imgSrc}`} 
                alt={`Arena View ${idx + 1}`} 
                fill 
                className="object-cover hover:scale-105 transition-transform duration-500" 
              />
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
                <span className="text-[11px] font-mono uppercase tracking-widest text-[#138808] block mb-2 font-bold animate-pulse">
                 03 — Promotional Roster
                </span>
                <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
                  Prepare Your Squad
                </h2>
              </div>
              
              {weather && (
                <div className="bg-neutral-900/40 border border-neutral-800 px-4 py-2.5 inline-flex items-center gap-3">
                  <span className="text-xl">🌤️</span>
                  <div>
                    <span className="block text-[9px] font-mono uppercase tracking-widest text-neutral-500">
                      Mysuru Weather
                    </span>
                    <span className="text-xs font-mono text-white font-bold">
                      {weather.temp}°C — <span className="text-[#FF9933]">{weather.condition}</span>
                    </span>
                  </div>
                </div>
              )}
            </motion.div>

            <div className="space-y-4 sm:space-y-6">
              
              {/* Name + Phone + Email */}
              <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                <div className="space-y-2">
                   <label className="text-xs font-mono uppercase text-neutral-400">Full Name</label>
                  <input
                    type="text"
                    placeholder="Enter athlete name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full p-4 bg-neutral-900/50 text-white font-bold border border-neutral-800 focus:border-white outline-none rounded-none transition-all text-base md:text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase text-neutral-400">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="10-Digit Contact"
                    value={phone}
                    onChange={(e) => {
                      const sanitized = e.target.value.replace(/\D/g, "");
                      const finalNumber = sanitized.length > 10 ? sanitized.slice(-10) : sanitized;
                      if (finalNumber.length <= 10) setPhone(finalNumber);
                    }}
                    className="w-full p-4 bg-neutral-900/50 text-white font-mono border border-neutral-800 focus:border-white outline-none rounded-none transition-all text-base md:text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase text-neutral-400">Email Address</label>
                  <input
                    type="email"
                    placeholder="For pass delivery"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full p-4 bg-neutral-900/50 text-white font-mono border border-neutral-800 focus:border-white outline-none rounded-none transition-all text-base md:text-sm"
                  />
                </div>
              </motion.div>

              {/* Insta + Sport */}
              <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase text-neutral-400">Sport Discipline</label>
                  <select
                    value={sport}
                    onChange={(e) => setSport(e.target.value)}
                    className="w-full p-4 bg-neutral-900 text-white font-bold border border-neutral-800 focus:border-white outline-none rounded-none appearance-none text-base md:text-sm"
                  >
                    <option value="" disabled>-- Select Sport --</option>
                    <option value="Football">⚽ Football</option>
                    <option value="Cricket">🏏 Cricket</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase text-[#FF9933] font-bold">Instagram Handle</label>
                  <input 
                    type="text" 
                    placeholder="@username" 
                    value={instaHandle} 
                    onChange={(e) => {
                      let val = e.target.value;
                      if (val && !val.startsWith("@")) val = "@" + val;
                      setInstaHandle(val);
                    }} 
                    className="w-full p-4 bg-white/5 border border-white/30 text-base md:text-sm font-mono outline-none text-white font-bold focus:border-[#FF9933] placeholder-white/50" 
                  />
                </div>
              </motion.div>

              {/* COURT TYPE SELECTION */}
              <motion.div variants={fadeUp} className="space-y-2">
                <label className="text-xs font-mono uppercase text-neutral-400">Court Scale</label>
                <select
                  value={bookingType}
                  onChange={(e) => setBookingType(e.target.value)}
                  className="w-full p-4 bg-neutral-900 text-white font-bold border border-neutral-800 focus:border-white outline-none rounded-none appearance-none text-base md:text-sm"
                >
                  <option value="" disabled>-- Select Court Scale --</option>
                  <option value="Half Court">Half Court (5v5) — ₹205</option>
                  <option value="Full Court">Full Court (7v7 / 9v9) — ₹410</option>
                </select>
              </motion.div>

              {/* Dynamic Promo Scale Display */}
              <motion.div variants={fadeUp} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase text-neutral-400 flex justify-between items-center">
                    <span>Arena Visualizer</span>
                    <span className="text-[#FF9933] tracking-wider font-black">SELECTED: {bookingType ? bookingType.toUpperCase() : "PENDING"}</span>
                  </label>
                  
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 bg-neutral-900/40 p-3 sm:p-4 border border-neutral-800">
                    <div className="relative w-full h-32 sm:h-40 bg-[#0d2a13] border-2 border-neutral-700 rounded-sm overflow-hidden flex shadow-inner pointer-events-none">
                      {/* Field Lines Overlay */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-40 z-10">
                        <div className="w-0.5 h-full bg-white" />
                        <div className="absolute w-14 sm:w-20 h-14 sm:h-20 border-2 border-white rounded-full" />
                        <div className="absolute w-1.5 h-1.5 bg-white rounded-full" />
                        <div className="absolute left-0 w-8 sm:w-12 h-16 sm:h-24 border-2 border-l-0 border-white top-1/2 -translate-y-1/2" />
                        <div className="absolute right-0 w-8 sm:w-12 h-16 sm:h-24 border-2 border-r-0 border-white top-1/2 -translate-y-1/2" />
                      </div>

                      {/* Visual Indicator Overlay */}
                      <div className="absolute inset-0 z-20 flex transition-all duration-500">
                        {bookingType === "Half Court" ? (
                           <>
                             <div className="w-1/2 h-full bg-[#FF9933]/30 flex items-center justify-center border-r-2 border-[#FF9933] border-dashed backdrop-blur-[1px]">
                               <span className="text-[#FF9933] text-[10px] sm:text-xs font-black tracking-widest font-mono bg-black/80 px-2.5 py-1.5 shadow-lg border border-[#FF9933]/30 uppercase text-center">
                                 5v5 Area
                               </span>
                             </div>
                             <div className="w-1/2 h-full bg-black/70 flex items-center justify-center">
                               <span className="text-neutral-500 text-[9px] font-bold tracking-widest font-mono uppercase bg-black/60 px-2 py-0.5 border border-neutral-800">
                                 Unused Space
                               </span>
                             </div>
                           </>
                        ) : bookingType === "Full Court" ? (
                           <div className="w-full h-full bg-[#138808]/30 flex items-center justify-center backdrop-blur-[1px]">
                             <span className="text-[#138808] text-[10px] sm:text-xs font-black tracking-widest font-mono bg-black/80 px-2.5 py-1.5 shadow-lg border border-[#138808]/30 uppercase text-center">
                               Full Court Access
                             </span>
                           </div>
                        ) : (
                           <div className="w-full h-full flex items-center justify-center backdrop-blur-[2px] bg-black/50">
                             <span className="text-neutral-400 text-[10px] sm:text-xs font-black tracking-widest font-mono uppercase text-center bg-black/80 px-3 py-2 border border-neutral-800">
                               Select Scale to Preview
                             </span>
                           </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* STRICT DATE DROPDOWN (AUTO-LOCKS SOLD OUT DAYS) */}
              <motion.div variants={fadeUp} className="space-y-2">
                <label className="text-xs font-mono uppercase text-neutral-400 flex justify-between">
                  <span>Promo Date</span>
                  {!bookingType && <span className="text-[9px] text-neutral-600">Select court scale first</span>}
                </label>
                <select
                  disabled={!bookingType}
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                  className={`w-full p-4 font-bold font-mono border outline-none rounded-none appearance-none text-base md:text-sm transition-colors ${
                    bookingType ? "bg-neutral-900 border-neutral-800 text-white focus:border-white" : "bg-neutral-950 border-neutral-900 text-neutral-600 cursor-not-allowed"
                  }`}
                >
                  <option value="" disabled>-- Select Promo Date --</option>
                  <option value="2026-08-15" disabled={!promoDatesStatus["2026-08-15"]}>
                    Aug 15, 2026 🇮🇳 (Independence Day) {!promoDatesStatus["2026-08-15"] ? "— SOLD OUT" : ""}
                  </option>
                  <option value="2026-08-16" disabled={!promoDatesStatus["2026-08-16"]}>
                    Aug 16, 2026 {!promoDatesStatus["2026-08-16"] ? "— SOLD OUT" : ""}
                  </option>
                  <option value="2026-08-17" disabled={!promoDatesStatus["2026-08-17"]}>
                    Aug 17, 2026 {!promoDatesStatus["2026-08-17"] ? "— SOLD OUT" : ""}
                  </option>
                  <option value="2026-08-18" disabled={!promoDatesStatus["2026-08-18"]}>
                    Aug 18, 2026 {!promoDatesStatus["2026-08-18"] ? "— SOLD OUT" : ""}
                  </option>
                  <option value="2026-08-19" disabled={!promoDatesStatus["2026-08-19"]}>
                    Aug 19, 2026 {!promoDatesStatus["2026-08-19"] ? "— SOLD OUT" : ""}
                  </option>
                </select>
              </motion.div>

              {/* DYNAMIC START TIME (FILTERED BY BOOKED SLOTS) */}
              <motion.div variants={fadeUp} className="space-y-2 relative">
                <label className="text-xs font-mono uppercase text-neutral-400">Kickoff Time</label>
                <select
                  disabled={!bookingDate || !bookingType}
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={`w-full p-4 font-bold border outline-none rounded-none appearance-none text-base md:text-sm transition-colors ${
                    bookingDate && bookingType ? "bg-neutral-900 border-neutral-800 text-white focus:border-white" : "bg-neutral-950 border-neutral-900 text-neutral-600 cursor-not-allowed"
                  }`}
                >
                  <option value="">-- Select Time Slot --</option>
                  {ALL_KICKOFF_SLOTS.map((t) => {
                    const isBooked = bookedSlots.includes(t);
                    return (
                      <option key={t} value={t} disabled={isBooked}>
                        {t} {isBooked ? "— BOOKED" : ""}
                      </option>
                    );
                  })}
                </select>
              </motion.div>

              {/* DURATION - LOCKED FOR PROMO */}
              <motion.div variants={fadeUp} className="space-y-2 relative">
                <label className="text-xs font-mono uppercase text-neutral-400">Session Length</label>
                <div className="relative">
                  <select disabled={true} className="w-full p-4 bg-neutral-950 text-neutral-500 border border-neutral-800 outline-none rounded-none appearance-none text-base md:text-sm cursor-not-allowed text-center">
                    <option>⏱ 60 Minutes Fixed Promo Duration</option>
                  </select>
                </div>
              </motion.div>
            </div>
          </motion.div>

          {/* -------- Summary Side (PROMO VIP Match Ticket) -------- */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.7, ease: easeOut }}
            className="lg:col-span-5 lg:sticky lg:top-6"
          >
            {/* 🎟️ TICKET CONTAINER */}
            <div className="relative bg-[#0a0a0a] border border-neutral-800 flex flex-col shadow-2xl overflow-hidden">
              <div className="h-2 w-full bg-gradient-to-r from-[#FF9933] via-white to-[#138808]" />
              
              <div className="p-5 sm:p-6 pb-4 flex justify-between items-start">
                <div>
                  <motion.div animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} className="flex items-center gap-2 mb-1.5">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
                    </span>
                    <span className="text-[10px] font-mono text-white uppercase tracking-[0.2em] drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">
                      Freedom Access Pass
                    </span>
                  </motion.div>
                  <h3 className="text-xl font-black uppercase text-white tracking-tight">SMES Turf Promo</h3>
                 </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-neutral-900 border border-neutral-800 flex items-center justify-center rotate-3 shrink-0 shadow-[0_0_15px_rgba(255,255,255,0.15)]">
                  <span className="text-white text-xl sm:text-2xl font-black">{sport === "Cricket" ? "🏏" : sport === "Football" ? "⚽" : "❓"}</span>
                </div>
              </div>

              <div className="px-5 sm:px-6 py-4 grid grid-cols-2 gap-y-5 gap-x-4 bg-neutral-900/30">
                <div className="col-span-2 sm:col-span-1">
                   <span className="text-[9px] text-neutral-500 font-mono uppercase block mb-1">Pass Holder</span>
                  <span className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider truncate block">
                    {name ? `${name} ${instaHandle ? `(${instaHandle})` : ""}` : "GUEST"}
                  </span>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <span className="text-[9px] text-neutral-500 font-mono uppercase block mb-1">Contact</span>
                  <span className="text-xs sm:text-sm font-bold text-neutral-300 uppercase tracking-wider">{phone ? `+91 ${phone}` : "REQUIRED"}</span>
                </div>
                <div>
                  <span className="text-[9px] text-neutral-500 font-mono uppercase block mb-1">Sport</span>
                  <span className="text-xs sm:text-sm font-bold text-[#FF9933] uppercase tracking-wider">{sport || "REQUIRED"}</span>
                </div>
                <div>
                  <span className="text-[9px] text-neutral-500 font-mono uppercase block mb-1">Scale</span>
                  <span className="text-xs sm:text-sm font-bold text-neutral-300 uppercase tracking-wider">{bookingType || "REQUIRED"}</span>
                </div>
                 <div>
                  <span className="text-[9px] text-neutral-500 font-mono uppercase block mb-1">Date</span>
                  <span className="text-xs sm:text-sm font-bold text-[#138808] uppercase tracking-wider">{bookingDate ? new Date(bookingDate).toLocaleDateString("en-GB") : "TBD"}</span>
                </div>
                <div>
                  <span className="text-[9px] text-neutral-500 font-mono uppercase block mb-1">Kickoff</span>
                  <span className="text-xs sm:text-sm font-bold text-[#138808] uppercase tracking-wider">{startTime || "TBD"}</span>
                </div>
              </div>

              <div className="relative w-full h-8 flex items-center justify-center my-1">
                 <div className="absolute left-[-16px] w-8 h-8 bg-neutral-950 rounded-full border border-neutral-800 z-10" />
                <div className="absolute left-[-20px] w-10 h-10 bg-neutral-950 z-20" /> 
                <div className="absolute left-[-16px] w-8 h-8 rounded-full border-r border-neutral-800 z-30" />
                <div className="w-full border-t-2 border-dashed border-neutral-800 relative z-0 mx-4" />
                <div className="absolute right-[-16px] w-8 h-8 bg-neutral-950 rounded-full border border-neutral-800 z-10" />
                <div className="absolute right-[-20px] w-10 h-10 bg-neutral-950 z-20" /> 
                <div className="absolute right-[-16px] w-8 h-8 rounded-full border-l border-neutral-800 z-30" />
              </div>

              <div className="px-5 sm:px-6 py-2 space-y-4">
                <div className="flex justify-between items-end">
                  <div>
                    <span className="text-[10px] text-neutral-500 font-mono uppercase block">Gross Value</span>
                    <span className="text-[11px] text-neutral-600 line-through font-mono tracking-widest block mt-0.5">₹{regularAmount}</span>
                  </div>
                  <AnimatePresence mode="wait">
                    <motion.span key={totalAmount} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }} className="text-3xl font-black text-white leading-none drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                      ₹{totalAmount}
                    </motion.span>
                  </AnimatePresence>
                 </div>

                <div className="p-3 bg-white/5 border border-white/20 flex justify-between items-center">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-white uppercase tracking-widest block">Promo Payment</span>
                    <span className="text-[9px] font-mono text-neutral-500 mt-0.5 block hidden sm:block">100% Secure Checkout</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black text-white block leading-none">₹{totalAmount}</span>
                    <span className="text-[8px] font-mono text-neutral-500 uppercase tracking-widest mt-1 block">Flat Total Applied</span>
                  </div>
                </div>
              </div>

              {/* Instagram Agreement UI */}
              <div className="px-5 sm:px-6 pb-4 mt-2">
                <div className="flex items-start gap-3 p-4 bg-neutral-950 border border-neutral-800 rounded-sm">
                  <input 
                    type="checkbox" 
                    id="insta-verification-checkbox" 
                    checked={instaAgreed} 
                    onChange={(e) => setInstaAgreed(e.target.checked)} 
                    className="w-4 h-4 accent-[#FF9933] mt-0.5 cursor-pointer flex-shrink-0" 
                  />
                  <label htmlFor="insta-verification-checkbox" className="text-[10px] font-mono text-neutral-400 cursor-pointer leading-relaxed select-none">
                    I agree my team will follow <span className="text-white font-bold">@smesturf</span>, post a story, mention us, and use <span className="text-[#FF9933] font-bold">#SMESTurf</span>. ⚠️ <span className="text-white font-bold underline">Strict Condition:</span> No player from my team will book duplicate promo slots.
                  </label>
                </div>
              </div>

              {/* Digital Barcode */}
              <div className="px-5 sm:px-6 pt-2 pb-6 flex flex-col items-center opacity-30">
                <div className="w-full h-8 flex justify-between items-end gap-[2px]">
                  {Array.from({ length: 35 }).map((_, i) => {
                    const deterministicWidth = (i % 4) + 1.5;
                    const inputSeed = name.length + phone.length + instaHandle.length + sport.length + bookingType.length;
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
                  SMES-FREEDOM-PROMO
                </span>
              </div>
            </div>

            {/* DYNAMIC CHECKOUT BUTTON */}
            <motion.button
              disabled={isPaymentLoading || !sport || !bookingType}
              onClick={openRazorpay}
              type="button"
              className={`w-full mt-4 font-mono text-xs sm:text-sm uppercase tracking-widest py-4 sm:py-5 transition-all font-black shadow-lg flex items-center justify-center gap-3 border ${
                isPaymentLoading || !sport || !bookingType
                  ? "bg-neutral-900 border-neutral-800 text-neutral-500 cursor-not-allowed"
                  : "bg-white hover:bg-gray-200 text-black border-white cursor-pointer shadow-white/20" 
              }`}
            >
              {isPaymentLoading ? "Processing..." : "🎟️ Secure Promo Slot"}
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
            <div><span className="text-white">P:</span> +91 8073064676</div>
            <div><span className="text-white">E:</span> smesturf@gmail.com</div>
            <div><span className="text-white">L:</span> Mysuru, Karnataka</div>
          </div>
        </div>
      </motion.footer>

      {/* ---------- Floating CTA ---------- */}
      <motion.button
        suppressHydrationWarning={true}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.5, ease: easeOut }}
        disabled={isPaymentLoading}
        onClick={isFormComplete ? openRazorpay : scrollToBooking}
        className={`fixed bottom-6 right-4 md:bottom-8 md:right-8 z-[9000] border px-6 py-3.5 rounded-full shadow-lg flex items-center gap-2 text-[12px] font-mono font-black uppercase tracking-widest transition-all ${
          isPaymentLoading 
            ? "bg-neutral-900 border-neutral-800 text-neutral-500 cursor-not-allowed"
            : isFormComplete 
              ? "bg-[#FF9933] border-[#FF9933] text-black hover:bg-[#ff8811] shadow-[#FF9933]/30 cursor-pointer" 
              : "bg-white border-white text-black hover:bg-gray-200 shadow-white/20 cursor-pointer"
        }`}
      >
        <span>
          {isPaymentLoading 
            ? "Processing..." 
            : isFormComplete 
              ? "🔒 Secure Promo Slot" 
              : "🎟️ Book Now"}
        </span>
      </motion.button>

      {/* ---------- Secure Payment Loading Overlay ---------- */}
      <AnimatePresence>
        {isPaymentLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center z-[999999]"
          >
            <div className="relative w-24 h-24 flex items-center justify-center mb-8">
              <div className="absolute inset-0 border-t-2 border-l-2 border-white rounded-full animate-spin" />
              <div className="absolute inset-3 border-r-2 border-b-2 border-neutral-500 rounded-full animate-[spin_1.5s_reverse_infinite]" />
              <span className="text-3xl animate-pulse">{sport === "Cricket" ? "🏏" : "⚽"}</span>
            </div>
            
            <h2 className="text-white font-mono font-black uppercase tracking-[0.2em] mb-3 text-center px-4 text-sm sm:text-base drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
              Connecting to Secure Gateway
            </h2>
            
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <p className="text-neutral-400 font-mono text-[10px] sm:text-xs uppercase tracking-widest">
                Please do not close or refresh
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- POST-PAYMENT PROCESSING LOADER ---------- */}
      <AnimatePresence>
        {isProcessingBooking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center z-[999999]"
          >
            <div className="relative w-24 h-24 flex items-center justify-center mb-8">
              <div className="absolute inset-0 border-t-2 border-l-2 border-white rounded-full animate-spin" />
              <div className="absolute inset-3 border-r-2 border-b-2 border-neutral-500 rounded-full animate-[spin_1.2s_reverse_infinite]" />
              <span className="text-3xl animate-pulse">🔒</span>
            </div>
            
            <h2 className="text-white font-mono font-black uppercase tracking-[0.2em] mb-3 text-center px-4 text-sm sm:text-base drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
              Securing Your Slot
            </h2>
            
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-neutral-200"></span>
              </span>
              <p className="text-neutral-400 font-mono text-[10px] sm:text-xs uppercase tracking-widest">
                Verifying Payment & Dispatching Tickets...
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 📲 UPGRADED WHATSAPP INTERACTION BLAST POPUP OVERLAY */}
      <AnimatePresence>
        {showSuccessModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-[99999]">
            <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-2xl w-full max-w-md text-center space-y-6">
              <div className="text-4xl text-white">🎉</div>
              <h3 className="text-xl font-black uppercase text-white tracking-tight">Match Slot Reserved!</h3>
              
              <p className="text-xs font-mono text-neutral-400">
                Your lineup on <span className="text-white font-bold">{savedBooking.date ? new Date(savedBooking.date).toLocaleDateString("en-GB") : ""}</span> at <span className="text-white font-bold">{savedBooking.time}</span> is securely locked.
              </p>
              
              <div className="p-4 bg-black border border-neutral-800/80 text-left rounded-xl">
                <p className="text-[11px] font-mono text-neutral-400 leading-relaxed">
                  📢 <span className="text-white font-bold">Important Strategy Note:</span> Pass this blast link onto your team group chat right now so all players can follow, post, and mention <span className="text-white font-bold">@smesturf</span> before arrival!
                </p>
              </div>

              <button
                onClick={() => {
                  const message = `Match Locked! 🏟️ SMES Turf | 📅 ${savedBooking.date ? new Date(savedBooking.date).toLocaleDateString("en-GB") : ""} | 🕒 ${savedBooking.time}. Reminder: Everyone needs to follow @smesturf and post/tag the story before kickoff to keep our promo rate! #SMESTurf`;
                  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, "_blank");
                }}
                className="w-full bg-white hover:bg-gray-200 text-black font-mono text-xs uppercase tracking-widest py-4 font-black transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-white/10"
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

    </main>
  );
}