import { Metadata } from "next";

export const metadata: Metadata = {
  title: "System Gateway | SMES Turf",
  description: "Secure Admin Gateway",
  manifest: "/manifest-staff.json", // 👈 This forces this page to use the staff app settings!
};

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}