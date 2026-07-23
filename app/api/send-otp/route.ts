import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(request: Request) {
  try {
    const { email, otp } = await request.json();

    if (!email || !otp) {
      return NextResponse.json({ error: "Email and OTP are required" }, { status: 400 });
    }

    // 1. Configure the email transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    // 2. Format the email content
    const mailOptions = {
      from: `"SMES Sports Turf" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your SMES Turf Pass Login OTP",
      html: `
        <div style="font-family: monospace; max-w-md; margin: auto; padding: 20px; background-color: #050505; color: #f5f5f5; border: 1px solid #262626;">
          <h2 style="color: #a3e635; text-transform: uppercase;">SMES Turf Verification</h2>
          <p style="color: #a3a3a3;">You requested access to view your Official Arena Passes.</p>
          <div style="margin: 30px 0; padding: 20px; background-color: #171717; border-left: 4px solid #a3e635; text-align: center;">
            <p style="margin: 0; font-size: 12px; color: #737373; text-transform: uppercase; letter-spacing: 2px;">Your Unlock Code</p>
            <h1 style="margin: 10px 0 0 0; font-size: 32px; color: #ffffff; letter-spacing: 8px;">${otp}</h1>
          </div>
          <p style="color: #a3a3a3; font-size: 12px;">If you did not request this, please ignore this email.</p>
          <hr style="border: none; border-top: 1px dashed #262626; margin: 20px 0;" />
          <p style="color: #737373; font-size: 10px; text-transform: uppercase;">📍 SMES Sports Academy, Mysuru</p>
        </div>
      `,
    };

    // 3. Send the email
    await transporter.sendMail(mailOptions);

    return NextResponse.json({ success: true, message: "OTP Email Sent Successfully" });
  } catch (error: any) {
    console.error("Nodemailer Error:", error);
    return NextResponse.json({ error: "Failed to send OTP email" }, { status: 500 });
  }
}