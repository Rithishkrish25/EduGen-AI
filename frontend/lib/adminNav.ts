import { SidebarLink } from "@/components/Sidebar";

export const ADMIN_LINKS: SidebarLink[] = [
  { label: "Overview", href: "/admin/dashboard" },
  { label: "Departments", href: "/admin/departments", group: "Academic Management" },
  { label: "Academic Years", href: "/admin/academic-years", group: "Academic Management" },
  { label: "Semesters", href: "/admin/semesters", group: "Academic Management" },
  { label: "Subjects", href: "/admin/subjects", group: "Academic Management" },
  { label: "Staff Assignments", href: "/admin/staff-assignments", group: "Academic Management" },
  { label: "Users", href: "/admin/users", group: "Academic Management" },
  { label: "Analytics", href: "/admin/analytics", group: "Platform Intelligence" },
  { label: "Academic Readiness", href: "/admin/academic-readiness", group: "Platform Intelligence" },
  { label: "AI Usage Controls", href: "/admin/usage-controls", group: "Platform Intelligence" },
  { label: "Audit Logs", href: "/admin/audit-logs", group: "Platform Intelligence" },
];
