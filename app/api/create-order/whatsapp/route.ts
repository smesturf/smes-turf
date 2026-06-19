import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { customerPhone, customerMessage, adminMessage } = await request.json();
    
    const token = process.env.WHAPI_TOKEN;
    const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER;
    const ownerPhone = process.env.OWNER_WHATSAPP_NUMBER; // Added securely for you personally

    if (!token) {
      return NextResponse.json({ error: "Missing Whapi Token Key" }, { status: 500 });
    }

    // 1. Dispatch Payload A: Sent directly to the client playing on the turf
    await fetch("https://gate.whapi.cloud/messages/text", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        to: `91${customerPhone}@c.us`,
        body: customerMessage
      })
    });

    // 2. Dispatch Payload B: Sent directly to your on-field turf management desk line
    if (adminPhone) {
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

    // 3. Dispatch Payload C: Sent directly to your personal phone line as a live receipt
    if (ownerPhone) {
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Whapi Background Dispatch Error:", error);
    return NextResponse.json({ error: "Failed to process message relay" }, { status: 500 });
  }
}