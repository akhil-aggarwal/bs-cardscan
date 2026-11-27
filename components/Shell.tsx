"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useApp } from "./AppProvider";
import { effectiveEx, exName } from "@/lib/leads";

const TABS = [
  { href: "/", label: "Scan card" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/settings", label: "Settings" },
];

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { leads, offline, settings } = useApp();
  return (
    <>
      <header className="top">
        <div className="tbar">
          <h1>Card Scanner<small>Now: {exName(effectiveEx(settings), settings)}</small></h1>
          <div className="count"><span className="num">{leads.length}</span><small>cards</small></div>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} aria-current={path === t.href ? "page" : undefined}>{t.label}</Link>
          ))}
        </nav>
      </header>
      {offline && <p className="offline">No connection — new leads are kept on this phone and will upload when the internet is back.</p>}
      {children}
    </>
  );
}
