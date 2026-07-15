export const convert12to24 = (time12: string): string => {
  if (!time12) return "00:00:00";
  const [time, ampm] = time12.split(" ");
  let [hours, minutes] = time.split(":").map(Number);
  if (ampm === "PM" && hours !== 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
};

export const timeToMinutes = (time12: string): number => {
  if (!time12) return 0;
  const [timePart, ampm] = time12.split(" ");
  let [hours, minutes] = timePart.split(":").map(Number);
  if (ampm === "PM" && hours !== 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
};

export const getPrice = (durationStr: string, bookingType: string) => {
  const duration = Number(durationStr);
  if (!duration) return { totalAmount: 0, regularAmount: 0, advanceAmount: 0 };

  let totalAmount = 0;
  if (bookingType === "Half Court") {
    totalAmount = duration === 60 ? 700 : duration === 90 ? 1050 : 1400;
  } else { 
    totalAmount = duration === 60 ? 1200 : duration === 90 ? 1800 : 2400;
  }

  return {
    totalAmount,
    regularAmount: totalAmount * 2,
    advanceAmount: 205, // Includes ₹5 Razorpay Convenience Fee
  };
};

type BookingData = { 
  start_time: string; 
  duration_minutes: number; 
  booking_type?: string; 
  court_number?: string;
};

export const findCourtAvailability = (
  selectedStartTime12h: string,
  durationMinutes: number,
  bookingType: string,
  existingBookings: BookingData[],
  nextDayBookings: BookingData[],
  blockedSlots: BookingData[] = [],
  previousDayBookings: BookingData[] = [],
  previousDayBlockedSlots: BookingData[] = [],
  nextDayBlockedSlots: BookingData[] = []
) => {
  const selectedStart = timeToMinutes(selectedStartTime12h);
  const selectedEnd = selectedStart + Number(durationMinutes);

  // Use one continuous timeline for prior, current, and next dates.
  const isOverlapping = (item: BookingData, dayOffsetMinutes: number) => {
    if (!item.start_time) return false;
    const [hours, minutes] = item.start_time.substring(0, 5).split(":").map(Number);
    const itemStart = hours * 60 + minutes + dayOffsetMinutes;
    const itemEnd = itemStart + (item.duration_minutes || 60);
    return selectedStart < itemEnd && selectedEnd > itemStart;
  };

  const overlaps = [
    ...previousDayBookings.filter((booking) => isOverlapping(booking, -24 * 60)),
    ...existingBookings.filter((booking) => isOverlapping(booking, 0)),
    ...nextDayBookings.filter((booking) => isOverlapping(booking, 24 * 60)),
  ];

  const blockedOverlaps = [
    ...previousDayBlockedSlots.filter((slot) => isOverlapping(slot, -24 * 60)),
    ...blockedSlots.filter((slot) => isOverlapping(slot, 0)),
    ...nextDayBlockedSlots.filter((slot) => isOverlapping(slot, 24 * 60)),
  ];

  if (bookingType === "Full Court") {
    if (overlaps.length > 0 || blockedOverlaps.length > 0) {
      return { isAvailable: false, error: "Full Court is not available for this slot.", court: null };
    }
    return { isAvailable: true, error: null, court: "Both Courts" };
  }

  const occupiedHalves = [...overlaps, ...blockedOverlaps];

  if (occupiedHalves.some((booking) =>
    booking.booking_type === "Full Court" ||
    booking.court_number === "Full Court" ||
    booking.court_number === "Both Courts"
  )) {
    return { isAvailable: false, error: "Half Court is not available for this slot.", court: null };
  }

  const court1Taken = occupiedHalves.some((booking) => booking.court_number === "Court 1");
  const court2Taken = occupiedHalves.some((booking) => booking.court_number === "Court 2");

  if (!court1Taken) return { isAvailable: true, error: null, court: "Court 1" };
  if (!court2Taken) return { isAvailable: true, error: null, court: "Court 2" };

  return { isAvailable: false, error: "Half Court is not available for this slot.", court: null };
};
