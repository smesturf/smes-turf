import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Action 1: Generate & Send OTP
    if (body.action === 'generate') {
      
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      // 1. Save it to Supabase
      const { error: dbError } = await supabase
        .from('admin_otps')
        .insert([{ otp_code: otpCode }]);
        
      if (dbError) throw new Error("Failed to save OTP to database");

      // 2. Setup Nodemailer
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: process.env.EMAIL_USERS, // This MUST be sports@smesturf.com
          pass: process.env.EMAIL_PASSWORD, // This MUST be the 16-digit App Password
        },
      });

      // 3. Send to all three admins
      await transporter.sendMail({
        from: '"SMES Command Center" <sports@smesturf.com>', 
        to: "abhayispilot@gmail.com, anandsk551@gmail.com, rootdesign2019@gmail.com", // Multiple recipients
        subject: `🔒 Admin Security OTP: ${otpCode}`,
        html: `
          <div style="font-family: monospace; background: #0a0a0a; color: #fff; padding: 30px; border: 1px solid #333;">
            <h2 style="color: #ef4444; margin-top: 0;">⚠️ Security Authorization Required</h2>
            <p style="color: #a3a3a3;">An attempt to modify or cancel a booking was initiated from the Command Center.</p>
            <p style="color: #a3a3a3;">To authorize this action, enter the following One-Time Password:</p>
            <div style="background: #171717; padding: 20px; font-size: 32px; font-weight: bold; letter-spacing: 5px; text-align: center; border: 1px solid #262626; margin: 20px 0;">
              ${otpCode}
            </div>
            <p style="color: #666; font-size: 12px;">If you did not request this, please secure your admin panel immediately.</p>
          </div>
        `,
      });

      return NextResponse.json({ success: true, message: 'OTP Sent' });
    }

    // Action 2: Verify the OTP
    if (body.action === 'verify') {
      const inputOtp = body.otp;
      
      const { data, error } = await supabase
        .from('admin_otps')
        .select('*')
        .eq('otp_code', inputOtp)
        .order('created_at', { ascending: false })
        .limit(1);
        
      if (error || !data || data.length === 0) {
        return NextResponse.json({ success: false, message: 'Invalid OTP' });
      }

      await supabase.from('admin_otps').delete().eq('id', data[0].id);

      return NextResponse.json({ success: true, message: 'Authorized' });
    }

    return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error("OTP API Error:", error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}