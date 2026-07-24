import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const {
      phone,
      customerName,
      bookingId,
      bookingRef,
      sport,
      court,
      bookingDate,
      startTime,
      endTime,
      totalAmount,
      advanceAmount,
      balanceAmount,
    } = await req.json();

    // 1. Clean and format the phone number (Assuming India +91)
    let formattedPhone = phone.replace(/\D/g, "");
    if (formattedPhone.length === 10) {
      formattedPhone = `91${formattedPhone}`;
    }

    // 2. Fetch credentials from environment variables
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID; // Your ID: 115905593967538

    if (!token || !phoneId) {
      return NextResponse.json(
        { error: "Missing WhatsApp API credentials in environment variables." },
        { status: 500 }
      );
    }

    // 3. Construct the payload for Meta API using Numbered Parameters (Strict Order)
    const payload = {
      messaging_product: "whatsapp",
      to: formattedPhone,
      type: "template",
      template: {
        name: "smes_turf", // Ensure this matches your Meta template name exactly
        language: {
          code: "en_US", // Update to "en" if you selected English (UK/Default) instead of English (US)
        },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: customerName },                             // Maps to {{1}}
              { type: "text", text: bookingDate },                              // Maps to {{2}}
              { type: "text", text: `${startTime} to ${endTime}` },             // Maps to {{3}}
              { type: "text", text: `${sport} (${court})` },                    // Maps to {{4}}
              { type: "text", text: String(bookingId) },                        // Maps to {{5}}
              { type: "text", text: bookingRef || "N/A" },                      // Maps to {{6}}
              { type: "text", text: String(totalAmount) },                      // Maps to {{7}}
              { type: "text", text: String(advanceAmount || 0) },               // Maps to {{8}}
              { type: "text", text: String(balanceAmount || 0) },               // Maps to {{9}}
            ],
          },
        ],
      },
    };

    // 4. Send the request to Meta's Graph API
    const response = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    // 5. Handle Meta API responses
    if (!response.ok) {
      console.error("WhatsApp API Error:", data);
      return NextResponse.json(
        { error: data.error?.message || "Failed to send WhatsApp message" },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true, messageId: data.messages[0].id });
    
  } catch (error: any) {
    console.error("Server Error in WhatsApp Route:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}