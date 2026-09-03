import Header from "./Header";
import Sidebar, { SidebarLink } from "./Sidebar";

interface DashboardLayoutProps {
  role: string;
  title: string;
  links: SidebarLink[];
  children: React.ReactNode;
}

export default function DashboardLayout({
  role,
  title,
  links,
  children,
}: DashboardLayoutProps) {
  return (
    <div className="flex min-h-screen bg-page">
      <Sidebar role={role} links={links} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header title={title} role={role} links={links} />
        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <div className="mx-auto w-full max-w-screen-2xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
