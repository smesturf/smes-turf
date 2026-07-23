import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

// Use Service Key to safely bypass Row Level Security in background jobs
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  try {
    // Get today's date in IST format
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    
    // Fetch today's bookings that HAVE an email and HAVE NOT been sent a reminder yet
    const { data: bookings, error } = await supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("booking_date", todayStr)
      .eq("reminder_sent", false)
      .not("email", "is", null)
      .not("email", "eq", "");

    if (error || !bookings) throw error;

    if (bookings.length === 0) {
      return NextResponse.json({ message: "No pending reminders to send at this time." });
    }

    // Get current time in IST
    const nowIst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const currentMinsFromMidnight = nowIst.getHours() * 60 + nowIst.getMinutes();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { 
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_APP_PASSWORD 
      },
    });

    const emailPromises = [];

    for (const b of bookings) {
      // Safely parse start_time into minutes (Handles both 12-hour and 24-hour formats)
      let hours = 0, mins = 0;
      if (b.start_time.includes("AM") || b.start_time.includes("PM")) {
        const [time, modifier] = b.start_time.split(" ");
        let [h, m] = time.split(":").map(Number);
        if (modifier.toUpperCase() === "PM" && h !== 12) h += 12;
        if (modifier.toUpperCase() === "AM" && h === 12) h = 0;
        hours = h; mins = m;
      } else {
        const [h, m] = b.start_time.split(":").map(Number);
        hours = h; mins = m;
      }

      const startMinsFromMidnight = hours * 60 + mins;

      // Calculate time difference
      const minutesUntilMatch = startMinsFromMidnight - currentMinsFromMidnight;

      // ⚡ UPDATED: Check if match starts in the next 0 to 45 minutes (Targets 45 mins prior)
      if (minutesUntilMatch > 0 && minutesUntilMatch <= 45) {
        
        // 1. Format the Email
        const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; background-color: #0a0a0a; color: #ffffff; padding: 30px; border-top: 5px solid #fbbf24;">
            <h2 style="color: #ffffff; text-transform: uppercase; letter-spacing: 2px;">SMES Sports Academy</h2>
            <p style="color: #a3a3a3; font-size: 14px;">Match Reminder</p>
            
            <div style="background-color: #171717; padding: 20px; border-left: 4px solid #fbbf24; margin-top: 25px;">
              <h3 style="margin-top: 0; color: #ffffff;">Hello ${b.customer_name},</h3>
              <p style="color: #d4d4d4; line-height: 1.6;">
                It's almost time! Your scheduled match at SMES Turf is starting in approximately <strong>45 Minutes</strong>.
              </p>
            </div>

            <table style="width: 100%; margin-top: 25px; border-collapse: collapse;">
              <tr style="background-color: #171717; border-bottom: 1px solid #262626;">
                <td style="padding: 15px; color: #a3a3a3; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Kickoff Time</td>
                <td style="padding: 15px; font-weight: bold; color: #fbbf24; font-size: 18px; text-align: right;">${b.start_time}</td>
              </tr>
              <tr style="background-color: #171717;">
                <td style="padding: 15px; color: #a3a3a3; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Court details</td>
                <td style="padding: 15px; font-weight: bold; color: #ffffff; text-align: right;">${b.sport} (${b.booking_type})</td>
              </tr>
            </table>

            <p style="color: #a3a3a3; font-size: 13px; margin-top: 30px; line-height: 1.5;">
              Please arrive at least 10 minutes early to gear up and clear any pending balances at the front desk. See you on the pitch!
            </p>
            
            <hr style="border: 0; height: 1px; background-color: #262626; margin: 30px 0;" />
            <p style="color: #525252; font-size: 11px; text-align: center; text-transform: uppercase; letter-spacing: 1px;">
              Ref ID: ${b.booking_reference || b.id}<br/><br/>
              📍 SMES Sports Academy, Mysuru
            </p>
          </div>
        `;

        // Push to execution array
        emailPromises.push(
          transporter.sendMail({
            from: `"SMES Turf Alerts" <${process.env.EMAIL_USER}>`,
            to: b.email,
            subject: "⏳ Reminder: Your match starts in 45 minutes!",
            html: htmlContent,
          }).then(() => {
            // 2. Mark reminder as sent so we don't email them again on the next cron loop
            return supabaseAdmin
              .from("bookings")
              .update({ reminder_sent: true })
              .eq("id", b.id);
          })
        );
      }
    }

    await Promise.all(emailPromises);

    return NextResponse.json({ success: true, message: `Checked bookings. Sent ${emailPromises.length} reminders.` });
  } catch (err: any) {
    console.error("Match Cron Error:", err);
    return NextResponse.json({ error: "Cron execution failed" }, { status: 500 });
  }
}