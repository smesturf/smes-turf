"use client";

import Link from "next/link";

export default function TermsAndConditions() {
  return (
    <main className="min-h-screen bg-[#050505] text-neutral-100 font-sans tracking-tight antialiased relative w-full overflow-x-hidden selection:bg-lime-400 selection:text-black">
      {/* Background Aurora */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 inset-x-0 h-[400px] bg-gradient-to-b from-lime-500/10 via-transparent to-transparent" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-12 sm:py-20">
        {/* Return Button */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs font-mono text-neutral-400 hover:text-lime-400 uppercase tracking-widest transition-colors mb-8"
        >
          ← Return to Arena Home
        </Link>

        {/* Header */}
        <div className="border-b border-neutral-800 pb-6 mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-[10px] font-mono uppercase tracking-widest text-lime-400 mb-3">
            Official Policy Document
          </div>
          <h1 className="text-3xl sm:text-5xl font-black uppercase text-white tracking-tight">
            Terms & Conditions
          </h1>
          <p className="text-xs font-mono text-neutral-400 mt-2">
            SMES Sports Academy Ground Hub · Vijayanagar 2nd Stage, Mysuru
          </p>
        </div>

        {/* Content Section */}
        <div className="space-y-6 font-mono text-xs sm:text-sm text-neutral-300 leading-relaxed">
          
          {/* Rule 1: Weather & Rain */}
          <section className="space-y-2 bg-neutral-900/30 p-6 border border-neutral-800">
            <h2 className="text-lime-400 font-bold uppercase text-sm sm:text-base tracking-wider">
              01. Weather & Rain-Out Policy
            </h2>
            <p className="text-neutral-400">
              * Matches continue as scheduled during light drizzle or mild weather.
            </p>
            <p className="text-neutral-400">
              * Advance payments will <strong className="text-white">only be refunded if there is heavy torrential rain directly at Vijayanagar 2nd Stage / SMES Turf premises</strong> that forces match suspension.
            </p>
            <p className="text-neutral-400">
              * <strong className="text-red-400">Location Restriction:</strong> If it is raining in other areas/parts of the city, but there is no heavy rain at Vijayanagar 2nd Stage or on the turf premises, <strong className="text-red-400">no refund will be issued</strong>.
            </p>
          </section>

          {/* Rule 2: Cancellation & Rescheduling */}
          <section className="space-y-2 bg-neutral-900/30 p-6 border border-neutral-800">
            <h2 className="text-lime-400 font-bold uppercase text-sm sm:text-base tracking-wider">
              02. Cancellation & Slot Rescheduling Policy
            </h2>
            <p className="text-neutral-400">
              * Customers are permitted to cancel their booking at any time, but <strong className="text-red-400">advance money will strictly not be refunded</strong>.
            </p>
            <p className="text-neutral-400">
              * Instead of a monetary refund, customers who cancel are eligible to <strong className="text-lime-400">reschedule their match slot</strong> to any available open date or time on the schedule.
            </p>
          </section>

          {/* Rule 3: Equipment & Inventory */}
          <section className="space-y-2 bg-neutral-900/30 p-6 border border-neutral-800">
            <h2 className="text-lime-400 font-bold uppercase text-sm sm:text-base tracking-wider">
              03. Inventory & Equipment Responsibility
            </h2>
            <p className="text-neutral-400">
              * All items, sports equipment, and accessories issued to players upon entry must be returned in full and undamaged at the end of the session.
            </p>
            <p className="text-neutral-400">
              * Players/teams are fully accountable for any items that go missing or are damaged during their slot, and charges will be billed directly to the customer.
            </p>
          </section>

          {/* Rule 4: Single Tennis Ball Policy */}
          <section className="space-y-2 bg-neutral-900/30 p-6 border border-neutral-800">
            <h2 className="text-lime-400 font-bold uppercase text-sm sm:text-base tracking-wider">
              04. Tennis Ball Policy
            </h2>
            <p className="text-neutral-400">
              * Management will issue exactly <strong className="text-white">one (1) tennis ball</strong> per booking session.
            </p>
            <p className="text-neutral-400">
              * If the provided ball is lost, misplaced, or damaged during play, the booking holder must pay for its replacement cost at the desk before exiting.
            </p>
          </section>

          {/* Rule 5: Timings & Overtime */}
          <section className="space-y-2 bg-neutral-900/30 p-6 border border-neutral-800">
            <h2 className="text-lime-400 font-bold uppercase text-sm sm:text-base tracking-wider">
              05. Reporting Time & Strict Overtime Charges
            </h2>
            <p className="text-neutral-400">
              * All players must arrive and check in at the desk at least <strong className="text-white">10 minutes prior</strong> to their kickoff time.
            </p>
            <p className="text-neutral-400">
              * Matches must finish strictly at the designated end time to ensure the next scheduled team starts promptly.
            </p>
            <p className="text-neutral-400">
              * If customers exceed their booked time without explicit desk approval, <strong className="text-red-400">additional overtime fees will automatically apply</strong> and must be settled immediately.
            </p>
          </section>

          {/* Rule 6: Food & Cleanliness */}
          <section className="space-y-2 bg-neutral-900/30 p-6 border border-neutral-800">
            <h2 className="text-lime-400 font-bold uppercase text-sm sm:text-base tracking-wider">
              06. Food, Beverages & Cleanliness
            </h2>
            <p className="text-neutral-400">
              * Chewing gum, gutkha/tobacco, glass bottles, and greasy cooked food are strictly prohibited on the turf pitch.
            </p>
            <p className="text-neutral-400">
              * Please dispose of all empty water bottles and waste in designated trash bins before leaving the court.
            </p>
          </section>

          {/* Rule 7: Footwear & Conduct */}
          <section className="space-y-2 bg-neutral-900/30 p-6 border border-neutral-800">
            <h2 className="text-lime-400 font-bold uppercase text-sm sm:text-base tracking-wider">
              07. Footwear & Conduct Code
            </h2>
            <p className="text-neutral-400">
              * Only turf shoes, flat-soled sneakers, or soft rubber studs are allowed on synthetic grass. Metal studs and track spikes are banned.
            </p>
            <p className="text-neutral-400">
              * Smoking or alcohol consumption on academy premises is strictly prohibited.
            </p>
            <p className="text-neutral-400">
              * Verbal abuse, physical fights, or unsportsmanlike behavior toward staff or other players will result in immediate removal from the venue without refund.
            </p>
          </section>

          {/* Rule 8: Personal Belongings & Liability */}
          <section className="space-y-2 bg-neutral-900/30 p-6 border border-neutral-800">
            <h2 className="text-lime-400 font-bold uppercase text-sm sm:text-base tracking-wider">
              08. Personal Belongings & Liability
            </h2>
            <p className="text-neutral-400">
              * Management is not responsible for any lost, stolen, or damaged personal belongings (phones, wallets, bags, gear).
            </p>
            <p className="text-neutral-400">
              * Players participate at their own risk. SMES Sports Academy holds no liability for injuries incurred during athletic activities.
            </p>
          </section>

          {/* Rule 9: CCTV Surveillance */}
          <section className="space-y-2 bg-neutral-900/30 p-6 border border-neutral-800">
            <h2 className="text-lime-400 font-bold uppercase text-sm sm:text-base tracking-wider">
              09. Security Surveillance
            </h2>
            <p className="text-neutral-400">
              * The venue premises are under active 24/7 CCTV camera monitoring for security, safety, and operational verification purposes.
            </p>
          </section>

        </div>

        {/* Footer info */}
        <div className="mt-12 pt-6 border-t border-neutral-900 text-center">
          <p className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
            © 2026 SMES Sports Academy · Mysuru, Karnataka
          </p>
        </div>
      </div>
    </main>
  );
}