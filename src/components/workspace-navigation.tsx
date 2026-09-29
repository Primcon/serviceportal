"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Building2, ClipboardList, ExternalLink, FileSpreadsheet, Inbox, LayoutDashboard, LogOut, Menu, Package, ScrollText, UsersRound, Workflow, X } from "lucide-react";

const navigationItems = [
  { href: "/workspace", label: "Overview", icon: LayoutDashboard },
  { href: "/workspace/work-orders", label: "Work orders", icon: ClipboardList },
  { href: "/workspace/equipment", label: "Equipment", icon: Package },
  { href: "/workspace/customers", label: "Customers", icon: Building2 },
  { href: "/workspace/workflow", label: "Workflow", icon: Workflow },
  { href: "/workspace/access-requests", label: "Access requests", icon: Inbox },
  { href: "/workspace/users", label: "Users", icon: UsersRound },
  { href: "/workspace/audit", label: "Audit", icon: ScrollText },
  { href: "/workspace/reports", label: "Reports", icon: FileSpreadsheet },
];

function isCurrentPath(pathname: string, href: string) {
  return href === "/workspace" ? pathname === href : pathname.startsWith(href);
}

export default function WorkspaceNavigation() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="border-b border-line bg-paper text-ink">
      <div className="relative mx-auto flex max-w-7xl items-center gap-3 px-5 py-3 sm:px-8">
        <Link href="/workspace" className="flex shrink-0 items-center" aria-label="VacTech service workspace">
          <Image alt="Pfeiffer Vacuum, part of the Busch Group" className="h-10 w-auto" height={131} priority src="/pfeiffer-vacuum-logo.png" width={320} />
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-1 text-sm">
          <Link className="hidden items-center gap-2 px-3 py-2 font-bold text-muted hover:text-brand sm:flex" href="/portal">
            Customer portal
            <ExternalLink size={15} />
          </Link>
          <form action="/api/auth/logout" method="post">
            <button className="hidden items-center gap-2 px-3 py-2 font-bold text-muted hover:text-brand sm:flex">
              <LogOut size={15} />
              Sign out
            </button>
          </form>
          <button aria-controls="workspace-menu" aria-expanded={isMenuOpen} className="grid size-10 place-items-center border border-line text-muted hover:border-brand hover:text-brand" onClick={() => setIsMenuOpen((open) => !open)} title={isMenuOpen ? "Close menu" : "Open menu"} type="button">
            {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
            <span className="sr-only">{isMenuOpen ? "Close menu" : "Open menu"}</span>
          </button>
        </div>
        <nav aria-label="Service workspace" className={`${isMenuOpen ? "grid" : "hidden"} absolute right-5 top-full z-20 mt-2 w-72 gap-1 border border-line bg-paper p-2 shadow-xl sm:right-8`} id="workspace-menu">
          {navigationItems.map(({ href, label, icon: Icon }) => {
            const current = isCurrentPath(pathname, href);
            return (
              <Link
                aria-current={current ? "page" : undefined}
                className={`flex items-center gap-2 border-l-2 px-3 py-2.5 text-sm font-bold transition-colors ${current ? "border-brand bg-brand-soft text-ink" : "border-transparent text-muted hover:bg-surface hover:text-brand"}`}
                href={href}
                key={href}
                onClick={() => setIsMenuOpen(false)}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
          <Link className="flex items-center gap-2 border-t border-line px-3 py-2.5 text-sm font-bold text-muted hover:bg-surface hover:text-brand sm:hidden" href="/portal" onClick={() => setIsMenuOpen(false)}><ExternalLink size={16} /> Customer portal</Link>
          <form action="/api/auth/logout" className="sm:hidden" method="post">
            <button className="flex w-full items-center gap-2 border-t border-line px-3 py-2.5 text-left text-sm font-bold text-muted hover:bg-surface hover:text-brand"><LogOut size={16} /> Sign out</button>
          </form>
        </nav>
      </div>
    </header>
  );
}