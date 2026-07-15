import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { convert12to24, findCourtAvailability, timeToMinutes } from "../../lib/booking-rules";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { paymentData, bookingDetails } = await req.json();

    // 1. CRYPTOGRAPHIC VERIFICATION (Server-Side)
    const secret = process.env.RAZORPAY_KEY_SECRET!; 
    
    if (paymentData !== "CHECK_ONLY") {
      const generatedSignature = crypto
        .createHmac("sha256", secret)
        .update(paymentData.razorpay_order_id + "|" + paymentData.razorpay_payment_id)
        .digest("hex");

      if (generatedSignature !== paymentData.razorpay_signature) {
        return NextResponse.json({ error: "Payment verification failed. Invalid Signature." }, { status: 400 });
      }
    }

    // 2. CALCULATE ADJACENT DATES (Yesterday, Today, Tomorrow)
    const bookingDate = bookingDetails.bookingDate;
    const selectedDate = new Date(bookingDate);

    const prevDate = new Date(selectedDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().split("T")[0];

    const nextDate = new Date(selectedDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().split("T")[0];

    // 3. FETCH ALL RELEVANT DATA IN ONE SINGLE QUERY (Performance Boost)
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

    // 4. ASSIGN COURT SECURELY
    const availability = findCourtAvailability(
      bookingDetails.startTime,
      Number(bookingDetails.duration),
      bookingDetails.bookingType,
      existingBookings,
      nextDayBookings,
      blockedSlotsData,
      previousDayBookings,
      previousDayBlockedSlots,
      nextDayBlockedSlots
    );

    if (!availability || !availability.isAvailable) {
       return NextResponse.json({ error: availability?.error || "Court not available" }, { status: 409 });
    }

    // 5. SECURE SERVER-SIDE DATABASE INSERTION
    const { data: insertedData, error } = await supabase.from("bookings").insert([
      {
        customer_name: bookingDetails.name,
        phone: bookingDetails.phone,
        booking_type: bookingDetails.bookingType,
        court_number: availability.court,
        sport: bookingDetails.sport,
        booking_date: bookingDetails.bookingDate,
        start_time: convert12to24(bookingDetails.startTime),
        duration_minutes: Number(bookingDetails.duration),
        total_amount: bookingDetails.totalAmount,
        advance_amount: 200,
        balance_amount: bookingDetails.totalAmount - 200,
        razorpay_order_id: paymentData.razorpay_order_id || null,
        razorpay_payment_id: paymentData.razorpay_payment_id || null,
        payment_status: "paid",
      },
    ]).select();

    if (error) throw error;

    return NextResponse.json({ success: true, booking: insertedData[0] });

  } catch (error: any) {
    console.error("Verification Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}