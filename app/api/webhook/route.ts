import { NextResponse, NextRequest } from "next/server";

// ==========================================
// 0. TEMPORARY DATABASE (State Management)
// ==========================================
// Tracks where each user is in the booking flow
const userSessions = new Map<string, any>();

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
      const from = message.from; // User's WhatsApp ID

      // Fetch or initialize this user's session
      let session = userSessions.get(from) || { step: "NONE", data: {} };

      // --- 2A. HANDLE TEXT INPUTS ---
      if (message.type === "text") {
        const text = message.text.body;

        // Trigger Main Menu
        if (text.toLowerCase() === "hi" || text.toLowerCase() === "hello") {
          session = { step: "NONE", data: {} }; // Reset flow
          userSessions.set(from, session);
          await sendButtonMessage(phoneNumberId, from, "Welcome to SMES Turf! How can we help you today?", [
            { id: "btn_book", title: "Book Turf" },
            { id: "btn_support", title: "Support" }
          ]);
          return NextResponse.json({ status: "success" }, { status: 200 });
        }

        // Handle State: Waiting for Name
        if (session.step === "WAITING_FOR_NAME") {
          session.data.name = text;
          session.step = "WAITING_FOR_PHONE";
          userSessions.set(from, session);
          
          await sendTextMessage(phoneNumberId, from, `Thanks, ${text}! Please type your 10-digit Phone Number:`);
          return NextResponse.json({ status: "success" }, { status: 200 });
        }

        // Handle State: Waiting for Phone
        if (session.step === "WAITING_FOR_PHONE") {
          session.data.phone = text;
          session.step = "WAITING_FOR_SPORT";
          userSessions.set(from, session);

          await sendButtonMessage(phoneNumberId, from, "Got it! Which sport are you booking for? ⚽🏏", [
            { id: "sport_football", title: "Football" },
            { id: "sport_cricket", title: "Cricket" }
          ]);
          return NextResponse.json({ status: "success" }, { status: 200 });
        }
      }

      // --- 2B. HANDLE INTERACTIVE CLICKS (Buttons & Lists) ---
      if (message.type === "interactive") {
        const interactive = message.interactive;
        // Determine if it was a button click or a list selection
        const interactionId = interactive.type === "button_reply" 
          ? interactive.button_reply.id 
          : interactive.list_reply.id;

        // 1. Start Booking Clicked
        if (interactionId === "btn_book") {
          session = { step: "WAITING_FOR_NAME", data: {} };
          userSessions.set(from, session);
          await sendTextMessage(phoneNumberId, from, "Let's get you booked! First, please type your Full Name:");
        } 
        
        // 2. Sport Selected
        else if (session.step === "WAITING_FOR_SPORT") {
          session.data.sport = interactionId === "sport_football" ? "Football" : "Cricket";
          session.step = "WAITING_FOR_COURT";
          userSessions.set(from, session);

          await sendButtonMessage(phoneNumberId, from, `Great! You chose ${session.data.sport}. Do you need a Half Court or Full Court?`, [
            { id: "court_half", title: "Half Court" },
            { id: "court_full", title: "Full Court" }
          ]);
        }

        // 3. Court Size Selected
        else if (session.step === "WAITING_FOR_COURT") {
          session.data.court = interactionId === "court_half" ? "Half Court" : "Full Court";
          session.step = "WAITING_FOR_DATE";
          userSessions.set(from, session);

          await sendListMessage(phoneNumberId, from, "When would you like to play?", "Select Date", [
            { title: "Available Dates", rows: [
              { id: "date_today", title: "Today" },
              { id: "date_tomorrow", title: "Tomorrow" },
              { id: "date_dayafter", title: "Day After Tomorrow" }
            ]}
          ]);
        }

        // 4. Date Selected
        else if (session.step === "WAITING_FOR_DATE") {
          const dateMap: any = { date_today: "Today", date_tomorrow: "Tomorrow", date_dayafter: "Day After Tomorrow" };
          session.data.date = dateMap[interactionId];
          session.step = "WAITING_FOR_DURATION";
          userSessions.set(from, session);

          await sendButtonMessage(phoneNumberId, from, "How long is your session?", [
            { id: "dur_1hr", title: "1 Hour" },
            { id: "dur_2hr", title: "2 Hours" }
          ]);
        }

        // 5. Duration Selected
        else if (session.step === "WAITING_FOR_DURATION") {
          session.data.duration = interactionId === "dur_1hr" ? "1 Hour" : "2 Hours";
          session.step = "WAITING_FOR_SLOT";
          userSessions.set(from, session);

          await sendListMessage(phoneNumberId, from, "Pick an available Kickoff Slot:", "View Slots", [
            { title: "Evening Slots", rows: [
              { id: "slot_6pm", title: "6:00 PM" },
              { id: "slot_7pm", title: "7:00 PM" },
              { id: "slot_8pm", title: "8:00 PM" }
            ]}
          ]);
        }

        // 6. Time Slot Selected (Final Step!)
        else if (session.step === "WAITING_FOR_SLOT") {
          const slotMap: any = { slot_6pm: "6:00 PM", slot_7pm: "7:00 PM", slot_8pm: "8:00 PM" };
          session.data.slot = slotMap[interactionId];
          
          // Generate Summary
          const summary = `🎉 *Booking Request Received!* 🎉\n\n` +
                          `👤 *Name:* ${session.data.name}\n` +
                          `📞 *Phone:* ${session.data.phone}\n` +
                          `⚽ *Sport:* ${session.data.sport} (${session.data.court})\n` +
                          `📅 *Date:* ${session.data.date}\n` +
                          `⏰ *Time:* ${session.data.slot} (for ${session.data.duration})\n\n` +
                          `Our team will confirm your slot shortly. Thank you!`;

          await sendTextMessage(phoneNumberId, from, summary);
          
          // Reset session after completion
          userSessions.delete(from);
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

// 1. Send Text
async function sendTextMessage(phoneId: string, to: string, text: string) {
  await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } })
  });
}

// 2. Send Buttons (Max 3 buttons)
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

// 3. Send List Menu (Up to 10 options)
async function sendListMessage(phoneId: string, to: string, text: string, buttonText: string, sections: any[]) {
  await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to, type: "interactive",
      interactive: { type: "list", body: { text }, action: { button: buttonText, sections } }
    })
  });
}