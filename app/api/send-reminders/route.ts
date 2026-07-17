import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(request: Request) {
  try {
    const { students, month, fee } = await request.json();

    if (!students || students.length === 0) {
      return NextResponse.json({ error: "No students provided" }, { status: 400 });
    }

    // Configure the Email Transporter (Setup using a standard Gmail App Password)
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER, // Your turf's email address
        pass: process.env.EMAIL_APP_PASSWORD, // Your Google App Password
      },
    });

    // Send emails in parallel for speed
    const emailPromises = students.map((student: any) => {
      
      // Professional HTML Email Template
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
              <td style="padding: 15px; font-weight: bold; color: #ffffff; text-align: right;">${month}</td>
            </tr>
            <tr style="background-color: #171717;">
              <td style="padding: 15px; color: #a3a3a3; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Amount Due</td>
              <td style="padding: 15px; font-weight: bold; color: #a3e635; font-size: 20px; text-align: right;">₹${fee}</td>
            </tr>
          </table>

          <p style="color: #a3a3a3; font-size: 13px; margin-top: 30px; line-height: 1.5;">
            Please clear your pending dues via UPI or Cash at the front desk before your next session to ensure uninterrupted access to the academy roster.
          </p>
          
          <hr style="border: 0; height: 1px; background-color: #262626; margin: 30px 0;" />
          <p style="color: #525252; font-size: 11px; text-align: center; text-transform: uppercase; letter-spacing: 1px;">
            This is an automated system generated message. Please do not reply directly to this email.
          </p>
        </div>
      `;

      return transporter.sendMail({
        from: `"SMES Turf Academy" <${process.env.EMAIL_USER}>`,
        to: student.email,
        subject: `Action Required: Pending Coaching Fee for ${month}`,
        html: htmlContent,
      });
    });

    // Wait for all emails to send
    await Promise.all(emailPromises);

    return NextResponse.json({ success: true, message: "Reminders dispatched" }, { status: 200 });

  } catch (error) {
    console.error("Email API Error:", error);
    return NextResponse.json({ error: "Failed to dispatch emails" }, { status: 500 });
  }
}