"use client";

import { useEffect } from "react";
import { useFinanceStore } from "@/lib/store";

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = useFinanceStore((s) => s.settings?.theme || "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return <>{children}</>;
}
