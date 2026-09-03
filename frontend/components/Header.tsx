"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/lib/session";
import { SidebarLink } from "./Sidebar";

interface HeaderProps {
  title: string;
  role?: string;
  links?: SidebarLink[];
}

export default function Header({ title, role, links = [] }: HeaderProps) {
  const { user, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      router.push("/login");
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {links.length > 0 && (
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-border text-foreground hover:bg-primary/5 md:hidden"
            >
              <span aria-hidden="true" className="flex flex-col items-center justify-center gap-1">
                <span className={`h-0.5 w-4 bg-current transition-transform ${menuOpen ? "translate-y-1.5 rotate-45" : ""}`} />
                <span className={`h-0.5 w-4 bg-current transition-opacity ${menuOpen ? "opacity-0" : ""}`} />
                <span className={`h-0.5 w-4 bg-current transition-transform ${menuOpen ? "-translate-y-1.5 -rotate-45" : ""}`} />
              </span>
            </button>
          )}
          {links.length > 0 && (
            <div className="flex items-center gap-2.5 border-r border-border pr-3 md:hidden">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-navy text-xs font-bold text-navy-foreground">
                EG
              </span>
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">{title}</h1>
            <p className="hidden text-[11px] uppercase tracking-wide text-muted sm:block">
              EduGen AI &middot; Academic Intelligence Platform
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {user && (
            <div className="hidden items-center gap-2.5 sm:flex">
              <div className="flex flex-col items-end leading-tight">
                <span className="text-sm font-medium text-foreground">{user.fullName}</span>
                <span className="text-xs text-muted">{user.email}</span>
              </div>
              <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent-hover">
                {role ?? user.role}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="rounded-sm border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
          >
            {loggingOut ? "Logging out..." : "Logout"}
          </button>
        </div>
      </div>

      {links.length > 0 && menuOpen && (
        <nav
          id="mobile-nav"
          className="flex flex-col gap-1 border-t border-border bg-background px-4 py-3 md:hidden"
        >
          {links.map((link) => {
            const isActive =
              pathname === link.href || (link.href !== "/" && pathname?.startsWith(`${link.href}/`));
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                aria-current={isActive ? "page" : undefined}
                className={`rounded-md px-3 py-2 text-sm ${
                  isActive ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-primary/5"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
