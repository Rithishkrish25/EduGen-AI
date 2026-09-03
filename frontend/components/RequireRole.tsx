"use client";

import { useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";
import { UserRole } from "@/lib/api";
import { useSession } from "@/lib/session";

interface RequireRoleProps {
  role: UserRole;
  children: ReactNode;
}

export default function RequireRole({ role, children }: RequireRoleProps) {
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    if (user.role !== role) {
      router.replace("/unauthorized");
    }
  }, [loading, user, role, router]);

  if (loading || !user || user.role !== role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <p className="text-sm text-muted">Checking your session...</p>
      </div>
    );
  }

  return <>{children}</>;
}
