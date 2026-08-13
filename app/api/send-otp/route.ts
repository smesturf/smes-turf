import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Must use service_role key to bypass RLS
);

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

    const safeEmail = email.toLowerCase().trim();
    
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save to Supabase (Upsert so it overwrites if they request a new one)
    const { error: dbError } = await supabaseAdmin
      .from("otp_verifications")
      .upsert({ email: safeEmail, otp: otp, created_at: new Date().toISOString() });

    if (dbError) throw dbError;

    // Send Email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_APP_PASSWORD },
    });

    await transporter.sendMail({
      from: `"SMES Turf" <${process.env.EMAIL_USER}>`,
      to: safeEmail,
      subject: "Your Arena Pass OTP",
      html: `<h2>Your OTP is: <strong>${otp}</strong></h2><p>This code is valid for 5 minutes.</p>`,
    });

    return NextResponse.json({ success: true, message: "OTP Sent" });
  } catch (error: any) {
    console.error("Send OTP Error:", error);
    return NextResponse.json({ error: "Failed to send OTP" }, { status: 500 });
  }
}