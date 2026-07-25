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

      // --- TRIGGER THE TEMPLATE ON ANY TEXT MESSAGE ---
      if (message.type === "text") {
        // Fires the template you just created in the Meta dashboard
        await sendTemplateMessage(phoneNumberId, from, "smes_welcome_menu");
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

// Send WhatsApp Template Message (with direct URL and Call CTA buttons)
async function sendTemplateMessage(phoneId: string, to: string, templateName: string) {
  await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method: "POST",
    headers: { 
      Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`, 
      "Content-Type": "application/json" 
    },
    body: JSON.stringify({
      messaging_product: "whatsapp", 
      to: to, 
      type: "template", 
      template: { 
        name: templateName, 
        language: { code: "en" } // Make sure this perfectly matches the language you chose in Meta
      }
    })
  });
}