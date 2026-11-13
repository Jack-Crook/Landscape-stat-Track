import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Landscape Tracker", template: "%s · Landscape Tracker" },
  description: "Jobs, receipts, profit and GST for a landscaping business",
  applicationName: "Landscape Tracker",
  appleWebApp: { capable: true, title: "Landscape", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const html = (
    <html lang="en-AU" className="h-full">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
  return clerkEnabled() ? <ClerkProvider>{html}</ClerkProvider> : html;
}
