"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ------------------------------------------------------------------ */
/* 1. INITIAL STUDENT DATABASE                                        */
/* ------------------------------------------------------------------ */
const initialStudentData = [
  { id: 1, name: "Rahul Kumar", age: 16, sport: "Football", weight: 65, height: 175 },
  { id: 2, name: "Siddarth M", age: 18, sport: "Cricket", weight: 75, height: 180 },
  { id: 3, name: "Arjun Singh", age: 15, sport: "Football", weight: 52, height: 168 },
  { id: 4, name: "Rohan Patel", age: 17, sport: "Cricket", weight: 82, height: 172 },
  { id: 5, name: "Kiran Raj", age: 16, sport: "Football", weight: 68, height: 176 },
  { id: 6, name: "Darshan V", age: 15, sport: "Cricket", weight: 48, height: 165 },
];

/* ------------------------------------------------------------------ */
/* 2. AUTOMATED HEALTH ENGINE & LEADERBOARD MATH                      */
/* ------------------------------------------------------------------ */
const calculateHealthStats = (weight: number, height: number, sport: string) => {
  const heightInMeters = height / 100;
  const bmiValue = weight / (heightInMeters * heightInMeters);
  const bmi = bmiValue.toFixed(1);

  // Gamification: Calculate a score (0-100) based on proximity to optimal BMI (22.0)
  const score = Math.round(Math.max(0, 100 - Math.abs(bmiValue - 22) * 3.5));

  let status = "";
  let colorClass = "";
  let dietPlan = "";

  if (bmiValue < 18.5) {
    status = "UNDERWEIGHT";
    colorClass = "text-yellow-400 border-yellow-400 bg-yellow-400/10";
    dietPlan = "Caloric Surplus: Add complex carbs (sweet potatoes, oats), mixed nuts, and protein shakes. Aim for 4-5 high-calorie meals a day.";
  } else if (bmiValue >= 18.5 && bmiValue <= 24.9) {
    status = "OPTIMAL FORM";
    colorClass = "text-lime-400 border-lime-400 bg-lime-400/10";
    dietPlan = sport === "Football" 
      ? "High-Intensity Maintenance: Lean proteins (chicken, eggs), high carbs for match stamina, and strict electrolyte hydration."
      : "Endurance Maintenance: Balanced macros, moderate carbs for sustained field energy, and high hydration focus.";
  } else {
    status = "OVERWEIGHT";
    colorClass = "text-red-400 border-red-400 bg-red-400/10";
    dietPlan = "Lean Cutting Focus: Increase protein intake, strictly reduce simple carbs, increase fiber (greens), and run a slight caloric deficit.";
  }

  return { bmi, status, colorClass, dietPlan, score };
};

/* ------------------------------------------------------------------ */
/* 3. MAIN COMPONENT                                                  */
/* ------------------------------------------------------------------ */
export default function HealthDashboard() {
  const [students, setStudents] = useState(initialStudentData);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAge, setNewAge] = useState("");
  const [newSport, setNewSport] = useState("");
  const [newWeight, setNewWeight] = useState("");
  const [newHeight, setNewHeight] = useState("");

  useEffect(() => {
    const savedData = localStorage.getItem("smes_health_athletes_v3");
    if (savedData) {
      setStudents(JSON.parse(savedData));
    }
    setIsLoaded(true); 
  }, []);

  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newName || !newAge || !newSport || !newWeight || !newHeight) {
      alert("Please fill in all athlete details.");
      return;
    }

    const newStudent = {
      id: Date.now(), 
      name: newName,
      age: Number(newAge),
      sport: newSport,
      weight: Number(newWeight),
      height: Number(newHeight),
    };

    const updatedList = [newStudent, ...students];

    setStudents(updatedList);
    localStorage.setItem("smes_health_athletes_v3", JSON.stringify(updatedList));

    setNewName(""); setNewAge(""); setNewSport(""); setNewWeight(""); setNewHeight("");
    setShowAddForm(false);
  };

  const filteredStudents = students.filter(student =>
    student.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 🏆 Auto-calculate top 3 students based on their BMI health score
  const eliteSquad = useMemo(() => {
    return [...students]
      .map(student => ({ ...student, ...calculateHealthStats(student.weight, student.height, student.sport) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [students]);

  if (!isLoaded) return null;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 font-sans tracking-tight p-4 sm:p-8">
      {/* Background Styling */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-5%] left-[-10%] w-[60%] h-[40%] bg-emerald-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header Section */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lime-400/10 border border-lime-400/30 text-[10px] font-mono uppercase tracking-widest text-lime-400 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" />
              Internal Portal Only
            </div>
            <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight text-white">
              Athlete Health Hub
            </h1>
            <p className="text-neutral-400 text-sm font-mono mt-2">
              SMES Academy Real-time BMI & Nutrition Tracking
            </p>
          </div>
        </motion.div>

        {/* 🏆 LEADERBOARD WIDGET */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mb-10 bg-[#0a0a0a] border border-neutral-800 p-6 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-lime-400 to-emerald-500" />
          <h2 className="text-sm font-black font-mono uppercase tracking-[0.2em] text-white mb-6 flex items-center gap-2">
            <span className="text-lime-400 text-lg">🏆</span> Elite Squad (Top Health Scores)
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {eliteSquad.map((athlete, index) => (
              <div key={athlete.id} className={`flex items-center gap-4 p-4 border ${index === 0 ? 'bg-lime-400/10 border-lime-400/30' : 'bg-neutral-900/50 border-neutral-800'}`}>
                <div className={`w-10 h-10 flex items-center justify-center font-black text-xl bg-black border ${index === 0 ? 'text-lime-400 border-lime-400/50' : 'text-neutral-500 border-neutral-800'}`}>
                  #{index + 1}
                </div>
                <div>
                  <h3 className="font-bold text-white uppercase tracking-wider">{athlete.name}</h3>
                  <div className="flex gap-2 text-[10px] font-mono text-neutral-400 mt-1 uppercase tracking-widest">
                    <span>Score: <strong className={index === 0 ? "text-lime-400" : "text-white"}>{athlete.score}/100</strong></span>
                    <span>| {athlete.sport}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto mb-8">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 hover:border-lime-400 text-white font-mono text-xs uppercase tracking-widest px-6 py-3 transition-colors flex items-center justify-center gap-2"
          >
            <span className="text-lime-400">{showAddForm ? "✖" : "➕"}</span>
            {showAddForm ? "Close Form" : "Add Athlete"}
          </button>
          <input
            type="text"
            placeholder="Search athlete name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-64 p-3 bg-neutral-900 border border-neutral-800 focus:border-lime-400 text-white font-mono text-sm outline-none rounded-none transition-colors"
          />
        </div>

        {/* Animated Add Athlete Form */}
        <AnimatePresence>
          {showAddForm && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-10">
              <form onSubmit={handleAddStudent} className="bg-[#0a0a0a] border border-neutral-800 p-6 sm:p-8 space-y-6 relative">
                <div className="absolute top-0 left-0 w-1 h-full bg-lime-400" />
                <h3 className="text-lg font-black uppercase tracking-tight text-white">Enter New Athlete Data</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-mono uppercase text-neutral-400 tracking-widest">Full Name</label>
                    <input type="text" placeholder="e.g. Virat Kohli" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full p-3 bg-neutral-900/50 text-white border border-neutral-800 focus:border-lime-400 outline-none rounded-none font-mono text-sm transition-colors" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono uppercase text-neutral-400 tracking-widest">Age</label>
                    <input type="number" placeholder="Years" value={newAge} onChange={(e) => setNewAge(e.target.value)} className="w-full p-3 bg-neutral-900/50 text-white border border-neutral-800 focus:border-lime-400 outline-none rounded-none font-mono text-sm transition-colors" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-mono uppercase text-neutral-400 tracking-widest">Sport</label>
                    <div className="relative">
                      <select value={newSport} onChange={(e) => setNewSport(e.target.value)} className={`w-full p-3 bg-neutral-900/50 outline-none rounded-none font-mono text-sm transition-colors border appearance-none ${newSport ? "text-white border-neutral-800 focus:border-lime-400" : "text-neutral-500 border-neutral-800 focus:border-neutral-600"}`}>
                        <option value="" disabled hidden>Select Sport</option>
                        <option value="Football">⚽ Football</option>
                        <option value="Cricket">🏏 Cricket</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-xs text-neutral-500">▼</div>
                    </div>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-mono uppercase text-neutral-400 tracking-widest">Weight (kg)</label>
                    <input type="number" placeholder="e.g. 70" value={newWeight} onChange={(e) => setNewWeight(e.target.value)} className="w-full p-3 bg-neutral-900/50 text-white border border-neutral-800 focus:border-lime-400 outline-none rounded-none font-mono text-sm transition-colors" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-mono uppercase text-neutral-400 tracking-widest">Height (cm)</label>
                    <input type="number" placeholder="e.g. 175" value={newHeight} onChange={(e) => setNewHeight(e.target.value)} className="w-full p-3 bg-neutral-900/50 text-white border border-neutral-800 focus:border-lime-400 outline-none rounded-none font-mono text-sm transition-colors" />
                  </div>
                  <div className="flex items-end">
                    <button type="submit" className="w-full bg-lime-400 hover:bg-lime-300 text-black font-black font-mono text-xs uppercase tracking-widest py-3.5 transition-colors shadow-[0_0_15px_rgba(163,230,53,0.2)]">
                      Process Data
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Student Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {filteredStudents.map((student, index) => {
              const health = calculateHealthStats(student.weight, student.height, student.sport);

              return (
                <motion.div
                  key={student.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3 }}
                  className="bg-[#0a0a0a] border border-neutral-800 p-6 relative overflow-hidden group hover:border-neutral-700 transition-colors"
                >
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="text-xl font-black text-white uppercase tracking-wider">{student.name}</h2>
                      <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest mt-1">
                        Age: {student.age} | {student.sport}
                      </p>
                    </div>
                    <div className="w-10 h-10 bg-neutral-900 border border-neutral-800 flex items-center justify-center text-xl shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                      {student.sport === "Cricket" ? "🏏" : "⚽"}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-6">
                    <div className="bg-neutral-900/50 border border-neutral-800/50 p-3">
                      <span className="text-[9px] font-mono text-neutral-500 uppercase block mb-1">Current Weight</span>
                      <span className="text-lg font-bold text-white">{student.weight} <span className="text-xs text-neutral-500 font-normal">kg</span></span>
                    </div>
                    <div className="bg-neutral-900/50 border border-neutral-800/50 p-3">
                      <span className="text-[9px] font-mono text-neutral-500 uppercase block mb-1">Height</span>
                      <span className="text-lg font-bold text-white">{student.height} <span className="text-xs text-neutral-500 font-normal">cm</span></span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center border-t border-neutral-800 pt-4">
                      <span className="text-xs font-mono text-neutral-400 uppercase tracking-widest">BMI Index</span>
                      <span className="text-2xl font-black text-white">{health.bmi}</span>
                    </div>

                    <div className={`px-3 py-2 border flex items-center justify-between ${health.colorClass}`}>
                      <span className="text-[10px] font-mono font-black uppercase tracking-widest">
                        Status: {health.status}
                      </span>
                      <span className="text-[9px] font-mono font-bold">SCORE: {health.score}/100</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-neutral-800">
                    <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-widest block mb-2">
                      Automated Nutrition Plan
                    </span>
                    <p className="text-xs text-neutral-300 leading-relaxed">
                      {health.dietPlan}
                    </p>
                  </div>

                  <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-neutral-800 to-transparent group-hover:via-lime-400/50 transition-colors" />
                </motion.div>
              );
            })}
          </AnimatePresence>
          
          {filteredStudents.length === 0 && (
            <div className="col-span-full py-12 text-center text-neutral-500 font-mono text-sm uppercase tracking-widest">
              No athletes found.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}