"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import * as XLSX from "xlsx";

export default function AdminPage() {
  const router = useRouter();

  const [bookings, setBookings] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [blockedSlots, setBlockedSlots] = useState<any[]>([]);
const [todaySlots, setTodaySlots] = useState(0);
const [tomorrowSlots, setTomorrowSlots] = useState(0);
const [monthlyBookings, setMonthlyBookings] = useState(0);
const [monthlyRevenue, setMonthlyRevenue] = useState(0);
const [monthlyAdvance, setMonthlyAdvance] = useState(0);
const [monthlyBalance, setMonthlyBalance] = useState(0);
const [showManageSlots, setShowManageSlots] = useState(false);

const [slotDate, setSlotDate] = useState("");
const adminTimeSlots = Array.from({ length: 48 }, (_, i) => {
  const hours = Math.floor(i / 2);
  const minutes = i % 2 === 0 ? "00" : "30";
  const date = new Date();
  date.setHours(hours);
  date.setMinutes(Number(minutes));

  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
});
const [slotTime, setSlotTime] = useState("");
const [slotReason, setSlotReason] = useState("MAINTENANCE");
const [slotCourt, setSlotCourt] = useState("Full Court");
const [availableCourts, setAvailableCourts] = useState([
  "Full Court",
  "Court 1",
  "Court 2",
]);
const loadAvailableCourts = async (
  date: string,
  time: string
) => {
  const { data } = await supabase
    .from("blocked_slots")
    .select("*")
    .eq("booking_date", date);

  let courts = [
    "Full Court",
    "Court 1",
    "Court 2",
  ];

  const selected = new Date(
    `2000-01-01 ${time}`
  );

  const selectedMinutes =
    selected.getHours() * 60 +
    selected.getMinutes();

  data?.forEach((b: any) => {
    const start = new Date(
      `2000-01-01T${b.start_time}`
    );

    const startMinutes =
      start.getHours() * 60 +
      start.getMinutes();

    const endMinutes =
      startMinutes +
      (b.duration_minutes || 60);

    const overlaps =
      selectedMinutes >= startMinutes &&
      selectedMinutes < endMinutes;

    if (!overlaps) return;

    if (b.court_number === "Court 1") {
      courts = courts.filter(
        (c) =>
          c !== "Court 1" &&
          c !== "Full Court"
      );
    }

    if (b.court_number === "Court 2") {
      courts = courts.filter(
        (c) =>
          c !== "Court 2" &&
          c !== "Full Court"
      );
    }

    if (b.court_number === "Full Court") {
      courts = [];
    }
  });

  setAvailableCourts(courts);
};
const [availableAdminSlots, setAvailableAdminSlots] = useState<string[]>([]);
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

  const bookingsChannel = supabase
    .channel("bookings-realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "bookings",
      },
      () => {
        loadBookings();
      }
    )
    .subscribe();

  const blockedChannel = supabase
    .channel("blocked-slots-realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "blocked_slots",
      },
      () => {
        loadBookings();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(bookingsChannel);
    supabase.removeChannel(blockedChannel);
  };
}, [router]);
useEffect(() => {
  let timeout: NodeJS.Timeout;

  const resetTimer = () => {
    clearTimeout(timeout);

    timeout = setTimeout(() => {
      localStorage.removeItem("adminLoggedIn");
      localStorage.removeItem("adminLoginTime");

      alert("Logged out due to inactivity");

      router.push("/admin/login");
    }, 15 * 60 * 1000);
  };

  window.addEventListener("mousemove", resetTimer);
  window.addEventListener("keypress", resetTimer);
  window.addEventListener("click", resetTimer);

  resetTimer();

  return () => {
    clearTimeout(timeout);

    window.removeEventListener("mousemove", resetTimer);
    window.removeEventListener("keypress", resetTimer);
    window.removeEventListener("click", resetTimer);
  };
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
 const currentMonth = new Date().getMonth() + 1;
const currentYear = new Date().getFullYear();

const thisMonthBookings =
  data?.filter((booking) => {
    const d = new Date(booking.booking_date);

    return (
      d.getMonth() + 1 === currentMonth &&
      d.getFullYear() === currentYear
    );
  }) || [];

setMonthlyBookings(thisMonthBookings.length);

setMonthlyRevenue(
  thisMonthBookings.reduce(
    (sum, b) => sum + (b.total_amount || 0),
    0
  )
);

setMonthlyAdvance(
  thisMonthBookings.reduce(
    (sum, b) => sum + (b.advance_amount || 0),
    0
  )
);

setMonthlyBalance(
  thisMonthBookings.reduce(
    (sum, b) => sum + (b.balance_amount || 0),
    0
  )
);   
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
  const loadAvailableAdminSlots = async (date: string) => {
  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "start_time,duration_minutes,booking_type,court_number"
    )
    .eq("booking_date", date);

  const { data: blocked } = await supabase
    .from("blocked_slots")
    .select(
      "start_time,duration_minutes,court_number"
    )
    .eq("booking_date", date);

  const availableTimes: string[] = [];

  adminTimeSlots.forEach((slot) => {
    const selected = new Date(
      `2000-01-01 ${slot}`
    );

    const selectedMinutes =
      selected.getHours() * 60 +
      selected.getMinutes();

    let court1Available = true;
    let court2Available = true;

    // CHECK BOOKINGS
    bookings?.forEach((b: any) => {
      const start = new Date(
        `2000-01-01T${b.start_time}`
      );

      const startMinutes =
        start.getHours() * 60 +
        start.getMinutes();

      const endMinutes =
        startMinutes +
        (b.duration_minutes || 60);

      const overlaps =
        selectedMinutes >= startMinutes &&
        selectedMinutes < endMinutes;

      if (!overlaps) return;

      if (
        b.booking_type === "Full Court" ||
        b.court_number === "Full Court"
      ) {
        court1Available = false;
        court2Available = false;
      }

      if (b.court_number === "Court 1") {
        court1Available = false;
      }

      if (b.court_number === "Court 2") {
        court2Available = false;
      }
    });

    // CHECK BLOCKED SLOTS
    blocked?.forEach((b: any) => {
      const start = new Date(
        `2000-01-01T${b.start_time}`
      );

      const startMinutes =
        start.getHours() * 60 +
        start.getMinutes();

      const endMinutes =
        startMinutes +
        (b.duration_minutes || 60);

      const overlaps =
        selectedMinutes >= startMinutes &&
        selectedMinutes < endMinutes;

      if (!overlaps) return;

      if (b.court_number === "Full Court") {
        court1Available = false;
        court2Available = false;
      }

      if (b.court_number === "Court 1") {
        court1Available = false;
      }

      if (b.court_number === "Court 2") {
        court2Available = false;
      }
    });

    if (court1Available || court2Available) {
      availableTimes.push(slot);
    }
  });

  setAvailableAdminSlots(availableTimes);
};
  const saveBlockedSlot = async () => {
  if (!slotDate || !slotTime) {
    alert("Please select date and time");
    return;
  }
  const { data: existing } = await supabase
  .from("blocked_slots")
  .select("*")
  .eq("booking_date", slotDate)
  .eq("start_time", slotTime)
  .eq("court_number", slotCourt);

if (existing && existing.length > 0) {
  alert("⚠️ This court is already blocked at that time");
  return;
}

  const { error } = await supabase
  .from("blocked_slots")
  .insert([
    {
  booking_date: slotDate,
  start_time: slotTime,
  duration_minutes: Number(slotDuration),
  reason: slotReason,
  court_number: slotCourt,
}
  ]);

  if (error) {
    alert(error.message);
    return;
  }

  alert("✅ Slot saved");

await loadBookings();
if (slotDate) {
  loadAvailableAdminSlots(slotDate);
}
setSlotDate("");
setSlotTime("");
setSlotDuration(60);
setSlotReason("MAINTENANCE");
setSlotCourt("Full Court");

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

const deleteBooking = async (id: number) => {
  const confirmed = confirm(
    "Cancel this booking?"
  );

  if (!confirmed) return;

  const { error } = await supabase
    .from("bookings")
    .delete()
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  loadBookings();
};

const todaysAdvance = bookings
  .filter((booking) => {
    return (
      booking.created_at?.split("T")[0] === today
    );
  })
  .reduce(
    (sum, booking) =>
      sum + (booking.advance_amount || 0),
    0
  );

const todaysBalance = bookings
  .filter((booking) => {
    return (
      booking.booking_date?.split("T")[0] === today
    );
  })
  .reduce(
    (sum, booking) =>
      sum + (booking.balance_amount || 0),
    0
  );
 const exportToExcel = () => {
  const exportData = bookings.map((booking) => ({
    Name: booking.customer_name,
    Phone: booking.phone,
    Date: booking.booking_date?.split("T")[0],
    Time: booking.start_time,
    Duration: booking.duration_minutes || 60,
    Sport: booking.sport,
    Type: booking.booking_type,
    Court: booking.court_number || "-",
    Total: booking.total_amount,
    Advance: booking.advance_amount,
    Balance: booking.balance_amount,
    Status: booking.payment_status,
  }));

  const totalRevenue = bookings.reduce(
    (sum, booking) => sum + (booking.total_amount || 0),
    0
  );

  const totalAdvance = bookings.reduce(
    (sum, booking) => sum + (booking.advance_amount || 0),
    0
  );

  const totalBalance = bookings.reduce(
    (sum, booking) => sum + (booking.balance_amount || 0),
    0
  );

  const workbook = XLSX.utils.book_new();
  const today = new Date().toISOString().split("T")[0];

  const worksheet = XLSX.utils.aoa_to_sheet([
  ["SMES TURF BOOKING REPORT"],
  [`Export Date: ${new Date().toLocaleString("en-IN")}`],
  [],
  ["Total Bookings", bookings.length],
  ["Total Revenue (₹)", totalRevenue],
  ["Total Advance Collected (₹)", totalAdvance],
  ["Total Pending Balance (₹)", totalBalance],
  [],
  [],
]);

  XLSX.utils.sheet_add_json(
    worksheet,
    exportData,
    {
      origin: "A9",
    }
  );
  // Auto-size columns
worksheet["!cols"] = [
  { wch: 20 }, // Name
  { wch: 15 }, // Phone
  { wch: 15 }, // Date
  { wch: 12 }, // Time
  { wch: 12 }, // Duration
  { wch: 15 }, // Sport
  { wch: 15 }, // Type
  { wch: 15 }, // Court
  { wch: 12 }, // Total
  { wch: 12 }, // Advance
  { wch: 12 }, // Balance
  { wch: 15 }, // Status
];

  XLSX.utils.book_append_sheet(
  workbook,
  worksheet,
  "Bookings"
);

// TODAY SUMMARY
const todayBookings = bookings.filter(
  (booking) =>
    booking.booking_date === today
);

const todayRevenue = todaysAdvance + todaysBalance;
const todayAdvance = todaysAdvance;
const todayBalance = todaysBalance;

const todaySheet = XLSX.utils.aoa_to_sheet([
  ["TODAY'S COLLECTION"],
  [],
  ["Total Bookings", todayBookings.length],
  ["Total Revenue (₹)", todayRevenue],
  ["Advance Collected (₹)", todayAdvance],
  ["Pending Balance (₹)", todayBalance],
]);

XLSX.utils.book_append_sheet(
  workbook,
  todaySheet,
  "Today"
);

// MONTHLY SUMMARY
const monthlySheet = XLSX.utils.aoa_to_sheet([
  ["MONTHLY COLLECTION"],
  [],
  ["Total Bookings", monthlyBookings],
  ["Total Revenue (₹)", monthlyRevenue],
  ["Advance Collected (₹)", monthlyAdvance],
  ["Pending Balance (₹)", monthlyBalance],
]);

XLSX.utils.book_append_sheet(
  workbook,
  monthlySheet,
  "Monthly"
);

XLSX.writeFile(
  workbook,
  `SMES_Bookings_${new Date()
    .toISOString()
    .split("T")[0]}.xlsx`
);
}; 
const handleLogout = () => {
  localStorage.removeItem("adminLoggedIn");
  localStorage.removeItem("adminLoginTime");
  router.push("/admin/login");
};
  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="relative mb-8">
  <h1 className="text-4xl font-bold text-center text-green-700">
    🏟️ SMES Turf Admin Dashboard
  </h1>

  <button
    onClick={handleLogout}
    className="absolute right-0 top-1/2 -translate-y-1/2 bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg font-bold"
  >
    🚪 Logout
  </button>
</div>

      <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
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
          <h3 className="text-sm">Today's Advance </h3>
          <p className="text-3xl font-bold">₹{todaysAdvance}</p>
        </div>

        <div className="bg-red-600 text-white p-6 rounded-xl shadow">
          <h3 className="text-sm"> Today's Balance</h3>
          <p className="text-3xl font-bold">₹{todaysBalance}</p>
                 </div>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="🔍 Search by name, phone or date..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full md:w-96 border p-3 rounded text-black"
        />
      </div>

      <div className="flex gap-4 mb-6">
  <button
    className="bg-purple-700 text-white px-6 py-3 rounded-lg font-bold shadow-lg border-2 border-purple-900"
    onClick={() => setShowManageSlots(true)}
  >
    ⚙️ MANAGE SLOTS
  </button>

  <button
    onClick={exportToExcel}
    className="bg-green-700 text-white px-6 py-3 rounded-lg font-bold shadow-lg border-2 border-green-900"
  >
    📊 EXPORT EXCEL
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
  min={new Date().toISOString().split("T")[0]}
  value={slotDate}
  onChange={(e) => {
  setSlotDate(e.target.value);
  loadAvailableAdminSlots(e.target.value);
}}
  className="w-full border p-3 rounded mb-3 text-black"
/>

            <select
  value={slotTime}
  onChange={(e) => {
  setSlotTime(e.target.value);

  if (slotDate) {
    loadAvailableCourts(
      slotDate,
      e.target.value
    );
  }
}}
  className="w-full border p-3 rounded mb-3 text-black"
>
  <option value="">Select Time</option>

  {availableAdminSlots.map((slot) => (
    <option key={slot} value={slot}>
      {slot}
    </option>
  ))}
</select>

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
  value={slotCourt}
  onChange={(e) => setSlotCourt(e.target.value)}
  className="w-full border p-3 rounded mb-3 text-black"
>
  {availableCourts.length === 0 ? (
    <option value="">
      No Courts Available
    </option>
  ) : (
    availableCourts.map((court) => (
      <option key={court} value={court}>
        {court}
      </option>
    ))
  )}
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
<p className="mb-3 text-gray-700 font-medium">
  Showing {
    bookings.filter((booking) => {
      const search = searchTerm.toLowerCase();

      return (
        booking.customer_name
          ?.toLowerCase()
          .includes(search) ||
        booking.phone
          ?.toLowerCase()
          .includes(search) ||
        booking.booking_date
          ?.toLowerCase()
          .includes(search)
      );
    }).length
  } booking(s)
</p>
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
<th className="p-4 text-left">Court</th>
<th className="p-4 text-left">Total</th>
              <th className="p-4 text-left">Advance</th>
              <th className="p-4 text-left">Balance</th>
<th className="p-4 text-left">Action</th>
            </tr>
          </thead>

          <tbody>
            {bookings
  .filter((booking) => {
    const search = searchTerm.toLowerCase();

    return (
      booking.customer_name
        ?.toLowerCase()
        .includes(search) ||
      booking.phone
        ?.toLowerCase()
        .includes(search) ||
      booking.booking_date
        ?.toLowerCase()
        .includes(search)
    );
  })
  .map((booking) => {
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
  {new Date(bookingDate).toLocaleDateString("en-GB")}

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

<td className="p-4">
  {new Date(
    `2000-01-01T${booking.start_time}`
  ).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })}
</td>

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
<td className="p-4">
  {booking.court_number || "-"}
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
  <button
    onClick={() => deleteBooking(booking.id)}
    className="bg-red-600 text-white px-3 py-1 rounded"
  >
    Cancel
  </button>
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
    <th className="p-4 text-left">Court</th>
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
  {new Date(slot.booking_date).toLocaleDateString("en-GB")}
</td>

<td className="p-4">
  {new Date(
    `2000-01-01T${slot.start_time}`
  ).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })}
</td>

          <td className="p-4">
  {slot.duration_minutes} mins
</td>

<td className="p-4 font-semibold text-blue-700">
  {slot.court_number}
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