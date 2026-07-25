import { NextResponse, NextRequest } from "next/server";

// ==========================================
// 1. GET: Handles the Meta Handshake
// ==========================================
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// ==========================================
// 2. POST: Handles incoming WhatsApp messages
// ==========================================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.object && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const message = body.entry[0].changes[0].value.messages[0];
      const phoneNumberId = body.entry[0].changes[0].value.metadata.phone_number_id;
      const from = message.from; 

      // --- 2A. HANDLE TEXT INPUTS (Trigger Main Menu) ---
      if (message.type === "text") {
        const textBody = message.text.body.toLowerCase();

        // Trigger the menu on greeting
        if (textBody === "hi" || textBody === "hello") {
          await sendButtonMessage(phoneNumberId, from, "Welcome to SMES Turf! ⚽🏏 What would you like to do?", [
            { id: "btn_book", title: "Book Now" },
            { id: "btn_call", title: "Call Now" }
          ]);
        }
      }

      // --- 2B. HANDLE INTERACTIVE BUTTON CLICKS ---
      if (message.type === "interactive" && message.interactive.type === "button_reply") {
        const buttonId = message.interactive.button_reply.id;

        if (buttonId === "btn_book") {
          // Send the Website Link (WhatsApp makes URLs clickable automatically)
          await sendTextMessage(
            phoneNumberId, 
            from, 
            "Great! Click the link below to view availability and book your turf instantly:\n\n🌐 https://smesturf.com"
          );
        } 
        
        else if (buttonId === "btn_call") {
          // Send the Phone Number (WhatsApp makes numbers tappable to dial automatically)
          // ⚠️ Be sure to replace the placeholder number below with your actual phone number!
          await sendTextMessage(
            phoneNumberId, 
            from, 
            "We would love to speak with you! Tap the number below to call us directly:\n\n📞 +91 8073064676"
          );
        }
      }

      return NextResponse.json({ status: "success" }, { status: 200 });
    }
    return new NextResponse("Not Found", { status: 404 });
  } catch (error) {
    console.error("Webhook Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

// ==========================================
// HELPER FUNCTIONS 
// ==========================================

// 1. Send Text Message
async function sendTextMessage(phoneId: string, to: string, text: string) {
  await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } })
  });
}

// 2. Send Interactive Buttons (Max 3 buttons per message)
async function sendButtonMessage(phoneId: string, to: string, text: string, buttons: {id: string, title: string}[]) {
  const actionButtons = buttons.map(btn => ({ type: "reply", reply: { id: btn.id, title: btn.title } }));
  await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to, type: "interactive",
      interactive: { type: "button", body: { text }, action: { buttons: actionButtons } }
    })
  });
}