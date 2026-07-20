import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase for the backend
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: Request) {
  try {
    // 1. Calculate Target Dates (Runs on the 1st of the month, so target is the last day of the previous month)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - 1); 
    
    const todayStr = targetDate.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const currentMonthNum = targetDate.getMonth();
    const currentYearNum = targetDate.getFullYear();
    const currentMonthYear = todayStr.slice(0, 7); // YYYY-MM
    const monthName = targetDate.toLocaleString("en-US", { month: "long" });

    // 2. Fetch ALL Data from Supabase
    const { data: bookingsData } = await supabase.from("bookings").select("*").order("booking_date", { ascending: true });
    const { data: dbStudents } = await supabase.from("students").select(`*, student_payments(*)`).order("name", { ascending: true });

    const bookings = bookingsData || [];
    const students = dbStudents || [];

    // 3. Initialize Workbook
    const workbook = XLSX.utils.book_new();

    /* ==========================================
       SHEET 1: MAIN BOOKINGS
       ========================================== */
    const exportData = bookings.map((booking) => ({
      "Booking ID": booking.id,
      "Barcode": booking.booking_reference || "N/A",
      "Customer Name": booking.customer_name,
      "Phone Number": booking.phone,
      "Date": booking.booking_date?.split("T")[0],
      "Time": booking.start_time,
      "Duration (Mins)": booking.duration_minutes || 60,
      "Sport": booking.sport,
      "Type": booking.booking_type,
      "Court": booking.court_number || "-",
      "Total (₹)": booking.total_amount,
      "Advance (₹)": booking.advance_amount,
      "Balance (₹)": booking.balance_amount,
      "Status": booking.payment_status,
      "Payment Method": booking.payment_method || "-",
      "Cash Received (₹)": booking.cash_received || 0,
      "UPI Received (₹)": booking.upi_received || 0,
      "Payment Status": booking.payment_completed ? "Paid" : "Pending",
    }));

    const totalRevenue = bookings.reduce((sum, booking) => sum + (booking.total_amount || 0), 0);
    const totalAdvance = bookings.reduce((sum, booking) => sum + (booking.advance_amount || 0), 0);
    const totalBalance = bookings.reduce((sum, booking) => sum + (booking.balance_amount || 0), 0);
    const totalCashCollected = bookings.reduce((sum, booking) => sum + Number(booking.cash_received || 0), 0);
    const totalUpiCollected = bookings.reduce((sum, booking) => sum + Number(booking.upi_received || 0), 0);
    const totalCollection = totalCashCollected + totalUpiCollected;
    const moneyInHand = totalAdvance + totalCollection;

    const mainSheet = XLSX.utils.aoa_to_sheet([
      ["SMES TURF BOOKING REPORT"],
      [`Export Date: ${new Date().toLocaleString("en-IN")}`],
      [],
      ["Total Bookings", bookings.length],
      ["Total Revenue Expected (₹)", totalRevenue],
      ["Advance Collected (₹)", totalAdvance],
      ["Pending Balance (₹)", totalBalance],
      ["Cash Collected (₹)", totalCashCollected],
      ["UPI Collected (₹)", totalUpiCollected],
      ["Total Collected (Cash + UPI) (₹)", totalCollection],
      ["Actual Money In Hand (Adv + Cash + UPI) (₹)", moneyInHand],
      [], [],
    ]);
    XLSX.utils.sheet_add_json(mainSheet, exportData, { origin: "A14" });
    mainSheet["!autofilter"] = { ref: `A14:R${14 + exportData.length}` };
    mainSheet["!cols"] = [{ wch: 12 }, { wch: 22 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(workbook, mainSheet, "Bookings");

    /* ==========================================
       SHEET 2: TODAY (Last Day of the Month)
       ========================================== */
    const todayBookings = bookings.filter((booking) => booking.booking_date?.split("T")[0] === todayStr);
    const todayAdvance = todayBookings.reduce((sum, booking) => sum + (booking.advance_amount || 0), 0);
    const todayBalance = todayBookings.reduce((sum, booking) => sum + (booking.balance_amount || 0), 0);
    const todayRevenue = todayAdvance + todayBalance;
    const todayCash = todayBookings.reduce((sum, booking) => sum + Number(booking.cash_received || 0), 0);
    const todayUpi = todayBookings.reduce((sum, booking) => sum + Number(booking.upi_received || 0), 0);
    const todayCollection = todayCash + todayUpi;
    const todayMoneyInHand = todayAdvance + todayCollection;

    const todaySheet = XLSX.utils.aoa_to_sheet([
      [`CLOSING DAY COLLECTION (${todayStr})`], [],
      ["Total Bookings", todayBookings.length],
      ["Total Revenue Expected (₹)", todayRevenue],
      ["Advance Collected (₹)", todayAdvance],
      ["Pending Balance (₹)", todayBalance],
      ["Cash Collected (₹)", todayCash],
      ["UPI Collected (₹)", todayUpi],
      ["Total Collected (Cash + UPI) (₹)", todayCollection],
      ["Actual Money In Hand (Adv + Cash + UPI) (₹)", todayMoneyInHand],
      ["Settlement Status", todayBalance > 0 ? `⚠️ ₹${todayBalance} DUE` : "✅ SETTLED"],
    ]);
    XLSX.utils.book_append_sheet(workbook, todaySheet, "Today");

    /* ==========================================
       SHEET 3: MONTHLY
       ========================================== */
    const targetMonthBookings = bookings.filter((booking) => {
      if (!booking.booking_date) return false;
      const d = new Date(booking.booking_date);
      return d.getMonth() === currentMonthNum && d.getFullYear() === currentYearNum;
    });

    const monthlyRevenueRaw = targetMonthBookings.reduce((sum, b) => sum + (b.total_amount || 0), 0);
    const monthlyAdvance = targetMonthBookings.reduce((sum, b) => sum + (b.advance_amount || 0), 0);
    const monthlyBalance = targetMonthBookings.reduce((sum, b) => sum + (b.balance_amount || 0), 0);
    const monthlyCash = targetMonthBookings.reduce((sum, b) => sum + Number(b.cash_received || 0), 0);
    const monthlyUpi = targetMonthBookings.reduce((sum, b) => sum + Number(b.upi_received || 0), 0);
    const monthlyCollection = monthlyCash + monthlyUpi;
    const monthlyMoneyInHand = monthlyAdvance + monthlyCollection;

    const monthlySheet = XLSX.utils.aoa_to_sheet([
      [`MONTHLY COLLECTION (${monthName} ${currentYearNum})`], [],
      ["Total Bookings", targetMonthBookings.length],
      ["Total Revenue Expected (₹)", monthlyRevenueRaw],
      ["Advance Collected (₹)", monthlyAdvance],
      ["Pending Balance (₹)", monthlyBalance],
      ["Cash Collected (₹)", monthlyCash],
      ["UPI Collected (₹)", monthlyUpi],
      ["Total Collected (Cash + UPI) (₹)", monthlyCollection],
      ["Actual Money In Hand (Adv + Cash + UPI) (₹)", monthlyMoneyInHand],
      ["Settlement Status", monthlyBalance > 0 ? `⚠️ ₹${monthlyBalance} DUE` : "✅ SETTLED"],
    ]);
    XLSX.utils.book_append_sheet(workbook, monthlySheet, "Monthly");

    /* ==========================================
       SHEET 4: DAILY SUMMARY
       ========================================== */
    const dailyStats: Record<string, any> = {};
    bookings.forEach(b => {
      const d = b.booking_date?.split("T")[0] || "Unknown";
      if (!dailyStats[d]) {
        dailyStats[d] = {
          "Date": d,
          "Total Bookings": 0,
          "Total Revenue (₹)": 0,
          "Advance Collected (₹)": 0,
          "Pending Balance (₹)": 0,
          "Cash Collected (₹)": 0,
          "UPI Collected (₹)": 0,
          "Total Collected (Cash+UPI) (₹)": 0,
          "Actual Money In Hand (Adv+Cash+UPI) (₹)": 0,
        };
      }
      const advance = b.advance_amount || 0;
      const cash = Number(b.cash_received) || 0;
      const upi = Number(b.upi_received) || 0;
      const balance = b.balance_amount || 0;

      dailyStats[d]["Total Bookings"] += 1;
      dailyStats[d]["Total Revenue (₹)"] += (b.total_amount || 0);
      dailyStats[d]["Advance Collected (₹)"] += advance;
      dailyStats[d]["Pending Balance (₹)"] += balance;
      dailyStats[d]["Cash Collected (₹)"] += cash;
      dailyStats[d]["UPI Collected (₹)"] += upi;
      dailyStats[d]["Total Collected (Cash+UPI) (₹)"] += (cash + upi);
      dailyStats[d]["Actual Money In Hand (Adv+Cash+UPI) (₹)"] += (advance + cash + upi);
    });

    const dailySummaryArray = Object.values(dailyStats).map((stat: any) => ({
      ...stat,
      "Settlement Status": stat["Pending Balance (₹)"] > 0 ? `⚠️ ₹${stat["Pending Balance (₹)"]} DUE` : `✅ SETTLED`
    })).sort((a: any, b: any) => a.Date.localeCompare(b.Date));
    
    const dailySheet = XLSX.utils.json_to_sheet(dailySummaryArray);
    dailySheet["!autofilter"] = { ref: `A1:J${1 + dailySummaryArray.length}` };
    dailySheet["!cols"] = [{ wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 22 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 28 }, { wch: 38 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, dailySheet, "Daily Summary");

    /* ==========================================
       SHEET 5: FOOTBALL COACHING
       ========================================== */
    const uniqueMonths = Array.from(
      new Set([
        ...(students.flatMap((s: any) => (s.student_payments || []).map((p: any) => p.month_year))),
        currentMonthYear
      ])
    ).sort();

    const formatMonthLabel = (my: string) => {
      const [year, month] = my.split("-");
      const date = new Date(Number(year), Number(month) - 1, 1);
      return date.toLocaleString("en-US", { month: "long", year: "numeric" });
    };

    const academyWorksheetData = students.map((s: any, index: number) => {
      const joinDate = new Date(s.created_at);
      const isNew = joinDate.getMonth() === currentMonthNum && joinDate.getFullYear() === currentYearNum;
      const row: any = {
        "S.No.": index + 1,
        "Student Name": s.name + (isNew ? " (NEW)" : ""),
        "Phone Number": s.phone,
        "Date of Birth": s.dob ? new Date(s.dob).toLocaleDateString("en-GB") : "-",
        "Email ID": s.email || "-",
        "Monthly Fee (₹)": s.monthly_fee,
        "Type": isNew ? "NEW REGISTRATION" : "EXISTING"
      };
      uniqueMonths.forEach((my) => {
        const record = s.student_payments?.find((p: any) => p.month_year === my);
        const colLabel = formatMonthLabel(my);
        row[colLabel] = record?.status === "settled" ? `✅ PAID (${record.payment_method || "UPI"})` : "❌ PENDING";
      });
      return row;
    });

    const academySheet = XLSX.utils.json_to_sheet(academyWorksheetData);
    const totalColumns = 7 + uniqueMonths.length; 
    const endColumnChar = String.fromCharCode(64 + totalColumns); 
    academySheet["!autofilter"] = { ref: `A1:${endColumnChar}${1 + academyWorksheetData.length}` }; 
    academySheet["!cols"] = [{ wch: 8 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 18 }, ...uniqueMonths.map(() => ({ wch: 22 }))];
    XLSX.utils.book_append_sheet(workbook, academySheet, "Football Coaching");

    /* ==========================================
       DISPATCH EMAIL
       ========================================== */
    const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
      },
    });

    const targetEmails = [
      "abhayispilot@gmail.com",
      "jathinsb704@gmail.com",
      "anandsk551@gmail.com",
      "abhayhanki@gmail.com"
    ];

    await transporter.sendMail({
      from: `"SMES Turf Admin" <${process.env.EMAIL_USER}>`,
      to: targetEmails.join(", "), 
      subject: `📊 SMES Turf: Monthly Master Report (${monthName} ${currentYearNum})`,
      html: `
        <div style="font-family: Arial, sans-serif; max-w: 600px; margin: 0 auto; background-color: #0a0a0a; color: #ffffff; padding: 30px; border-top: 5px solid #a3e635;">
          <h2 style="color: #ffffff; text-transform: uppercase;">Monthly Master Report</h2>
          <p style="color: #a3a3a3;">Attached is the automated, full 5-sheet financial and booking ledger for <strong>${monthName} ${currentYearNum}</strong>.</p>
          
          <div style="background-color: #171717; padding: 20px; margin-top: 20px; border-left: 4px solid #a3e635;">
            <h3 style="margin-top: 0; color: #ffffff;">Quick Overview</h3>
            <p style="color: #d4d4d4; margin: 5px 0;">Total Revenue: <strong>₹${monthlyRevenueRaw}</strong></p>
            <p style="color: #d4d4d4; margin: 5px 0;">Money In Hand: <strong style="color: #a3e635;">₹${monthlyMoneyInHand}</strong></p>
            <p style="color: #d4d4d4; margin: 5px 0;">Pending Dues: <strong style="color: #ef4444;">₹${monthlyBalance}</strong></p>
          </div>

          <p style="color: #525252; font-size: 11px; margin-top: 30px; text-transform: uppercase;">
            Automated via SMES Management System
          </p>
        </div>
      `,
      attachments: [
        {
          filename: `SMES_Master_Report_${monthName}_${currentYearNum}.xlsx`,
          content: excelBuffer,
        },
      ],
    });

    return NextResponse.json({ success: true, message: `Full 5-Sheet Report sent to 4 founders for ${monthName}` });
  } catch (error) {
    console.error("Cron Job Failed:", error);
    return NextResponse.json({ error: "Failed to generate monthly report" }, { status: 500 });
  }
}