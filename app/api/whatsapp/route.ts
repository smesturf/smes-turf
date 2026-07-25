import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { 
      // Original Whapi variables
      customerPhone, 
      adminMessage,
      
      // New Meta Template variables
      customerName, 
      date, 
      timeRange, 
      sportAndCourt, 
      bookingId, 
      refId, 
      totalAmount, 
      advancePaid, 
      balanceDue 
    } = await request.json();
    
    // Environment variables
    const token = process.env.WHAPI_TOKEN;
    const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER;
    const ownerPhone = process.env.OWNER_WHATSAPP_NUMBER; 
    
    const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID; 
    const META_TOKEN = process.env.META_ACCESS_TOKEN;

    if (!token) {
      return NextResponse.json({ error: "Missing Whapi Token Key" }, { status: 500 });
    }

    // ==========================================
    // 1. WHAPI SYSTEM (For Internal Alerts)
    // ==========================================

    // Dispatch Payload A: Sent directly to your on-field turf management desk line
    if (adminPhone && adminMessage) {
      await fetch("https://gate.whapi.cloud/messages/text", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          to: `${adminPhone}@c.us`,
          body: adminMessage
        })
      });
    }

    // Dispatch Payload B: Sent directly to your personal phone line as a live receipt
    if (ownerPhone && adminMessage) {
      await fetch("https://gate.whapi.cloud/messages/text", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          to: `${ownerPhone}@c.us`,
          body: adminMessage // Mirrors the exact complete detail booking alert to you
        })
      });
    }

    // ==========================================
    // 2. META CLOUD API SYSTEM (For smes_turf template)
    // ==========================================
    
    if (customerPhone && PHONE_NUMBER_ID && META_TOKEN) {
      // Ensure phone number has the '91' country code for Meta
      let formattedPhone = customerPhone.replace(/\D/g, "");
      if (formattedPhone.length === 10) {
        formattedPhone = `91${formattedPhone}`; 
      }

      await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${META_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: formattedPhone,
          type: "template",
          template: {
            name: "smes_turf",
            language: { code: "en" }, 
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: customerName ? String(customerName) : "Player" },       // {{1}}
                  { type: "text", text: date ? String(date) : "TBD" },                           // {{2}}
                  { type: "text", text: timeRange ? String(timeRange) : "TBD" },                 // {{3}}
                  { type: "text", text: sportAndCourt ? String(sportAndCourt) : "TBD" },         // {{4}}
                  { type: "text", text: bookingId ? String(bookingId) : "N/A" },                 // {{5}}
                  { type: "text", text: refId ? String(refId) : "N/A" },                         // {{6}}
                  { type: "text", text: totalAmount ? String(totalAmount) : "0" },               // {{7}}
                  { type: "text", text: advancePaid ? String(advancePaid) : "200" },             // {{8}}
                  { type: "text", text: balanceDue ? String(balanceDue) : "0" }                  // {{9}}
                ],
              },
            ],
          },
        }),
      });
    }

    return NextResponse.json({ success: true, message: "All messaging systems triggered perfectly" });
  } catch (error) {
    console.error("Background Dispatch Error:", error);
    return NextResponse.json({ error: "Failed to process message relay" }, { status: 500 });
  }
}