import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Rural Connections — for providers",
    template: "%s | Rural Connections Providers",
  },
  description:
    "Advertise your rural services, grazing, gear, space and goods, and manage enquiries and bookings — the provider side of Rural Connections.",
  applicationName: "Rural Connections Providers",
};

export const viewport: Viewport = {
  themeColor: "#153e30",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-NZ">
      <body>{children}</body>
    </html>
  );
}
