"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface SidebarLink {
  label: string;
  href: string;
  group?: string;
}

interface SidebarProps {
  role: string;
  links: SidebarLink[];
}

function groupLinks(links: SidebarLink[]): Array<{ group: string | null; links: SidebarLink[] }> {
  const groups: Array<{ group: string | null; links: SidebarLink[] }> = [];
  for (const link of links) {
    const key = link.group ?? null;
    const last = groups[groups.length - 1];
    if (last && last.group === key) {
      last.links.push(link);
    } else {
      groups.push({ group: key, links: [link] });
    }
  }
  return groups;
}

export default function Sidebar({ role, links }: SidebarProps) {
  const pathname = usePathname();
  const groups = groupLinks(links);

  return (
    <aside className="hidden w-60 shrink-0 border-r border-border bg-background md:flex md:flex-col">
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-navy text-xs font-bold text-navy-foreground">
          EG
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-foreground">EduGen AI</span>
          <span className="text-[10px] uppercase tracking-wide text-muted">Academic Platform</span>
        </span>
      </div>

      <div className="border-b border-border px-5 py-3">
        <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent-hover">
          {role}
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
        {groups.map((section, sectionIndex) => (
          <div key={section.group ?? `section-${sectionIndex}`} className="flex flex-col gap-0.5">
            {section.group && (
              <span className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
                {section.group}
              </span>
            )}
            {section.links.map((link) => {
              const isActive =
                pathname === link.href ||
                (link.href !== "/" && pathname?.startsWith(`${link.href}/`));

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative rounded-sm px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-foreground hover:bg-primary/5"
                  }`}
                >
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 -translate-x-3 rounded-full bg-accent"
                    />
                  )}
                  {link.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
