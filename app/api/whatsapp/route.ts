import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Destructure the 9 exact variables required for the 'smes_turf' template
    // plus the customer's phone number
    const {
      customerPhone,
      customerName,
      date,
      time,
      sport,
      bookingId,
      referenceId,
      totalAmount,
      advanceAmount,
      balanceAmount,
    } = body;

    // 1. Pull Environment Variables (Matches your Vercel exactly)
    const metaPhoneId = process.env.META_PHONE_NUMBER_ID;
    const metaToken = process.env.META_ACCESS_TOKEN;
    const whapiToken = process.env.WHAPI_TOKEN;
    const adminNumber = process.env.ADMIN_WHATSAPP_NUMBER;
    const ownerNumber = process.env.OWNER_WHATSAPP_NUMBER;

    if (!metaPhoneId || !metaToken || !whapiToken) {
      console.error("Missing required environment variables for WhatsApp APIs.");
      return NextResponse.json({ error: "Server Configuration Error" }, { status: 500 });
    }

    // 2. Format Customer Phone Number for Meta (E.164 standard)
    // Strips any spaces/dashes and ensures the '91' country code is prefixed
    let formattedCustomerPhone = customerPhone.replace(/\D/g, "");
    if (formattedCustomerPhone.length === 10) {
      formattedCustomerPhone = `91${formattedCustomerPhone}`;
    }

    // ==========================================
    // 3. META CLOUD API LOGIC (Customer Template)
    // ==========================================
    const metaUrl = `https://graph.facebook.com/v20.0/${metaPhoneId}/messages`;
    const metaPayload = {
      messaging_product: "whatsapp",
      to: formattedCustomerPhone,
      type: "template",
      template: {
        name: "smes_turf",
        language: { code: "en" }, // Matches the "English" language setting in your Meta dashboard
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: customerName || "Guest" }, // 1. Name
              { type: "text", text: date },                    // 2. Date
              { type: "text", text: time },                    // 3. Time
              { type: "text", text: sport },                   // 4. Sport/Court
              { type: "text", text: bookingId },               // 5. Booking ID
              { type: "text", text: referenceId },             // 6. Reference ID
              { type: "text", text: String(totalAmount) },     // 7. Total
              { type: "text", text: String(advanceAmount) },   // 8. Advance
              { type: "text", text: String(balanceAmount) },   // 9. Balance
            ],
          },
        ],
      },
    };

    const sendMetaMessage = fetch(metaUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${metaToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(metaPayload),
    });

    // ==========================================
    // 4. WHAPI LOGIC (Admin & Owner Alerts)
    // ==========================================
    const adminMessageText = `*New Booking Alert (SMES Turf)* 🏟️\n\n*Name:* ${customerName}\n*Date:* ${date}\n*Time:* ${time}\n*Sport/Court:* ${sport}\n*Total:* ₹${totalAmount}\n*Advance:* ₹${advanceAmount}\n*Balance:* ₹${balanceAmount}`;
    
    // Reusable function to send a standard text via Whapi
    const sendWhapiMessage = async (phone: string | undefined) => {
      if (!phone) return null;
      
      // Ensure number is digits only and appends the standard Whapi WhatsApp extension
      const cleanPhone = phone.replace(/\D/g, ""); 
      
      return fetch("https://panel.whapi.cloud/messages/text", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${whapiToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          typing_time: 0,
          to: `${cleanPhone}@s.whatsapp.net`, 
          body: adminMessageText
        })
      });
    };

    // ==========================================
    // 5. EXECUTE ALL REQUESTS IN PARALLEL & CATCH ERRORS
    // ==========================================
    
    // We wrap the Meta fetch in a helper to parse the exact success/failure from Meta
    const handleMetaRequest = async () => {
      const response = await sendMetaMessage;
      const data = await response.json();
      
      if (!response.ok) {
        // If Meta rejected it (e.g., 400 Bad Request), throw the exact error message
        throw new Error(data.error?.message || "Unknown Meta API Error");
      }
      return data; // Success! Contains the Meta message ID
    };

    const [metaResponse, adminResponse, ownerResponse] = await Promise.allSettled([
      handleMetaRequest(),
      sendWhapiMessage(adminNumber),
      sendWhapiMessage(ownerNumber)
    ]);

    // 6. BUILD THE FINAL STATUS REPORT
    const isMetaSuccess = metaResponse.status === "fulfilled";
    const metaDetails = isMetaSuccess 
      ? metaResponse.value 
      : metaResponse.reason.message;

    if (!isMetaSuccess) {
      console.error("Meta Template Failed to Send:", metaDetails);
    }

    // Return the exact status back to your frontend so you can show a toast/alert
    return NextResponse.json({ 
      success: true, // The API route itself ran successfully
      metaSent: isMetaSuccess,
      metaError: isMetaSuccess ? null : metaDetails,
      message: isMetaSuccess 
        ? "All notifications sent successfully." 
        : "Internal alerts sent, but customer WhatsApp failed."
    });

  } catch (error) {
    console.error("WhatsApp Route Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}