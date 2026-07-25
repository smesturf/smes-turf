import { NextResponse } from "next/server";

// 1. GET HANDLER: For Meta's one-time Verification Handshake
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log("✅ WEBHOOK_VERIFIED");
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// 2. POST HANDLER: Listens for incoming customer messages
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Verify this is a WhatsApp message event
    if (body.object === "whatsapp_business_account") {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0]?.value;
      
      // Check if there is an actual message (and not just a read receipt)
      if (changes?.messages && changes.messages.length > 0) {
        const message = changes.messages[0];
        const senderPhone = message.from; // The customer's phone number

        // --- SCENARIO A: Customer sends a text like "Hi" ---
        if (message.type === "text") {
          const textMsg = message.text.body.toLowerCase().trim();

          if (textMsg === "hi" || textMsg === "hello" || textMsg === "hey") {
            await sendWelcomeMenu(senderPhone);
          }
        } 
        
        // --- SCENARIO B: Customer clicks one of the buttons we sent ---
        else if (message.type === "interactive") {
          const buttonId = message.interactive.button_reply.id;
          
          if (buttonId === "btn_book") {
             await sendTextMessage(senderPhone, "Awesome! You can book a slot here: https://your-website.com");
          } else if (buttonId === "btn_pricing") {
             await sendTextMessage(senderPhone, "Our pricing is ₹1200/hr for Full Court and ₹700/hr for Half Court.");
          } else if (buttonId === "btn_contact") {
             await sendTextMessage(senderPhone, "You can reach our desk at +91 8453095258.");
          }
        }
      }
    }

    // ALWAYS return 200 OK immediately so Meta knows you received it
    return NextResponse.json({ status: "ok" }, { status: 200 });

  } catch (error) {
    console.error("Webhook POST Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/* ================================================================ */
/* HELPER FUNCTIONS FOR META API ACTIONS                            */
/* ================================================================ */

const META_URL = `https://graph.facebook.com/v20.0/${process.env.META_PHONE_NUMBER_ID}/messages`;
const META_HEADERS = {
  "Authorization": `Bearer ${process.env.META_ACCESS_TOKEN}`,
  "Content-Type": "application/json"
};

// Sends an Interactive Message with up to 3 Buttons
async function sendWelcomeMenu(toPhone: string) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toPhone,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: "Welcome to *SMES Turf Arena*! ⚽🏏\n\nHow can we help you today?"
      },
      action: {
        buttons: [
          { type: "reply", reply: { id: "btn_book", title: "📅 Book a Slot" } },
          { type: "reply", reply: { id: "btn_pricing", title: "💰 View Pricing" } },
          { type: "reply", reply: { id: "btn_contact", title: "📞 Contact Desk" } }
        ]
      }
    }
  };

  await fetch(META_URL, { method: "POST", headers: META_HEADERS, body: JSON.stringify(payload) });
}

// Sends a standard simple text message back
async function sendTextMessage(toPhone: string, textMsg: string) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toPhone,
    type: "text",
    text: { body: textMsg }
  };

  await fetch(META_URL, { method: "POST", headers: META_HEADERS, body: JSON.stringify(payload) });
}