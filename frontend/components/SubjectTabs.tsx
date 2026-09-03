"use client";

interface SubjectTabsProps<T extends string> {
  tabs: readonly T[];
  labels: Record<T, string>;
  active: T;
  onChange: (tab: T) => void;
}

export default function SubjectTabs<T extends string>({
  tabs,
  labels,
  active,
  onChange,
}: SubjectTabsProps<T>) {
  return (
    <div className="mb-5 overflow-x-auto">
      <div className="inline-flex min-w-full gap-1 rounded-lg border border-border bg-surface-muted p-1">
        {tabs.map((tabKey) => (
          <button
            key={tabKey}
            type="button"
            onClick={() => onChange(tabKey)}
            aria-current={active === tabKey ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active === tabKey
                ? "bg-background text-primary shadow-[var(--shadow-card)]"
                : "text-muted hover:text-foreground"
            }`}
          >
            {labels[tabKey]}
          </button>
        ))}
      </div>
    </div>
  );
}
