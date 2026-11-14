import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createClient } from "@supabase/supabase-js";
import { findCourtAvailability } from "../../lib/booking-rules";

// Initialize Server Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const razorpay = new Razorpay({
  key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!, 
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: Request) {
  try {
    const { 
      bookingDate, startTime, duration, bookingType, amount, 
      totalAmount, name, phone, email, sport 
    } = await req.json();

    // ---------------------------------------------------------------
    // 🔒 Never trust the browser for money: rebuild the price on the server
    // ---------------------------------------------------------------
    const mins = Number(duration);
    if (![60, 90, 120, 150, 180].includes(mins) || !["Full Court", "Half Court"].includes(bookingType)) {
      return NextResponse.json({ error: "Invalid booking details. Please refresh and try again." }, { status: 400 });
    }

    // Live hourly rates set by admin (falls back to the original rates)
    let rates = { full_hour: 2200, half_hour: 1100 };
    try {
      const { data: priceRow } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "pricing")
        .maybeSingle();
      if (priceRow?.value) {
        rates = {
          full_hour: Number(priceRow.value.full_hour) || rates.full_hour,
          half_hour: Number(priceRow.value.half_hour) || rates.half_hour,
        };
      }
    } catch {
      /* keep defaults */
    }

    const baseAmount = Math.round((mins / 60) * (bookingType === "Half Court" ? rates.half_hour : rates.full_hour));

    // Special percentage offer (same lookup the booking page does)
    let offerCheckOk = true;
    let specialDiscount = 0;
    let offerApplies = false;
    try {
      const { data: offerRows, error: offerError } = await supabase
        .from("customer_discounts")
        .select("discount_percent, start_date, end_date")
        .ilike("email", String(email || "").trim().toLowerCase())
        .eq("phone", phone)
        .order("created_at", { ascending: false })
        .limit(1);
      if (offerError) throw offerError;
      const offer = offerRows?.[0];
      if (offer && bookingDate >= offer.start_date && bookingDate <= offer.end_date) {
        offerApplies = true;
        specialDiscount = Math.round((baseAmount * Number(offer.discount_percent || 0)) / 100);
      }
    } catch {
      offerCheckOk = false; // can't verify offers right now → skip the strict total check
    }

    const expectedTotals = offerApplies
      ? [Math.max(0, baseAmount - specialDiscount)]
      : [baseAmount, Math.max(0, baseAmount - 1000)]; // 2nd value = loyalty ₹1000 discount

    if (offerCheckOk && !expectedTotals.includes(Number(totalAmount))) {
      return NextResponse.json(
        { error: "Prices have been updated. Please refresh the page and try again." },
        { status: 409 }
      );
    }

    const expectedAdvance = Number(totalAmount) > 0 ? Math.min(200, Number(totalAmount)) + 5 : 0;
    if (Number(amount) !== expectedAdvance || expectedAdvance <= 0) {
      return NextResponse.json(
        { error: "Payment amount mismatch. Please refresh the page and try again." },
        { status: 409 }
      );
    }

    const selectedDate = new Date(bookingDate);
    const prevDate = new Date(selectedDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().split("T")[0];

    const nextDate = new Date(selectedDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().split("T")[0];

    const { data: allBookings, error: checkError } = await supabase
      .from("bookings")
      .select("start_time, duration_minutes, booking_type, court_number, booking_date")
      .in("booking_date", [prevDateStr, bookingDate, nextDateStr]);

    const { data: allBlockedSlots } = await supabase
      .from("blocked_slots")
      .select("start_time, duration_minutes, court_number, booking_date")
      .in("booking_date", [prevDateStr, bookingDate, nextDateStr]);

    if (checkError) throw checkError;

    const existingBookings = allBookings?.filter(b => b.booking_date === bookingDate) || [];
    const previousDayBookings = allBookings?.filter(b => b.booking_date === prevDateStr) || [];
    const nextDayBookings = allBookings?.filter(b => b.booking_date === nextDateStr) || [];

    const blockedSlotsData = allBlockedSlots?.filter(b => b.booking_date === bookingDate) || [];
    const previousDayBlockedSlots = allBlockedSlots?.filter(b => b.booking_date === prevDateStr) || [];
    const nextDayBlockedSlots = allBlockedSlots?.filter(b => b.booking_date === nextDateStr) || [];

    const availability = findCourtAvailability(
      startTime,
      Number(duration),
      bookingType,
      existingBookings,
      nextDayBookings,
      blockedSlotsData,
      previousDayBookings,
      previousDayBlockedSlots,
      nextDayBlockedSlots
    ) ?? { isAvailable: false, error: "Availability check failed" };

    if (!availability.isAvailable) {
      return NextResponse.json({ error: availability.error }, { status: 409 });
    }

    const options = {
      amount: amount * 100, 
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      notes: {
        name,
        phone,
        email,
        sport,
        bookingType,
        bookingDate,
        startTime,
        duration: String(duration),
        totalAmount: String(totalAmount),
      },
    };

    const order = await razorpay.orders.create(options);
    return NextResponse.json(order);

  } catch (error: any) {
    console.error("Order Creation Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}