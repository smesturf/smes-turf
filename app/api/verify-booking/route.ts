import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
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

      // --- ⚡ CRITICAL FIX: PREVENT DUPLICATE BOOKINGS ---
      // If the background webhook already saved this order, do not crash! Just return success.
      const { data: existingOrder } = await supabase
        .from("bookings")
        .select("*")
        .eq("razorpay_order_id", paymentData.razorpay_order_id)
        .single();

      if (existingOrder) {
        return NextResponse.json({ success: true, booking: existingOrder });
      }
      // ---------------------------------------------------
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

    // 3. FETCH ALL RELEVANT DATA IN ONE SINGLE QUERY
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
    const datePart = bookingDetails.bookingDate.replace(/-/g, "");
    const timePart = bookingDetails.startTime.substring(0, 5).replace(":", "");
    const randomTag = Math.floor(1000 + Math.random() * 9000); 
    const bookingReference = `SMES-${datePart}-${timePart}-${randomTag}`;

    const fullTotal = Number(bookingDetails.totalAmount);
    const advancePaid = 200; // Hardcoded fixed ₹200 advance
    const balanceDue = fullTotal - advancePaid;

    const { data: insertedData, error } = await supabase.from("bookings").insert([
      {
        booking_reference: bookingReference,
        customer_name: bookingDetails.name,
        phone: bookingDetails.phone,
        email: bookingDetails.email, 
        booking_type: bookingDetails.bookingType,
        court_number: availability.court,
        sport: bookingDetails.sport,
        booking_date: bookingDetails.bookingDate,
        start_time: convert12to24(bookingDetails.startTime),
        duration_minutes: Number(bookingDetails.duration),
        
        // --- ⚡ ADMIN MATRIX SETTLEMENT FIELDS ---
        total_amount: fullTotal, 
        advance_amount: advancePaid,              
        balance_amount: balanceDue,                       
        payment_method: "UPI",              
        upi_received: advancePaid,                 
        cash_received: 0,
        payment_completed: balanceDue <= 0,
        payment_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
        payment_status: "paid",

        razorpay_order_id: paymentData.razorpay_order_id || null,
        razorpay_payment_id: paymentData.razorpay_payment_id || null,
      },
    ]).select();

    if (error) {
      console.error("Supabase Database Insert Error:", error);
      throw error;
    }

    // 6. SEND CONFIRMATION EMAIL VIA NODEMAILER
    if (bookingDetails.email) {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_APP_PASSWORD,
        },
      });

      const mailOptions = {
        from: `"SMES Sports Turf" <${process.env.EMAIL_USER}>`,
        to: bookingDetails.email,
        subject: "🎟️ Your SMES Turf Booking is Confirmed!",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; background-color: #0a0a0a; color: #ffffff; padding: 30px; border-top: 5px solid #a3e635;">
            <h2 style="color: #ffffff; text-transform: uppercase; letter-spacing: 2px;">SMES Sports Academy</h2>
            <p style="color: #a3a3a3; font-size: 14px;">Booking Confirmed</p>
            
            <div style="background-color: #171717; padding: 20px; border-left: 4px solid #a3e635; margin-top: 25px;">
              <h3 style="margin-top: 0; color: #ffffff;">Hello ${bookingDetails.name},</h3>
              <p style="color: #d4d4d4; line-height: 1.6;">
                Your turf slot has been successfully locked and verified. Please find your match details below.
              </p>
            </div>

            <table style="width: 100%; margin-top: 25px; border-collapse: collapse;">
              <tr style="background-color: #171717; border-bottom: 1px solid #262626;">
                <td style="padding: 15px; color: #a3a3a3; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Date</td>
                <td style="padding: 15px; font-weight: bold; color: #ffffff; text-align: right;">${new Date(bookingDetails.bookingDate).toLocaleDateString("en-GB")}</td>
              </tr>
              <tr style="background-color: #171717; border-bottom: 1px solid #262626;">
                <td style="padding: 15px; color: #a3a3a3; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Kickoff Time</td>
                <td style="padding: 15px; font-weight: bold; color: #ffffff; text-align: right;">${bookingDetails.startTime} (${bookingDetails.duration} Mins)</td>
              </tr>
              <tr style="background-color: #171717; border-bottom: 1px solid #262626;">
                <td style="padding: 15px; color: #a3a3a3; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Gross Total</td>
                <td style="padding: 15px; font-weight: bold; color: #ffffff; text-align: right;">₹${fullTotal}</td>
              </tr>
              <tr style="background-color: #171717; border-bottom: 1px solid #262626;">
                <td style="padding: 15px; color: #a3a3a3; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Advance Paid</td>
                <td style="padding: 15px; font-weight: bold; color: #a3e635; text-align: right;">₹200 (+ ₹5 Fee)</td>
              </tr>
              <tr style="background-color: #171717;">
                <td style="padding: 15px; color: #a3a3a3; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Balance Due at Venue</td>
                <td style="padding: 15px; font-weight: bold; color: #ef4444; font-size: 18px; text-align: right;">₹${balanceDue}</td>
              </tr>
            </table>

            <p style="color: #a3a3a3; font-size: 13px; margin-top: 30px; line-height: 1.5;">
              ⚠️ <strong>Rules:</strong> Please arrive 10 minutes prior to kickoff. Non-marking turf shoes only.
            </p>
            
            <hr style="border: 0; height: 1px; background-color: #262626; margin: 30px 0;" />
            <p style="color: #525252; font-size: 11px; text-align: center; text-transform: uppercase; letter-spacing: 1px;">
              Ref ID: ${bookingReference}<br/><br/>
              📍 SMES Sports Academy, Mysuru
            </p>
          </div>
        `,
      };

      // Send asynchronously so it doesn't block the user's booking success screen
      transporter.sendMail(mailOptions).catch(err => console.error("Email dispatch failed:", err));
    }

    return NextResponse.json({ success: true, booking: insertedData[0] });

  } catch (error: any) {
    console.error("Verification Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}