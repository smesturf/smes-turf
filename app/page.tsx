"use client";

import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import { motion, useMotionValue, useSpring } from "framer-motion";

export default function Home() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sport, setSport] = useState("Football");
  const [bookingDate, setBookingDate] = useState("");
  const [startTime, setStartTime] = useState("06:00 AM");
  const [duration, setDuration] = useState("60");
  const [bookingType, setBookingType] = useState("Full Court");
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);

  // Kinetic Frame Trail Motion Vectors
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);

  // Layer 1: High-Response Structural Spring (Tight Tracking)
  const quickSpringConfig = { stiffness: 450, damping: 28, mass: 0.3 };
  const targetX = useSpring(cursorX, quickSpringConfig);
  const targetY = useSpring(cursorY, quickSpringConfig);

  // Layer 2: Elastic Ghost Trail Spring (Fluid Velocity Delay)
  const fluidTrailConfig = { stiffness: 120, damping: 20, mass: 0.6 };
  const trailX = useSpring(cursorX, fluidTrailConfig);
  const trailY = useSpring(cursorY, fluidTrailConfig);

  useEffect(() => {
    const moveCursor = (e: MouseEvent) => {
      cursorX.set(e.clientX);
      cursorY.set(e.clientY);
    };
    window.addEventListener("mousemove", moveCursor);
    return () => {
      window.removeEventListener("mousemove", moveCursor);
    };
  }, [cursorX, cursorY]);

  useEffect(() => {
    if (bookingDate) {
      loadBookedSlots(bookingDate);
    }
  }, [bookingDate, bookingType]);

  const totalAmount =
    bookingType === "Half Court"
      ? duration === "60"
        ? 750
        : duration === "90"
        ? 1100
        : 1500
      : duration === "60"
      ? 1250
      : duration === "90"
      ? 1850
      : 2500;

  const advanceAmount = 205;
  const allSlots = [
    "05:00 AM", "05:30 AM",
    "06:00 AM", "06:30 AM",
    "07:00 AM", "07:30 AM",
    "08:00 AM", "08:30 AM",
    "09:00 AM", "09:30 AM",
    "10:00 AM", "10:30 AM",
    "11:00 AM", "11:30 AM",
    "12:00 PM", "12:30 PM",
    "01:00 PM", "01:30 PM",
    "02:00 PM", "02:30 PM",
    "03:00 PM", "03:30 PM",
    "04:00 PM", "04:30 PM",
    "05:00 PM", "05:30 PM",
    "06:00 PM", "06:30 PM",
    "07:00 PM", "07:30 PM",
    "08:00 PM", "08:30 PM",
    "09:00 PM", "09:30 PM",
    "10:00 PM", "10:30 PM",
    "11:00 PM", "11:30 PM"
  ];

  const loadBookedSlots = async (date: string) => {
    const { data, error } = await supabase
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

    if (data) {
      const blocked: string[] = [];
      const slotCounts: Record<string, number> = {};

      data.forEach((booking: any) => {
        const time = booking.start_time.substring(0, 5);
        const [h, m] = time.split(":");
        let minutes = Number(h) * 60 + Number(m);
        const slotsToBlock = booking.duration_minutes / 30;

        for (let i = 0; i < slotsToBlock; i++) {
          const current = minutes + i * 30;
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
          if (count >= 1) {
            blocked.push(slot);
          }
        } else {
          if (count >= 2 || count === 999) {
            blocked.push(slot);
          }
        }
      });

      if (blockedData) {
        blockedData.forEach((slot: any) => {
          const time = slot.start_time.substring(0, 5);
          const [h, m] = time.split(":");
          let minutes = Number(h) * 60 + Number(m);
          const slotsToBlock = (slot.duration_minutes || 60) / 30;

          for (let i = 0; i < slotsToBlock; i++) {
            const current = minutes + i * 30;
            const hour24 = Math.floor(current / 60);
            const minute = current % 60;
            const ampm = hour24 >= 12 ? "PM" : "AM";
            const hour12 = hour24 % 12 || 12;
            blocked.push(`${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${ampm}`);
          }
        });
      }

      setBookedSlots(blocked);
    }
  };

  const openRazorpay = async () => {
    try {
      if (!name || !phone || !bookingDate) {
        alert("Please fill all fields");
        return;
      }
      const availabilityCheck = await handleBooking("CHECK_ONLY");
      if (!availabilityCheck) {
        return;
      }
      const response = await fetch("/api/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: advanceAmount,
        }),
      });

      const order = await response.json();

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: "SMES Turf",
        description: "Advance Booking Payment",
        order_id: order.id,
        handler: async function (response: any) {
          await handleBooking(response);
        },
        prefill: {
          name: name,
          contact: phone,
        },
      };

      const razor = new (window as any).Razorpay(options);
      razor.open();
    } catch (error) {
      console.error(error);
      alert("Failed to open payment gateway");
    }
  };

  const handleBooking = async (paymentData?: any) => {
    if (!name || !phone || !bookingDate) {
      alert("Please fill all fields");
      return;
    }

    const { data: existingBookings, error: checkError } = await supabase
      .from("bookings")
      .select("*")
      .eq("booking_date", bookingDate);

    if (checkError) {
      alert(checkError.message);
      return;
    }

    const selectedDuration = Number(duration);
    const convertToMinutes = (time: string) => {
      const [timePart, ampm] = time.split(" ");
      let [hours, minutes] = timePart.split(":").map(Number);
      if (ampm === "PM" && hours !== 12) hours += 12;
      if (ampm === "AM" && hours === 12) hours = 0;
      return hours * 60 + minutes;
    };

    const selectedStart = convertToMinutes(startTime);
    const selectedEnd = selectedStart + selectedDuration;

    const conflict = existingBookings?.some((booking) => {
      const [hours, minutes] = booking.start_time
        .substring(0, 5)
        .split(":")
        .map(Number);
      const bookingStart = hours * 60 + minutes;
      const bookingEnd = bookingStart + booking.duration_minutes;
      return selectedStart < bookingEnd && selectedEnd > bookingStart;
    });

    let courtNumber = "";
    const overlappingBookings =
      existingBookings?.filter((booking) => {
        const [hours, minutes] = booking.start_time
          .substring(0, 5)
          .split(":")
          .map(Number);
        const bookingStart = hours * 60 + minutes;
        const bookingEnd = bookingStart + booking.duration_minutes;
        return selectedStart < bookingEnd && selectedEnd > bookingStart;
      }) || [];

    if (bookingType === "Half Court") {
      const fullCourtExists = overlappingBookings.some((b) => b.booking_type === "Full Court");
      if (fullCourtExists) {
        alert("❌ No Half Court Available.");
        return;
      }
      const court1Taken = overlappingBookings.some((b) => b.court_number === "Court 1");
      const court2Taken = overlappingBookings.some((b) => b.court_number === "Court 2");

      if (!court1Taken) {
        courtNumber = "Court 1";
      } else if (!court2Taken) {
        courtNumber = "Court 2";
      } else {
        alert("❌ No Half Court Available.");
        return;
      }
    }

    if (bookingType === "Full Court") {
      if (overlappingBookings.length > 0) {
        alert("❌ Full Court Not Available.");
        return;
      }
      courtNumber = "Both Courts";
    }

    if (paymentData === "CHECK_ONLY") {
      return true;
    }

    console.log("Assigned court:", courtNumber);
    const { error } = await supabase.from("bookings").insert([
      {
        customer_name: name,
        phone: phone,
        booking_type: bookingType,
        court_number: courtNumber,
        sport: sport.toLowerCase(),
        booking_date: bookingDate,
        start_time: startTime,
        duration_minutes: Number(duration),
        total_amount: totalAmount,
        advance_amount: 200,
        balance_amount: totalAmount - 200,
        razorpay_order_id: paymentData?.razorpay_order_id,
        razorpay_payment_id: paymentData?.razorpay_payment_id,
        payment_status: "paid",
      },
    ]);

    if (error) {
      console.error(error);
      alert(error.message);
      return;
    }

    const balanceAmount = totalAmount - 200;
    const message = `🏟️ SMES Turf Booking Confirmed\n\nName: ${name}\nDate: ${bookingDate}\nTime: ${startTime}\nSport: ${sport}\n\n💰 Total Amount: ₹${totalAmount}\n✅ Advance Paid: ₹${advanceAmount}\n💳 Balance Due: ₹${balanceAmount}\n\nThank you for choosing SMES Turf!`;

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
    alert("✅ Payment Successful & Booking Saved");

    setName("");
    setPhone("");
    setBookingDate("");
    setStartTime("06:00 AM");
    setDuration("60");
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 selection:bg-lime-400 selection:text-slate-950 font-sans relative overflow-x-hidden antialiased lg:cursor-none">
      
      {/* ── HIGH PERFORMANCE MULTI-STAGE TRAILING KINETIC CURSOR GRID ── */}
      {/* Element A: Core Focal Dot (0-latency tracking input position) */}
      <motion.div
        className="fixed top-0 left-0 w-2 h-2 bg-lime-400 rounded-full pointer-events-none z-50 mix-blend-screen hidden lg:block"
        style={{ x: cursorX, y: cursorY, translateX: "-50%", translateY: "-50%" }}
      />
      
      {/* Element B: High-Tension Response Ring */}
      <motion.div
        className="fixed top-0 left-0 w-8 h-8 border border-lime-400/80 rounded-full pointer-events-none z-50 mix-blend-screen hidden lg:block"
        style={{ x: targetX, y: targetY, translateX: "-50%", translateY: "-50%" }}
      />

      {/* Element C: Fluid Velocity Ghost Trailing Ring */}
      <motion.div
        className="fixed top-0 left-0 w-12 h-12 border border-emerald-500/30 bg-emerald-500/[0.02] rounded-full pointer-events-none z-50 mix-blend-screen hidden lg:block"
        style={{ x: trailX, y: trailY, translateX: "-50%", translateY: "-50%" }}
      />

      {/* Stadium Lightning FX overlay */}
      <div className="absolute top-0 inset-x-0 h-[640px] bg-gradient-to-b from-lime-500/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[20%] right-[-10%] w-[40%] h-[60%] bg-lime-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Header Banner Section */}
      <header className="max-w-7xl mx-auto px-4 pt-16 pb-8 relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-semibold uppercase tracking-widest text-lime-400 mb-6"
        >
          <span className="w-2 h-2 rounded-full bg-lime-400 animate-pulse" />
          Elite Sports Venue
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-5xl md:text-8xl font-black tracking-tight uppercase italic bg-gradient-to-r from-white via-slate-200 to-slate-500 bg-clip-text text-transparent"
        >
          SMES TURF
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-lg md:text-xl font-bold tracking-widest uppercase text-lime-400/90 mt-2 italic"
        >
          Premium Football & Cricket Arena
        </motion.p>

        {/* Dynamic Offering Badge */}
        <div className="mt-8 inline-block transform -skew-x-12 bg-gradient-to-r from-lime-400 to-emerald-500 text-slate-950 px-8 py-3 font-black uppercase tracking-wider text-sm shadow-[0_0_30px_rgba(163,230,53,0.25)] rounded-sm">
          <div className="transform skew-x-12">🎉 Launch Offer: ₹1250 / Hour</div>
        </div>

        {/* Quick Quicklinks Row */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-12 max-w-xl mx-auto">
          <a
            href="https://wa.me/918453095258"
            className="flex-1 min-w-[140px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-xl transition-all duration-200 text-sm tracking-wide shadow-lg shadow-emerald-950/50 lg:cursor-none"
          >
            WhatsApp Us
          </a>
          <a
            href="https://maps.google.com/?q=12.329329,76.612008"
            className="flex-1 min-w-[140px] bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold py-3 px-4 rounded-xl transition-all duration-200 text-sm tracking-wide lg:cursor-none"
          >
            Get Directions
          </a>
          <a
            href="tel:+918453095258"
            className="flex-1 min-w-[140px] bg-lime-400 hover:bg-lime-300 text-slate-950 font-black py-3 px-4 rounded-xl transition-all duration-200 text-sm tracking-wide shadow-lg shadow-lime-400/10 lg:cursor-none"
          >
            📞 Call Desk
          </a>
        </div>
      </header>

      {/* Main Form Dashboard Section */}
      <section className="max-w-7xl mx-auto px-4 py-8 relative z-10">
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          
          {/* Left / Center: Interactive Grid Booking Architecture */}
          <div className="lg:col-span-7 bg-slate-900/60 backdrop-blur-xl p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl space-y-8">
            
            <div>
              <h2 className="text-2xl font-black uppercase tracking-wide text-white">
                Configure <span className="text-lime-400">Your Session</span>
              </h2>
              <p className="text-slate-400 text-xs mt-1">Fill details and tap on your layout preference to check space accessibility.</p>
            </div>

            <div className="space-y-5">
              {/* Profile Context Rows */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-slate-400 tracking-wider">Full Name</label>
                  <input
                    type="text"
                    placeholder="Athletes Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full p-4 rounded-xl bg-slate-950 text-white border border-white/5 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none transition-all placeholder:text-slate-700 font-medium text-sm min-h-[52px] lg:cursor-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-slate-400 tracking-wider">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="WhatsApp Active Number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full p-4 rounded-xl bg-slate-950 text-white border border-white/5 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 outline-none transition-all placeholder:text-slate-700 font-medium text-sm min-h-[52px] lg:cursor-none"
                  />
                </div>
              </div>

              {/* Functional Component Rule #3: Tactical Option Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-slate-400 tracking-wider">Select Sport</label>
                  <div className="relative">
                    <select
                      value={sport}
                      onChange={(e) => setSport(e.target.value)}
                      className="w-full p-4 rounded-xl bg-slate-950 text-white border border-white/5 focus:border-lime-400 outline-none appearance-none font-semibold text-sm min-h-[52px] lg:cursor-none"
                    >
                      <option value="Football">⚽ Football Arena</option>
                      <option value="Cricket">🏏 Cricket Net</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 text-xs">▼</div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-slate-400 tracking-wider">Court Configuration</label>
                  <div className="relative">
                    <select
                      value={bookingType}
                      onChange={(e) => setBookingType(e.target.value)}
                      className="w-full p-4 rounded-xl bg-slate-950 text-white border border-white/5 focus:border-lime-400 outline-none appearance-none font-semibold text-sm min-h-[52px] lg:cursor-none"
                    >
                      <option value="Half Court">🌓 Half Court Size</option>
                      <option value="Full Court">🌕 Full Stadium Court</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 text-xs">▼</div>
                  </div>
                </div>
              </div>

              {/* Dynamic Calendar Trigger */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-slate-400 tracking-wider">Choose Date</label>
                <input
                  type="date"
                  min={new Date().toISOString().split("T")[0]}
                  value={bookingDate}
                  onChange={(e) => {
                    setBookingDate(e.target.value);
                    loadBookedSlots(e.target.value);
                  }}
                  className="w-full p-4 rounded-xl bg-slate-950 text-white border border-white/5 focus:border-lime-400 outline-none font-semibold text-sm min-h-[52px] lg:cursor-none"
                  style={{ colorScheme: "dark" }}
                />
              </div>

              {/* High Energy Tactical Time Slot Layout */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-slate-400 tracking-wider block">Select Available Time Slot</label>
                
                <div className="relative">
                  <select
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full p-4 rounded-xl bg-slate-950 text-white border border-white/5 focus:border-lime-400 outline-none appearance-none font-bold text-sm min-h-[52px] lg:cursor-none"
                  >
                    {allSlots
                      .filter((slot) => {
                        if (bookedSlots.includes(slot)) return false;
                        const today = new Date().toISOString().split("T")[0];
                        if (bookingDate !== today) return true;
                        const now = new Date();
                        const currentMinutes = now.getHours() * 60 + now.getMinutes();
                        const [time, ampm] = slot.split(" ");
                        let [hours, minutes] = time.split(":").map(Number);
                        if (ampm === "PM" && hours !== 12) hours += 12;
                        if (ampm === "AM" && hours === 12) hours = 0;
                        const slotMinutes = hours * 60 + minutes;
                        return slotMinutes > currentMinutes;
                      })
                      .map((slot) => (
                        <option key={slot} value={slot}>
                          ⏱️ {slot}
                        </option>
                      ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 text-xs">▼</div>
                </div>
              </div>

              {/* Duration Settings Option Block */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-slate-400 tracking-wider">Match Duration Capacity</label>
                <div className="relative">
                  <select
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-full p-4 rounded-xl bg-slate-950 text-white border border-white/5 focus:border-lime-400 outline-none appearance-none font-bold text-sm min-h-[52px] lg:cursor-none"
                  >
                    <option value="60">60 Minutes Playtime — (₹{bookingType === "Half Court" ? 750 : 1250})</option>
                    <option value="90">90 Minutes Playtime — (₹{bookingType === "Half Court" ? 1100 : 1850})</option>
                    <option value="120">120 Minutes Playtime — (₹{bookingType === "Half Court" ? 1500 : 2500})</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 text-xs">▼</div>
                </div>
              </div>

            </div>
          </div>

          {/* Right Column: Premium Interactive Glass Checkout Ticket */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-gradient-to-b from-slate-900 to-neutral-950 rounded-3xl p-6 border border-white/10 relative overflow-hidden shadow-2xl">
              {/* Ticket Top Jagged Edge Visual FX */}
              <div className="absolute top-0 inset-x-0 h-1 bg-[radial-gradient(circle,transparent_4px,rgba(15,23,42,1)_4px)] bg-[length:12px_8px] pointer-events-none" />
              
              <div className="text-center pb-6 border-b border-white/10">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Order Manifest Receipt</span>
                <h3 className="text-xl font-black uppercase tracking-wider text-white mt-1">SMES Match Ticket</h3>
              </div>

              {/* Dynamic Readout Properties */}
              <div className="py-6 space-y-4 text-sm font-semibold">
                <div className="flex justify-between">
                  <span className="text-slate-400">Sport Chosen</span>
                  <span className="text-white uppercase font-bold text-right">{sport || "Not Selected"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Setup Layout</span>
                  <span className="text-white font-bold text-right">{bookingType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Scheduled Date</span>
                  <span className="text-lime-400 font-bold text-right">{bookingDate || "Select above..."}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Kickoff Time</span>
                  <span className="text-white font-bold text-right">{startTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Duration Range</span>
                  <span className="text-white font-bold text-right">{duration} Mins</span>
                </div>

                <div className="h-px bg-dashed bg-white/10 my-4" />

                {/* Pricing Framework Display */}
                <div className="p-4 rounded-xl bg-slate-950 border border-white/5 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-bold uppercase tracking-wider">Advance Lockdown Deposit</span>
                    <span className="text-amber-400 font-black text-sm">₹200</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-snug">A platform gateway fee of ₹5 applies to process reservations instantaneously through automated payment protection channels.</p>
                  <div className="h-px bg-white/5 my-1" />
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-xs text-white font-bold uppercase tracking-wider">Gross Total Pitch Fee</span>
                    <span className="text-xl font-black text-white">₹{totalAmount}</span>
                  </div>
                </div>
              </div>

              {/* Razorpay Call CTA Trigger */}
              <button
                type="button"
                onClick={openRazorpay}
                className="w-full bg-gradient-to-r from-lime-400 to-lime-300 hover:from-lime-300 hover:to-lime-200 text-slate-950 font-black text-base uppercase tracking-wider py-4 rounded-xl transition-all shadow-xl shadow-lime-400/10 min-h-[56px] lg:cursor-none"
              >
                🔒 Pay Advance & Lock Slot
              </button>
            </div>

            {/* Micro Sports Capabilities Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900/40 border border-white/5 p-4 rounded-2xl text-center">
                <span className="text-xl block mb-1">⚡</span>
                <h4 className="text-xs font-black uppercase text-white tracking-wider">Instant Confirmation</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Automated booking sync</p>
              </div>
              <div className="bg-slate-900/40 border border-white/5 p-4 rounded-2xl text-center">
                <span className="text-xl block mb-1">🛡️</span>
                <h4 className="text-xs font-black uppercase text-white tracking-wider">Secure Escrow</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Razorpay encrypted node</p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Corporate Arena Facilities Layout Section */}
      <section className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h3 className="text-xs font-black uppercase tracking-widest text-lime-400 mb-2">Infrastructure Specifications</h3>
        <h2 className="text-3xl font-black uppercase tracking-tight text-white mb-10">Premium Stadium Perks</h2>
        
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 max-w-4xl mx-auto">
          {[
            { label: "Floodlights", icon: "💡" },
            { label: "Safe Parking", icon: "🚗" },
            { label: "Washrooms", icon: "🧼" },
            { label: "Mineral Water", icon: "🚰" },
            { label: "Open 24 Hours", icon: "⏳" }
          ].map((facility, idx) => (
            <div 
              key={idx} 
              className={`bg-slate-900/60 border border-white/5 rounded-2xl p-5 transition-all hover:border-lime-400/20 shadow-lg ${
                idx === 4 ? "col-span-2 md:col-span-1" : ""
              }`}
            >
              <span className="text-2xl block mb-2">{facility.icon}</span>
              <span className="text-xs font-black uppercase tracking-wider text-slate-200">{facility.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* HQ Corporate Contact Footer Block */}
      <footer className="w-full bg-gradient-to-t from-black to-slate-950 border-t border-white/5 py-16 px-4 mt-12 text-center relative z-10">
        <div className="max-w-4xl mx-auto space-y-6">
          <p className="text-sm font-black uppercase tracking-widest text-slate-500">SMES Arena Corporation Ltd.</p>
          <div className="flex flex-wrap items-center justify-center gap-y-4 gap-x-8 text-slate-400 text-xs font-bold uppercase tracking-wider">
            <div className="flex items-center gap-2 hover:text-white transition-colors">
              <span className="text-lime-400 text-sm">📞</span> 8453095258
            </div>
            <div className="flex items-center gap-2 hover:text-white transition-colors">
              <span className="text-lime-400 text-sm">✉️</span> sports@smesturf.com
            </div>
            <div className="flex items-center gap-2 hover:text-white transition-colors">
              <span className="text-lime-400 text-sm">📍</span> Mysuru, Karnataka
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}