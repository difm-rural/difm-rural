import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://ruralconnections.nz"),
  title: {
    default: "Rural Connections | Local rural help, connected",
    template: "%s | Rural Connections",
  },
  description:
    "Find practical local help for farms, lifestyle blocks and rural properties across New Zealand—or offer the skills your community needs.",
  applicationName: "Rural Connections",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_NZ",
    siteName: "Rural Connections",
    title: "Local rural help, connected",
    description:
      "A rural marketplace for jobs, services and trusted local know-how.",
    images: [
      {
        url: "/og.png",
        width: 1536,
        height: 1024,
        alt: "Rural Connections — local rural help, connected",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Rural Connections",
    description:
      "Find practical local help—or offer the skills your community needs.",
    images: ["/og.png"],
  },
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
