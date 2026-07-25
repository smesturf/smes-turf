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

      // If a customer sent a message, extract the details
      if (message) {
        const phone = message.from;
        const text = message.text?.body;
        
        // 🐛 Debugging: This will print the customer's text in Vercel Logs
        console.log(`💬 Incoming message from ${phone}: ${text}`);
        
        // Next step: We will trigger the interactive menu logic here!
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