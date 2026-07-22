"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  
  // 🔒 CLIENT DATE STATE
  const [minDate, setMinDate] = useState("");

  // 🌤️ DYNAMIC WEATHER WIDGET STATE
  const [weather, setWeather] = useState<{ temp: number; condition: string } | null>(null);

  /// 🎫 CONFIRMATION MODAL STATE
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  
  // 🔄 SECURE PAYMENT LOADING STATE
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);

  // 🔄 POST-PAYMENT PROCESSING STATE
  const [isProcessingBooking, setIsProcessingBooking] = useState(false);
  
  // 🎉 SUCCESS MODAL STATE
  const [successData, setSuccessData] = useState<any>(null);

  // 📄 AUTOMATIC PASS DOWNLOAD REF
  const autoPassRef = useRef<HTMLDivElement>(null);

  /* -------- HELPER: TIME RANGE FORMATTER (e.g. 8:00 PM - 9:30 PM) -------- */
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
          link.download = `SMES_Arena_Pass_${successData.referenceId || successData.bookingId}.png`;
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
    setMinDate(getLocalDateString());
  }, []);

  useEffect(() => {
    if (bookingDate) loadBookedSlots(bookingDate);
  }, [bookingDate, bookingType]);

  const { totalAmount, regularAmount } = useMemo(
    () => getPrice(duration, bookingType),
    [duration, bookingType]
  );

  const allSlots = Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2);
    const m = i % 2 === 0 ? "00" : "30";
    const ampm = h >= 12 ? "PM" : "AM";
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${String(displayH).padStart(2, "0")}:${m} ${ampm}`;
  });

  const getLocalDateString = () =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  const isSlotAvailable = (slot: string) => {
    if (!bookingDate || !duration) return false;
    const segmentsNeeded = Number(duration) / 30;
    const slotIndex = allSlots.indexOf(slot);
    
    for (let i = 0; i < segmentsNeeded; i++) {
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

  const loadBookedSlots = async (dateStr: string) => {
    const selectedDate = new Date(dateStr);
    const prevDate = new Date(selectedDate);
    prevDate.setDate(prevDate.getDate() - 1);

    const currentDateStr = dateStr;
    const prevDateStr = prevDate.toISOString().split("T")[0];

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

          if (slot.booking_date === currentDateStr) {
            if (currentMinute < 24 * 60) isSlotForToday = true;
          } else if (slot.booking_date === prevDateStr) {
            if (currentMinute >= 24 * 60) {
              isSlotForToday = true;
              currentMinute = currentMinute - (24 * 60); 
            }
          }

          if (isSlotForToday) {
            const hour24 = Math.floor(currentMinute / 60);
            const minute = currentMinute % 60;
            const ampm = hour24 >= 12 ? "PM" : "AM";
            const hour12 = hour24 % 12 || 12;
            const slotLabel = `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${ampm}`;

            let type = slot.booking_type; 
            if (isBlock) {
               if (slot.court_number === "Both Courts" || !slot.court_number) {
                  type = "Full Court";
               } else {
                  type = "Half Court";
               }
            }

            if (type === "Full Court") {
              slotCounts[slotLabel] = 999; 
            } else {
              slotCounts[slotLabel] = (slotCounts[slotLabel] || 0) + 1; 
            }
          }
        }
      });
    };

    processSlots(bookingsData, false);
    processSlots(blockedData, true);

    const blocked: string[] = [];
    Object.entries(slotCounts).forEach(([slot, count]) => {
      if (bookingType === "Full Court") {
        if (count >= 1) blocked.push(slot); 
      } else {
        if (count >= 2 || count === 999) blocked.push(slot); 
      }
    });

    setBookedSlots(blocked);
  };

  /* -------- Secure Razorpay Intent -------- */
  const openRazorpay = async () => {
    if (!name || !phone || !bookingDate || !startTime) {
      alert("⚠️ Please fill all fields and select a valid time slot.");
      return;
    }
    if (phone.length !== 10) {
      alert("⚠️ Invalid Phone Number: Please enter exactly 10 digits.");
      return;
    }

    setIsPaymentLoading(true); 

    try {
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
        setIsPaymentLoading(false);
        alert(`❌ ${orderData.error || "Slot is no longer available. Please select another time."}`);
        loadBookedSlots(bookingDate); 
        return;
      }

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
        setIsPaymentLoading(false);
      } else {
        setIsPaymentLoading(false);
        alert("Payment gateway script still loading. Please try again.");
      }
    } catch (error) {
      setIsPaymentLoading(false);
      console.error("Order creation failed:", error);
      alert("Failed to initiate secure checkout.");
    }
  };

  /* -------- Secure Server Booking Handler -------- */
  const handleBooking = async (paymentData: any) => {
    setIsProcessingBooking(true);

    try {
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
        setIsProcessingBooking(false);
        alert(`❌ ${verifyData.error || "Payment verification failed."}`);
        return;
      }

      const balanceAmount = totalAmount - 200;
      const bookingId = verifyData.booking?.id ? `#${verifyData.booking.id}` : "#----";
      const referenceId = verifyData.booking?.booking_reference || paymentData.razorpay_payment_id || "N/A";
      const advancePaid = 200;
      
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

      setIsProcessingBooking(false);

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

      // Reset form fields
      setName("");
      setPhone("");
      setBookingDate("");
      setStartTime("");
      setDuration("");
      loadBookedSlots(bookingDate); 

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

  /* ================================================================ */
  /* RENDER                                                          */
  /* ================================================================ */
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 font-sans tracking-tight antialiased relative w-full overflow-x-hidden">

      {/* ---------- Background ---------- */}
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
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      {/* ---------- Header ---------- */}
      <motion.header
        variants={stagger}
        initial="hidden"
        animate="show"
        className="max-w-7xl mx-auto px-4 pt-6 sm:pt-16 pb-6 sm:pb-8 relative z-10 text-center"
      >
        <motion.div
          variants={fadeUp}
          className="inline-flex items-center gap-1.5 px-3 py-1 sm:px-4 sm:py-1.5 rounded-full bg-slate-900/80 backdrop-blur border border-slate-800 text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-lime-400 mb-3 sm:mb-6 mt-1 sm:mt-4"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" />
          Elite Sports Venue
        </motion.div>

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 sm:gap-8">
          <div className="text-center lg:text-left">
            {/* 🛑 Added whitespace-nowrap to keep SMES TURF strictly in a single line on desktop */}
            <motion.h1
              variants={fadeUp}
              className="text-5xl sm:text-6xl md:text-8xl font-black tracking-tighter uppercase leading-none text-white whitespace-nowrap"
            >
              <span className="inline-block bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-neutral-400">
                SMES TURF
              </span>
            </motion.h1>

            {/* 📍 Location Pin under Heading */}
            <motion.div
              variants={fadeUp}
              className="flex items-center justify-center lg:justify-start gap-1.5 text-xs sm:text-sm font-mono text-lime-400 uppercase tracking-wider mt-0.5 sm:mt-3 font-bold"
            >
              <span className="text-sm sm:text-base">📍</span>
              <span>Vijayanagar, 2nd Stage, Mysuru</span>
            </motion.div>

            <motion.p
              variants={fadeUp}
              className="text-base sm:text-lg md:text-xl font-medium tracking-normal text-neutral-400 mt-3 sm:mt-4 max-w-xl mx-auto lg:mx-0"
            >
               Premium multisport arena built for high-performance{" "}
              <span className="text-lime-400">Football</span> &{" "}
              <span className="text-lime-400">Cricket</span> action.
            </motion.p>
          </div>

          {/* Header Action Buttons with Custom SVG Logos */}
          <motion.div
            variants={fadeUp}
            className="grid grid-cols-1 gap-2 w-full max-w-md mx-auto lg:max-w-none lg:mx-0 lg:flex lg:flex-wrap lg:justify-end lg:w-auto lg:gap-3"
          >
            {/* BOOK NOW Button */}
            <motion.button
              suppressHydrationWarning={true}
              whileHover={{ y: -2, boxShadow: "0 12px 30px rgba(163,230,53,0.35)" }}
              whileTap={{ scale: 0.97 }}
              onClick={scrollToBooking}
              type="button"
              className="bg-lime-400 hover:bg-lime-300 text-black text-xs font-mono uppercase tracking-wider p-4 rounded-none transition-colors font-black text-center shadow-lg shadow-lime-400/10 cursor-pointer flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/>
              </svg>
              <span>BOOK NOW</span>
            </motion.button>

            {/* Additional Header Navigation Links with Icons */}
            {[
              { 
                href: "/my-booking", 
                label: "My Bookings",
                icon: (
                  <svg className="w-4 h-4 fill-lime-400 shrink-0" viewBox="0 0 24 24">
                    <path d="M22 10V6c0-1.11-.9-2-2-2H4c-1.1 0-1.99.89-1.99 2v4c1.1 0 1.99.9 1.99 2s-.89 2-2 2v4c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-4c-1.1 0-2-.9-2-2s.9-2 2-2zm-2-1.46c-1.19.69-2 1.99-2 3.46s.81 2.77 2 3.46V18H4v-2.54c1.19-.69 2-1.99 2-3.46s-.81-2.77-2-3.46V6h16v2.54zM11 7h2v2h-2zm0 4h2v2h-2zm0 4h2v2h-2z"/>
                  </svg>
                )
              },
              { 
                href: "https://wa.me/918453095258", 
                label: "WhatsApp",
                icon: (
                  <svg className="w-4 h-4 fill-emerald-400 shrink-0" viewBox="0 0 24 24">
                    <path d="M12.012 2c-5.506 0-9.969 4.458-9.969 9.968 0 1.764.453 3.487 1.313 5.013l-1.396 5.099 5.234-1.365c1.472.802 3.137 1.222 4.818 1.222l.004-.001c5.505 0 9.967-4.457 9.967-9.968 0-2.663-1.038-5.168-2.923-7.051-1.884-1.884-4.388-2.92-7.048-2.92zm5.834 14.161c-.247.693-1.229 1.272-1.996 1.423-.523.103-1.205.186-3.504-.76-2.942-1.21-4.839-4.204-4.986-4.401-.147-.197-1.198-1.593-1.198-3.038 0-1.445.759-2.158 1.028-2.451.269-.293.587-.366.783-.366.196 0 .392.001.564.01.185.009.434-.07.679.529.245.599.833 2.032.906 2.18.073.148.122.321.024.518-.098.197-.147.321-.293.494-.147.173-.309.387-.441.52-.147.148-.302.309-.13.576.173.268.767 1.267 1.648 2.051 1.134 1.009 2.091 1.321 2.385 1.469.294.148.465.123.637-.074.172-.197.735-.856.932-1.15.196-.294.392-.246.661-.148.269.098 1.714.808 2.008.955.294.148.49.222.563.346.073.123.073.717-.174 1.41z"/>
                  </svg>
                )
              },
              { 
                href: "https://instagram.com/smesturf", 
                label: "Instagram",
                icon: (
                  <svg className="w-4 h-4 fill-pink-500 shrink-0" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                )
              }, 
              { 
                href: "https://maps.google.com/?q=12.329329,76.612008", 
                label: "Find Arena",
                icon: (
                  <svg className="w-4 h-4 fill-red-400 shrink-0" viewBox="0 0 24 24">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                  </svg>
                )
              },
              { 
                href: "tel:+918453095258", 
                label: "Call Desk",
                icon: (
                  <svg className="w-4 h-4 fill-lime-400 shrink-0" viewBox="0 0 24 24">
                    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                  </svg>
                )
              },
            ].map((btn) => (
              <motion.a
                key={btn.label}
                whileHover={{ y: -2, borderColor: "rgba(163,230,53,0.6)" }}
                whileTap={{ scale: 0.97 }}
                href={btn.href}
                className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white text-xs font-mono uppercase tracking-wider p-4 rounded-none transition-colors text-center flex items-center justify-center gap-2"
              >
                {btn.icon}
                <span>{btn.label}</span>
              </motion.a>
            ))}
          </motion.div>
        </div>

        <motion.div
          variants={fadeUp}
          className="mt-8 sm:mt-12 inline-flex items-center gap-3 sm:gap-4 bg-neutral-900/70 backdrop-blur border border-neutral-800 px-4 py-3 rounded-none w-full sm:w-auto"
        >
          <span className="flex h-2 w-2 relative flex-shrink-0">
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

              {/* Sport + Pitch Config */}
              <motion.div variants={fadeUp} className="space-y-6">
                
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

                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase text-neutral-400 flex justify-between items-center">
                    <span>Arena Scale Configuration</span>
                    <span className="text-lime-400 tracking-wider font-black">{bookingType.toUpperCase()}</span>
                  </label>
                  
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 bg-neutral-900/40 p-3 sm:p-4 border border-neutral-800">
                    
                    <div className="relative w-full sm:w-2/3 h-32 sm:h-40 bg-[#0d2a13] border-2 border-neutral-700 rounded-sm overflow-hidden flex shadow-inner group">
                      
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-40 group-hover:opacity-70 transition-opacity duration-300 z-10">
                        <div className="w-0.5 h-full bg-white" />
                        <div className="absolute w-14 sm:w-20 h-14 sm:h-20 border-2 border-white rounded-full" />
                        <div className="absolute w-1.5 h-1.5 bg-white rounded-full" />
                        <div className="absolute left-0 w-8 sm:w-12 h-16 sm:h-24 border-2 border-l-0 border-white top-1/2 -translate-y-1/2" />
                        <div className="absolute right-0 w-8 sm:w-12 h-16 sm:h-24 border-2 border-r-0 border-white top-1/2 -translate-y-1/2" />
                      </div>

                      <div className="absolute inset-0 z-20 pointer-events-none flex">
                        {bookingType === "Half Court" ? (
                          <>
                            <motion.div 
                              initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
                              className="w-1/2 h-full bg-lime-400/30 flex items-center justify-center border-r-2 border-lime-400 border-dashed backdrop-blur-[1px]"
                            >
                              <span className="text-lime-400 text-[10px] sm:text-xs font-black tracking-widest font-mono bg-black/80 px-2.5 py-1.5 shadow-lg border border-lime-400/30 uppercase">
                                5v5 Half
                              </span>
                            </motion.div>
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

              {/* Session Length */}
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
                    <option value="60">60 Minutes (- ₹{bookingType === "Half Court" ? 700 : 1200})</option>
                    <option value="90">90 Minutes (- ₹{bookingType === "Half Court" ? 1050 : 1800})</option>
                    <option value="120">120 Minutes (- ₹{bookingType === "Half Court" ? 1400 : 2400})</option>
                  </select>
                  <div className={`pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-xs transition-all ${
                    !bookingDate ? "text-neutral-700 opacity-40" : "text-neutral-500"
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
                        !bookingDate || !duration ? "opacity-40 pointer-events-none select-none" : ""
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
                            whileHover={available && !selected && bookingDate && duration ? { scale: 1.06 } : {}}
                            whileTap={available && bookingDate && duration ? { scale: 0.94 } : {}}
                            type="button"
                            disabled={!available || !bookingDate || !duration} 
                            onClick={() => setStartTime(slot)}
                            className={`relative py-3 px-1 text-[11px] sm:text-xs font-mono font-bold uppercase transition-colors border ${
                              selected
                                ? "bg-red-600 border-red-500 text-white"
                                : available && bookingDate && duration
                                ? "bg-lime-500/10 border-lime-500/30 text-lime-400 hover:bg-lime-500 hover:text-black cursor-pointer"
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

          {/* -------- Summary Side -------- */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.7, ease: easeOut }}
            className="lg:col-span-5 lg:sticky lg:top-6"
          >
            <div className="relative bg-[#0a0a0a] border border-neutral-800 flex flex-col shadow-2xl overflow-hidden">
              <div className="h-2 w-full bg-gradient-to-r from-lime-500 to-emerald-400" />
              
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
                  <span className="text-lime-400 text-xl sm:text-2xl font-black">{sport === "Cricket" ? "🏏" : "⚽"}</span>
                </div>
              </div>

              <div className="px-5 sm:px-6 py-4 grid grid-cols-2 gap-y-5 gap-x-4 bg-neutral-900/30">
                <div className="col-span-2 sm:col-span-1">
                   <span className="text-[9px] text-neutral-500 font-mono uppercase block mb-1">Pass Holder</span>
                  <span className="text-xs sm:text-sm font-bold text-lime-400 uppercase tracking-wider truncate block">
                    {name || "GUEST"}
                  </span>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <span className="text-[9px] text-neutral-500 font-mono uppercase block mb-1">Contact</span>
                  <span className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                    {phone ? `+91 ${phone}` : "REQUIRED"}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-neutral-500 font-mono uppercase block mb-1">Sport</span>
                  <span className="text-xs sm:text-sm font-bold text-lime-400 uppercase tracking-wider">{sport}</span>
                </div>
                <div>
                  <span className="text-[9px] text-neutral-500 font-mono uppercase block mb-1">Scale</span>
                  <span className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">{bookingType}</span>
                </div>
                 <div>
                  <span className="text-[9px] text-neutral-500 font-mono uppercase block mb-1">Date</span>
                  <span className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                    {bookingDate ? new Date(bookingDate).toLocaleDateString("en-GB") : "TBD"}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-neutral-500 font-mono uppercase block mb-1">Kickoff</span>
                  <span className="text-xs sm:text-sm font-bold text-lime-400 uppercase tracking-wider">{startTime || "TBD"}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-[9px] text-neutral-500 font-mono uppercase block mb-1">Timeframe</span>
                  <span className="text-xs sm:text-sm font-bold text-lime-400 uppercase tracking-wider">
                    {duration ? `${duration} Minutes` : "TBD"}
                  </span>
                </div>
              </div>

              {/* Perforated Line */}
              <div className="relative w-full h-8 flex items-center justify-center my-1">
                 <div className="absolute left-[-16px] w-8 h-8 bg-neutral-950 rounded-full border border-neutral-800 z-10" />
                <div className="absolute left-[-20px] w-10 h-10 bg-neutral-950 z-20" /> 
                <div className="absolute left-[-16px] w-8 h-8 rounded-full border-r border-neutral-800 z-30" />
                
                <div className="w-full border-t-2 border-dashed border-neutral-800 relative z-0 mx-4" />
                
                <div className="absolute right-[-16px] w-8 h-8 bg-neutral-950 rounded-full border border-neutral-800 z-10" />
                <div className="absolute right-[-20px] w-10 h-10 bg-neutral-950 z-20" /> 
                <div className="absolute right-[-16px] w-8 h-8 rounded-full border-l border-neutral-800 z-30" />
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
                    <span className="text-[8px] font-mono text-neutral-500 uppercase tracking-widest mt-1 block">+ Convenience Fee</span>
                  </div>
                </div>
              </div>

              {/* Barcode Graphic */}
              <div className="px-5 sm:px-6 pt-4 pb-6 flex flex-col items-center opacity-30">
                <div className="w-full h-8 flex justify-between items-end gap-[2px]">
                  {Array.from({ length: 35 }).map((_, i) => {
                    const deterministicWidth = (i % 4) + 1.5;
                    const combinedString = `${name}${phone}${sport}${bookingType}${bookingDate}${startTime}${duration}`;
                    let charSum = 0;
                    for (let j = 0; j < combinedString.length; j++) {
                      charSum += combinedString.charCodeAt(j);
                    }
                    const dynamicHeight = 20 + (((i * 41) + (charSum * 17)) % 80);

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

            <motion.button
              suppressHydrationWarning={true}
              whileHover={startTime && name && phone.length === 10 ?
                { y: -2, boxShadow: "0 12px 30px rgba(163,230,53,0.35)" } : {}}
              whileTap={startTime && name && phone.length === 10 ?
                { scale: 0.97 } : {}}
              type="button"
              onClick={() => setShowConfirmModal(true)}
              disabled={!startTime || !name || phone.length !== 10}
              className={`w-full mt-4 font-mono text-xs sm:text-sm uppercase tracking-widest py-4 sm:py-5 transition-all font-black shadow-lg flex items-center justify-center gap-3 ${
                !startTime || !name || phone.length !== 10
                  ? "bg-neutral-900 border border-neutral-800 text-neutral-600 cursor-not-allowed"
                  : "bg-lime-400 hover:bg-lime-300 text-black border border-lime-400 shadow-lime-400/20"
              }`}
            >
              {!name || phone.length !== 10 
                ? "Enter Name & 10-Digit Phone" 
                : !startTime 
                ? "Select Kickoff Time" 
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

          <div className="flex flex-col items-center md:items-end gap-2 font-mono text-[9px] sm:text-[10px] text-neutral-400 uppercase tracking-widest">
            <div className="flex flex-wrap justify-center md:justify-end gap-x-6 gap-y-2">
              <div><span className="text-lime-500">P:</span> +91 8453095258</div>
              <div><span className="text-lime-500">E:</span> sports@smesturf.com</div>
              <div><span className="text-lime-500">L:</span> Mysuru, Karnataka</div>
            </div>

            {/* 📄 Terms & Conditions Link */}
            <Link
              href="/terms"
              className="text-[9px] sm:text-[10px] text-neutral-500 hover:text-lime-400 uppercase tracking-widest transition-colors pt-1 underline underline-offset-4 decoration-neutral-800 hover:decoration-lime-400"
            >
              Terms & Conditions
            </Link>
          </div>
        </div>
      </motion.footer>

      {/* ---------- SMART Floating CTA ---------- */}
      <motion.button
        suppressHydrationWarning={true}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.5, ease: easeOut }}
        whileHover={{ scale: 1.05, boxShadow: startTime && name && phone.length === 10 ? "0 0 20px rgba(163,230,53,0.4)" : "0 0 20px rgba(163,230,53,0.2)" }}
        whileTap={{ scale: 0.95 }}
        onClick={() => {
          if (startTime && name && phone.length === 10) {
            setShowConfirmModal(true);
          } else {
            scrollToBooking();
          }
        }}
        className={`fixed bottom-6 right-4 md:bottom-8 md:right-8 z-[9000] backdrop-blur-md px-5 py-3 rounded-full transition-all duration-300 shadow-xl cursor-pointer flex items-center gap-2 text-[11px] md:text-[12px] font-mono font-bold uppercase tracking-widest ${
          startTime && name && phone.length === 10
            ? "bg-lime-400 text-black border border-lime-400 hover:bg-lime-300"
            : "bg-neutral-900/95 border border-neutral-700 hover:border-lime-400/50 text-white"
        }`}
        title={startTime && name && phone.length === 10 ? "Confirm Match Slot" : "Book Here"}
      >
        <motion.span
          className={startTime && name && phone.length === 10 ? "text-black" : "text-lime-400"}
          animate={{ rotate: [0, 15, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
        >
          {startTime && name && phone.length === 10 ? "🔒" : "⚡"}
        </motion.span>
        <span>{startTime && name && phone.length === 10 ? "Confirm Slot" : "Book Here"}</span>
      </motion.button>

      {/* ---------- Arena Pass Confirmation Modal ---------- */}
      <AnimatePresence>
        {showConfirmModal && (
          <motion.div
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[99999]"
            onClick={() => setShowConfirmModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-neutral-900 border border-neutral-800 p-6 sm:p-8 w-full max-w-md shadow-2xl space-y-6 relative overflow-hidden"
            >
               <div className="border-b border-neutral-800 pb-4">
                  <h3 className="text-xl font-black uppercase text-white tracking-tight">Are you confirm?</h3>
                  <p className="text-neutral-400 text-xs font-mono uppercase mt-1">Please verify your Arena Pass details</p>
               </div>

               <div className="grid grid-cols-2 gap-4 bg-black/50 p-4 border border-neutral-800/50">
                  <div>
                     <span className="text-[10px] text-neutral-500 font-mono uppercase block mb-1">Sport & Scale</span>
                     <span className="text-sm font-bold text-white uppercase tracking-wider">{sport} <span className="text-lime-400">({bookingType})</span></span>
                  </div>
                  <div>
                     <span className="text-[10px] text-neutral-500 font-mono uppercase block mb-1">Date</span>
                     <span className="text-sm font-bold text-white uppercase tracking-wider">{new Date(bookingDate).toLocaleDateString("en-GB")}</span>
                  </div>
                  <div>
                     <span className="text-[10px] text-neutral-500 font-mono uppercase block mb-1">Kick-off</span>
                     <span className="text-sm font-bold text-lime-400 uppercase tracking-wider">{startTime}</span>
                  </div>
                  <div>
                     <span className="text-[10px] text-neutral-500 font-mono uppercase block mb-1">Timeframe</span>
                     <span className="text-sm font-bold text-lime-400 uppercase tracking-wider">{duration} Mins</span>
                  </div>
               </div>

               <div className="space-y-3">
                  <div className="flex justify-between items-center text-neutral-400 px-1">
                     <span className="text-xs font-mono uppercase">Gross Value</span>
                     <span className="font-bold font-mono">₹{totalAmount}</span>
                  </div>
                  
                  <div className="bg-lime-400/10 border border-lime-400/30 p-4 flex justify-between items-center relative overflow-hidden">
                     <div className="absolute top-0 left-0 w-1 h-full bg-lime-400"></div>
                     <div>
                       <span className="text-[11px] font-mono font-bold text-lime-400 uppercase tracking-widest block">Advance Payable Now</span>
                       <span className="text-[9px] font-mono text-neutral-400 mt-1 block">Includes ₹5 Convenience Fee</span>
                     </div>
                     <span className="text-2xl font-black text-white">₹205</span>
                  </div>
               </div>

               <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setShowConfirmModal(false)}
                    className="flex-1 bg-transparent border border-neutral-700 hover:bg-neutral-800 text-white font-mono text-xs uppercase tracking-wider py-3.5 transition-colors"
                  >
                     Edit Details
                  </button>
                  <button
                    onClick={() => {
                      setShowConfirmModal(false);
                      openRazorpay();
                    }}
                    className="flex-1 bg-lime-400 hover:bg-lime-300 text-black font-black font-mono text-xs uppercase tracking-wider py-3.5 shadow-[0_0_15px_rgba(163,230,53,0.3)] transition-colors flex items-center justify-center gap-2"
                  >
                     Proceed To Pay
                  </button>
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
              <div className="absolute inset-0 border-t-2 border-l-2 border-lime-400 rounded-full animate-spin" />
              <div className="absolute inset-3 border-r-2 border-b-2 border-emerald-400 rounded-full animate-[spin_1.5s_reverse_infinite]" />
              <span className="text-3xl animate-pulse">{sport === "Cricket" ? "🏏" : "⚽"}</span>
            </div>
            
            <h2 className="text-lime-400 font-mono font-black uppercase tracking-[0.2em] mb-3 text-center px-4 text-sm sm:text-base drop-shadow-[0_0_10px_rgba(163,230,53,0.5)]">
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
              <div className="absolute inset-0 border-t-2 border-l-2 border-lime-400 rounded-full animate-spin" />
              <div className="absolute inset-3 border-r-2 border-b-2 border-white rounded-full animate-[spin_1.2s_reverse_infinite]" />
              <span className="text-3xl animate-pulse">🔒</span>
            </div>
            
            <h2 className="text-lime-400 font-mono font-black uppercase tracking-[0.2em] mb-3 text-center px-4 text-sm sm:text-base drop-shadow-[0_0_10px_rgba(163,230,53,0.5)]">
              Securing Your Slot
            </h2>
            
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500"></span>
              </span>
              <p className="text-neutral-400 font-mono text-[10px] sm:text-xs uppercase tracking-widest">
                Verifying Payment & Dispatching Tickets...
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- 🎉 FINAL SUCCESS CONFIRMATION MODAL WITH AUTO-DOWNLOAD PASS ---------- */}
      <AnimatePresence>
        {successData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 z-[999999] overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="bg-[#0a0a0a] border border-neutral-800 p-6 sm:p-8 w-full max-w-md shadow-2xl relative overflow-hidden my-8"
            >
              {/* Glowing Top Accent */}
              <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-lime-400 to-emerald-500" />
              <div className="absolute top-[-50px] left-1/2 -translate-x-1/2 w-[200px] h-[100px] bg-lime-500/20 blur-[60px] rounded-full pointer-events-none" />

              <div className="flex flex-col items-center text-center space-y-4 relative z-10">
                
                {/* Animated Checkmark */}
                <motion.div 
                  initial={{ scale: 0 }} 
                  animate={{ scale: 1, rotate: 360 }} 
                  transition={{ type: "spring", delay: 0.2 }}
                  className="w-16 h-16 bg-lime-400/10 border-2 border-lime-400 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(163,230,53,0.3)] mb-1"
                >
                  <span className="text-3xl drop-shadow-[0_0_10px_rgba(163,230,53,0.8)]">✅</span>
                </motion.div>

                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight text-white mb-1">Slot Confirmed!</h2>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-lime-400 flex items-center justify-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-ping" />
                    Auto-downloading Arena Pass to device...
                  </p>
                </div>

                {/* Printable Digital Ticket Node (autoPassRef Target) */}
                <div
                  ref={autoPassRef}
                  className="w-full bg-[#0a0a0a] border border-neutral-800 p-5 text-left space-y-3 relative overflow-hidden shadow-xl"
                >
                  <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-lime-400 to-emerald-500" />
                  
                  <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
                    <div>
                      <span className="text-[9px] font-mono text-lime-400 uppercase font-bold tracking-widest block">Official Arena Pass</span>
                      <h3 className="text-base font-black text-white uppercase tracking-tight">SMES Sports Turf</h3>
                      <p className="text-[9px] font-mono text-neutral-400 mt-0.5">
                        Ref: <strong className="text-lime-400">{successData.referenceId}</strong>
                      </p>
                    </div>
                    <div className="w-8 h-8 bg-neutral-900 border border-neutral-800 flex items-center justify-center">
                      <span className="text-base">{successData.sport === "Cricket" ? "🏏" : "⚽"}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-b border-neutral-800 pb-3 text-xs font-mono">
                    <div>
                      <span className="text-[8px] text-neutral-500 uppercase block">Booking ID</span>
                      <span className="font-bold text-white uppercase">{successData.bookingId}</span>
                    </div>
                    <div>
                      <span className="text-[8px] text-neutral-500 uppercase block">Player</span>
                      <span className="font-bold text-white uppercase truncate block">{successData.name}</span>
                    </div>
                    <div>
                      <span className="text-[8px] text-neutral-500 uppercase block">Schedule</span>
                      <span className="font-bold text-lime-400 uppercase">
                        {new Date(successData.date).toLocaleDateString("en-GB")}<br/>
                        {getTimeRangeLabel(successData.time, successData.duration)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[8px] text-neutral-500 uppercase block">Scale</span>
                      <span className="font-bold text-white uppercase">{successData.bookingType}</span>
                    </div>
                  </div>

                  <div className="space-y-1 pt-1 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-[9px] text-neutral-500 uppercase">Advance Paid</span>
                      <span className="font-bold text-emerald-400">₹{successData.advancePaid}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[9px] text-neutral-500 uppercase">Balance Due at Venue</span>
                      <span className="font-bold text-red-400">₹{successData.balance}</span>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-neutral-500 font-mono mt-2 leading-relaxed">
                  A confirmation message has been sent to your WhatsApp. Please arrive 10 minutes prior to kickoff.
                </p>

                <motion.button
                  whileHover={{ y: -2, boxShadow: "0 10px 25px rgba(163,230,53,0.2)" }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setSuccessData(null)}
                  className="w-full mt-2 bg-lime-400 hover:bg-lime-300 text-black font-black font-mono text-xs uppercase tracking-widest py-4 transition-all"
                >
                  Done
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}