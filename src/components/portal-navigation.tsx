"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, ClipboardList, LogOut, Menu, Package, UserRound, X } from "lucide-react";

const navigationItems = [
  { href: "/portal", label: "My repairs", icon: ClipboardList },
  { href: "/portal/equipment", label: "Equipment", icon: Package },
  { href: "/portal/notifications", label: "Notifications", icon: Bell },
  { href: "/portal/account", label: "Account", icon: UserRound },
];

function isCurrentPath(pathname: string, href: string) {
  return href === "/portal" ? pathname === href : pathname.startsWith(href);
}

export default function PortalNavigation() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="border-b border-line bg-paper text-ink">
      <div className="relative mx-auto flex max-w-6xl items-center gap-3 px-5 py-3 sm:px-8">
        <Link href="/portal" className="flex shrink-0 items-center" aria-label="VacTech customer portal">
          <Image alt="Pfeiffer Vacuum, part of the Busch Group" className="h-10 w-auto" height={131} priority src="/pfeiffer-vacuum-logo.png" width={320} />
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <form action="/api/auth/logout" method="post">
            <button className="hidden items-center gap-2 px-3 py-2 text-sm font-bold text-muted hover:text-brand sm:flex"><LogOut size={15} /> Sign out</button>
          </form>
          <button aria-controls="portal-menu" aria-expanded={isMenuOpen} className="grid size-10 place-items-center border border-line text-muted hover:border-brand hover:text-brand" onClick={() => setIsMenuOpen((open) => !open)} title={isMenuOpen ? "Close menu" : "Open menu"} type="button">
            {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
            <span className="sr-only">{isMenuOpen ? "Close menu" : "Open menu"}</span>
          </button>
        </div>
        <nav aria-label="Customer portal" className={`${isMenuOpen ? "grid" : "hidden"} absolute right-5 top-full z-20 mt-2 w-64 gap-1 border border-line bg-paper p-2 shadow-xl sm:right-8`} id="portal-menu">
          {navigationItems.map(({ href, label, icon: Icon }) => {
            const current = isCurrentPath(pathname, href);
            return (
              <Link
                aria-current={current ? "page" : undefined}
                className={`flex items-center gap-2 border-l-2 px-3 py-2.5 text-sm font-bold transition-colors ${current ? "border-danger bg-surface text-ink" : "border-transparent text-muted hover:bg-surface hover:text-brand"}`}
                href={href}
                key={href}
                onClick={() => setIsMenuOpen(false)}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
          <form action="/api/auth/logout" className="border-t border-line sm:hidden" method="post">
            <button className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-bold text-muted hover:bg-surface hover:text-brand"><LogOut size={16} /> Sign out</button>
          </form>
        </nav>
      </div>
    </header>
  );
}