import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import ToastContainer from "@/components/Toast";
import ThemeProvider from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "FinTracker - Spending & Investment Tracker",
  description:
    "Track your Barclays spending, eToro investments, and Standard Life retirement fund in one place.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FinTracker",
  },
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <Nav />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">{children}</main>
          <ToastContainer />
        </ThemeProvider>
      </body>
    </html>
  );
}
