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
  existingBookings: BookingData[], // Bookings for current day
  nextDayBookings: BookingData[],  // Bookings for next day (new!)
  blockedSlots: BookingData[] = []
) => {
  const selectedStart = timeToMinutes(selectedStartTime12h);
  const selectedEnd = selectedStart + Number(durationMinutes);

  // Helper: Returns true if the session spans into the next day
  const isCrossDay = selectedEnd > (24 * 60);

  const isOverlapping = (item: BookingData, isNextDay: boolean) => {
    if (!item.start_time) return false;
    const [hours, minutes] = item.start_time.substring(0, 5).split(":").map(Number);
    const itemStart = hours * 60 + minutes;
    const itemEnd = itemStart + (item.duration_minutes || 60);
    
    // If checking next day bookings, we ignore time wrap-around logic for the check itself
    // because we have already determined it's a cross-day slot.
    return selectedStart < itemEnd && selectedEnd > itemStart;
  };

  // Logic: Split checks based on whether it is cross-day
  const overlaps = isCrossDay 
    ? [...existingBookings.filter(b => isOverlapping(b, false)), ...nextDayBookings.filter(b => isOverlapping(b, true))]
    : existingBookings.filter(b => isOverlapping(b, false));
    
  const blockedOverlaps = blockedSlots.filter(b => isOverlapping(b, false));

  // ... (Keep the rest of your existing overlap enforcement logic exactly the same) ...
  if (bookingType === "Full Court") {
    if (overlaps.length > 0 || blockedOverlaps.length > 0) {
      return { isAvailable: false, error: "Full Court is not available for this slot.", court: null };
    }
    return { isAvailable: true, error: null, court: "Both Courts" };
  }

  // ... (Half Court logic remains identical) ...
  // ...
};