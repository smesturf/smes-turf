import { NextResponse, NextRequest } from "next/server";

// ==========================================
// 1. GET: Handles the Meta Handshake
// ==========================================
export async function GET(req: NextRequest) {
  // Using NextRequest's native URL parser prevents Vercel/Next.js from stripping query parameters
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  console.log("Token sent by Meta:", token);
  console.log("Token stored in Vercel:", process.env.META_WEBHOOK_VERIFY_TOKEN);

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log("✅ Tokens Match! Handshake successful.");
    // Meta requires the challenge to be returned as plain text
    return new NextResponse(challenge, { 
      status: 200,
      headers: { "Content-Type": "text/plain" }
    });
  }
  
  return new NextResponse("Forbidden", { status: 403 });
}

// ==========================================
// 2. POST: Handles incoming WhatsApp messages
// ==========================================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Check if this is a WhatsApp status update or a message
    if (body.object) {
      if (
        body.entry &&
        body.entry[0].changes &&
        body.entry[0].changes[0] &&
        body.entry[0].changes[0].value.messages &&
        body.entry[0].changes[0].value.messages[0]
      ) {
        const phoneNumberId = body.entry[0].changes[0].value.metadata.phone_number_id;
        const from = body.entry[0].changes[0].value.messages[0].from; // sender's phone number
        const msgBody = body.entry[0].changes[0].value.messages[0].text?.body?.toLowerCase();

        console.log(`Received message: "${msgBody}" from ${from}`);

        // If the user says hi, hello, or hey, trigger the interactive menu
        if (msgBody === "hi" || msgBody === "hello" || msgBody === "hey") {
          await sendInteractiveMenu(phoneNumberId, from);
        }
      }
      // Acknowledge receipt back to Meta immediately
      return NextResponse.json({ status: "success" }, { status: 200 });
    } else {
      return new NextResponse("Not Found", { status: 404 });
    }
  } catch (error) {
    console.error("Error processing POST request:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

// ==========================================
// 3. Helper: Sends Interactive Button Menu
// ==========================================
async function sendInteractiveMenu(phoneNumberId: string, to: string) {
  const token = process.env.META_ACCESS_TOKEN;

  const data = {
    messaging_product: "whatsapp",
    to: to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: "Welcome to SMES Turf! How can we help you today?",
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "btn_book",
              title: "Book",
            },
          },
          {
            type: "reply",
            reply: {
              id: "btn_my_bookings",
              title: "My Bookings",
            },
          },
          {
            type: "reply",
            reply: {
              id: "btn_support",
              title: "Support",
            },
          },
        ],
      },
    },
  };

  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Failed to send message:", errorData);
    } else {
      console.log("✅ Interactive menu sent successfully!");
    }
  } catch (error) {
    console.error("Error sending WhatsApp API request:", error);
  }
}