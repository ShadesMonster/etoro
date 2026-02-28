"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/spending", label: "Spending" },
  { href: "/investments", label: "Investments" },
  { href: "/retirement", label: "Retirement" },
  { href: "/upload", label: "Upload" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-[var(--card-border)] bg-[var(--card)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="text-lg font-bold text-white">
            FinTracker
          </Link>
          <div className="flex gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  pathname === link.href
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--muted)] hover:text-white hover:bg-white/5"
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
