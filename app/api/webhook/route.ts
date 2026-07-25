import { NextResponse } from "next/server";

// ==========================================
// 1. GET: Handles the Meta Handshake
// ==========================================
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log("✅ Tokens Match! Handshake successful.");
    return new NextResponse(challenge, { 
      status: 200,
      headers: { "Content-Type": "text/plain" }
    });
  }
  
  return new NextResponse("Forbidden", { status: 403 });
}

// ==========================================
// 2. POST: Handles Incoming WhatsApp Messages
// ==========================================
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Verify this is a WhatsApp API event
    if (body.object === "whatsapp_business_account") {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const message = value?.messages?.[0];

      // If a customer sent a message, extract details & respond
      if (message) {
        const phone = message.from;
        const text = message.text?.body?.trim().toLowerCase();
        
        console.log(`💬 Incoming message from ${phone}: ${text}`);
        
        // Trigger interactive menu for greetings
        if (text === "hi" || text === "hello" || text === "hey") {
          await sendInteractiveMenu(phone);
        }
      }
      
      // Meta strictly requires a 200 OK response to acknowledge receipt
      return new NextResponse("EVENT_RECEIVED", { status: 200 });
    }
    
    return new NextResponse("Not Found", { status: 404 });
  } catch (error) {
    console.error("Error processing POST request:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

// ==========================================
// 3. HELPER: Send Interactive Menu
// ==========================================
async function sendInteractiveMenu(to: string) {
  // Uses META_PHONE_NUMBER_ID matching your Vercel settings
  const url = `https://graph.facebook.com/v20.0/${process.env.META_PHONE_NUMBER_ID}/messages`;
  const token = process.env.META_ACCESS_TOKEN;

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "Welcome to SMES Turf! ⚽\n\nHow can we help you today?" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "BOOK_TURF", title: "📅 Book Turf" } },
          { type: "reply", reply: { id: "MY_BOOKINGS", title: "📋 My Bookings" } },
          { type: "reply", reply: { id: "SUPPORT", title: "💬 Support" } }
        ]
      }
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    console.log("📤 Response from Meta API:", data);
  } catch (error) {
    console.error("❌ Failed to send menu:", error);
  }
}