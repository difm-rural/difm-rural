import {NavigationFeedback} from '@/components/navigation-feedback'
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Rural Connections — Web console",
    template: "%s | Rural Connections",
  },
  description:
    "Post jobs, discover local listings, and manage messages, bookings and your Rural Connections profile.",
  applicationName: "Rural Connections",
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
      <body><NavigationFeedback>{children}</NavigationFeedback></body>
    </html>
  );
}
