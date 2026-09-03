import { ReactNode } from "react";

type StatCardAccent = "primary" | "accent" | "success" | "warning" | "danger";

interface StatCardProps {
  label: string;
  value: ReactNode;
  accent?: StatCardAccent;
}

const ACCENT_BAR: Record<StatCardAccent, string> = {
  primary: "bg-primary",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export default function StatCard({ label, value, accent = "primary" }: StatCardProps) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-background py-4 pl-5 pr-4">
      <span
        aria-hidden="true"
        className={`absolute left-0 top-0 h-full w-1 ${ACCENT_BAR[accent]}`}
      />
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted">{label}</h2>
      <p className="mt-1.5 text-2xl font-semibold text-foreground sm:text-3xl">{value}</p>
    </div>
  );
}
