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
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: Request) {
  try {
    const { bookingDate, startTime, duration, bookingType, amount } = await req.json();

    // 1. CALCULATE IF CROSS-DAY
    const startMins = timeToMinutes(startTime);
    const endMins = startMins + Number(duration);
    const isCrossDay = endMins > (24 * 60);

    // Calculate next date
    const nextDate = new Date(bookingDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().split('T')[0];

    // Fetch Bookings for Current Day
    const { data: existingBookings, error: checkError } = await supabase
      .from("bookings")
      .select("start_time, duration_minutes, booking_type, court_number")
      .eq("booking_date", bookingDate);

    // Fetch Bookings for Next Day (ONLY if cross-day)
    const { data: nextDayBookings } = isCrossDay 
      ? await supabase.from("bookings").select("start_time, duration_minutes, booking_type, court_number").eq("booking_date", nextDateStr)
      : { data: [] };

    // Fetch Blocked Slots
    const { data: blockedSlotsData } = await supabase
      .from("blocked_slots")
      .select("start_time, duration_minutes")
      .eq("booking_date", bookingDate);

    if (checkError) throw checkError;

    // 2. ENFORCE OVERLAP RULES
    // Correctly passing 6 arguments: 
    // 1. startTime, 2. duration, 3. bookingType, 4. existing, 5. nextDay, 6. blocked
    const availability =
      findCourtAvailability(
        startTime,
        Number(duration),
        bookingType,
        existingBookings || [],
        nextDayBookings || [],
        blockedSlotsData || []
      ) ?? { isAvailable: false, error: "Availability check failed" };

    if (!availability.isAvailable) {
      return NextResponse.json({ error: availability.error }, { status: 409 });
    }

    // 3. SECURE TO PROCEED: CREATE RAZORPAY ORDER
    const options = {
      amount: amount * 100, // Amount in paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);
    return NextResponse.json(order);

  } catch (error: any) {
    console.error("Order Creation Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}