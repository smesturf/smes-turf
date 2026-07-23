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
    const currentMonthLabel = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
    const currentMonthYear = new Date().toISOString().slice(0, 7);
    const FIXED_COACHING_FEE = 3500;

    // 1. Fetch all students and their payments
    const { data: stData, error } = await supabaseAdmin
      .from("students")
      .select(`*, student_payments(*)`);

    if (error || !stData) throw error;

    // 2. Filter for students who haven't paid this month AND have an email
    const pendingStudents = stData.filter((student: any) => {
      if (!student.email) return false;
      const currentMonthRecord = student.student_payments?.find((p: any) => p.month_year === currentMonthYear);
      const isPaid = currentMonthRecord && currentMonthRecord.status === "settled";
      return !isPaid; // Keep if NOT paid
    });

    if (pendingStudents.length === 0) {
      return NextResponse.json({ message: "No pending students with emails found." });
    }

    // 3. Setup Nodemailer
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
      },
    });

    // 4. Dispatch Emails
    const emailPromises = pendingStudents.map((student: any) => {
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-w: 600px; margin: 0 auto; background-color: #0a0a0a; color: #ffffff; padding: 30px; border-top: 5px solid #a3e635;">
          <h2 style="color: #ffffff; text-transform: uppercase; letter-spacing: 2px;">SMES Sports Academy</h2>
          <p style="color: #a3a3a3; font-size: 14px;">Official Coaching Fee Reminder</p>
          
          <div style="background-color: #171717; padding: 20px; border-left: 4px solid #ef4444; margin-top: 25px;">
            <h3 style="margin-top: 0; color: #ffffff;">Hello ${student.name},</h3>
            <p style="color: #d4d4d4; line-height: 1.6;">
              This is an automated notification from the SMES Turf Management System. Our records indicate that your academy coaching fee is currently <strong>PENDING</strong> for the current billing cycle.
            </p>
          </div>

          <table style="width: 100%; margin-top: 25px; border-collapse: collapse;">
            <tr style="background-color: #171717; border-bottom: 1px solid #262626;">
              <td style="padding: 15px; color: #a3a3a3; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Pending Month</td>
              <td style="padding: 15px; font-weight: bold; color: #ffffff; text-align: right;">${currentMonthLabel}</td>
            </tr>
            <tr style="background-color: #171717;">
              <td style="padding: 15px; color: #a3a3a3; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Amount Due</td>
              <td style="padding: 15px; font-weight: bold; color: #a3e635; font-size: 20px; text-align: right;">₹${FIXED_COACHING_FEE}</td>
            </tr>
          </table>

          <p style="color: #a3a3a3; font-size: 13px; margin-top: 30px; line-height: 1.5;">
            Please clear your pending dues via UPI or Cash at the front desk before your next session to ensure uninterrupted access to the academy roster.
          </p>
          
          <hr style="border: 0; height: 1px; background-color: #262626; margin: 30px 0;" />
          <p style="color: #525252; font-size: 11px; text-align: center; text-transform: uppercase; letter-spacing: 1px;">
            This is an automated system generated message. Please do not reply directly to this email.<br/><br/>
            📍 SMES Sports Academy, Mysuru
          </p>
        </div>
      `;

      return transporter.sendMail({
        from: `"SMES Turf Academy" <${process.env.EMAIL_USER}>`,
        to: student.email,
        subject: `Action Required: Pending Coaching Fee for ${currentMonthLabel}`,
        html: htmlContent,
      });
    });

    await Promise.all(emailPromises);

    return NextResponse.json({ success: true, message: `Auto-reminders sent to ${pendingStudents.length} students.` });
  } catch (err: any) {
    console.error("Coaching Cron Error:", err);
    return NextResponse.json({ error: "Cron execution failed" }, { status: 500 });
  }
}