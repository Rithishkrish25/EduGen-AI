import Link from "next/link";
import { ReactNode } from "react";

const CAPABILITIES = [
  "Syllabus-Grounded AI Notes & Answers",
  "AI-Assisted Question Papers",
  "Course Outcome & Bloom Mapping",
  "Institutional Academic Analytics",
];

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  wide?: boolean;
}

export default function AuthLayout({ title, subtitle, children, wide = false }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen bg-page">
      <div className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-navy px-12 py-12 text-navy-foreground lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(242,239,231,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(242,239,231,0.06) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <Link href="/" className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-sm border border-accent/40 text-sm font-bold text-navy-foreground">
            EG
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-base font-semibold">EduGen AI</span>
            <span className="text-[11px] uppercase tracking-wide text-navy-foreground/60">
              Academic Intelligence Platform
            </span>
          </span>
        </Link>

        <div className="relative">
          <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
            <span aria-hidden="true" className="h-px w-6 bg-accent" />
            Academic Intelligence Platform
          </span>
          <h2
            className="mt-4 text-3xl font-bold leading-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Smart Learning for Students,
            <br />
            Smarter Teaching for Educators.
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-navy-foreground/70">
            A syllabus-grounded academic platform that helps students learn, faculty prepare
            academic content, and institutions manage intelligent teaching workflows using AI.
          </p>
          <ul className="mt-8 flex flex-col gap-3">
            {CAPABILITIES.map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-sm text-navy-foreground/85">
                <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-accent" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-navy-foreground/45">
          EduGen AI &middot; Academic Intelligence Platform
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className={`w-full ${wide ? "max-w-md" : "max-w-sm"}`}>
          <Link href="/" className="mb-8 flex items-center justify-center gap-2 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-navy text-sm font-bold text-navy-foreground">
              EG
            </span>
            <span className="text-lg font-semibold text-primary">EduGen AI</span>
          </Link>

          <h1 className="text-center text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="mt-1.5 text-center text-sm text-muted">{subtitle}</p>

          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
