"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function AdminPage() {
  const router = useRouter();

  const [bookings, setBookings] = useState<any[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<any[]>([]);
const [todaySlots, setTodaySlots] = useState(0);
const [tomorrowSlots, setTomorrowSlots] = useState(0);

const [showManageSlots, setShowManageSlots] = useState(false);

const [slotDate, setSlotDate] = useState("");
const [slotTime, setSlotTime] = useState("");
const [slotReason, setSlotReason] = useState("MAINTENANCE");
const [slotDuration, setSlotDuration] = useState(60);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
  };

  const today = formatDate(new Date());

  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);

  const tomorrow = formatDate(tomorrowDate);

  useEffect(() => {
    const loggedIn = localStorage.getItem("adminLoggedIn");

    if (loggedIn !== "true") {
      router.push("/admin/login");
      return;
    }

    loadBookings();
  }, [router]);

  const loadBookings = async () => {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .gte("booking_date", today)
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      console.log(error);
      return;
    }

    setBookings(data || []);
const { data: blockedData } = await supabase
  .from("blocked_slots")
  .select("*")
  .order("booking_date", { ascending: true })
  .order("start_time", { ascending: true });

setBlockedSlots(blockedData || []);
    const todaysBookings =
      data?.filter(
        (booking) =>
          booking.booking_date?.split("T")[0] === today
      ) || [];

    const tomorrowsBookings =
      data?.filter(
        (booking) =>
          booking.booking_date?.split("T")[0] === tomorrow
      ) || [];

    setTodaySlots(todaysBookings.length);
    setTomorrowSlots(tomorrowsBookings.length);
  };
  const saveBlockedSlot = async () => {
  if (!slotDate || !slotTime) {
    alert("Please select date and time");
    return;
  }

  const { error } = await supabase
  .from("blocked_slots")
  .insert([
    {
      booking_date: slotDate,
      start_time: slotTime,
      duration_minutes: slotDuration,
      reason: slotReason,
    },
  ]);

  if (error) {
    alert(error.message);
    return;
  }

  alert("✅ Slot saved");

  setSlotDate("");
setSlotTime("");
setSlotDuration(60);
setSlotReason("MAINTENANCE");
  setShowManageSlots(false);
};
const deleteBlockedSlot = async (id: number) => {
  const confirmed = confirm(
    "Delete this blocked slot?"
  );

  if (!confirmed) return;

  const { error } = await supabase
    .from("blocked_slots")
    .delete()
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  loadBookings();
};

  const totalRevenue = bookings.reduce(
    (sum, booking) => sum + (booking.advance_amount || 0),
    0
  );

  const totalBalance = bookings.reduce(
    (sum, booking) => sum + (booking.balance_amount || 0),
    0
  );

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-4xl font-bold mb-8 text-center text-green-700">
        🏟️ SMES Turf Admin Dashboard
      </h1>

      <div className="grid md:grid-cols-5 gap-4 mb-8">
        <div className="bg-green-700 text-white p-6 rounded-xl shadow">
          <h3 className="text-sm">Total Bookings</h3>
          <p className="text-3xl font-bold">{bookings.length}</p>
        </div>

        <div className="bg-blue-700 text-white p-6 rounded-xl shadow">
          <h3 className="text-sm">Today's Slots</h3>
          <p className="text-3xl font-bold">{todaySlots}</p>
        </div>

        <div className="bg-indigo-700 text-white p-6 rounded-xl shadow">
          <h3 className="text-sm">Tomorrow's Slots</h3>
          <p className="text-3xl font-bold">{tomorrowSlots}</p>
        </div>

        <div className="bg-yellow-600 text-white p-6 rounded-xl shadow">
          <h3 className="text-sm">Revenue Collected</h3>
          <p className="text-3xl font-bold">₹{totalRevenue}</p>
        </div>

        <div className="bg-red-600 text-white p-6 rounded-xl shadow">
          <h3 className="text-sm">Pending Balance</h3>
          <p className="text-3xl font-bold">₹{totalBalance}</p>
        </div>
      </div>

      <div className="flex gap-4 mb-6">
  <button
    className="bg-purple-700 text-white px-6 py-3 rounded-lg font-bold shadow-lg border-2 border-purple-900"
    onClick={() => setShowManageSlots(true)}
  >
    ⚙️ MANAGE SLOTS
  </button>
</div>
{showManageSlots && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-white p-6 rounded-xl w-[400px] shadow-xl">

      <h2 className="text-2xl font-bold mb-4 text-black">
        Manage Slots
      </h2>

      <input
        type="date"
        value={slotDate}
        onChange={(e) => setSlotDate(e.target.value)}
        className="w-full border p-3 rounded mb-3 text-black"
      />

      <input
        type="time"
        value={slotTime}
        onChange={(e) => setSlotTime(e.target.value)}
        className="w-full border p-3 rounded mb-3 text-black"
      />
<select
  value={slotDuration}
  onChange={(e) => setSlotDuration(Number(e.target.value))}
  className="w-full border p-3 rounded mb-3 text-black"
>
  <option value={60}>60 Minutes</option>
  <option value={90}>90 Minutes</option>
  <option value={120}>120 Minutes</option>
</select>
      <select
        value={slotReason}
        onChange={(e) => setSlotReason(e.target.value)}
        className="w-full border p-3 rounded mb-4 text-black"
      >
        <option value="MAINTENANCE">Maintenance</option>
        <option value="TOURNAMENT">Tournament</option>
        <option value="OFFLINE BOOKING">Offline Booking</option>
      </select>

      <div className="flex gap-3">
        <button
          onClick={saveBlockedSlot}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          Save
        </button>

        <button
          onClick={() => setShowManageSlots(false)}
          className="bg-gray-500 text-white px-4 py-2 rounded"
        >
          Cancel
        </button>
      </div>

    </div>
  </div>
)}

      <div className="bg-white rounded-xl shadow-lg overflow-x-auto">
        <table className="w-full">
          <thead className="bg-green-700 text-white">
            <tr>
              <th className="p-4 text-left">Name</th>
              <th className="p-4 text-left">Phone</th>
              <th className="p-4 text-left">Date</th>
              <th className="p-4 text-left">Time</th>
<th className="p-4 text-left">Duration</th>
<th className="p-4 text-left">Sport</th>
<th className="p-4 text-left">Type</th>
<th className="p-4 text-left">Total</th>
              <th className="p-4 text-left">Advance</th>
              <th className="p-4 text-left">Balance</th>
              <th className="p-4 text-left">Status</th>
            </tr>
          </thead>

          <tbody>
            {bookings.map((booking) => {
              const bookingDate =
                booking.booking_date?.split("T")[0];

              let rowColor = "bg-white";

if (bookingDate === today) {
  rowColor = "bg-green-100";
} else if (bookingDate === tomorrow) {
  rowColor = "bg-yellow-100";
}

              return (
                <tr
  key={booking.id}
  className={`${rowColor} border-b text-black`}
>
                  <td className="p-4 font-medium">
                    {booking.customer_name}
                  </td>

                  <td className="p-4">{booking.phone}</td>

                  <td className="p-4">
                    {bookingDate}

                    {bookingDate === today && (
                      <span className="ml-2 bg-green-600 text-white px-2 py-1 rounded text-xs">
                        TODAY
                      </span>
                    )}

                    {bookingDate === tomorrow && (
                      <span className="ml-2 bg-yellow-500 text-white px-2 py-1 rounded text-xs">
                        TOMORROW
                      </span>
                    )}
                  </td>

                  <td className="p-4">{booking.start_time}</td>

<td className="p-4">
  {booking.duration_minutes || 60} mins
</td>

<td className="p-4 capitalize">
  {booking.sport}
</td>

<td className="p-4">
  <span
    className={`px-3 py-1 rounded-full text-sm font-semibold ${
      booking.booking_type === "Half Court"
        ? "bg-blue-100 text-blue-700"
        : "bg-purple-100 text-purple-700"
    }`}
  >
    {booking.booking_type || "Full Court"}
  </span>
</td>

<td className="p-4 font-semibold">
  ₹{booking.total_amount}
</td>

                  <td className="p-4 text-green-700 font-semibold">
                    ₹{booking.advance_amount || 0}
                  </td>

                  <td className="p-4 text-red-700 font-semibold">
                    ₹{booking.balance_amount || 0}
                  </td>

                  <td className="p-4">
                    <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">
                      {booking.payment_status || "Pending"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
</div>

<div className="bg-white rounded-xl shadow-lg mt-8 overflow-x-auto">
  <h2 className="text-2xl font-bold p-4 text-black">
    🚫 Blocked Slots
  </h2>

  <table className="w-full">
    <thead className="bg-red-600 text-white">
      <tr>
        <th className="p-4 text-left">Date</th>
        <th className="p-4 text-left">Time</th>
        <th className="p-4 text-left">Duration</th>
        <th className="p-4 text-left">Reason</th>
<th className="p-4 text-left">Action</th>
      </tr>
    </thead>

    <tbody>
      {blockedSlots.map((slot) => (
        <tr
          key={slot.id}
          className="border-b text-black"
        >
          <td className="p-4">
            {slot.booking_date}
          </td>

          <td className="p-4">
            {slot.start_time}
          </td>

          <td className="p-4">
            {slot.duration_minutes || 60} mins
          </td>

          <td className="p-4">
  {slot.reason}
</td>

<td className="p-4">
  <button
    onClick={() => deleteBlockedSlot(slot.id)}
    className="bg-red-600 text-white px-3 py-1 rounded"
  >
    🗑 Delete
  </button>
</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>

</main>
  );
}