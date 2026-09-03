import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-page px-4 text-center">
      <h1 className="text-xl font-semibold text-foreground">Access Denied</h1>
      <p className="max-w-sm text-sm text-muted">
        You do not have permission to view this page.
      </p>
      <Link
        href="/login"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Back to Login
      </Link>
    </div>
  );
}
