import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import ToastContainer from "@/components/Toast";

export const metadata: Metadata = {
  title: "FinTracker - Spending & Investment Tracker",
  description:
    "Track your Barclays spending, eToro investments, and Standard Life retirement fund in one place.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">{children}</main>
        <ToastContainer />
      </body>
    </html>
  );
}
