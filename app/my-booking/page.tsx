"use client";

import { useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import { motion } from "framer-motion";

export default function BookingLookup() {
  const [phone, setPhone] = useState("");
  const [bookings, setBookings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const passRef = useRef<HTMLDivElement>(null);

  /* -------- Fetch Bookings Directly by Phone -------- */
  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.length !== 10) {
      alert("⚠️ Please enter a valid 10-digit mobile number.");
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    setBookings([]);

    try {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .or(`phone.eq.${phone},phone.eq.+91${phone},phone.eq.91${phone}`)
        .order("booking_date", { ascending: false })
        .order("start_time", { ascending: false });

      if (error) throw error;

      setBookings(data || []);
      if (data && data.length > 0) {
        setSelectedBooking(data[0]); // Auto-select the latest booking
      } else {
        setSelectedBooking(null);
      }
    } catch (err: any) {
      console.error(err);
      alert("❌ Error retrieving bookings. Please check your network connection.");
    } finally {
      setIsLoading(false);
    }
  };

  /* -------- Helper: Format Booking ID (e.g., #68) -------- */
  const formatBookingId = (id: number | string) => {
    if (!id) return "#----";
    return `#${id}`;
  };

  /* -------- Safe Image Download (html-to-image) -------- */
  const downloadAsImage = async () => {
    if (!passRef.current) return;
    setIsDownloading(true);

    try {
      const { toPng } = await import("html-to-image");

      const dataUrl = await toPng(passRef.current, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: "#0a0a0a",
        cacheBust: true,
      });

      const link = document.createElement("a");
      link.download = `SMES_Pass_${selectedBooking.booking_reference || formatBookingId(selectedBooking.id)}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error("Image export error:", err);
      alert(`❌ Image download failed: ${err.message || "Failed to render image."}`);
    } finally {
      setIsDownloading(false);
    }
  };

  /* -------- Safe PDF Download (html-to-image + jsPDF) -------- */
  const downloadAsPDF = async () => {
    if (!passRef.current) return;
    setIsDownloading(true);

    try {
      const { toPng } = await import("html-to-image");
      const jsPDF = (await import("jspdf")).default;

      const dataUrl = await toPng(passRef.current, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: "#0a0a0a",
        cacheBust: true,
      });

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const imgWidth = 170;
      const passWidth = passRef.current.clientWidth || 500;
      const passHeight = passRef.current.clientHeight || 700;
      const imgHeight = (passHeight * imgWidth) / passWidth;

      pdf.setFillColor(10, 10, 10);
      pdf.rect(0, 0, 210, 297, "F");
      pdf.addImage(dataUrl, "PNG", 20, 20, imgWidth, imgHeight);
      pdf.save(`SMES_Arena_Pass_${selectedBooking.booking_reference || formatBookingId(selectedBooking.id)}.pdf`);
    } catch (err: any) {
      console.error("PDF export error:", err);
      alert(`❌ PDF download failed: ${err.message || "Failed to render PDF."}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const getTimeRangeLabel = (startTimeStr: string, durationMins: number) => {
    if (!startTimeStr) return "";
    const [h, m] = startTimeStr.split(":");
    const startTotal = Number(h) * 60 + Number(m);
    const endTotal = startTotal + Number(durationMins || 60);
    const formatString = (t: number) => {
      const hours24 = Math.floor(t / 60) % 24;
      const mins = t % 60;
      return `${hours24 % 12 === 0 ? 12 : hours24 % 12}:${String(mins).padStart(2, "0")} ${hours24 >= 12 ? "PM" : "AM"}`;
    };
    return `${formatString(startTotal)} - ${formatString(endTotal)}`;
  };

  return (
    <main className="min-h-screen bg-[#050505] text-neutral-100 font-sans tracking-tight antialiased relative w-full overflow-x-hidden selection:bg-lime-400 selection:text-black">
      {/* Background Aurora */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 inset-x-0 h-[400px] bg-gradient-to-b from-lime-500/10 via-transparent to-transparent" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-10 sm:py-16">
        
        {/* Header */}
        <div className="text-center max-w-xl mx-auto space-y-3 mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-[10px] font-mono uppercase tracking-widest text-lime-400">
            <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" />
            Official Pass Lookup
          </div>
          <h1 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-white">
            My Match Passes
          </h1>
          <p className="text-neutral-400 text-xs sm:text-sm font-mono">
            Enter your registered 10-digit mobile number to view and download your official arena booking passes.
          </p>
        </div>

        {/* Direct Phone Search Form */}
        <form onSubmit={handleLookup} className="max-w-md mx-auto mb-12">
          <div className="flex flex-col sm:flex-row gap-2 bg-neutral-900/80 p-2 border border-neutral-800 shadow-2xl">
            <input
              type="tel"
              placeholder="Enter 10-Digit Mobile Number"
              value={phone}
              onChange={(e) => {
                const numeric = e.target.value.replace(/\D/g, "");
                if (numeric.length <= 10) setPhone(numeric);
              }}
              maxLength={10}
              className="w-full p-3.5 bg-neutral-950 text-white font-mono border border-neutral-800 focus:border-lime-400 outline-none text-sm tracking-widest transition-colors"
              required
            />
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              type="submit"
              disabled={isLoading || phone.length !== 10}
              className={`px-6 py-3.5 font-mono text-xs uppercase tracking-widest font-black transition-all shrink-0 ${
                isLoading || phone.length !== 10
                  ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                  : "bg-lime-400 hover:bg-lime-300 text-black shadow-[0_0_15px_rgba(163,230,53,0.3)]"
              }`}
            >
              {isLoading ? "Searching..." : "🔍 Find Passes"}
            </motion.button>
          </div>
        </form>

        {/* Results Grid */}
        {hasSearched && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left Column: Bookings History List */}
            <div className="lg:col-span-5 space-y-4">
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 block px-1">
                // Found {bookings.length} Booking Record(s) for +91 {phone}
              </span>

              {bookings.length === 0 ? (
                <div className="p-8 bg-neutral-900/40 border border-neutral-800 text-center space-y-2">
                  <span className="text-3xl">⚽</span>
                  <p className="text-sm font-mono text-neutral-300 font-bold uppercase">No Bookings Found</p>
                  <p className="text-xs text-neutral-500 font-mono">
                    No match reservations found for contact: +91 {phone}
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                  {bookings.map((b) => {
                    const isSelected = selectedBooking?.id === b.id;

                    return (
                      <div
                        key={b.id}
                        onClick={() => setSelectedBooking(b)}
                        className={`p-4 border transition-all cursor-pointer font-mono text-xs ${
                          isSelected
                            ? "bg-neutral-900 border-lime-400 shadow-[0_0_15px_rgba(163,230,53,0.15)]"
                            : "bg-neutral-950/60 border-neutral-800 hover:border-neutral-700 opacity-80"
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <span className="text-lime-400 font-bold text-sm block">
                              {new Date(b.booking_date).toLocaleDateString("en-GB")}
                            </span>
                            <span className="text-white text-[11px] block mt-0.5">
                              {getTimeRangeLabel(b.start_time, b.duration_minutes)}
                            </span>
                          </div>
                          <span
                            className={`px-2 py-0.5 text-[9px] font-bold uppercase ${
                              b.balance_amount > 0
                                ? "bg-red-500/10 text-red-400 border border-red-500/30"
                                : "bg-lime-400/10 text-lime-400 border border-lime-400/30"
                            }`}
                          >
                            {b.balance_amount > 0 ? `₹${b.balance_amount} Due` : "Paid"}
                          </span>
                        </div>

                        {/* Reference ID & #ID Format */}
                        <div className="pt-3 border-t border-neutral-900 space-y-1 text-[11px]">
                          <div className="flex justify-between items-center">
                            <span className="text-neutral-500 uppercase">Reference ID:</span>
                            <span className="font-bold text-lime-400 font-mono tracking-wider">
                              {b.booking_reference || "N/A"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-neutral-500 uppercase">Booking ID:</span>
                            <span className="font-bold text-white font-mono tracking-widest">
                              {formatBookingId(b.id)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Pass Preview & Download Actions */}
            <div className="lg:col-span-7 lg:sticky lg:top-8">
              {selectedBooking ? (
                <div className="space-y-4">
                  <div ref={passRef} className="bg-[#0a0a0a] border border-neutral-800 p-6 sm:p-8 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-lime-400 to-emerald-500" />
                    
                    <div className="flex justify-between items-start pb-6 border-b border-neutral-800">
                      <div>
                        <span className="text-[10px] font-mono text-lime-400 uppercase tracking-[0.2em] font-bold block mb-1">
                          Official Arena Pass
                        </span>
                        <h2 className="text-2xl font-black uppercase text-white tracking-tight">SMES Sports Turf</h2>
                        
                        {/* IDs Display */}
                        <div className="mt-2 space-y-0.5 font-mono text-[10px] uppercase">
                          <p className="text-neutral-400">
                            Ref ID: <strong className="text-lime-400 font-bold">{selectedBooking.booking_reference || "N/A"}</strong>
                          </p>
                          <p className="text-neutral-400">
                            Booking ID: <strong className="text-white font-bold">{formatBookingId(selectedBooking.id)}</strong>
                          </p>
                        </div>
                      </div>
                      <div className="w-12 h-12 bg-neutral-900 border border-neutral-800 flex items-center justify-center shrink-0">
                        <span className="text-lime-400 text-2xl font-black">
                          {selectedBooking.sport === "Cricket" ? "🏏" : "⚽"}
                        </span>
                      </div>
                    </div>

                    <div className="py-6 grid grid-cols-2 gap-y-4 gap-x-6 text-left border-b border-neutral-800">
                      <div>
                        <span className="text-[9px] font-mono text-neutral-500 uppercase block mb-1">Player Name</span>
                        <span className="text-sm font-bold text-white uppercase">{selectedBooking.customer_name}</span>
                      </div>
                      <div>
                        <span className="text-[9px] font-mono text-neutral-500 uppercase block mb-1">Contact</span>
                        <span className="text-sm font-mono font-bold text-neutral-300">{selectedBooking.phone}</span>
                      </div>
                      <div>
                        <span className="text-[9px] font-mono text-neutral-500 uppercase block mb-1">Match Schedule</span>
                        <span className="text-xs font-bold text-lime-400 uppercase">
                          {new Date(selectedBooking.booking_date).toLocaleDateString("en-GB")}<br />
                          {getTimeRangeLabel(selectedBooking.start_time, selectedBooking.duration_minutes)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] font-mono text-neutral-500 uppercase block mb-1">Scale / Court</span>
                        <span className="text-xs font-bold text-white uppercase">
                          {selectedBooking.sport || "Football"} ({selectedBooking.court_number || selectedBooking.booking_type || "Full Court"})
                        </span>
                      </div>
                    </div>

                    <div className="py-5 space-y-2 border-b border-neutral-800">
                      <div className="flex justify-between items-center text-xs font-mono">
                        <span className="text-neutral-500 uppercase">Total Booking Value</span>
                        <span className="text-neutral-300 font-bold">₹{selectedBooking.total_amount}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs font-mono">
                        <span className="text-neutral-500 uppercase">Advance Amount Paid</span>
                        <span className="text-emerald-400 font-bold">₹{selectedBooking.advance_amount || 200}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-neutral-900">
                        <span className="text-xs font-mono uppercase font-bold text-white">Balance Due at Venue</span>
                        <span className="text-base font-black text-red-400 font-mono">
                          ₹{selectedBooking.balance_amount || 0}
                        </span>
                      </div>
                    </div>

                    {/* Barcode Display */}
                    <div className="pt-6 flex flex-col items-center opacity-80">
                      <div className="w-full h-10 flex justify-between items-end gap-[2px]">
                        {Array.from({ length: 42 }).map((_, i) => {
                          const heights = [40, 80, 60, 100, 50, 90, 70, 30, 85, 95];
                          const h = heights[i % heights.length];
                          return (
                            <div
                              key={i}
                              className="bg-white rounded-t-sm"
                              style={{ width: `${(i % 3) + 1.5}px`, height: `${h}%` }}
                            />
                          );
                        })}
                      </div>
                      <span className="text-[9px] font-mono text-neutral-400 tracking-[0.3em] mt-2 uppercase">
                        {selectedBooking.booking_reference || formatBookingId(selectedBooking.id)}
                      </span>
                    </div>

                    <p className="text-[9px] font-mono text-neutral-500 text-center mt-4">
                      📍 SMES Sports Academy, Mysuru • Arrive 10 minutes prior to kickoff.
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-3">
                    <motion.button
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={downloadAsImage}
                      disabled={isDownloading}
                      className="w-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-lime-400 font-mono text-xs uppercase tracking-widest py-4 font-black transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isDownloading ? "Generating..." : "🖼️ Save Image"}
                    </motion.button>

                    <motion.button
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={downloadAsPDF}
                      disabled={isDownloading}
                      className="w-full bg-lime-400 hover:bg-lime-300 text-black font-mono text-xs uppercase tracking-widest py-4 font-black transition-colors shadow-[0_0_15px_rgba(163,230,53,0.2)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isDownloading ? "Generating..." : "📄 Download PDF"}
                    </motion.button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}