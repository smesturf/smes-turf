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
  
  // Tactical interactive segment filter for 24/7 grid layout optimization
  const [timeTab, setTimeTab] = useState<"ALL" | "DAY" | "NIGHT">("ALL");

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
    "12:00 AM", "12:30 AM", "01:00 AM", "01:30 AM", "02:00 AM", "02:30 AM",
    "03:00 AM", "03:30 AM", "04:00 AM", "04:30 AM", "05:00 AM", "05:30 AM",
    "06:00 AM", "06:30 AM", "07:00 AM", "07:30 AM", "08:00 AM", "08:30 AM",
    "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
    "12:00 PM", "12:30 PM", "01:00 PM", "01:30 PM", "02:00 PM", "02:30 PM",
    "03:00 PM", "03:30 PM", "04:00 PM", "04:30 PM", "05:00 PM", "05:30 PM",
    "06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM", "08:00 PM", "08:30 PM",
    "09:00 PM", "09:30 PM", "10:00 PM", "10:30 PM", "11:00 PM", "11:30 PM"
  ];

  const convert12To24 = (time12: string) => {
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

  const convertMinutesTo12H = (totalMinutes: number) => {
    const mins = totalMinutes % (24 * 60);
    const hour24 = Math.floor(mins / 60);
    const minute = mins % 60;
    const ampm = hour24 >= 12 ? "PM" : "AM";
    const hour12 = hour24 % 12 || 12;
    return `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${ampm}`;
  };

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
        let minutes = parseTimeToMinutes(booking.start_time);
        const slotsToBlock = booking.duration_minutes / 30;

        for (let i = 0; i < slotsToBlock; i++) {
          const current = minutes + i * 30;
          const slotLabel = convertMinutesTo12H(current);

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

      if (blockedData) {
        blockedData.forEach((slot: any) => {
          let minutes = parseTimeToMinutes(slot.start_time);
          const slotsToBlock = (slot.duration_minutes || 60) / 30;

          for (let i = 0; i < slotsToBlock; i++) {
            const current = minutes + i * 30;
            const slotLabel = convertMinutesTo12H(current);
            blocked.push(slotLabel);
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
      
      if (phone.length !== 10) {
        alert("❌ Please enter a valid 10-digit phone number.");
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

    if (phone.length !== 10) {
      alert("❌ Please enter a valid 10-digit phone number.");
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
    const selectedStart = parseTimeToMinutes(startTime);
    const selectedEnd = selectedStart + selectedDuration;

    let courtNumber = "";
    const overlappingBookings =
      existingBookings?.filter((booking) => {
        const bookingStart = parseTimeToMinutes(booking.start_time);
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

    if (paymentData === "CHECK_ONLY") return true;

    const { error } = await supabase.from("bookings").insert([
      {
        customer_name: name,
        phone: phone,
        booking_type: bookingType,
        court_number: courtNumber,
        sport: sport.toLowerCase(),
        booking_date: bookingDate,
        start_time: convert12To24(startTime),
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
    <main className="min-h-screen bg-[#07090e] text-neutral-100 font-sans tracking-tight antialiased relative selection:bg-lime-400 selection:text-black">
      {/* Editorial Arena Lighting Accents */}
      <div className="absolute top-0 inset-x-0 h-[700px] bg-[radial-gradient(ellipse_at_top,rgba(163,230,53,0.08),transparent_60%)] pointer-events-none" />
      <div className="absolute top-[20%] left-[-10%] w-[50%] h-[40%] bg-emerald-500/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Core Layout Grid System */}
      <div className="max-w-7xl mx-auto px-4 lg:px-8">
        
        {/* Navigation / Brand Block */}
        <header className="py-8 border-b border-neutral-900 flex flex-col sm:flex-row items-center justify-between gap-4 relative z-10">
          <div className="text-center sm:text-left">
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-[10px] font-mono uppercase tracking-widest text-lime-400 mb-2"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" />
              Mysuru Operational Ground Hub
            </motion.div>
            <h1 className="text-3xl font-black uppercase tracking-tighter text-white sm:text-4xl">SMES TURF</h1>
          </div>

          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
            <span className="text-neutral-500">Status:</span>
            <span className="px-2.5 py-1 bg-lime-500/10 border border-lime-500/20 text-lime-400 font-bold">24/7 Continuous Operational</span>
          </div>
        </header>

        {/* Hero Pitch Display Feature */}
        <section className="py-12 border-b border-neutral-900 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
            <div>
              <p className="text-sm font-medium text-neutral-400 max-w-lg leading-relaxed">
                Experience Mysuru's premium modular multisport arena. Engineered for peak performance, high-traction team clashes, and seamless weekend action.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <a href="https://wa.me/918453095258" className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white text-xs font-mono uppercase tracking-wider p-4 transition-all text-center font-bold">WhatsApp</a>
              <a href="https://maps.google.com/?q=12.329329,76.612008" className="bg-neutral-900 border border-neutral-800 text-white text-xs font-mono uppercase tracking-wider p-4 transition-all text-center font-bold">Directions</a>
              <a href="tel:+918453095258" className="bg-lime-400 hover:bg-lime-300 text-black text-xs font-mono uppercase tracking-wider p-4 transition-all font-black text-center shadow-lg shadow-lime-400/5">Call Desk</a>
            </div>
          </div>
        </section>

        {/* Dynamic Split Booking UI Grid Framework */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 py-12 relative z-10">
          
          {/* Main Controls Panel (Left Column) */}
          <div className="lg:col-span-7 space-y-12">
            
            {/* Context Line Block 1 */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5 }}
              className="space-y-6"
            >
              <div className="border-l-2 border-lime-400 pl-4">
                <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">01 // Identity Matrix</span>
                <h2 className="text-lg font-black uppercase text-white tracking-wide mt-0.5">Roster Profile Details</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-mono uppercase text-neutral-400">Athlete / Group Name</label>
                  <input
                    type="text"
                    placeholder="Enter booking captain name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full p-4 bg-neutral-900/40 text-white border border-neutral-800/80 focus:border-lime-400 outline-none transition-all font-medium text-base md:text-sm rounded-none"
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-mono uppercase text-neutral-400">Mobile Node</label>
                    <span className="text-[10px] font-mono text-neutral-600 font-bold">{phone.length}/10 DIGITS</span>
                  </div>
                  <input
                    type="tel"
                    placeholder="10-digit phone contact"
                    value={phone}
                    onChange={(e) => {
                      const sanitized = e.target.value.replace(/\D/g, "");
                      if (sanitized.length <= 10) setPhone(sanitized);
                    }}
                    className={`w-full p-4 bg-neutral-900/40 text-white border outline-none transition-all font-medium text-base md:text-sm font-mono rounded-none ${
                      phone.length > 0 && phone.length < 10 ? "border-amber-500/40 focus:border-amber-500" : "border-neutral-800/80 focus:border-lime-400"
                    }`}
                  />
                </div>
              </div>
            </motion.div>

            {/* Context Line Block 2 */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5 }}
              className="space-y-6"
            >
              <div className="border-l-2 border-lime-400 pl-4">
                <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">02 // Arena Layout</span>
                <h2 className="text-lg font-black uppercase text-white tracking-wide mt-0.5">Discipline and Scope Selection</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-mono uppercase text-neutral-400">Target Discipline</label>
                  <div className="relative">
                    <select
                      value={sport}
                      onChange={(e) => setSport(e.target.value)}
                      className="w-full p-4 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none appearance-none font-medium text-base md:text-sm rounded-none"
                    >
                      <option value="Football">Football (7-A-Side Pitch Configuration)</option>
                      <option value="Cricket">Cricket (Velocity Box Grid)</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-neutral-500 text-xs">▼</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-mono uppercase text-neutral-400">Field Architecture</label>
                  <div className="relative">
                    <select
                      value={bookingType}
                      onChange={(e) => setBookingType(e.target.value)}
                      className="w-full p-4 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none appearance-none font-medium text-base md:text-sm rounded-none"
                    >
                      <option value="Full Court">Full Court (Complete Match Environment)</option>
                      <option value="Half Court">Half Court (Training Matrix Loop)</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-neutral-500 text-xs">▼</div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Context Line Block 3 */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5 }}
              className="space-y-6"
            >
              <div className="border-l-2 border-lime-400 pl-4">
                <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">03 // Match Timing Node</span>
                <h2 className="text-lg font-black uppercase text-white tracking-wide mt-0.5">Chronological Matrix Placement</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-mono uppercase text-neutral-400">Target Calendar Date</label>
                  <input
                    type="date"
                    min={new Date().toISOString().split("T")[0]}
                    value={bookingDate}
                    onChange={(e) => {
                      setBookingDate(e.target.value);
                      loadBookedSlots(e.target.value);
                    }}
                    className="w-full p-4 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none font-medium text-base md:text-sm rounded-none"
                    style={{ colorScheme: "dark" }}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-mono uppercase text-neutral-400">Session Engagement Window</label>
                  <div className="relative">
                    <select
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      className="w-full p-4 bg-neutral-900 text-white border border-neutral-800 focus:border-lime-400 outline-none appearance-none font-medium text-base md:text-sm rounded-none"
                    >
                      <option value="60">60 Minutes engagement timeframe</option>
                      <option value="90">90 Minutes engagement timeframe</option>
                      <option value="120">120 Minutes engagement timeframe</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-neutral-500 text-xs">▼</div>
                  </div>
                </div>
              </div>

              {/* Advanced Segment Filtered 24/7 Time Grid */}
              <div className="space-y-3 pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-900 pb-3">
                  <span className="text-[11px] font-mono uppercase text-neutral-400 tracking-wider">Select Available Kickoff Slot</span>
                  
                  {/* Segment Controller Tabs */}
                  <div className="flex items-center gap-1 bg-neutral-950 p-1 border border-neutral-900 font-mono text-[10px]">
                    {(["ALL", "DAY", "NIGHT"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setTimeTab(tab)}
                        className={`px-3 py-1 font-bold transition-all uppercase ${
                          timeTab === tab ? "bg-neutral-800 text-lime-400" : "text-neutral-500 hover:text-neutral-300"
                        }`}
                      >
                        {tab === "ALL" ? "All Hours" : tab === "DAY" ? "Sunlight" : "Floodlight"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-80 overflow-y-auto p-2 bg-neutral-950/60 border border-neutral-900/60 rounded-none scrollbar-thin scrollbar-thumb-neutral-800">
                  {allSlots
                    .filter((slot) => {
                      if (timeTab === "ALL") return true;
                      const minutes = parseTimeToMinutes(slot);
                      const isDayRange = minutes >= 360 && minutes < 1080; // 6:00 AM to 6:00 PM
                      return timeTab === "DAY" ? isDayRange : !isDayRange;
                    })
                    .map((slot) => {
                      const isBooked = bookedSlots.includes(slot);
                      const todayDate = new Date().toISOString().split("T")[0];
                      let isPast = false;
                      
                      if (bookingDate === todayDate) {
                        const now = new Date();
                        const currentMinutes = now.getHours() * 60 + now.getMinutes();
                        if (parseTimeToMinutes(slot) <= currentMinutes) isPast = true;
                      }

                      const isUnavailable = isBooked || isPast;
                      const isSelected = startTime === slot;

                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={isUnavailable}
                          onClick={() => setStartTime(slot)}
                          className={`p-3 text-center font-mono text-[11px] transition-all border ${
                            isUnavailable
                              ? "bg-neutral-900/10 border-neutral-900/40 text-neutral-700 line-through cursor-not-allowed"
                              : isSelected
                              ? "bg-lime-400 text-slate-950 border-lime-400 font-black shadow-[0_0_20px_rgba(163,230,53,0.15)]"
                              : "bg-neutral-900/60 text-neutral-300 border-neutral-800/80 hover:border-neutral-600"
                          }`}
                        >
                          {slot}
                        </button>
                      );
                    })}
                </div>
              </div>
            </motion.div>
          </div>

          {/* Sticky Checkout Panel Framework (Right Column) */}
          <div className="lg:col-span-5 lg:sticky lg:top-8">
            <div className="bg-neutral-900/30 border border-neutral-900 p-6 space-y-6 backdrop-blur-md relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-lime-500/5 to-transparent pointer-events-none" />
              
              <div className="border-b border-neutral-800 pb-4">
                <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">Real-time Summary Manifest</span>
                <h3 className="text-base font-black uppercase text-white mt-0.5">Match Clearance Ticket</h3>
              </div>

              <div className="space-y-3.5 text-xs font-mono">
                <div className="flex justify-between items-center gap-4">
                  <span className="text-neutral-500 uppercase tracking-wider">Discipline:</span>
                  <span className="text-white font-bold tracking-wide">{sport}</span>
                </div>
                <div className="flex justify-between items-center gap-4">
                  <span className="text-neutral-500 uppercase tracking-wider">Field Scale:</span>
                  <span className="text-white font-bold tracking-wide">{bookingType}</span>
                </div>
                <div className="flex justify-between items-center gap-4">
                  <span className="text-neutral-500 uppercase tracking-wider">Target Date:</span>
                  <span className="text-lime-400 font-black tracking-wide">{bookingDate ? new Date(bookingDate).toLocaleDateString("en-GB") : "UNSELECTED"}</span>
                </div>
                <div className="flex justify-between items-center gap-4">
                  <span className="text-neutral-500 uppercase tracking-wider">Kickoff Clock:</span>
                  <span className="text-white font-bold tracking-wide">{startTime}</span>
                </div>
                <div className="flex justify-between items-center gap-4">
                  <span className="text-neutral-500 uppercase tracking-wider">Window Length:</span>
                  <span className="text-white font-bold tracking-wide">{duration} Minutes</span>
                </div>
              </div>

              <div className="bg-neutral-950 p-4 border border-neutral-900 space-y-2.5">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-neutral-400">Lockdown Advance Token:</span>
                  <span className="text-white font-bold">₹200</span>
                </div>
                <p className="text-[10px] text-neutral-600 leading-normal font-mono">
                  A processing allocation deposit confirms your exclusive structural field lockout.
                </p>
                <div className="h-px bg-neutral-900 my-1" />
                <div className="flex justify-between items-end">
                  <span className="text-xs font-mono text-neutral-300 tracking-wider">Gross Match Cost:</span>
                  <span className="text-2xl font-black text-lime-400 leading-none">₹{totalAmount}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={openRazorpay}
                className="w-full bg-lime-400 hover:bg-lime-300 text-slate-950 font-mono text-xs uppercase tracking-widest py-4.5 font-black transition-all shadow-xl shadow-lime-400/5 tracking-widest block text-center min-h-[54px]"
              >
                Execute Reservation Token
              </button>
            </div>
          </div>
        </div>

        {/* Technical Strip Footer Block */}
        <motion.section 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="border-t border-neutral-900 py-12 text-center space-y-6"
        >
          <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block">03 // Perimeter Logistics Infrastructure</span>
          <div className="flex flex-wrap items-center justify-center gap-2 max-w-4xl mx-auto">
            {["High-Velocity Floodlights", "Secure Vehicle Paddock", "Dedicated Dressing Rooms", "Pure Water Filtration Nodes", "Continuous 24-Hour Infrastructure"].map((item, index) => (
              <span key={index} className="px-4 py-2 border border-neutral-900 bg-neutral-900/10 font-mono text-[11px] uppercase tracking-wider text-neutral-400">
                {item}
              </span>
            ))}
          </div>
        </motion.section>

        {/* Footer Area */}
        <footer className="w-full bg-[#030508] border-t border-neutral-900/60 py-12 text-left relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-start gap-8 font-mono text-xs text-neutral-500">
            <div className="space-y-1">
              <p className="text-neutral-400 uppercase font-bold tracking-wider">SMES GROUND HUB OPERATIONS</p>
              <p>© 2026 Engineered architecture built for competitive league gameplay.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-y-2 gap-x-8 uppercase">
              <div><span className="text-lime-400 font-bold">P:</span> +91 8453095258</div>
              <div><span className="text-lime-400 font-bold">E:</span> operations@smesturf.com</div>
              <div><span className="text-lime-400 font-bold">L:</span> Mysuru, KA</div>
            </div>
          </div>
        </footer>

      </div>
    </main>
  );
}