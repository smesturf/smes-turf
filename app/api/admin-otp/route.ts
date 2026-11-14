import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
);

const OTP_TTL_MINUTES = 10;

// One-time use + expires after 10 minutes
async function consumeOtp(inputOtp: unknown): Promise<boolean> {
  if (typeof inputOtp !== 'string' || !/^\d{6}$/.test(inputOtp)) return false;
  const cutoff = new Date(Date.now() - OTP_TTL_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('admin_otps')
    .select('id')
    .eq('otp_code', inputOtp)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return false;
  await supabase.from('admin_otps').delete().eq('id', data[0].id);
  return true;
}

const SLOT_RE = /^(0[5-9]|1[0-2]):(00|30) (AM|PM)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanPricing(p: any) {
  if (!p) return null;
  const out: Record<string, number> = {};
  for (const k of ['full_hour', 'full_regular', 'half_hour', 'half_regular']) {
    const n = Number(p[k]);
    if (!Number.isInteger(n) || n <= 0 || n > 100000) return null;
    out[k] = n;
  }
  return out;
}

function cleanAcademy(a: any) {
  if (!a || typeof a.enabled !== 'boolean') return null;
  if (typeof a.start_date !== 'string' || !DATE_RE.test(a.start_date)) return null;
  if (!Array.isArray(a.days) || !Array.isArray(a.slots)) return null;
  const days = Array.from(new Set(a.days.map(Number)));
  if (days.some((d: any) => !Number.isInteger(d) || d < 0 || d > 6)) return null;
  const slots = Array.from(new Set(a.slots)) as string[];
  if (slots.length > 40 || slots.some((s) => typeof s !== 'string' || !SLOT_RE.test(s))) return null;
  return { enabled: a.enabled, start_date: a.start_date, days, slots };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Action 1: Generate & Send OTP
    if (body.action === 'generate') {
      
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const isSettings = body.purpose === 'settings';

      // Tidy up expired codes
      await supabase
        .from('admin_otps')
        .delete()
        .lt('created_at', new Date(Date.now() - OTP_TTL_MINUTES * 60 * 1000).toISOString());
      
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
            <p style="color: #a3a3a3;">${isSettings ? 'A change to turf pricing / academy hours was initiated from the Command Center.' : 'An attempt to modify or cancel a booking was initiated from the Command Center.'}</p>
            <p style="color: #a3a3a3;">To authorize this action, enter the following One-Time Password:</p>
            <div style="background: #171717; padding: 20px; font-size: 32px; font-weight: bold; letter-spacing: 5px; text-align: center; border: 1px solid #262626; margin: 20px 0;">
              ${otpCode}
            </div>
            <p style="color: #a3a3a3; font-size: 12px;">This code expires in ${OTP_TTL_MINUTES} minutes.</p>
            <p style="color: #666; font-size: 12px;">If you did not request this, please secure your admin panel immediately.</p>
          </div>
        `,
      });

      return NextResponse.json({ success: true, message: 'OTP Sent' });
    }

    // Action 2: Verify the OTP (used by booking actions)
    if (body.action === 'verify') {
      const ok = await consumeOtp(body.otp);
      if (!ok) return NextResponse.json({ success: false, message: 'Invalid or expired OTP' });
      return NextResponse.json({ success: true, message: 'Authorized' });
    }

    // Action 3: Save turf pricing / academy hours — the OTP is checked HERE on the server
    if (body.action === 'save_settings') {
      const pricing = cleanPricing(body.pricing);
      const academy = cleanAcademy(body.academy);
      if (!pricing || !academy) {
        return NextResponse.json({ success: false, message: 'Invalid settings values' }, { status: 400 });
      }

      const ok = await consumeOtp(body.otp);
      if (!ok) return NextResponse.json({ success: false, message: 'Invalid or expired OTP' });

      const now = new Date().toISOString();
      const { error } = await supabase.from('site_settings').upsert(
        [
          { key: 'pricing', value: pricing, updated_at: now },
          { key: 'academy_hours', value: academy, updated_at: now },
        ],
        { onConflict: 'key' }
      );
      if (error) throw new Error('Failed to save settings: ' + error.message);

      return NextResponse.json({ success: true, message: 'Settings saved' });
    }

    return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error("OTP API Error:", error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}