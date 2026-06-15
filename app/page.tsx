"use client";

import { useState } from "react";
import { supabase } from "./lib/supabase";


export default function Home() {

const [name, setName] = useState("");

const [phone, setPhone] = useState("");

const [sport, setSport] = useState("Football");

const [bookingDate, setBookingDate] = useState("");

const [startTime, setStartTime] = useState("06:00 AM");

const [duration, setDuration] = useState("60");
const [bookingType, setBookingType] = useState("Full Court");
const [bookedSlots, setBookedSlots] = useState<string[]>([]);


const totalAmount =
  bookingType === "Half Court"
    ? duration === "60"
      ? 750
      : duration === "90"
      ? 1125
      : 1500
    : duration === "60"
    ? 1250
    : duration === "90"
    ? 1875
    : 2500;

const advanceAmount = Math.round(totalAmount * 0.1);
const allSlots = [
  "06:00 AM","06:30 AM","07:00 AM","07:30 AM",
  "08:00 AM","08:30 AM","09:00 AM","09:30 AM",
  "10:00 AM","10:30 AM","11:00 AM","11:30 AM",
  "12:00 PM","12:30 PM","01:00 PM","01:30 PM",
  "02:00 PM","02:30 PM","03:00 PM","03:30 PM",
  "04:00 PM","04:30 PM","05:00 PM","05:30 PM",
  "06:00 PM","06:30 PM","07:00 PM","07:30 PM",
  "08:00 PM","08:30 PM","09:00 PM","09:30 PM",
  "10:00 PM","10:30 PM","11:00 PM","11:30 PM"
];

const loadBookedSlots = async (date: string) => {
  const { data, error } = await supabase
    .from("bookings")
    .select("start_time, duration_minutes")
    .eq("booking_date", date);

  if (error) {
    console.log(error);
    return;
  }

  if (data) {
  const blocked: string[] = [];

  data.forEach((booking: any) => {
    const time = booking.start_time.substring(0, 5);
    const [h, m] = time.split(":");

    let minutes = Number(h) * 60 + Number(m);

    const slotsToBlock = booking.duration_minutes / 30;

    for (let i = 0; i < slotsToBlock; i++) {
      const current = minutes + i * 30;

      const hour24 = Math.floor(current / 60);
      const minute = current % 60;

      const ampm = hour24 >= 12 ? "PM" : "AM";
      const hour12 = hour24 % 12 || 12;

      blocked.push(
        `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${ampm}`
      );
    }
  });

  setBookedSlots(blocked);
}
};
const openRazorpay = async () => {
  try {
    if (!name || !phone || !bookingDate) {
      alert("Please fill all fields");
      return;
    }

    const response = await fetch("/api/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: advanceAmount,
      }),
    });

    const order = await response.json();

    const options = {
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      name: "SMES Turf",
      description: "Advance Booking Payment",
      order_id: order.id,

      handler: async function (response: any) {
  



  await handleBooking(response);
},

      prefill: {
        name: name,
        contact: phone,
      },
    };

    const razor = new (window as any).Razorpay(options);
    razor.open();
  } catch (error) {
    console.error(error);
    alert("Failed to open payment gateway");
  }
};


const handleBooking = async (paymentData?: any) => {
  

  if (!name || !phone || !bookingDate) {
    alert("Please fill all fields");
    return;
  }

  const { data: existingBooking, error: checkError } = await supabase
    .from("bookings")
    .select("*")
    .eq("booking_date", bookingDate)
    .eq("start_time", startTime);

  if (checkError) {
    alert(checkError.message);
    return;
  }

  if (existingBooking && existingBooking.length > 0) {
    alert("❌ This slot is already booked.");
    return;
  }

  const { error } = await supabase.from("bookings").insert([
{
  customer_name: name,
  phone: phone,

  booking_type: bookingType,

  sport: sport.toLowerCase(),
  booking_date: bookingDate,
  start_time: startTime,
  duration_minutes: Number(duration),
  total_amount: totalAmount,

  advance_amount: advanceAmount,
  balance_amount: totalAmount - advanceAmount,

  razorpay_order_id: paymentData?.razorpay_order_id,
  razorpay_payment_id: paymentData?.razorpay_payment_id,
  payment_status: "paid",
},
]);

  if (error) {
    console.error(error);
    alert(error.message);
    return;
  }

  const balanceAmount = totalAmount - advanceAmount;

const message =
`🏟️ SMES Turf Booking Confirmed

Name: ${name}
Date: ${bookingDate}
Time: ${startTime}
Sport: ${sport}

💰 Total Amount: ₹${totalAmount}
✅ Advance Paid: ₹${advanceAmount}
💳 Balance Due: ₹${balanceAmount}

Thank you for choosing SMES Turf!`;

window.open(
  `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
  "_blank"
);

alert("✅ Payment Successful & Booking Saved");

  setName("");
  setPhone("");
  setBookingDate("");
  setStartTime("06:00 AM");
  setDuration("60");
};

return (

<main className="min-h-screen bg-green-950 text-white">

  <section className="text-center py-20 px-6">

    <h1 className="text-5xl font-bold mb-4">SMES Turf</h1>

    <p className="text-xl mb-6">Where Champions Begin</p>



    <div className="bg-yellow-400 text-black inline-block px-6 py-3 rounded-full font-bold mb-8">

      🎉 Launch Offer: ₹1250 / Hour

    </div>



    <div className="flex flex-col md:flex-row gap-4 justify-center">

      <a

        href="https://wa.me/918453095258"

        className="bg-green-600 px-6 py-3 rounded-lg font-semibold"

      >

        WhatsApp Us

      </a>



      <a

        href="https://maps.google.com/?q=12.329329,76.612008"

        className="bg-blue-600 px-6 py-3 rounded-lg font-semibold"

      >

        Get Directions

      </a>

    </div>

  </section>



  <section className="py-12 px-6 text-center">

    <h2 className="text-3xl font-bold mb-8">Sports Available</h2>



    <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">

      <div className="bg-green-900 p-8 rounded-xl">

        <h3 className="text-2xl font-bold">⚽ Football</h3>

      </div>



      <div className="bg-green-900 p-8 rounded-xl">

        <h3 className="text-2xl font-bold">🏏 Cricket</h3>

      </div>

    </div>

  </section>



  <section className="py-12 px-6">

    <div className="max-w-2xl mx-auto bg-green-900 p-8 rounded-xl">

      <h2 className="text-3xl font-bold mb-6 text-center">

        Book Your Slot

      </h2>



      <div className="space-y-4">

        <input

          type="text"

          placeholder="Full Name"

          value={name}

          onChange={(e) => setName(e.target.value)}

          className="w-full p-3 rounded text-black"

        />



        <input

          type="tel"

          placeholder="Phone Number"

          value={phone}

          onChange={(e) => setPhone(e.target.value)}

          className="w-full p-3 rounded text-black"

        />
        







        <select

          value={sport}

          onChange={(e) => setSport(e.target.value)}

          className="w-full p-3 rounded text-black"

        >

          <option>Football</option>

          <option>Cricket</option>

        </select>
        <select
  value={bookingType}
  onChange={(e) => setBookingType(e.target.value)}
  className="w-full p-3 rounded text-black"
>
  <option value="Half Court">
    Half Court
  </option>

  <option value="Full Court">
    Full Court
  </option>
</select>



        <input
  type="date"
  min={new Date().toISOString().split("T")[0]}
  value={bookingDate}
  onChange={(e) => {
    setBookingDate(e.target.value);
    loadBookedSlots(e.target.value);
  }}
  className="w-full p-3 rounded text-black"
/>



        <select

          value={startTime}

          onChange={(e) => setStartTime(e.target.value)}

          className="w-full p-3 rounded text-black"

        >

          {allSlots
  .filter((slot) => {
    if (bookedSlots.includes(slot)) return false;

    const today = new Date().toISOString().split("T")[0];

    if (bookingDate !== today) return true;

    const now = new Date();

    const currentMinutes =
      now.getHours() * 60 + now.getMinutes();

    const [time, ampm] = slot.split(" ");
    let [hours, minutes] = time.split(":").map(Number);

    if (ampm === "PM" && hours !== 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;

    const slotMinutes = hours * 60 + minutes;

    return slotMinutes > currentMinutes;
  })
  .map((slot) => (
    <option key={slot} value={slot}>
      {slot}
    </option>
  ))}
    

        </select>



        <select

          value={duration}

          onChange={(e) => setDuration(e.target.value)}

          className="w-full p-3 rounded text-black"

        >

          <option value="60">
  60 Minutes - ₹{bookingType === "Half Court" ? 750 : 1250}
</option>

<option value="90">
  90 Minutes - ₹{bookingType === "Half Court" ? 1125 : 1875}
</option>

<option value="120">
  120 Minutes - ₹{bookingType === "Half Court" ? 1500 : 2500}
</option>

        </select>



        <div className="bg-green-800 p-4 rounded">

          <p>Advance Payment: 10%</p>

          <p>Amount to Pay: ₹{advanceAmount}</p>

        </div>



        <button

          type="button"

          onClick={openRazorpay}

          className="w-full bg-yellow-400 text-black font-bold py-3 rounded"

        >

          Book Now

        </button>

      </div>

    </div>

  </section>



  <section className="py-12 px-6 text-center">

    <h2 className="text-3xl font-bold mb-8">Facilities</h2>



    <div className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto">

      <div>✅ Floodlights</div>

      <div>✅ Parking</div>

      <div>✅ Washrooms</div>

      <div>✅ Drinking Water</div>

      <div>✅ Open 24 Hours</div>

    </div>

  </section>



  <section className="py-12 px-6 text-center">

    <h2 className="text-3xl font-bold mb-4">Contact Us</h2>



    <p>📞 8453095258</p>

    <p>📧 sports@smesturf.com</p>

    <p>📍 Mysuru, Karnataka</p>

  </section>

</main>

);

}