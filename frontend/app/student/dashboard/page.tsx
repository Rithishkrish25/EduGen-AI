"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { STUDENT_LINKS } from "@/lib/studentNav";
import RequireRole from "@/components/RequireRole";
import StatCard from "@/components/StatCard";
import { formatDateTime } from "@/lib/format";
import {
  ApiError,
  GeneratedNote,
  listQuizAttempts,
  listStudentNotes,
  listStudentOnlineClasses,
  listStudentSubjects,
  ONLINE_CLASS_PLATFORM_LABELS,
  QuizAttempt,
  StudentOnlineClass,
  Subject,
} from "@/lib/api";

interface ActivityItem {
  id: string;
  label: string;
  timestamp: string;
}

function findNextOnlineClass(classes: StudentOnlineClass[]): StudentOnlineClass | null {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = classes
    .filter((c) => (c.status === "scheduled" || c.status === "live") && c.class_date >= today)
    .sort((a, b) => `${a.class_date}T${a.start_time}`.localeCompare(`${b.class_date}T${b.start_time}`));
  return upcoming[0] ?? null;
}

export default function StudentDashboardPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [notesCount, setNotesCount] = useState<number | null>(null);
  const [attemptsCount, setAttemptsCount] = useState<number | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [nextClass, setNextClass] = useState<StudentOnlineClass | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    Promise.all([
      listStudentSubjects(),
      listStudentNotes({ limit: 5 }),
      listQuizAttempts({ limit: 5 }),
      listStudentOnlineClasses(),
    ])
      .then(([subjectsData, notesData, attemptsData, classesData]) => {
        if (!active) return;
        setSubjects(subjectsData.subjects);
        setNotesCount(notesData.total);
        setAttemptsCount(attemptsData.total);
        setNextClass(findNextOnlineClass(classesData.classes));

        const noteItems: ActivityItem[] = notesData.items.map((note: GeneratedNote) => ({
          id: `note-${note.id}`,
          label: `Generated ${note.output_type.replace(/_/g, " ")}${
            note.topic_text ? ` - ${note.topic_text}` : ""
          }`,
          timestamp: note.created_at,
        }));
        const attemptItems: ActivityItem[] = attemptsData.items.map(
          (attempt: QuizAttempt) => ({
            id: `attempt-${attempt.id}`,
            label: attempt.submitted_at
              ? `Completed a quiz - ${attempt.percentage}%`
              : "Started a quiz",
            timestamp: attempt.started_at,
          })
        );

        const combined = [...noteItems, ...attemptItems]
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 5);
        setActivity(combined);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof ApiError ? err.message : "Unable to load dashboard data.");
          setSubjects([]);
          setNotesCount(null);
          setAttemptsCount(null);
          setActivity([]);
          setNextClass(null);
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
      <DashboardLayout role="Student" title="Student Learning Portal" links={STUDENT_LINKS}>
        <div className="mb-6 border-l-2 border-accent pl-4">
          <span className="section-label">Student Learning Portal</span>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">
            Your Academic Workspace
          </h2>
          <p className="mt-1 text-sm text-muted">
            Your subjects, AI-generated study material, and recent activity in one place.
          </p>
        </div>

        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Available Subjects"
            value={loading ? "--" : error ? "Unable to load" : subjects.length}
          />
          <StatCard
            label="Generated Notes"
            value={loading ? "--" : notesCount === null ? "Unable to load" : notesCount}
            accent="accent"
          />
          <StatCard
            label="Quiz Attempts"
            value={loading ? "--" : attemptsCount === null ? "Unable to load" : attemptsCount}
            accent="success"
          />
        </div>

        {!loading && nextClass && (
          <div className="mt-6 rounded-lg border border-border bg-background p-5">
            <h2 className="mb-2 text-base font-semibold text-foreground">Next Online Class</h2>
            <p className="text-sm font-medium text-foreground">
              {nextClass.subject_code} - {nextClass.title}
            </p>
            <p className="mt-1 text-xs text-muted">
              {formatDateTime(`${nextClass.class_date}T${nextClass.start_time}`)} -{" "}
              {nextClass.duration_minutes} minutes - {ONLINE_CLASS_PLATFORM_LABELS[nextClass.platform]}
            </p>
            <Link
              href="/student/online-classes"
              className="mt-2 inline-block text-sm text-primary hover:underline"
            >
              View Online Classes &rarr;
            </Link>
          </div>
        )}

        <div className="mt-6 rounded-lg border border-border bg-background p-5">
          <h2 className="mb-4 text-base font-semibold text-foreground">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Link
              href="/student/subjects"
              className="rounded-md border border-border px-3 py-2 text-center text-sm text-foreground hover:border-primary/40 hover:bg-primary/5"
            >
              My Subjects
            </Link>
            <Link
              href="/student/subjects"
              className="rounded-md border border-border px-3 py-2 text-center text-sm text-foreground hover:border-primary/40 hover:bg-primary/5"
            >
              AI Notes
            </Link>
            <Link
              href="/student/subjects"
              className="rounded-md border border-border px-3 py-2 text-center text-sm text-foreground hover:border-primary/40 hover:bg-primary/5"
            >
              Ask AI
            </Link>
            <Link
              href="/student/subjects"
              className="rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground hover:bg-primary-hover"
            >
              Assigned Quizzes
            </Link>
          </div>
        </div>

        <div className="mt-8">
          <span className="section-label">Enrolled Courses</span>
          <h2 className="mb-4 mt-1 text-lg font-semibold text-foreground">My Subjects</h2>
          {loading ? (
            <p className="text-sm text-muted">Loading subjects...</p>
          ) : error ? (
            <p className="text-sm text-danger">Unable to load data.</p>
          ) : subjects.length === 0 ? (
            <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted">
              No subjects are available for your department and semester yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {subjects.slice(0, 6).map((subject) => (
                <Link
                  key={subject.id}
                  href={`/student/subjects/${subject.id}`}
                  className="group relative overflow-hidden rounded-md border border-border bg-background p-5 transition-colors hover:border-primary/40"
                >
                  <span aria-hidden="true" className="absolute left-0 top-0 h-full w-1 bg-primary" />
                  <p
                    className="text-xs font-semibold uppercase tracking-wide text-accent-hover"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {subject.subject_code}
                  </p>
                  <h3 className="mt-1.5 text-sm font-semibold text-foreground">
                    {subject.subject_name}
                  </h3>
                  <p className="mt-2 text-xs text-muted">{subject.semester_name}</p>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8">
          <span className="section-label">Recent Activity</span>
          <h2 className="mb-4 mt-1 text-lg font-semibold text-foreground">Recent AI Activity</h2>
          <div className="rounded-lg border border-border bg-background p-5">
            {loading ? (
              <p className="text-sm text-muted">Loading activity...</p>
            ) : error ? (
              <p className="text-sm text-danger">Unable to load data.</p>
            ) : activity.length === 0 ? (
              <p className="text-sm text-muted">No AI activity yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {activity.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-md border border-border px-3 py-2 text-sm transition-colors hover:border-primary/30"
                  >
                    <p className="text-foreground">{item.label}</p>
                    <p className="text-xs text-muted">
                      {formatDateTime(item.timestamp)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DashboardLayout>
    </RequireRole>
  );
}
