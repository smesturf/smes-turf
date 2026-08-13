import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
);

export async function POST(request: Request) {
  try {
    const { email, otp } = await request.json();
    const safeEmail = email.toLowerCase().trim();

    // Check Supabase for the OTP
    const { data, error } = await supabaseAdmin
      .from("otp_verifications")
      .select("otp, created_at")
      .eq("email", safeEmail)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "No OTP found for this email" }, { status: 400 });
    }

    if (data.otp !== otp.trim()) {
      return NextResponse.json({ error: "Incorrect OTP" }, { status: 400 });
    }

    // Check if older than 5 minutes
    const otpTime = new Date(data.created_at).getTime();
    if (Date.now() - otpTime > 5 * 60 * 1000) {
      return NextResponse.json({ error: "OTP has expired" }, { status: 400 });
    }

    // Success! Delete the used OTP so it can't be reused
    await supabaseAdmin.from("otp_verifications").delete().eq("email", safeEmail);

    return NextResponse.json({ success: true, message: "Verified" });
  } catch (error: any) {
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}