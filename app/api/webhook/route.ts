import { NextResponse, NextRequest } from "next/server";

// ==========================================
// 1. GET: Handles the Meta Handshake
// ==========================================
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  console.log("Token sent by Meta:", token);
  console.log("Token stored in Vercel:", process.env.META_WEBHOOK_VERIFY_TOKEN);

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
// 2. POST: Handles incoming WhatsApp messages
// ==========================================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.object) {
      if (
        body.entry &&
        body.entry[0].changes &&
        body.entry[0].changes[0] &&
        body.entry[0].changes[0].value.messages &&
        body.entry[0].changes[0].value.messages[0]
      ) {
        const message = body.entry[0].changes[0].value.messages[0];
        const phoneNumberId = body.entry[0].changes[0].value.metadata.phone_number_id;
        const from = message.from;

        // --- 2A. HANDLE TEXT MESSAGES ---
        if (message.type === "text") {
          const msgBody = message.text?.body?.toLowerCase();
          console.log(`Received text: "${msgBody}" from ${from}`);

          if (msgBody === "hi" || msgBody === "hello" || msgBody === "hey") {
            await sendInteractiveMenu(phoneNumberId, from);
          }
        }

        // --- 2B. HANDLE BUTTON CLICKS ---
        if (message.type === "interactive") {
          const buttonId = message.interactive.button_reply.id;
          const buttonTitle = message.interactive.button_reply.title;
          
          console.log(`User clicked button: ${buttonTitle} (${buttonId})`);

          // Route the logic based on which button they tapped
          if (buttonId === "btn_book") {
            // Step 1 of Booking: Send Football/Cricket buttons
            await sendSportSelection(phoneNumberId, from);
            
          } else if (buttonId === "btn_sport_football" || buttonId === "btn_sport_cricket") {
            // Step 2 of Booking: Acknowledge sport and prep for time slots
            const chosenSport = buttonId === "btn_sport_football" ? "Football" : "Cricket";
            await sendTextMessage(
              phoneNumberId, 
              from, 
              `You chose ${chosenSport}! 🏆\n\nNext, we will show you available time slots.`
            );
            
          } else if (buttonId === "btn_my_bookings") {
            await sendTextMessage(
              phoneNumberId, 
              from, 
              "Let me check the system for your recent bookings... ⏳\n\n(Database lookup coming soon!)"
            );
            
          } else if (buttonId === "btn_support") {
            await sendTextMessage(
              phoneNumberId, 
              from, 
              "Our support team is here to help! 🛠️\n\nPlease call us at +91 XXXXX XXXXX or email support@smesturf.com."
            );
          }
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
// 3. Helper: Sends Main Interactive Menu
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

    if (!response.ok) console.error("Failed to send menu:", await response.json());
  } catch (error) {
    console.error("Error sending WhatsApp API request:", error);
  }
}

// ==========================================
// 4. Helper: Sends Standard Text Messages
// ==========================================
async function sendTextMessage(phoneNumberId: string, to: string, text: string) {
  const token = process.env.META_ACCESS_TOKEN;

  const data = {
    messaging_product: "whatsapp",
    to: to,
    type: "text",
    text: {
      body: text,
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

    if (!response.ok) console.error("Failed to send text message:", await response.json());
  } catch (error) {
    console.error("Error sending text message:", error);
  }
}

// ==========================================
// 5. Helper: Sends Sport Selection (Step 1)
// ==========================================
async function sendSportSelection(phoneNumberId: string, to: string) {
  const token = process.env.META_ACCESS_TOKEN;

  const data = {
    messaging_product: "whatsapp",
    to: to,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: "Great! Which sport would you like to book? ⚽🏏",
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "btn_sport_football",
              title: "Football",
            },
          },
          {
            type: "reply",
            reply: {
              id: "btn_sport_cricket",
              title: "Cricket",
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

    if (!response.ok) console.error("Failed to send sport selection:", await response.json());
  } catch (error) {
    console.error("Error sending sport selection:", error);
  }
}