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
  const [duration, setDuration] = useState(""); // 🔒 Default cleared state value
  const [bookingType, setBookingType] = useState("Full Court");
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);

  // Staff Auth
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffRole, setStaffRole] = useState("Admin");
  const [staffPassword, setStaffPassword] = useState("");

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
  }, [bookingDate, bookingType]);

  /* -------- Pricing -------- */
  const totalAmount = useMemo(() => {
    if (!duration) return 0; // 🔒 Guard condition fallback structure
    if (bookingType === "Half Court") {
      return duration === "60" ? 750 : duration === "90" ? 1100 : 1500;
    }
    return duration === "60" ? 1250 : duration === "90" ? 1850 : 2500;
  }, [bookingType, duration]);

  const advanceAmount = 205;

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
    if (!bookingDate || !duration) return false; // 🔒 Locked guard parameter validation boundary
    const segmentsNeeded = Number(duration) / 30;
    const slotIndex = allSlots.indexOf(slot);
    for (let i = 0; i < segmentsNeeded; i++) {
      const targetIndex = slotIndex + i;
      if (targetIndex < allSlots.length) {
        const nextSlot = allSlots[targetIndex];
        if (bookedSlots.includes(nextSlot)) return false;
      }
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
        if (bookingType === "Full Court") {
          if (count >= 1) blocked.push(slot);
        } else {
          if (count >= 2 || count === 999) blocked.push(slot);
        }
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

  /* -------- Razorpay -------- */
  const openRazorpay = async () => {
    try {
      if (!name || !phone || !bookingDate || !startTime) {
        alert("Please fill all fields and select a valid time slot.");
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
        name: "SMES Turf",
        description: "Advance Booking Payment",
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

  /* -------- Booking Handler -------- */
  const handleBooking = async (paymentData?: any) => {
    if (!name || !phone || !bookingDate || !startTime) {
      alert("Please fill all fields and select a valid time slot.");
      return;
    }

    const { data: existingBookings, error: checkError } = await supabase
      .from("bookings")
      .select("*")
      .eq("booking_date", bookingDate);

    const { data: blockedSlotsData, error: blockedError } = await supabase
      .from("blocked_slots")
      .select("*")
      .eq("booking_date", bookingDate);

    if (checkError) { alert(checkError.message); return; }
    if (blockedError) { alert(blockedError.message); return; }

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

    const overlappingBlocked =
      blockedSlotsData?.filter((slot) => {
        if (!slot.start_time) return false;
        const [hours, minutes] = slot.start_time.substring(0, 5).split(":").map(Number);
        const blockStart = hours * 60 + minutes;
        const blockEnd = blockStart + (slot.duration_minutes || 60);
        return selectedStart < blockEnd && selectedEnd > blockStart;
      }) || [];

    if (bookingType === "Half Court") {
      const fullCourtExists =
        overlappingBookings.some((b) => b.booking_type === "Full Court") || overlappingBlocked.length > 0;
      if (fullCourtExists) { alert("❌ No Half Court Available."); return; }
      const court1Taken = overlappingBookings.some((b) => b.court_number === "Court 1");
      const court2Taken = overlappingBookings.some((b) => b.court_number === "Court 2");
      if (!court1Taken) courtNumber = "Court 1";
      else if (!court2Taken) courtNumber = "Court 2";
      else { alert("❌ No Half Court Available."); return; }
    }

    if (bookingType === "Full Court") {
      if (overlappingBookings.length > 0 || overlappingBlocked.length > 0) {
        alert("❌ Full Court Not Available.");
        return;
      }
      courtNumber = "Both Courts";
    }

    if (paymentData === "CHECK_ONLY") return true;

    const { data: insertedData, error } = await supabase.from("bookings").insert([
      {
        customer_name: name,
        phone,
        booking_type: bookingType,
        court_number: courtNumber,
        sport: sport.toLowerCase(),
        booking_date: bookingDate,
        start_time: convert12to24(startTime),
        duration_minutes: Number(duration),
        total_amount: totalAmount,
        advance_amount: 200,
        balance_amount: totalAmount - 200,
        razorpay_order_id: paymentData?.razorpay_order_id,
        razorpay_payment_id: paymentData?.razorpay_payment_id,
        payment_status: "paid",
      },
    ]).select();

    if (error) { console.error(error); alert(error.message); return; }

    const balanceAmount = totalAmount - 200;
    const bookingId = insertedData?.[0]?.id
      ? `#${insertedData[0].id.toString().slice(-4)}`
      : "#----";

    const clientText = `🏟️ *SMES Sports Academy Booking Confirmed*\n\nHello ${name},\n\nYour booking has been successfully confirmed.\n\n📅 *Date:* ${bookingDate}\n🕒 *Time:* ${startTime}\n⏱ *Duration:* ${duration} Minutes\n🏏 *Sport:* ${sport}\n🏟 *Court:* ${bookingType}\n\n💰 *Total Amount:* ₹${totalAmount}\n✅ *Advance Paid:* ₹200\n💳 *Balance Due:* ₹${balanceAmount}\n\n📍 *Location:*\nSMES Sports Academy, Mysuru\n\n⚠️ Please arrive 10 minutes before your slot.\n⚠️ Balance payment must be completed before play starts.\n\nThank you for choosing SMES Sports Academy.\n\n📞 *Support:* 8453095258`;

    const adminText = `🔔 *NEW BOOKING RECEIVED*\n\n🏟️ *SMES Sports Academy*\n\n👤 *Customer:* ${name}\n📞 *Phone:* ${phone}\n\n📅 *Date:* ${bookingDate}\n🕒 *Time:* ${startTime}\n⏱ *Duration:* ${duration} Minutes\n\n🏟 *Court:* ${courtNumber}\n🏏 *Sport:* ${sport}\n\n💰 *Total Amount:* ₹${totalAmount}\n✅ *Advance Paid:* ₹200\n💳 *Balance:* ₹${balanceAmount}\n\n💳 *Payment Status:* PAID\n\n*Booking ID:* ${bookingId}`;

    try {
      await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerPhone: `91${phone}`,
          customerMessage: clientText,
          adminMessage: adminText,
        }),
      });
    } catch (e) {
      console.log("Notification route connection failed.");
    }

    alert("✅ Payment Successful & Booking Saved! Confirmations dispatched via WhatsApp.");

    setName("");
    setPhone("");
    setBookingDate("");
    setStartTime("");
    setDuration("");
  };

  /* -------- Staff Login -------- */
  const handleStaffLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (staffRole === "Admin") {
      if (staffPassword === "SMES@2026") {
        localStorage.setItem("adminLoggedIn", "true");
        localStorage.setItem("adminLoginTime", Date.now().toString());
        router.push("/admin");
        setShowStaffModal(false);
        setStaffPassword("");
      } else alert("❌ Invalid Admin Password");
    } else if (staffRole === "Sub-Admin") {
      if (staffPassword === "1234") {
        localStorage.setItem("subadminLoggedIn", "true");
        router.push("/subadmin");
        setShowStaffModal(false);
        setStaffPassword("");
      } else alert("❌ Invalid Sub-Admin Password");
    } else if (staffRole === "Coach") {
      if (staffPassword === "2468") {
        localStorage.setItem("subAdminLoggedIn", "true");
        router.push("/coach");
        setShowStaffModal(false);
        setStaffPassword("");
      } else alert("❌ Invalid Coach Password");
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
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
              ⚽ BOOK NOW
            </motion.button>
            {[
              { href: "https://wa.me/918453095258", label: "WhatsApp" },
              { href: "https://maps.google.com/?q=12.329329,76.612008", label: "Find Arena" },
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

        <motion.div
          variants={fadeUp}
          className="mt-8 sm:mt-12 inline-flex items-center gap-3 sm:gap-4 bg-neutral-900/70 backdrop-blur border border-neutral-800 px-4 py-3 rounded-none w-full sm:w-auto"
        >
          <span className="flex h-2 w-2 relative flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500" />
          </span>
          <p className="text-[11px] sm:text-xs font-mono uppercase tracking-wide text-neutral-300">
            ⚡ Live Promo Offer:{" "}
            <span className="text-lime-400 font-bold">₹1250 / Hr Only</span>
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
            <motion.div variants={fadeUp}>
              <span className="text-[11px] font-mono uppercase tracking-widest text-neutral-500 block mb-2">
                02 — Reservation
              </span>
              <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
                Select and Secure Pitch
              </h2>
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
                    className="w-full p-4 bg-neutral-900/50 text-white border border-neutral-800 focus:border-lime-400 outline-none rounded-none transition-all font-medium text-base md:text-sm"
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
                    className="w-full p-4 bg-neutral-900/50 text-white border border-neutral-800 focus:border-lime-400 outline-none rounded-none transition-all font-medium text-base md:text-sm"
                  />
                </div>
              </motion.div>

              {/* Sport + Type */}
              <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase text-neutral-400">Sport</label>
                  <div className="relative">
                    <select
                      suppressHydrationWarning={true}
                      value={sport}
                      onChange={(e) => setSport(e.target.value)}
                      className="w-full p-4 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none rounded-none appearance-none font-medium text-base md:text-sm"
                    >
                      <option value="Football">Football</option>
                      <option value="Cricket">Cricket</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 text-xs">▼</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase text-neutral-400">Pitch Scale</label>
                  <div className="relative">
                    <select
                      suppressHydrationWarning={true}
                      value={bookingType}
                      onChange={(e) => setBookingType(e.target.value)}
                      className="w-full p-4 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none rounded-none appearance-none font-medium text-base md:text-sm"
                    >
                      <option value="Half Court">Half Court</option>
                      <option value="Full Court">Full Court</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 text-xs">▼</div>
                  </div>
                </div>
              </motion.div>

              {/* Date */}
              <motion.div variants={fadeUp} className="space-y-2">
                <label className="text-xs font-mono uppercase text-neutral-400">Calendar Date</label>
                <input
                  suppressHydrationWarning={true}
                  type="date"
                  min={getLocalDateString()}
                  value={bookingDate}
                  onChange={(e) => {
                    setBookingDate(e.target.value);
                    loadBookedSlots(e.target.value);
                  }}
                  className="w-full p-4 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none rounded-none font-medium text-base md:text-sm"
                  style={{ colorScheme: "dark" }}
                />
              </motion.div>

              {/* Duration - 🛠️ Always Visible but Select Interactivity Locked until Date Input Registers */}
              <motion.div variants={fadeUp} className="space-y-2 relative">
                <label className="text-xs font-mono uppercase text-neutral-400">Session Length</label>
                <div className="relative">
                  <select
                    disabled={!bookingDate} // 🔒 Dependency constraint handler hook
                    suppressHydrationWarning={true}
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className={`w-full p-4 bg-neutral-900 text-white border outline-none rounded-none appearance-none font-medium text-base md:text-sm transition-all ${
                      !bookingDate ? "border-neutral-800/50 opacity-40 cursor-not-allowed text-neutral-500" : "border-neutral-800 focus:border-lime-400"
                    }`}
                  >
                    <option value="" disabled hidden>-- Select Session Length --</option> {/* 🔒 Initial custom row index indicator block */}
                    <option value="60">60 Minutes (- ₹{bookingType === "Half Court" ? 750 : 1250})</option>
                    <option value="90">90 Minutes (- ₹{bookingType === "Half Court" ? 1100 : 1850})</option>
                    <option value="120">120 Minutes (- ₹{bookingType === "Half Court" ? 1500 : 2500})</option>
                  </select>
                  <div className={`pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-xs transition-all ${
                    !bookingDate ? "text-neutral-700 opacity-40" : "text-neutral-500"
                  }`}>▼</div>
                </div>
              </motion.div>

              {/* Slot Grid - 🛠️ Always Visible but Block Click Overrides until Date and Duration are populated */}
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
                            disabled={!available || !bookingDate || !duration} // 🔒 Consolidated dependency locks
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
            className="lg:col-span-5 bg-neutral-900/50 backdrop-blur border border-neutral-900 p-4 sm:p-6 md:p-8 rounded-none space-y-6 lg:sticky lg:top-6"
          >
            <div className="border-b border-neutral-800 pb-4">
              <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
                Live Breakdown Summary
              </span>
              <h3 className="text-lg font-bold uppercase text-white mt-1">Pitch Bill Receipt</h3>
            </div>

            <div className="space-y-3 text-xs font-mono">
              {[
                { k: "SPORT", v: sport, cls: "text-white uppercase" },
                { k: "ARENA SCALE", v: bookingType, cls: "text-white" },
                { k: "TARGET DATE", v: bookingDate || "Unselected", cls: "text-lime-400" },
                { k: "KICKOFF TIME", v: startTime || "None", cls: "text-white" },
                { k: "DURATION TIMEFRAME", v: `${duration ? duration + ' Minutes' : 'Unselected'}`, cls: "text-white" },
              ].map((row) => (
                <div key={row.k} className="flex justify-between gap-4">
                  <span className="text-neutral-500 flex-shrink-0">{row.k}:</span>
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={row.v}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.2 }}
                      className={`font-bold text-right break-all ${row.cls}`}
                    >
                      {row.v}
                    </motion.span>
                  </AnimatePresence>
                </div>
              ))}
            </div>

            {/* 🧾 PITCH BILL RECEIPT: Gross value on top downscaled to 20px, lockdown fee below downscaled to 17.7px */}
            <div className="black bg-black p-4 border border-neutral-800 space-y-4">
              
              {/* Row 1: Gross Field Value (Positioned Above - Fixed to 20px White) */}
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                <span className="text-xs font-mono text-white font-black tracking-wider">GROSS FIELD VALUE:</span>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={totalAmount}
                    initial={{ opacity: 0, y: -6, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.9 }}
                    transition={{ duration: 0.25, ease: easeOut }}
                    className="text-[20px] leading-none font-black text-white whitespace-nowrap"
                  >
                    ₹{totalAmount}
                  </motion.span>
                </AnimatePresence>
              </div>

              <div className="h-px bg-neutral-800 my-2" />

              {/* Row 2: Lockdown Reservation Fee (Positioned Below - Fixed to 17.7px Lime Green) */}
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                <span className="text-[10px] font-mono text-neutral-400 font-bold tracking-wider">LOCKDOWN RESERVATION FEE:</span>
                <span className="text-[17.5px] leading-none font-black text-lime-400 whitespace-nowrap">
                  ₹200 + Convenience Fee
                </span>
              </div>

              <p className="text-[10px] text-neutral-600 leading-normal font-mono pt-1 border-t border-neutral-900/60">
                An advance lock deposit reserves the stadium slot uniquely for your team line.
              </p>
            </div>

            <motion.button
              suppressHydrationWarning={true}
              whileHover={startTime ? { y: -2, boxShadow: "0 12px 30px rgba(163,230,53,0.35)" } : {}}
              whileTap={startTime ? { scale: 0.97 } : {}}
              type="button"
              onClick={openRazorpay}
              disabled={!startTime}
              className={`w-full font-mono text-xs uppercase tracking-widest py-4 rounded-none transition-colors font-black ${
                !startTime
                  ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                  : "bg-lime-400 hover:bg-lime-300 text-black cursor-pointer"
              }`}
            >
              {!startTime ? "Select Slot" : "Confirm Match Slot"}
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
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl w-full max-w-sm shadow-2xl space-y-4"
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
                              ? "bg-lime-400 border-lime-400 text-black font-black"
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