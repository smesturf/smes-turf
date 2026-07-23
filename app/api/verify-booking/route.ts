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
    // Generate the official Barcode / Reference ID
    const datePart = bookingDetails.bookingDate.replace(/-/g, "");
    const timePart = bookingDetails.startTime.substring(0, 5).replace(":", "");
    const bookingReference = `SMES-${datePart}-${timePart}`;

    const { data: insertedData, error } = await supabase.from("bookings").insert([
      {
        booking_reference: bookingReference,
        customer_name: bookingDetails.name,
        phone: bookingDetails.phone,
        email: bookingDetails.email, // <-- Added Email Save
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
                <td style="padding: 15px; color: #a3a3a3; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Advance Paid</td>
                <td style="padding: 15px; font-weight: bold; color: #a3e635; text-align: right;">₹200</td>
              </tr>
              <tr style="background-color: #171717;">
                <td style="padding: 15px; color: #a3a3a3; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Balance Due</td>
                <td style="padding: 15px; font-weight: bold; color: #ef4444; font-size: 18px; text-align: right;">₹${bookingDetails.totalAmount - 200}</td>
              </tr>
            </table>

            <p style="color: #a3a3a3; font-size: 13px; margin-top: 30px; line-height: 1.5;">
              ⚠️ <strong>Rules:</strong> Please arrive 10 minutes prior to kickoff. Balance must be cleared at the desk before entering the pitch. Non-marking turf shoes only.
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