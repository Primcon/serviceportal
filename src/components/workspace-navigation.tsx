"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { LogOut, Menu, Search, X } from "lucide-react";
import { navigationForRole } from "@/features/navigation/workspace-items";
import { roleLabels } from "@/lib/labels";

type Viewer = { displayName: string; role: UserRole } | null;
type Badges = { pendingAccessRequests: number };

function isCurrentPath(pathname: string, href: string) {
  return href === "/workspace" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarContents({ viewer, badges, onNavigate }: { viewer: Viewer; badges: Badges; onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = navigationForRole(viewer?.role ?? null);

  return (
    <div className="flex h-full flex-col">
      {viewer && (
        <form action="/workspace/search" className="px-4 pt-4" method="get" role="search">
          <label className="sr-only" htmlFor="workspace-search">Search work orders, equipment and customers</label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-muted" size={16} />
            <input className="w-full border border-line bg-surface py-2 pl-9 pr-3 text-sm outline-none focus:border-brand focus:bg-paper" id="workspace-search" name="q" placeholder="WIP, serial, customer..." />
          </div>
        </form>
      )}

      <nav aria-label="Service workspace" className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div className="mb-5" key={group.label}>
            <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{group.label}</p>
            <ul className="grid gap-0.5">
              {group.items.map(({ href, label, icon: Icon, badge }) => {
                const current = isCurrentPath(pathname, href);
                const count = badge === "pendingAccessRequests" ? badges.pendingAccessRequests : 0;
                return (
                  <li key={href}>
                    <Link
                      aria-current={current ? "page" : undefined}
                      className={`flex items-center gap-2.5 border-l-2 px-3 py-2 text-sm font-bold transition-colors ${current ? "border-brand bg-brand-soft text-ink" : "border-transparent text-muted hover:bg-surface hover:text-brand"}`}
                      href={href}
                      onClick={onNavigate}
                    >
                      <Icon size={16} />
                      <span className="flex-1">{label}</span>
                      {count > 0 && <span className="min-w-5 bg-brand px-1.5 text-center text-xs text-white" title={`${count} waiting for review`}>{count}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-line px-4 py-4">
        {viewer && (
          <div className="mb-3 min-w-0">
            <p className="truncate text-sm font-bold">{viewer.displayName}</p>
            <p className="text-xs text-muted">{roleLabels[viewer.role]}</p>
          </div>
        )}
        <form action="/api/auth/logout" method="post">
          <button className="flex items-center gap-2 text-sm font-bold text-muted hover:text-brand"><LogOut size={15} /> Sign out</button>
        </form>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <Link aria-label="Service workspace home" className="flex items-center gap-3" href="/workspace">
      <Image alt="Pfeiffer Vacuum, part of the Busch Group" className="h-8 w-auto" height={131} priority src="/pfeiffer-vacuum-logo.png" width={320} />
    </Link>
  );
}

export default function WorkspaceNavigation({ viewer, badges }: { viewer: Viewer; badges: Badges }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (!isMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMenuOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isMenuOpen]);

  return (
    <>
      {/* Phones and tablets: a top bar with a slide-out menu. */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-paper px-4 py-3 lg:hidden">
        <Logo />
        <button aria-controls="workspace-drawer" aria-expanded={isMenuOpen} className="grid size-10 place-items-center border border-line text-muted hover:border-brand hover:text-brand" onClick={() => setIsMenuOpen(true)} type="button">
          <Menu size={20} />
          <span className="sr-only">Open menu</span>
        </button>
      </header>
      {isMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onMouseDown={() => setIsMenuOpen(false)} role="presentation">
          <aside aria-label="Menu" className="h-full w-72 max-w-[85vw] bg-paper shadow-2xl" id="workspace-drawer" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <Logo />
              <button className="grid size-10 place-items-center border border-line text-muted hover:border-brand hover:text-brand" onClick={() => setIsMenuOpen(false)} type="button">
                <X size={20} />
                <span className="sr-only">Close menu</span>
              </button>
            </div>
            <div className="h-[calc(100%-65px)]">
              <SidebarContents badges={badges} onNavigate={() => setIsMenuOpen(false)} viewer={viewer} />
            </div>
          </aside>
        </div>
      )}

      {/* Desktop: a persistent sidebar. */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-paper lg:flex">
        <div className="border-b border-line px-4 py-4">
          <Logo />
          <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Service workspace</p>
        </div>
        <div className="min-h-0 flex-1">
          <SidebarContents badges={badges} viewer={viewer} />
        </div>
      </aside>
    </>
  );
}
