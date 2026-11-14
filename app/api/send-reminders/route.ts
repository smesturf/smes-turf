import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

const MAX_RECIPIENTS = 300;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Student names / months are user-typed data, so escape them before putting them in HTML
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

type Recipient = { name: string; email: string; fee?: number };

export async function POST(request: Request) {
  try {
    // 🔐 Only a logged-in staff member may trigger emails (otherwise anyone could spam from the academy Gmail)
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Not authorised" }, { status: 401 });

    const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: userData, error: authErr } = await supa.auth.getUser(token);
    if (authErr || !userData?.user) return NextResponse.json({ error: "Not authorised" }, { status: 401 });

    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
      console.error("Reminder API: EMAIL_USER / EMAIL_APP_PASSWORD missing");
      return NextResponse.json({ error: "Email service is not configured" }, { status: 500 });
    }

    const { students, month, fee } = await request.json();
    if (!Array.isArray(students) || students.length === 0) {
      return NextResponse.json({ error: "No students provided" }, { status: 400 });
    }
    if (students.length > MAX_RECIPIENTS) {
      return NextResponse.json({ error: `Too many recipients (max ${MAX_RECIPIENTS})` }, { status: 400 });
    }

    const recipients: Recipient[] = students.filter(
      (s: Recipient) => s && typeof s.email === "string" && EMAIL_RE.test(s.email.trim())
    );
    const skipped = students.length - recipients.length;
    if (recipients.length === 0) {
      return NextResponse.json({ error: "No valid email addresses" }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_APP_PASSWORD },
    });

    const results = await Promise.allSettled(
      recipients.map((student) => {
        // Per-student amount (half fee for late joiners), falling back to the standard fee
        const amount = Number(student.fee ?? fee) || 0;
        const amountLabel = amount.toLocaleString("en-IN");

        const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0a0a0a; color: #ffffff; padding: 30px; border-top: 5px solid #a3e635;">
          <h2 style="color: #ffffff; text-transform: uppercase; letter-spacing: 2px;">SMES Sports Academy</h2>
          <p style="color: #a3a3a3; font-size: 14px;">Official Coaching Fee Reminder</p>

          <div style="background-color: #171717; padding: 20px; border-left: 4px solid #ef4444; margin-top: 25px;">
            <h3 style="margin-top: 0; color: #ffffff;">Hello ${esc(student.name)},</h3>
            <p style="color: #d4d4d4; line-height: 1.6;">
              This is an automated notification from the SMES Turf Management System. Our records indicate that your academy coaching fee is currently <strong>PENDING</strong> for the current billing cycle.
            </p>
          </div>

          <table style="width: 100%; margin-top: 25px; border-collapse: collapse;">
            <tr style="background-color: #171717; border-bottom: 1px solid #262626;">
              <td style="padding: 15px; color: #a3a3a3; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Pending Month</td>
              <td style="padding: 15px; font-weight: bold; color: #ffffff; text-align: right;">${esc(month)}</td>
            </tr>
            <tr style="background-color: #171717;">
              <td style="padding: 15px; color: #a3a3a3; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Amount Due</td>
              <td style="padding: 15px; font-weight: bold; color: #a3e635; font-size: 20px; text-align: right;">₹${esc(amountLabel)}</td>
            </tr>
          </table>

          <p style="color: #a3a3a3; font-size: 13px; margin-top: 30px; line-height: 1.5;">
            Please clear your pending dues via UPI or Cash at the front desk before your next session to ensure uninterrupted access to the academy roster.
          </p>

          <hr style="border: 0; height: 1px; background-color: #262626; margin: 30px 0;" />
          <p style="color: #525252; font-size: 11px; text-align: center; text-transform: uppercase; letter-spacing: 1px;">
            This is an automated system generated message. Please do not reply directly to this email.
          </p>
        </div>`;

        return transporter.sendMail({
          from: `"SMES Turf Academy" <${process.env.EMAIL_USER}>`,
          to: student.email.trim(),
          subject: `Action Required: Pending Coaching Fee for ${String(month).replace(/[\r\n]/g, " ")}`,
          html: htmlContent,
        });
      })
    );

    // One bad address must not hide the fact that the rest were sent
    const failedEmails = results
      .map((r, i) => (r.status === "rejected" ? recipients[i].email : null))
      .filter(Boolean) as string[];
    failedEmails.forEach((e) => console.error("Reminder failed for", e));
    const sent = results.length - failedEmails.length;

    console.log(`[reminders] by=${userData.user.id} month="${month}" sent=${sent} failed=${failedEmails.length} skipped=${skipped}`);

    return NextResponse.json(
      { success: failedEmails.length === 0, sent, failed: failedEmails.length, skipped, failedEmails },
      { status: 200 }
    );
  } catch (error) {
    console.error("Email API Error:", error);
    return NextResponse.json({ error: "Failed to dispatch emails" }, { status: 500 });
  }
}