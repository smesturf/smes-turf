import { Metadata } from "next";

export const metadata: Metadata = {
  title: "System Gateway | SMES Turf",
  description: "Secure Admin Gateway",
  manifest: "/manifest-staff.json",
  appleWebApp: {
    capable: true,
    title: "SMES Staff",
    statusBarStyle: "black-translucent",
  },
};

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}