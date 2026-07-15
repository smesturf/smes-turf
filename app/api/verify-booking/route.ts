import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { convert12to24, findCourtAvailability } from "../../lib/booking-rules"; // <-- ADDED THIS

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { paymentData, bookingDetails } = await req.json();

    // 1. CRYPTOGRAPHIC VERIFICATION (Server-Side)
    // Make sure this exactly matches what is in your .env.local file!
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

    // 2. ASSIGN COURT SECURELY using Pure Functions
    const { data: existingBookings } = await supabase
      .from("bookings")
      .select("start_time, duration_minutes, booking_type, court_number")
      .eq("booking_date", bookingDetails.bookingDate);

    const availability = findCourtAvailability(
      bookingDetails.startTime,
      Number(bookingDetails.duration),
      bookingDetails.bookingType,
      existingBookings || [],
      []
    );

    if (!availability.isAvailable) {
       return NextResponse.json({ error: availability.error }, { status: 409 });
    }

    // 3. SECURE SERVER-SIDE DATABASE INSERTION
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}