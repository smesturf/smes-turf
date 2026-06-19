"use client";

import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import { motion } from "framer-motion";

export default function Home() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sport, setSport] = useState("Football");
  const [bookingDate, setBookingDate] = useState("");
  const [startTime, setStartTime] = useState("06:00 AM");
  const [duration, setDuration] = useState("60");
  const [bookingType, setBookingType] = useState("Full Court");
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);

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
    const message = `🏟️ SMES Turf Booking Confirmed\n\nName: ${name}\nDate: ${bookingDate}\nTime: ${startTime}\nSport: ${sport}\n\n💰 Total Amount: ₹${totalAmount}\n✅ Advance Paid: ₹200 (+ Convenience Fee)\n💳 Balance Due at Turf: ₹${balanceAmount}\n\nThank you for choosing SMES Turf!`;

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
    alert("✅ Payment Successful & Booking Saved");

    setName("");
    setPhone("");
    setBookingDate("");
    setStartTime("06:00 AM");
    setDuration("60");
  };

  // Click handler function for instant smooth target element navigation placement
  const scrollToBooking = () => {
    const targetElement = document.getElementById("booking-engine-section");
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 font-sans tracking-tight antialiased relative w-full overflow-x-hidden">
      
      {/* FIXED: Contained decorative blur backgrounds inside an explicitly bounded viewport container to eliminate horizontal scroll canvas leak anomalies completely */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 inset-x-0 h-[400px] sm:h-[640px] bg-gradient-to-b from-lime-500/10 via-transparent to-transparent" />
        <div className="absolute top-[-5%] left-[-10%] w-[60%] h-[40%] bg-emerald-500/5 rounded-full blur-[80px] sm:blur-[120px]" />
        <div className="absolute top-[15%] right-[-10%] w-[50%] h-[50%] bg-lime-500/5 rounded-full blur-[80px] sm:blur-[120px]" />
      </div>

      {/* Header Banner Section */}
      <header className="max-w-7xl mx-auto px-4 pt-12 pb-6 sm:pt-16 sm:pb-8 relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-1.5 px-3 py-1 sm:px-4 sm:py-1.5 rounded-full bg-slate-900 border border-slate-800 text-[10px] sm:text-xs font-semibold uppercase tracking-widest text-lime-400 mb-4 sm:mb-6"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" />
          Elite Sports Venue
        </motion.div>

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 sm:gap-8">
          <div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="text-4xl sm:text-6xl md:text-8xl font-black tracking-tighter uppercase leading-none text-white"
            >
              SMES TURF
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-base sm:text-lg md:text-xl font-medium tracking-normal text-neutral-400 mt-3 sm:mt-4 max-w-xl"
            >
              Premium multisport arena built for high-performance Football & Cricket action.
            </motion.p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 w-full lg:flex lg:w-auto lg:gap-3">
            {/* UPGRADED: Added high-intensity instant landing anchor button matching Matchbox spec style layout models */}
            <button
              onClick={scrollToBooking}
              type="button"
              className="bg-lime-400 hover:bg-lime-300 text-black text-xs font-mono uppercase tracking-wider p-4 rounded-none transition-all font-black text-center shadow-lg shadow-lime-400/5 cursor-pointer flex items-center justify-center gap-1"
            >
              ⚡ BOOK NOW
            </button>
            <a
              href="https://wa.me/918453095258"
              className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white text-xs font-mono uppercase tracking-wider p-4 rounded-none transition-all text-center flex items-center justify-center"
            >
              WhatsApp
            </a>
            <a
              href="https://maps.google.com/?q=12.329329,76.612008"
              className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white text-xs font-mono uppercase tracking-wider p-4 rounded-none transition-all text-center flex items-center justify-center"
            >
              Find Arena
            </a>
            <a
              href="tel:+918453095258"
              className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white text-xs font-mono uppercase tracking-wider p-4 rounded-none transition-all font-bold text-center flex items-center justify-center"
            >
              Call Desk
            </a>
          </div>
        </div>

        <div className="mt-8 sm:mt-12 inline-flex items-center gap-3 sm:gap-4 bg-neutral-900 border border-neutral-800 px-4 py-3 rounded-none w-full sm:w-auto">
          <span className="flex h-2 w-2 relative flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500"></span>
          </span>
          <p className="text-[11px] sm:text-xs font-mono uppercase tracking-wide text-neutral-300">
            ⚡ Live Promo Offer: <span className="text-lime-400 font-bold">₹1250 / Hr Only</span>
          </p>
        </div>
      </header>

      {/* Grid Features Block */}
      <section className="max-w-7xl mx-auto px-4 py-12 sm:px-6 sm:py-20 border-b border-neutral-900 relative z-10">
        <span className="text-[11px] font-mono uppercase tracking-widest text-neutral-500 block mb-2">01 — Disciplines</span>
        <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white mb-8 sm:mb-12">Sports Arena Layout</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
          <div className="border border-neutral-900 bg-neutral-900/20 p-6 sm:p-8 flex flex-col justify-between group hover:border-neutral-700 transition-all min-h-[180px] sm:min-h-[220px]">
            <div>
              <span className="text-[11px] font-mono text-neutral-600 block mb-3 sm:mb-4">01 // TRACK FIELD</span>
              <h3 className="text-xl sm:text-2xl font-bold uppercase tracking-tight text-white group-hover:text-lime-400 transition-colors">Football Arena</h3>
              <p className="text-neutral-400 text-xs sm:text-sm mt-2 max-w-sm">From fast-paced 7-A-side tactical clashes to open-field training drills.</p>
            </div>
          </div>

          <div className="border border-neutral-900 bg-neutral-900/20 p-6 sm:p-8 flex flex-col justify-between group hover:border-neutral-700 transition-all min-h-[180px] sm:min-h-[220px]">
            <div>
              <span className="text-[11px] font-mono text-neutral-600 block mb-3 sm:mb-4">02 // NET BOX</span>
              <h3 className="text-xl sm:text-2xl font-bold uppercase tracking-tight text-white group-hover:text-lime-400 transition-colors">Box Cricket</h3>
              <p className="text-neutral-400 text-xs sm:text-sm mt-2 max-w-sm">High-bounce, entirely enclosed system built for maximum velocity cricket action.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Industrial Matchbox-style Layout Booking Portal Grid */}
      <section id="booking-engine-section" className="max-w-7xl mx-auto px-4 py-12 sm:px-6 sm:py-20 relative z-10 scroll-mt-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          
          {/* Form Side */}
          <div className="lg:col-span-7 space-y-6 sm:space-y-8">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-neutral-500 block mb-2">02 — Reservation</span>
              <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">Select and Secure Pitch</h2>
            </div>

            <div className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase text-neutral-400">Full Name</label>
                  <input
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
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase text-neutral-400">Sport</label>
                  <div className="relative">
                    <select
                      value={sport}
                      onChange={(e) => setSport(e.target.value)}
                      className="w-full p-4 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none rounded-none appearance-none font-medium text-base md:text-sm"
                    >
                      <option value="Football">Football</option>
                      <option value="Cricket">Cricket</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-neutral-500 text-xs">▼</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-mono uppercase text-neutral-400">Pitch Scale</label>
                  <div className="relative">
                    <select
                      value={bookingType}
                      onChange={(e) => setBookingType(e.target.value)}
                      className="w-full p-4 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none rounded-none appearance-none font-medium text-base md:text-sm"
                    >
                      <option value="Half Court">Half Court</option>
                      <option value="Full Court">Full Court</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-neutral-500 text-xs">▼</div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-mono uppercase text-neutral-400">Calendar Date</label>
                <input
                  type="date"
                  min={new Date().toISOString().split("T")[0]}
                  value={bookingDate}
                  onChange={(e) => {
                    setBookingDate(e.target.value);
                    loadBookedSlots(e.target.value);
                  }}
                  className="w-full p-4 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none rounded-none font-medium text-base md:text-sm"
                  style={{ colorScheme: "dark" }}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-mono uppercase text-neutral-400">Kickoff Slot</label>
                <div className="relative">
                  <select
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full p-4 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none rounded-none appearance-none font-medium text-base md:text-sm"
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
                          {slot}
                        </option>
                      ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-neutral-500 text-xs">▼</div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-mono uppercase text-neutral-400">Session Length</label>
                <div className="relative">
                  <select
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-full p-4 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none rounded-none appearance-none font-medium text-base md:text-sm"
                  >
                    <option value="60">60 Minutes (- ₹{bookingType === "Half Court" ? 750 : 1250})</option>
                    <option value="90">90 Minutes (- ₹{bookingType === "Half Court" ? 1100 : 1850})</option>
                    <option value="120">120 Minutes (- ₹{bookingType === "Half Court" ? 1500 : 2500})</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-neutral-500 text-xs">▼</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column Checkout Component Panel */}
          <div className="lg:col-span-5 bg-neutral-900/50 border border-neutral-900 p-4 sm:p-6 md:p-8 rounded-none space-y-6">
            <div className="border-b border-neutral-800 pb-4">
              <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Live Breakdown Summary</span>
              <h3 className="text-lg font-bold uppercase text-white mt-1">Pitch Bill Receipt</h3>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div className="flex justify-between gap-4">
                <span className="text-neutral-500 flex-shrink-0">SPORT:</span>
                <span className="text-white uppercase font-bold text-right break-all">{sport}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-neutral-500 flex-shrink-0">ARENA SCALE:</span>
                <span className="text-white font-bold text-right break-all">{bookingType}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-neutral-500 flex-shrink-0">TARGET DATE:</span>
                <span className="text-lime-400 font-bold text-right break-all">{bookingDate || "Unselected"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-neutral-500 flex-shrink-0">KICKOFF TIME:</span>
                <span className="text-white font-bold text-right break-all">{startTime}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-neutral-500 flex-shrink-0">DURATION TIMEFRAME:</span>
                <span className="text-white font-bold text-right break-all">{duration} Minutes</span>
              </div>
            </div>

            <div className="bg-black p-4 border border-neutral-800 space-y-2">
              <div className="flex justify-between items-center text-xs font-mono gap-2">
                <span className="text-neutral-400">LOCKDOWN RESERVATION FEE:</span>
                <span className="text-lime-400 font-bold whitespace-nowrap">₹200 + Convenience Fee</span>
              </div>
              <p className="text-[10px] text-neutral-600 leading-normal font-mono">An advance lock deposit reserves the stadium slot uniquely for your team line.</p>
              <div className="h-px bg-neutral-800 my-2" />
              <div className="flex justify-between items-center gap-2">
                <span className="text-xs font-mono text-white font-bold">GROSS FIELD VALUE:</span>
                <span className="text-xl font-black text-lime-400 whitespace-nowrap">₹{totalAmount}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={openRazorpay}
              className="w-full bg-lime-400 hover:bg-lime-300 text-black font-mono text-xs uppercase tracking-widest py-4 rounded-none transition-all font-black cursor-pointer"
            >
              Confirm Match Slot
            </button>
          </div>

        </div>
      </section>

      {/* Facilities Strip Layout */}
      <section className="max-w-7xl mx-auto px-4 py-12 sm:px-6 sm:py-16 border-t border-neutral-900 relative z-10">
        <span className="text-xs font-mono uppercase tracking-widest text-neutral-500 block mb-6 sm:mb-8 text-center">03 — Setup Infrastructure</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4 max-w-4xl mx-auto text-center">
          {["💡 Floodlights", "🚗 Secure Parking", "🧼 Washrooms", "🚰 Pure Water", "⏳ Open 24 Hours"].map((facility, index) => (
            <div 
              key={index} 
              className={`border border-neutral-900 p-3 sm:p-4 font-mono text-xs text-neutral-400 uppercase tracking-wider bg-neutral-900/10 ${
                index === 4 ? "col-span-2 sm:col-span-1" : ""
              }`}
            >
              {facility}
            </div>
          ))}
        </div>
      </section>

      {/* Footer System */}
      <footer className="w-full bg-black border-t border-neutral-900 py-12 px-4 sm:py-16 sm:px-6 text-left relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start gap-6 sm:gap-8">
          <div className="space-y-2">
            <p className="text-xs font-mono text-neutral-400 uppercase tracking-widest">SMES Sports Ground Hub</p>
            <p className="text-xs text-neutral-600 font-mono">© 2026 Built for competitive team sports action and weekend fun.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-y-2 gap-x-6 md:gap-x-8 font-mono text-xs text-neutral-400 uppercase">
            <div><span className="text-lime-400">P:</span> +91 8453095258</div>
            <div><span className="text-lime-400">E:</span> sports@smesturf.com</div>
            <div><span className="text-lime-400">L:</span> Mysuru, Karnataka</div>
          </div>
        </div>
      </footer>
    </main>
  );
}