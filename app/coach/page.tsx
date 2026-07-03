"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function CoachPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  
  // Registration Form States
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentPhone, setNewStudentPhone] = useState("");
  const [newStudentDOB, setNewStudentDOB] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");

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

    if (newStudentPhone.length !== 10) {
      alert("⚠️ Input Error: Mobile number must be exactly 10 digits long.");
      return;
    }

    const { data: student, error: stError } = await supabase.from("students").insert([{
      name: newStudentName,
      phone: newStudentPhone,
      dob: newStudentDOB || null,
      email: newStudentEmail || null,
      monthly_fee: FIXED_COACHING_FEE
    }]).select().single();

    if (stError || !student) { 
      alert(stError?.message || "Registration failed node mismatch"); 
      return; 
    }

    const { error: pmError } = await supabase.from("student_payments").insert([{
      student_id: student.id,
      month_year: currentMonthYear,
      status: "pending",
      amount_paid: 0,
      payment_method: null
    }]);

    if (pmError) { alert(pmError.message); return; }

    alert(`✅ ${newStudentName} Enrolled Successfully! Pending Desk Payment Approval.`);
    setNewStudentName(""); setNewStudentPhone(""); setNewStudentDOB(""); setNewStudentEmail("");
    loadCoachData();
  };

  const exportCoachExcel = async () => {
    const XLSX = await import("xlsx");
    
    const currentMonthNum = new Date().getMonth();
    const currentYearNum = new Date().getFullYear();

    const data = students.map((s) => {
      const joinDate = new Date(s.created_at);
      const isNew = joinDate.getMonth() === currentMonthNum && joinDate.getFullYear() === currentYearNum;
      
      return {
        "Student Name": s.name + (isNew ? " (NEW)" : ""),
        "Phone Number": s.phone,
        "Date of Birth": s.dob ? new Date(s.dob).toLocaleDateString("en-GB") : "-",
        "Email ID": s.email || "-",
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
    
    worksheet["!cols"] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
    XLSX.writeFile(workbook, `Coach_Report_${currentMonthYear}.xlsx`);
  };

  const getTimeRangeLabel = (startTimeStr: string, durationMins: number) => {
    if (!startTimeStr) return "";
    const [h, m] = startTimeStr.split(":");
    const startTotal = Number(h) * 60 + Number(m);
    const endTotal = startTotal + Number(durationMins);
    const formatString = (t: number) => {
      const hours24 = Math.floor(t / 60) % 24;
      const mins = t % 60;
      return `${hours24 % 12 === 0 ? 12 : hours24 % 12}:${String(mins).padStart(2, "0")} ${hours24 >= 12 ? "pm" : "am"}`;
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
            <div>
              <h2 className="text-base font-black uppercase text-white">Enroll New Student</h2>
              <p className="text-xs text-slate-400">Add player details to the ledger. Fee collection is handled at the main desk counter.</p>
            </div>
            <form onSubmit={registerNewStudent} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input type="text" placeholder="Student Name" value={newStudentName} onChange={(e) => setNewStudentName(e.target.value)} className="p-3.5 bg-slate-950 rounded-xl border border-white/5 focus:border-emerald-400 outline-none text-sm font-medium" />
              
              <input 
                type="text" 
                placeholder="Phone Number (10 Digits)" 
                value={newStudentPhone} 
                onChange={(e) => {
                  const numericValue = e.target.value.replace(/\D/g, "");
                  if (numericValue.length <= 10) setNewStudentPhone(numericValue);
                }} 
                maxLength={10}
                className="p-3.5 bg-slate-950 rounded-xl border border-white/5 focus:border-emerald-400 outline-none text-sm font-medium font-mono" 
              />
              
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Date of Birth</label>
                <input type="date" value={newStudentDOB} onChange={(e) => setNewStudentDOB(e.target.value)} className="w-full p-3.5 bg-slate-950 rounded-xl border border-white/5 focus:border-emerald-400 outline-none text-sm font-medium" style={{ colorScheme: "dark" }} />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">Email ID</label>
                <input type="email" placeholder="example@email.com" value={newStudentEmail} onChange={(e) => setNewStudentEmail(e.target.value)} className="w-full p-3.5 bg-slate-950 rounded-xl border border-white/5 focus:border-emerald-400 outline-none text-sm font-medium" />
              </div>

              <button type="submit" className="sm:col-span-2 bg-emerald-500 text-slate-950 font-mono font-black py-3.5 rounded-xl text-xs uppercase tracking-wider shadow-md hover:bg-emerald-400 transition-all">Submit Enrollment</button>
            </form>
          </div>

          <div className="bg-slate-900/40 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-4 bg-slate-900/80 border-b border-white/10">
              <h2 className="text-lg font-black uppercase text-white">Academy Roster — <span className="text-emerald-400">{currentMonthLabel}</span></h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] font-mono uppercase tracking-widest text-slate-400 bg-slate-950/20">
                    <th className="p-4">Student Info</th>
                    <th className="p-4">Contact Details</th>
                    <th className="p-4">Academy Fee</th>
                    <th className="p-4 text-center">Payment Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm font-medium">
                  {students.map((student) => {
                    const joinDate = new Date(student.created_at);
                    const isNew = joinDate.getMonth() === new Date().getMonth() && joinDate.getFullYear() === new Date().getFullYear();
                    const isUnpaid = student.payment_status !== "settled";
                    
                    return (
                      <tr key={student.id} className={`transition-colors ${isUnpaid ? 'bg-red-500/[0.08] hover:bg-red-500/[0.12]' : 'hover:bg-white/[0.01]'}`}>
                        <td className="p-4">
                          <div className={`font-bold flex items-center gap-2 ${isUnpaid ? 'text-red-300' : 'text-white'}`}>
                            {student.name}
                            {isNew && <span className="px-2 py-0.5 rounded text-[9px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 tracking-wider font-black uppercase">New</span>}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">DOB: {student.dob ? new Date(student.dob).toLocaleDateString("en-GB") : "-"}</div>
                        </td>
                        <td className="p-4 space-y-0.5">
                          <div className="font-mono text-slate-300 text-xs">{student.phone}</div>
                          <div className="text-xs text-slate-400 truncate max-w-[200px]">{student.email || "-"}</div>
                        </td>
                        <td className="p-4 font-mono text-white">₹{student.monthly_fee || FIXED_COACHING_FEE}</td>
                        <td className="p-4 text-center">
                          {student.payment_status === "settled" ? (
                            <span className="px-2 py-1 text-[10px] font-mono uppercase bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded whitespace-nowrap inline-flex items-center gap-1 justify-center">
                              ✅ Paid
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-[10px] font-mono uppercase bg-red-500/20 border border-red-500/40 text-red-400 rounded font-black animate-pulse whitespace-nowrap inline-flex items-center gap-1 justify-center">
                              ⚠️ Unpaid
                            </span>
                          )}
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