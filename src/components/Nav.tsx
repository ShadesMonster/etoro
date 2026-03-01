"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useFinanceStore } from "@/lib/store";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/spending", label: "Spending" },
  { href: "/investments", label: "Investments" },
  { href: "/retirement", label: "Retirement" },
  { href: "/analytics", label: "Analytics" },
  { href: "/planning", label: "Planning" },
  { href: "/lifeplan", label: "Life Plan" },
  { href: "/tax", label: "Tax" },
  { href: "/upload", label: "Upload" },
  { href: "/banksync", label: "Bank Sync" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  const pathname = usePathname();
  const { settings, updateSettings } = useFinanceStore();
  const theme = settings?.theme || "dark";

  return (
    <nav className="border-b border-[var(--card-border)] bg-[var(--card)] no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="text-lg font-bold text-white">
            FinTracker
          </Link>
          <div className="flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  pathname === link.href
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--muted)] hover:text-white hover:bg-[var(--card-border)]"
                )}
              >
                {link.label}
              </Link>
            ))}
            <button
              onClick={() =>
                updateSettings({ theme: theme === "dark" ? "light" : "dark" })
              }
              className="ml-2 px-2 py-2 rounded-lg text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? "\u2600\uFE0F" : "\uD83C\uDF19"}
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
