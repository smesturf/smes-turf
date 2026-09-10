import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { convert12to24, findCourtAvailability } from "../../lib/booking-rules";

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

      // --- ⚡ CRITICAL FIX: BULLETPROOF DUPLICATE CHECK ---
      const { data: existingOrder } = await supabase
        .from("bookings")
        .select("*")
        .or(`razorpay_order_id.eq.${paymentData.razorpay_order_id},razorpay_payment_id.eq.${paymentData.razorpay_payment_id},booking_reference.eq.${paymentData.razorpay_payment_id}`)
        .limit(1)
        .maybeSingle();

      if (existingOrder) {
        console.log("Duplicate prevented: Order already processed by webhook or client.");
        return NextResponse.json({ success: true, booking: existingOrder });
      }
    }

    // 2. CALCULATE ADJACENT DATES
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

    // 6. SEND CONFIRMATION WHATSAPP & EMAIL
    try {
      const host = req.headers.get("host");
      const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
      const baseUrl = `${protocol}://${host}`;

      // --- CALCULATE EXACT END TIME ---
      const [timeStr, ampm] = bookingDetails.startTime.split(" ");
      let [h, m] = timeStr.split(":").map(Number);
      if (ampm === "PM" && h !== 12) h += 12;
      if (ampm === "AM" && h === 12) h = 0;

      const totalMins = h * 60 + m + Number(bookingDetails.duration);
      const endH24 = Math.floor(totalMins / 60) % 24;
      const endM = totalMins % 60;
      const endH12 = endH24 % 12 === 0 ? 12 : endH24 % 12;
      const endAMPM = endH24 >= 12 ? "PM" : "AM";

      const endTime = `${String(endH12).padStart(2, "0")}:${String(endM).padStart(2, "0")} ${endAMPM}`;
      
      // ⚡ META API FIX: A function to instantly strip all forbidden formatting
      const sanitize = (str: string) => str.replace(/[\n\t]/g, ' ').replace(/\s{2,}/g, ' ').trim();

      const safeTimeFormat = sanitize(`${bookingDetails.startTime} - ${endTime}`);
      const safeName = sanitize(bookingDetails.name);
      const safeSport = sanitize(bookingDetails.sport);

      const waResponse = await fetch(`${baseUrl}/api/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerPhone: bookingDetails.phone,
          customerName: safeName,
          email: bookingDetails.email,
          date: bookingDetails.bookingDate,
          time: safeTimeFormat, 
          duration: bookingDetails.duration,
          sport: safeSport,
          court: availability.court,
          bookingId: `#${insertedData[0].id}`,
          referenceId: bookingReference,
          totalAmount: fullTotal,
          advanceAmount: advancePaid,
          balanceAmount: balanceDue
        }),
      });

      if (!waResponse.ok) {
        const errorText = await waResponse.text();
        console.error("❌ WhatsApp API Rejected the Message:", errorText);
      } else {
        console.log("✅ WhatsApp Message Sent Successfully!");
      }

    } catch(waErr) {
      console.error("❌ Server WA Dispatch Failed", waErr);
    }

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
          </div>
        `,
      };

      // ⚡ CRITICAL FIX: Added AWAIT
      await transporter.sendMail(mailOptions).catch(err => console.error("Email dispatch failed:", err));
    }

    return NextResponse.json({ success: true, booking: insertedData[0] });

  } catch (error: any) {
    console.error("Verification Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}