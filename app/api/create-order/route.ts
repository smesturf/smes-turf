import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createClient } from "@supabase/supabase-js";
import { findCourtAvailability, timeToMinutes } from "../../lib/booking-rules";

// Initialize Server Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const razorpay = new Razorpay({
  key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!, // Make sure this matches your .env
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: Request) {
  try {
    // ⚡ FIX: Destructure all the customer and sport details sent from the frontend
    const { 
      bookingDate, startTime, duration, bookingType, amount, 
      totalAmount, name, phone, email, sport 
    } = await req.json();

    // 1. CALCULATE ADJACENT DATES (Yesterday, Today, Tomorrow)
    const selectedDate = new Date(bookingDate);

    const prevDate = new Date(selectedDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().split("T")[0];

    const nextDate = new Date(selectedDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().split("T")[0];

    // 2. FETCH ALL RELEVANT DATA IN ONE SINGLE QUERY
    const { data: allBookings, error: checkError } = await supabase
      .from("bookings")
      .select("start_time, duration_minutes, booking_type, court_number, booking_date")
      .in("booking_date", [prevDateStr, bookingDate, nextDateStr]);

    const { data: allBlockedSlots } = await supabase
      .from("blocked_slots")
      .select("start_time, duration_minutes, court_number, booking_date")
      .in("booking_date", [prevDateStr, bookingDate, nextDateStr]);

    if (checkError) throw checkError;

    // Filter the single dataset into the separate arrays your booking rules expect
    const existingBookings = allBookings?.filter(b => b.booking_date === bookingDate) || [];
    const previousDayBookings = allBookings?.filter(b => b.booking_date === prevDateStr) || [];
    const nextDayBookings = allBookings?.filter(b => b.booking_date === nextDateStr) || [];

    const blockedSlotsData = allBlockedSlots?.filter(b => b.booking_date === bookingDate) || [];
    const previousDayBlockedSlots = allBlockedSlots?.filter(b => b.booking_date === prevDateStr) || [];
    const nextDayBlockedSlots = allBlockedSlots?.filter(b => b.booking_date === nextDateStr) || [];

    // 3. ENFORCE OVERLAP RULES
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

    // 4. SECURE TO PROCEED: CREATE RAZORPAY ORDER
    const options = {
      amount: amount * 100, // Amount in paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      // ⚡ FIX: Add notes so the webhook can recover dropped payments
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