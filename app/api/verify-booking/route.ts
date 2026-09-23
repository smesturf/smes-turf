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

    // 1. CRYPTOGRAPHIC VERIFICATION
    const secret = process.env.RAZORPAY_KEY_SECRET!; 

    if (paymentData !== "CHECK_ONLY") {
      const generatedSignature = crypto
        .createHmac("sha256", secret)
        .update(paymentData.razorpay_order_id + "|" + paymentData.razorpay_payment_id)
        .digest("hex");

      if (generatedSignature !== paymentData.razorpay_signature) {
        return NextResponse.json({ error: "Payment verification failed. Invalid Signature." }, { status: 400 });
      }

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

    // 3. FETCH ALL RELEVANT DATA
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

    // ⚡ 5. BULLETPROOF SERVER-SIDE MATH (Overrides old cached tabs)
    const mins = Number(bookingDetails.duration);
    let basePrice = bookingDetails.bookingType === "Half Court"
      ? Math.round((mins / 60) * 1100) 
      : Math.round((mins / 60) * 2200); 

    // ⚡ Check VIP Spend Database safely in the backend
    const { data: vipData } = await supabase
      .from("regular_customers")
      .select("id")
      .eq("email", bookingDetails.email)
      .eq("phone", bookingDetails.phone)
      .limit(1);

    let discount = 0;
    if (vipData && vipData.length > 0) {
      const { data: pastBookings } = await supabase
        .from("bookings")
        .select("duration_minutes, booking_type, total_amount")
        .eq("email", bookingDetails.email)
        .eq("phone", bookingDetails.phone)
        .gte("booking_date", "2026-09-21");
        
      let pastTotalBase = 0;
      let pastTotalPaid = 0;

      if (pastBookings && pastBookings.length > 0) {
        pastBookings.forEach((b: any) => {
          const m = b.duration_minutes || 60;
          const isHalf = b.booking_type === "Half Court";
          const pastBase = Math.round((m / 60) * (isHalf ? 1100 : 2200));
          pastTotalBase += pastBase;
          pastTotalPaid += (b.total_amount !== null ? b.total_amount : pastBase);
        });
      }

      const earnedDiscounts = Math.floor(pastTotalBase / 11000);
      const discountsReceived = Math.round((pastTotalBase - pastTotalPaid) / 1000);

      if (earnedDiscounts > discountsReceived) {
        discount = 1000;
      }
    }

    // Force the correct mathematical totals
    const fullTotal = Math.max(0, basePrice - discount);
    const advancePaid = Math.min(200, fullTotal); 
    const balanceDue = fullTotal - advancePaid;

    // 6. SECURE SERVER-SIDE DATABASE INSERTION
    const datePart = bookingDetails.bookingDate.replace(/-/g, "");
    const timePart = bookingDetails.startTime.substring(0, 5).replace(":", "");
    const randomTag = Math.floor(1000 + Math.random() * 9000); 
    const bookingReference = `SMES-${datePart}-${timePart}-${randomTag}`;

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

    // 7. SEND CONFIRMATION WHATSAPP & EMAIL
    try {
      const host = req.headers.get("host");
      const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
      const baseUrl = `${protocol}://${host}`;

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

      if (!waResponse.ok) console.error("❌ WhatsApp API Rejected the Message");
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
              <p style="color: #d4d4d4; line-height: 1.6;">Your turf slot has been successfully locked and verified. Please find your match details below.</p>
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
                <td style="padding: 15px; font-weight: bold; color: #a3e635; text-align: right;">₹${advancePaid} (+ ₹5 Fee)</td>
              </tr>
              <tr style="background-color: #171717;">
                <td style="padding: 15px; color: #a3a3a3; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Balance Due at Venue</td>
                <td style="padding: 15px; font-weight: bold; color: #ef4444; font-size: 18px; text-align: right;">₹${balanceDue}</td>
              </tr>
            </table>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions).catch(err => console.error("Email dispatch failed:", err));
    }

    return NextResponse.json({ success: true, booking: insertedData[0] });

  } catch (error: any) {
    console.error("Verification Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}