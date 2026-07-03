"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import * as XLSX from "xlsx";

export default function CoachPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  
  // Tab Switcher state: "new" or "existing"
  const [formTab, setFormTab] = useState<"new" | "existing">("new");

  // Registration Form States (New Student - Paid Flow)
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentPhone, setNewStudentPhone] = useState("");
  const [newStudentMethod, setNewStudentMethod] = useState("UPI"); 

  // Selection states (Existing Student Pairing)
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [existingPaymentMethod, setExistingPaymentMethod] = useState("UPI");

  const FIXED_COACHING_FEE = 3500; 
  const currentMonthYear = new Date().toISOString().slice(0, 7); // Format: YYYY-MM
  const currentMonthLabel = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });

  useEffect(() => {
    loadCoachData();
    
    const bookingsChannel = supabase.channel("coach-b-sync").on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => loadCoachData()).subscribe();
    const blockedChannel = supabase.channel("coach-bl-sync").on("postgres_changes", { event: "*", schema: "public", table: "blocked_slots" }, () => loadCoachData()).subscribe();
    const studentsChannel = supabase.channel("coach-st-sync").on("postgres_changes", { event: "*", schema: "public", table: "students" }, () => loadCoachData()).subscribe();
    const paymentsChannel = supabase.channel("coach-p-sync").on("postgres_changes", { event: "*", schema: "public", table: "student_payments" }, () => loadCoachData()).subscribe();

    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(blockedChannel);
      supabase.removeChannel(studentsChannel);
      supabase.removeChannel(paymentsChannel);
    };
  }, []);

  const loadCoachData = async () => {
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

    const { data: bData } = await supabase.from("bookings").select("*").gte("booking_date", todayStr).order("booking_date", { ascending: true }).order("start_time", { ascending: true });
    setBookings(bData || []);

    const { data: blData } = await supabase.from("blocked_slots").select("*").gte("booking_date", todayStr).order("booking_date", { ascending: true }).order("start_time", { ascending: true });
    setBlockedSlots(blData || []);

    const { data: stData } = await supabase.from("students").select(`*, student_payments(*)`).order("name", { ascending: true });
    
    if (stData) {
      const processedStudents = stData.map((student: any) => {
        const currentMonthRecord = student.student_payments?.find((p: any) => p.month_year === currentMonthYear);
        return {
          ...student,
          payment_status: currentMonthRecord ? currentMonthRecord.status : "pending",
          amount_paid: currentMonthRecord ? currentMonthRecord.amount_paid : 0,
          payment_method: currentMonthRecord ? currentMonthRecord.payment_method : "-",
          payment_record_id: currentMonthRecord ? currentMonthRecord.id : null,
        };
      });
      setStudents(processedStudents);
    }
  };

  const registerNewStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName || !newStudentPhone) { alert("Please complete name and phone fields"); return; }

    // 🔒 Guard check: Rejects the pipeline execution if phone digits are incomplete
    if (newStudentPhone.length !== 10) {
      alert("⚠️ Verification Error: Mobile number must be exactly 10 digits long.");
      return;
    }

    const { data: student, error: stError } = await supabase.from("students").insert([{
      name: newStudentName,
      phone: newStudentPhone,
      monthly_fee: FIXED_COACHING_FEE
    }]).select().single();

    if (stError || !student) { 
      alert(stError?.message || "Registration failed node mismatch"); 
      return; 
    }

    const { error: pmError } = await supabase.from("student_payments").insert([{
      student_id: student.id,
      month_year: currentMonthYear,
      status: "settled",
      amount_paid: FIXED_COACHING_FEE,
      payment_method: newStudentMethod
    }]);

    if (pmError) { alert(pmError.message); return; }

    alert(`✅ ${newStudentName} Registered & Current Month Paid via ${newStudentMethod}!`);
    setNewStudentName(""); setNewStudentPhone("");
    loadCoachData();
  };

  const pairExistingStudentPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) { alert("Please select a student name first"); return; }

    const targetStudent = students.find(s => s.id === selectedStudentId);
    if (!targetStudent) return;

    if (targetStudent.payment_record_id) {
      const { error } = await supabase.from("student_payments").update({
        status: "settled",
        amount_paid: FIXED_COACHING_FEE,
        payment_method: existingPaymentMethod,
        updated_at: new Date().toISOString()
      }).eq("id", targetStudent.payment_record_id);

      if (error) { alert(error.message); return; }
    } else {
      const { error } = await supabase.from("student_payments").insert([{
        student_id: selectedStudentId,
        month_year: currentMonthYear,
        status: "settled",
        amount_paid: FIXED_COACHING_FEE,
        payment_method: existingPaymentMethod
      }]);

      if (error) { alert(error.message); return; }
    }

    alert(`💸 Paired fee clearance successfully for ${targetStudent.name}`);
    setSelectedStudentId("");
    loadCoachData();
  };

  const collectStudentFee = async (student: any, method: string) => {
    if (student.payment_record_id) {
      await supabase.from("student_payments").update({
        status: "settled",
        amount_paid: student.monthly_fee || FIXED_COACHING_FEE,
        payment_method: method,
        updated_at: new Date().toISOString()
      }).eq("id", student.payment_record_id);
    } else {
      await supabase.from("student_payments").insert([{
        student_id: student.id,
        month_year: currentMonthYear,
        status: "settled",
        amount_paid: student.monthly_fee || FIXED_COACHING_FEE,
        payment_method: method
      }]);
    }
    alert(`💸 Payment Marked as Settled via ${method}`);
    loadCoachData();
  };

  const exportCoachExcel = () => {
    const currentMonthNum = new Date().getMonth();
    const currentYearNum = new Date().getFullYear();

    const data = students.map((s) => {
      const joinDate = new Date(s.created_at);
      const isNew = joinDate.getMonth() === currentMonthNum && joinDate.getFullYear() === currentYearNum;
      
      return {
        "Student Name": s.name + (isNew ? " (NEW)" : ""),
        "Phone Number": s.phone,
        "Monthly Fee (₹)": s.monthly_fee || FIXED_COACHING_FEE,
        "Amount Paid (₹)": s.amount_paid,
        "Payment Method": s.payment_method,
        "Status": s.payment_status === "settled" ? "✅ SETTLED" : "❌ PENDING",
        "Type": isNew ? "NEW STUDENT" : "EXISTING"
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Coaching Roster");
    
    worksheet["!cols"] = [{ wch: 25 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 15 }];
    XLSX.writeFile(workbook, `Coach_Report_${currentMonthYear}.xlsx`);
  };

  const getTimeRangeLabel = (startTimeStr: string, durationMins: number) => {
    if (!startTimeStr) return "";
    const [h, m] = startTimeStr.split(":");
    const startTotal = Number(h) * 60 + Number(m);
    const endTotal = startTotal + Number(durationMins);
    const formatString = (t: number) => {
      const h24 = Math.floor(t / 60) % 24;
      const mins = t % 60;
      return `${h24 % 12 === 0 ? 12 : h24 % 12}:${String(mins).padStart(2, "0")} ${h24 >= 12 ? "pm" : "am"}`;
    };
    return `${formatString(startTotal)} to ${formatString(endTotal)}`;
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 md:p-8">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 mb-8 border-b border-white/10">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400">// Football Academy Terminal</span>
          <h1 className="text-2xl sm:text-4xl font-black uppercase tracking-tight italic text-white mt-1">Coach Portal</h1>
        </div>
        <button onClick={exportCoachExcel} className="bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs uppercase px-5 py-3.5 rounded-xl font-bold transition-all">
          📊 Download Roster Excel
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          
          <div className="bg-slate-900/60 border border-white/5 p-5 rounded-2xl space-y-4">
            
            <div className="flex gap-2 border-b border-white/5 pb-3">
              <button 
                onClick={() => setFormTab("new")} 
                className={`px-4 py-2 text-xs font-mono uppercase tracking-wider rounded-lg transition-all ${formTab === "new" ? "bg-emerald-500 text-slate-950 font-black" : "bg-slate-950 text-slate-400 border border-white/5 hover:text-white"}`}
              >
                👶 Enroll New Student
              </button>
              <button 
                onClick={() => setFormTab("existing")} 
                className={`px-4 py-2 text-xs font-mono uppercase tracking-wider rounded-lg transition-all ${formTab === "existing" ? "bg-emerald-500 text-slate-950 font-black" : "bg-slate-950 text-slate-400 border border-white/5 hover:text-white"}`}
              >
                🔄 Old Student payment
              </button>
            </div>

            {formTab === "new" ? (
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-black uppercase text-white">Enroll New Student</h2>
                  <p className="text-xs text-slate-400">Creates profile and automatically marks this current month's fees as paid.</p>
                </div>
                <form onSubmit={registerNewStudent} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input type="text" placeholder="Student Name" value={newStudentName} onChange={(e) => setNewStudentName(e.target.value)} className="p-3.5 bg-slate-950 rounded-xl border border-white/5 focus:border-emerald-400 outline-none text-sm font-medium" />
                  
                  {/* 🔒 UPDATED: Force filters non-digits out instantly and strictly enforces a 10 digit boundary */}
                  <input 
                    type="text" 
                    placeholder="Phone Number (10 Digits)" 
                    value={newStudentPhone} 
                    onChange={(e) => {
                      const numericValue = e.target.value.replace(/\D/g, "");
                      if (numericValue.length <= 10) {
                        setNewStudentPhone(numericValue);
                      }
                    }} 
                    maxLength={10}
                    className="p-3.5 bg-slate-950 rounded-xl border border-white/5 focus:border-emerald-400 outline-none text-sm font-medium font-mono" 
                  />

                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Initial Payment Method</label>
                    <select value={newStudentMethod} onChange={(e) => setNewStudentMethod(e.target.value)} className="w-full p-3.5 bg-slate-950 rounded-xl border border-white/5 text-sm outline-none font-medium text-slate-300 focus:border-emerald-400">
                      <option value="UPI">UPI</option>
                      <option value="Cash">Cash</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Amount Paid (₹)</label>
                    <div className="p-3.5 bg-slate-950 rounded-xl border border-white/5 text-sm font-mono text-emerald-400 font-bold select-none cursor-not-allowed">
                      ₹3,500 <span className="text-[10px] text-slate-500 font-sans font-normal ml-1.5">(Fixed Rate Paid Today)</span>
                    </div>
                  </div>
                  <button type="submit" className="sm:col-span-2 bg-emerald-500 text-slate-950 font-mono font-black py-3.5 rounded-xl text-xs uppercase tracking-wider shadow-md hover:bg-emerald-400 transition-all">Enroll & Mark As Paid</button>
                </form>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-black uppercase text-white">Record Old Student Payment</h2>
                  <p className="text-xs text-slate-400">Select an existing registered name from the panel to log fees for this month.</p>
                </div>
                <form onSubmit={pairExistingStudentPayment} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Select Student Name</label>
                    <select 
                      value={selectedStudentId} 
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      className="w-full p-3.5 bg-slate-950 rounded-xl border border-white/5 text-sm outline-none font-medium text-slate-200 focus:border-emerald-400"
                    >
                      <option value="">-- Choose Student --</option>
                      {/* 🚫 UPDATED FILTER: Automatically drops out anyone who already cleared this month's fee pass */}
                      {students.filter(s => s.payment_status !== "settled").map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.phone})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">Fee Collected (₹)</label>
                    <div className="p-3.5 bg-slate-950 rounded-xl border border-white/5 text-sm font-mono text-purple-400 font-bold select-none cursor-not-allowed">
                      ₹3,500 <span className="text-[10px] text-slate-500 font-sans font-normal ml-1.5">(Fixed Rate)</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Accept Method</label>
                    <select value={existingPaymentMethod} onChange={(e) => setExistingPaymentMethod(e.target.value)} className="w-full p-3.5 bg-slate-950 rounded-xl border border-white/5 text-sm outline-none font-medium text-slate-300">
                      <option value="UPI">UPI</option>
                      <option value="Cash">Cash</option>
                    </select>
                  </div>
                  <button type="submit" className="sm:col-span-2 bg-purple-600 hover:bg-purple-500 text-white font-mono font-black py-3.5 rounded-xl text-xs uppercase tracking-wider shadow-md transition-all">Pair & Save Payment</button>
                </form>
              </div>
            )}
          </div>

          <div className="bg-slate-900/40 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-4 bg-slate-900/80 border-b border-white/10">
              <h2 className="text-lg font-black uppercase text-white">Academy Roster — <span className="text-emerald-400">{currentMonthLabel}</span></h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] font-mono uppercase tracking-widest text-slate-400 bg-slate-950/20">
                    <th className="p-4">Student</th>
                    <th className="p-4">Phone</th>
                    <th className="p-4">Fee Dues</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-center">Accept Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm font-medium">
                  {students.map((student) => {
                    const joinDate = new Date(student.created_at);
                    const isNew = joinDate.getMonth() === new Date().getMonth() && joinDate.getFullYear() === new Date().getFullYear();
                    
                    return (
                      <tr key={student.id} className={`hover:bg-white/[0.01] transition-colors ${isNew ? 'bg-emerald-500/[0.04]' : ''}`}>
                        <td className="p-4">
                          <div className="font-bold text-white flex items-center gap-2">
                            {student.name}
                            {isNew && <span className="px-2 py-0.5 rounded text-[9px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 tracking-wider font-black uppercase">New</span>}
                          </div>
                        </td>
                        <td className="p-4 font-mono text-slate-400 text-xs">{student.phone}</td>
                        <td className="p-4 font-mono text-white">₹{student.monthly_fee || FIXED_COACHING_FEE}</td>
                        <td className="p-4">
                          {student.payment_status === "settled" ? (
                            <span className="px-2 py-0.5 text-[10px] font-mono uppercase bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded">Settled</span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-mono uppercase bg-red-500/10 border border-red-500/20 text-red-400 rounded">Due</span>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center justify-center gap-1.5">
                            {student.payment_status !== "settled" ? (
                              <>
                                <button onClick={() => collectStudentFee(student, "UPI")} className="bg-cyan-500 text-slate-950 font-mono text-[10px] uppercase font-bold px-2 py-1 rounded">UPI</button>
                                <button onClick={() => collectStudentFee(student, "Cash")} className="bg-amber-400 text-slate-950 font-mono text-[10px] uppercase font-bold px-2 py-1 rounded">Cash</button>
                              </>
                            ) : (
                              <span className="text-slate-500 font-mono text-xs">Method: {student.payment_method}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-8 lg:col-span-1">
          <div className="bg-slate-900/40 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-4 bg-slate-900/80 border-b border-white/10">
              <h2 className="text-sm font-black uppercase text-slate-300">📅 Active Turf Bookings (Read-Only)</h2>
            </div>
            <div className="divide-y divide-white/5 max-h-[350px] overflow-y-auto p-2 space-y-2">
              {bookings.length === 0 ? <p className="text-xs text-slate-600 p-2 font-mono">No live match bookings.</p> : bookings.map((b) => (
                <div key={b.id} className="p-3 bg-slate-950/40 rounded-xl border border-white/5 font-mono text-xs">
                  <div className="font-bold text-slate-200">{new Date(b.booking_date?.split("T")[0]).toLocaleDateString("en-GB")}</div>
                  <div className="text-emerald-400 font-black mt-1">{getTimeRangeLabel(b.start_time, b.duration_minutes || 60)}</div>
                  <div className="text-slate-500 text-[10px] mt-0.5">{b.court_number} • {b.booking_type}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/40 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-4 bg-slate-900/80 border-b border-white/10">
              <h2 className="text-sm font-black uppercase text-slate-300">🚫 Excluded Field Blocks (Read-Only)</h2>
            </div>
            <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto p-2 space-y-2">
              {blockedSlots.length === 0 ? <p className="text-xs text-slate-600 p-2 font-mono">No field block restrictions.</p> : blockedSlots.map((s) => (
                <div key={s.id} className="p-3 bg-slate-950/40 rounded-xl border border-red-500/10 font-mono text-xs">
                  <div className="font-bold text-slate-400">{new Date(s.booking_date?.split("T")[0]).toLocaleDateString("en-GB")}</div>
                  <div className="text-red-400 font-black mt-1">{getTimeRangeLabel(s.start_time, s.duration_minutes || 60)}</div>
                  <div className="text-slate-500 text-[10px] mt-0.5 uppercase">{s.reason} • {s.court_number}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}