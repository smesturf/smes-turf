import { NextResponse } from "next/server";

// Access the same global cache we used in send-otp
const globalForOtp = global as unknown as { otpCache: Map<string, { otp: string; expires: number }> };
const otpCache = globalForOtp.otpCache || new Map();

export async function POST(request: Request) {
  try {
    const { email, otp } = await request.json();

    if (!email || !otp) {
      return NextResponse.json({ error: "Email and OTP are required" }, { status: 400 });
    }

    // 1. Retrieve the stored OTP data for this email
    const storedData = otpCache.get(email);

    // 2. Validation Checks
    if (!storedData) {
      return NextResponse.json({ error: "No OTP requested for this email" }, { status: 400 });
    }

    if (Date.now() > storedData.expires) {
      otpCache.delete(email); // Clean up expired OTP
      return NextResponse.json({ error: "OTP has expired" }, { status: 400 });
    }

    if (storedData.otp !== otp) {
      return NextResponse.json({ error: "Invalid OTP" }, { status: 400 });
    }

    // 3. Success! OTP matches and is not expired. Clear it from memory to prevent reuse.
    otpCache.delete(email);

    return NextResponse.json({ success: true, message: "OTP Verified Successfully" });
  } catch (error: any) {
    console.error("Verification Error:", error);
    return NextResponse.json({ error: "Failed to verify OTP" }, { status: 500 });
  }
}