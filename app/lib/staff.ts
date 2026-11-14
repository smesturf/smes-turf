import { supabase } from "./supabase";

export type StaffRole = "admin" | "subadmin" | "coach";

export interface StaffInfo {
  name: string; // display name shown everywhere, e.g. "Ravi"
  username: string; // what they type on the login screen
  role: StaffRole;
}

export const ROLE_LABEL: Record<StaffRole, string> = {
  admin: "Admin",
  subadmin: "Sub-Admin",
  coach: "Coach",
};

/** "Ravi Kumar" -> "ravi.kumar" */
export const usernameSlug = (username: string) =>
  username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");

/** The shared login account of each role (same password for everyone in that role). */
export const ROLE_EMAIL: Record<StaffRole, string> = {
  admin: "sports+admin@smesturf.com",
  subadmin: "sports+subadmin@smesturf.com",
  coach: "sports+coach@smesturf.com",
};

const STORE_KEY = "smes_staff_name";

/** "ravi kumar" -> "Ravi Kumar" */
export const prettyName = (name: string) =>
  name.trim().replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Remember (in this browser) the name typed at login. */
export function setStoredStaff(name: string) {
  try { localStorage.setItem(STORE_KEY, prettyName(name)); } catch {}
}
export function clearStoredStaff() {
  try { localStorage.removeItem(STORE_KEY); } catch {}
}

/** The person using this browser: role comes from the shared account they logged in with, name from login. */
export async function getCurrentStaff(): Promise<StaffInfo | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const role = (Object.keys(ROLE_EMAIL) as StaffRole[]).find(
    (r) => ROLE_EMAIL[r] === (user.email || "").toLowerCase()
  );
  if (!role) return null;
  let name: string | null = null;
  try { name = localStorage.getItem(STORE_KEY); } catch {}
  if (!name) return null;
  return { name, username: usernameSlug(name), role };
}

/** Use before any money action: we always need to know WHO is doing it. */
export async function requireStaff(): Promise<StaffInfo | null> {
  const staff = await getCurrentStaff();
  if (!staff) {
    alert("⚠️ Your staff profile was not found, so this payment cannot be recorded. Please log out and log in again, or ask the admin to add you.");
  }
  return staff;
}

/** Permanent audit trail: one row per payment action (never overwritten). */
export async function logPayment(entry: {
  staff: StaffInfo;
  kind: "booking_balance" | "booking_advance" | "booking_reset" | "student_fee" | "student_fee_removed";
  amount: number;
  method?: string | null;
  bookingId?: string | number | null;
  studentId?: string | null;
  monthYear?: string | null;
  note?: string | null;
}) {
  const { error } = await supabase.from("payment_log").insert([
    {
      kind: entry.kind,
      amount: entry.amount,
      method: entry.method ?? null,
      booking_id: entry.bookingId != null ? String(entry.bookingId) : null,
      student_id: entry.studentId ?? null,
      month_year: entry.monthYear ?? null,
      note: entry.note ?? null,
      collected_by: entry.staff.name,
      collected_by_role: entry.staff.role,
    },
  ]);
  if (error) console.log("payment_log insert failed:", error.message);
}