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

/**
 * LEGACY: the old shared per-role logins. No longer used to sign in - kept only so older imports
 * still compile. After the move, delete the shared admin and subadmin users in Supabase (the coach one is still used).
 */
export const ROLE_EMAIL: Record<StaffRole, string> = {
  admin: "sports+admin@smesturf.com",
  subadmin: "sports+subadmin@smesturf.com",
  coach: "sports+coach@smesturf.com",
};

/**
 * One login and ONE password per person. The password proves who they are, so nobody types a name.
 * Every password must be different from everyone else's, or the wrong name could be recorded.
 * Create each user in Supabase -> Authentication -> Users with exactly this email.
 */
export interface StaffAccount {
  id: string;
  name: string;
  email: string;
  roles: StaffRole[]; // first one is the default; a person with 2+ roles picks one at login
}

export const STAFF_ACCOUNTS: StaffAccount[] = [
  { id: "abhay", name: "Abhay", roles: ["admin", "subadmin", "coach"], email: "sports+abhay@smesturf.com" },
  { id: "anand", name: "Anand K", roles: ["admin"], email: "sports+anand@smesturf.com" },
  { id: "ullas", name: "Ullas", roles: ["subadmin", "admin"], email: "sports+ullas@smesturf.com" },
  { id: "sandesh", name: "Sandesh", roles: ["subadmin"], email: "sports+sandesh@smesturf.com" },
  { id: "ravi", name: "Ravi", roles: ["subadmin"], email: "sports+ravi@smesturf.com" },
  { id: "coach", name: "Coach", roles: ["coach"], email: "sports+coach@smesturf.com" },
];

export const accountByEmail = (email?: string | null) =>
  STAFF_ACCOUNTS.find((a) => a.email === (email || "").toLowerCase());

const STORE_KEY = "smes_staff_name";
const ACTIVE_ROLE_KEY = "smes_active_role";

/** The role tab the person logged in with (matters for people who have both admin and sub-admin). */
export function setActiveRole(role: StaffRole) {
  try { localStorage.setItem(ACTIVE_ROLE_KEY, role); } catch {}
}

/** "ravi kumar" -> "Ravi Kumar" */
export const prettyName = (name: string) =>
  name.trim().replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Kept only so older imports still compile - names now come from the account, not from typing. */
export function setStoredStaff(name: string) {
  try { localStorage.setItem(STORE_KEY, prettyName(name)); } catch {}
}
export function clearStoredStaff() {
  try { localStorage.removeItem(STORE_KEY); } catch {}
}

/**
 * The person using this browser. The name comes from the account whose password was entered,
 * so it cannot be typed or faked.
 */
export async function getCurrentStaff(): Promise<StaffInfo | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const account = accountByEmail(user.email);
  if (!account) return null;

  // role = the one chosen at login, but only if this person is really allowed to have it
  let role: StaffRole = account.roles[0];
  try {
    const chosen = localStorage.getItem(ACTIVE_ROLE_KEY) as StaffRole | null;
    if (chosen && account.roles.includes(chosen)) role = chosen;
  } catch {}

  return { name: account.name, username: usernameSlug(account.name), role };
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