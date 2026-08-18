import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { convert12to24, findCourtAvailability } from "../../../lib/booking-rules";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const bodyText = await req.text();
    const signature = req.headers.get("x-razorpay-signature");

    // We use the normal Key Secret to validate the Webhook for simplicity
    const secret = process.env.RAZORPAY_KEY_SECRET!; 
    const expectedSignature = crypto.createHmac("sha256", secret).update(bodyText).digest("hex");

    if (expectedSignature !== signature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const event = JSON.parse(bodyText);

    // Only process successful payments
    if (event.event === "payment.captured" || event.event === "order.paid") {
      const payment = event.payload.payment.entity;
      const order_id = payment.order_id;
      const payment_id = payment.id;
      const notes = payment.notes;

      if (!notes || !notes.bookingDate) {
         return NextResponse.json({ message: "Not a turf booking payment, ignoring." });
      }

      // 1. Prevent Double-Booking (Check if frontend already handled it)
      const { data: existingBooking } = await supabase
        .from("bookings")
        .select("id")
        .eq("razorpay_order_id", order_id)
        .single();

      if (existingBooking) {
        return NextResponse.json({ success: true, message: "Booking already handled by frontend" });
      }

      // 2. Fetch data for Court Assignment
      const bookingDate = notes.bookingDate;
      const selectedDate = new Date(bookingDate);
      const prevDate = new Date(selectedDate);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split("T")[0];
      const nextDate = new Date(selectedDate);
      nextDate.setDate(nextDate.getDate() + 1);
      const nextDateStr = nextDate.toISOString().split("T")[0];

      const { data: allBookings } = await supabase
        .from("bookings")
        .select("start_time, duration_minutes, booking_type, court_number, booking_date")
        .in("booking_date", [prevDateStr, bookingDate, nextDateStr]);

      const { data: allBlockedSlots } = await supabase
        .from("blocked_slots")
        .select("start_time, duration_minutes, court_number, booking_date")
        .in("booking_date", [prevDateStr, bookingDate, nextDateStr]);

      const existingBookings = allBookings?.filter(b => b.booking_date === bookingDate) || [];
      const previousDayBookings = allBookings?.filter(b => b.booking_date === prevDateStr) || [];
      const nextDayBookings = allBookings?.filter(b => b.booking_date === nextDateStr) || [];
      const blockedSlotsData = allBlockedSlots?.filter(b => b.booking_date === bookingDate) || [];
      const previousDayBlockedSlots = allBlockedSlots?.filter(b => b.booking_date === prevDateStr) || [];
      const nextDayBlockedSlots = allBlockedSlots?.filter(b => b.booking_date === nextDateStr) || [];

      // 3. Assign Court
      const availability = findCourtAvailability(
        notes.startTime,
        Number(notes.duration),
        notes.bookingType,
        existingBookings,
        nextDayBookings,
        blockedSlotsData,
        previousDayBookings,
        previousDayBlockedSlots,
        nextDayBlockedSlots
      );

      if (!availability || !availability.isAvailable) {
         return NextResponse.json({ error: "Court unavailable" }, { status: 409 });
      }

      // 4. Save to Database
      const datePart = notes.bookingDate.replace(/-/g, "");
      const timePart = notes.startTime.substring(0, 5).replace(":", "");
      const randomTag = Math.floor(1000 + Math.random() * 9000); 
      const bookingReference = `SMES-${datePart}-${timePart}-${randomTag}`;

      const fullTotal = Number(notes.totalAmount);
      const advancePaid = 200;
      const balanceDue = fullTotal - advancePaid;

      const { data: insertedData, error: insertError } = await supabase.from("bookings").insert([
        {
          booking_reference: bookingReference,
          customer_name: notes.name,
          phone: notes.phone,
          email: notes.email, 
          booking_type: notes.bookingType,
          court_number: availability.court,
          sport: notes.sport,
          booking_date: notes.bookingDate,
          start_time: convert12to24(notes.startTime),
          duration_minutes: Number(notes.duration),
          total_amount: fullTotal, 
          advance_amount: advancePaid,              
          balance_amount: balanceDue,                       
          payment_method: "UPI",              
          upi_received: advancePaid,                 
          cash_received: 0,
          payment_completed: balanceDue <= 0,
          payment_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
          payment_status: "paid",
          razorpay_order_id: order_id,
          razorpay_payment_id: payment_id,
        },
      ]).select();

      if (insertError) throw insertError;

      // 5. Send Background Email
      if (notes.email) {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_APP_PASSWORD },
        });
        const mailOptions = {
          from: `"SMES Sports Turf" <${process.env.EMAIL_USER}>`,
          to: notes.email,
          subject: "🎟️ Your SMES Turf Booking is Confirmed!",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; background-color: #0a0a0a; color: #ffffff; padding: 30px; border-top: 5px solid #a3e635;">
              <h2 style="color: #ffffff; text-transform: uppercase; letter-spacing: 2px;">SMES Sports Academy</h2>
              <p style="color: #a3a3a3; font-size: 14px;">Booking Confirmed</p>
              <table style="width: 100%; margin-top: 25px; border-collapse: collapse;">
                <tr style="background-color: #171717; border-bottom: 1px solid #262626;">
                  <td style="padding: 15px; color: #a3a3a3; text-transform: uppercase; font-size: 12px;">Date</td>
                  <td style="padding: 15px; font-weight: bold; color: #ffffff; text-align: right;">${notes.bookingDate}</td>
                </tr>
                <tr style="background-color: #171717; border-bottom: 1px solid #262626;">
                  <td style="padding: 15px; color: #a3a3a3; text-transform: uppercase; font-size: 12px;">Time</td>
                  <td style="padding: 15px; font-weight: bold; color: #ffffff; text-align: right;">${notes.startTime} (${notes.duration} Mins)</td>
                </tr>
                <tr style="background-color: #171717; border-bottom: 1px solid #262626;">
                  <td style="padding: 15px; color: #a3a3a3; text-transform: uppercase; font-size: 12px;">Advance Paid</td>
                  <td style="padding: 15px; font-weight: bold; color: #a3e635; text-align: right;">₹200 (+ ₹5 Fee)</td>
                </tr>
                <tr style="background-color: #171717;">
                  <td style="padding: 15px; color: #a3a3a3; text-transform: uppercase; font-size: 12px;">Balance Due at Venue</td>
                  <td style="padding: 15px; font-weight: bold; color: #ef4444; font-size: 18px; text-align: right;">₹${balanceDue}</td>
                </tr>
              </table>
            </div>
          `
        };
        transporter.sendMail(mailOptions).catch(console.error);
      }

      // 6. Trigger WhatsApp
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `https://${req.headers.get('host')}`;
      fetch(`${baseUrl}/api/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerPhone: notes.phone,    
          customerName: notes.name, 
          email: notes.email,                            
          date: notes.bookingDate,
          time: `${notes.startTime} (${notes.duration} Mins)`, 
          duration: notes.duration,                      
          sport: notes.sport,                            
          court: availability.court, 
          bookingId: `#${insertedData[0].id}`,
          referenceId: bookingReference,
          totalAmount: fullTotal,
          advanceAmount: advancePaid,
          balanceAmount: balanceDue
        })
      }).catch(console.error);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Webhook Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}