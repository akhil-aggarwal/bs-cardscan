"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useApp } from "./AppProvider";

const TABS = [
  { href: "/", label: "Scan card" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/settings", label: "Settings" },
];

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { leads, offline } = useApp();
  return (
    <>
      <header className="top">
        <div className="tbar">
          <h1>Card Scanner<small>Indusfood buyer leads</small></h1>
          <div className="count"><span className="num">{leads.length}</span><small>leads</small></div>
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
