import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Destructure all required variables from the frontend payload
    const {
      customerPhone, customerName, email, date, time, duration, 
      court, sport, bookingId, referenceId, totalAmount, 
      advanceAmount, balanceAmount
    } = body;

    const metaPhoneId = process.env.META_PHONE_NUMBER_ID;
    const metaToken = process.env.META_ACCESS_TOKEN;
    const adminNumber = process.env.ADMIN_WHATSAPP_NUMBER;
    const ownerNumber = process.env.OWNER_WHATSAPP_NUMBER;
    const subAdminNumber = process.env.SUB_ADMIN_WHATSAPP_NUMBER;

    // Failsafe check for critical credentials
    if (!metaPhoneId || !metaToken) {
      return NextResponse.json({ error: "Server Configuration Error: Missing Meta Credentials" }, { status: 500 });
    }

    // Helper to format phone numbers (removes spaces/symbols, adds 91 for India)
    const formatPhone = (phone: string) => {
      if (!phone) return "";
      let cleaned = phone.replace(/\D/g, "");
      return cleaned.length === 10 ? `91${cleaned}` : cleaned;
    };

    const metaUrl = `https://graph.facebook.com/v20.0/${metaPhoneId}/messages`;

    // --- 1. CUSTOMER MESSAGE PROMISE (smes_turf template) ---
    const sendCustomerMessage = fetch(metaUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${metaToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: formatPhone(customerPhone),
        type: "template",
        template: {
          name: "smes_turf", 
          language: { code: "en" },
          components: [{
            type: "body",
            parameters: [
              { type: "text", text: customerName || "Guest" },
              { type: "text", text: date || "N/A" },
              { type: "text", text: time || "N/A" },
              { type: "text", text: `${sport} (${court})` },
              { type: "text", text: String(bookingId || "") },
              { type: "text", text: String(referenceId || "") },
              { type: "text", text: String(totalAmount || 0) },
              { type: "text", text: String(advanceAmount || 0) },
              { type: "text", text: String(balanceAmount || 0) },
            ],
          }],
        },
      }),
    });

    // --- 2. STAFF MESSAGE PROMISE HELPER (admin_booking_alert template) ---
    const sendStaffAlert = (targetPhone: string) => fetch(metaUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${metaToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: formatPhone(targetPhone),
        type: "template",
        template: {
          name: "admin_booking_alert", 
          language: { code: "en" },
          components: [{
            type: "body",
            parameters: [
              { type: "text", text: customerName || "Guest" }, // {{1}}
              { type: "text", text: String(customerPhone || "N/A") },  // {{2}}
              { type: "text", text: email || "N/A" },          // {{3}}
              { type: "text", text: date || "N/A" },           // {{4}}
              { type: "text", text: time || "N/A" },           // {{5}}
              { type: "text", text: String(duration || 60) },  // {{6}}
              { type: "text", text: sport || "N/A" },          // {{7}}
              { type: "text", text: court || "N/A" },          // {{8}}
              { type: "text", text: String(totalAmount || 0) },// {{9}}
              { type: "text", text: String(advanceAmount || 0)},// {{10}}
              { type: "text", text: String(balanceAmount || 0)},// {{11}}
              // ⚡ COMBINED BOOKING ID & REFERENCE ID INTO VARIABLE 12 
              { type: "text", text: `${bookingId || ""} | ${referenceId || ""}` },// {{12}}
            ],
          }],
        },
      }),
    });

    // --- 3. EXECUTE ALL 4 REQUESTS CONCURRENTLY ---
    const [customerRes, adminRes, subAdminRes, ownerRes] = await Promise.allSettled([
      customerPhone ? sendCustomerMessage : Promise.resolve(null),
      adminNumber ? sendStaffAlert(adminNumber) : Promise.resolve(null),
      subAdminNumber ? sendStaffAlert(subAdminNumber) : Promise.resolve(null),
      ownerNumber ? sendStaffAlert(ownerNumber) : Promise.resolve(null)
    ]);

    // --- 4. ERROR LOGGING & RESPONSE ---
    let isCustomerSuccess = false;
    let customerError = null;

    if (customerRes.status === "fulfilled" && customerRes.value) {
      const data = await customerRes.value.json();
      if (customerRes.value.ok) {
        isCustomerSuccess = true;
      } else {
        customerError = data.error?.message;
        console.error("Customer Meta API Error:", data.error);
      }
    } else if (customerRes.status === "rejected") {
      console.error("Customer Fetch Error:", customerRes.reason);
    }

    // (Optional) Debugging logs for Vercel if any staff messages fail
    const checkStaffResponse = async (res: any, role: string) => {
        if (res.status === "fulfilled" && res.value && !res.value.ok) {
            const data = await res.value.json();
            console.error(`${role} Meta API Error:`, data.error);
        }
    };
    
    await checkStaffResponse(adminRes, "Admin");
    await checkStaffResponse(subAdminRes, "Sub-Admin");
    await checkStaffResponse(ownerRes, "Owner");

    return NextResponse.json({ 
      success: true, 
      metaSent: isCustomerSuccess,
      metaError: customerError
    });

  } catch (error) {
    console.error("WhatsApp Route Fatal Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}