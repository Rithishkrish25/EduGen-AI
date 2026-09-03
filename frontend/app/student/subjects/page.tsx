"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { STUDENT_LINKS } from "@/lib/studentNav";
import RequireRole from "@/components/RequireRole";
import { ApiError, listStudentSubjects, Subject } from "@/lib/api";

export default function StudentSubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    listStudentSubjects()
      .then((data) => {
        if (active) setSubjects(data.subjects);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof ApiError ? err.message : "Failed to load subjects");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <RequireRole role="student">
      <DashboardLayout role="Student" title="My Subjects" links={STUDENT_LINKS}>
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        <div className="overflow-x-auto rounded-lg border border-border bg-background">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Credits</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted">
                    Loading subjects...
                  </td>
                </tr>
              ) : subjects.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted">
                    No subjects are available for your department and semester yet.
                  </td>
                </tr>
              ) : (
                subjects.map((subject) => (
                  <tr key={subject.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-foreground">{subject.subject_code}</td>
                    <td className="px-4 py-3 text-foreground">{subject.subject_name}</td>
                    <td className="px-4 py-3 text-muted">{subject.credits}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/student/subjects/${subject.id}`}
                        className="text-primary hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DashboardLayout>
    </RequireRole>
  );
}
