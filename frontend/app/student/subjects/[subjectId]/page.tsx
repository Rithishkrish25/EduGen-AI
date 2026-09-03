"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { STUDENT_LINKS } from "@/lib/studentNav";
import RequireRole from "@/components/RequireRole";
import SubjectTabs from "@/components/SubjectTabs";
import AskPanel from "@/components/student/AskPanel";
import HistoryPanel from "@/components/student/HistoryPanel";
import ImportantQuestionsPanel from "@/components/student/ImportantQuestionsPanel";
import NotesPanel from "@/components/student/NotesPanel";
import QuizPanel from "@/components/student/QuizPanel";
import {
  ApiError,
  DocumentType,
  getDocumentDownloadUrl,
  getStudentSubjectDetail,
  StudentSubjectDetail,
} from "@/lib/api";

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  syllabus: "Syllabus",
  staff_notes: "Staff Notes",
  textbook_material: "Textbook Material",
  question_bank: "Question Bank",
  previous_question_paper: "Previous Question Paper",
  reference_material: "Reference Material",
};

type Tab =
  | "overview"
  | "units"
  | "materials"
  | "notes"
  | "questions"
  | "ask"
  | "quiz"
  | "history";

const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  units: "Units",
  materials: "Materials",
  notes: "AI Notes",
  questions: "Important Questions",
  ask: "Ask AI",
  quiz: "Quiz",
  history: "History",
};

const TAB_KEYS = Object.keys(TAB_LABELS) as Tab[];

export default function StudentSubjectDetailPage() {
  const params = useParams<{ subjectId: string }>();
  const subjectId = params.subjectId;

  const [subject, setSubject] = useState<StudentSubjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    let active = true;

    getStudentSubjectDetail(subjectId)
      .then((data) => {
        if (active) setSubject(data.subject);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof ApiError ? err.message : "Failed to load subject");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [subjectId]);

  const title = subject ? `${subject.subjectCode} - ${subject.subjectName}` : "Subject";

  return (
    <RequireRole role="student">
      <DashboardLayout role="Student" title={title} links={STUDENT_LINKS}>
        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        {loading ? (
          <p className="text-sm text-muted">Loading subject...</p>
        ) : !subject ? (
          <p className="text-sm text-muted">Subject not found.</p>
        ) : (
          <>
            <div className="mb-6 rounded-md border border-border bg-navy px-6 py-5 text-navy-foreground">
              <p
                className="text-sm font-semibold uppercase tracking-wide text-accent"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {subject.subjectCode}
              </p>
              <h2 className="mt-1 text-xl font-bold tracking-tight">{subject.subjectName}</h2>
              <p className="mt-1.5 text-sm text-navy-foreground/70">{subject.credits} Credits</p>
            </div>

            <SubjectTabs tabs={TAB_KEYS} labels={TAB_LABELS} active={tab} onChange={setTab} />

            {tab === "overview" && (
              <div className="flex flex-col gap-6">
                <div className="rounded-lg border border-border bg-background p-5">
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted">Subject Code</dt>
                      <dd className="mt-1 text-sm font-medium text-foreground">{subject.subjectCode}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted">Subject Name</dt>
                      <dd className="mt-1 text-sm font-medium text-foreground">{subject.subjectName}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted">Credits</dt>
                      <dd className="mt-1 text-sm font-medium text-foreground">{subject.credits}</dd>
                    </div>
                  </dl>
                  {subject.description && (
                    <div className="mt-5 border-t border-border pt-4">
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted">Description</dt>
                      <dd className="mt-1 text-sm text-foreground">{subject.description}</dd>
                    </div>
                  )}
                </div>

                <div>
                  <h2 className="mb-3 text-base font-semibold text-foreground">Course Outcomes</h2>
                  {subject.courseOutcomes.length === 0 ? (
                    <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted">
                      No course outcomes have been published for this subject yet.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-border bg-background">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-border text-xs uppercase text-muted">
                          <tr>
                            <th className="px-4 py-3">Code</th>
                            <th className="px-4 py-3">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subject.courseOutcomes.map((co) => (
                            <tr key={co.id} className="border-b border-border last:border-0">
                              <td className="px-4 py-3 text-foreground">{co.coCode}</td>
                              <td className="px-4 py-3 text-muted">{co.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === "units" &&
              (subject.units.length === 0 ? (
                <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted">
                  No units have been published for this subject yet.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {subject.units.map((unit) => (
                    <div
                      key={unit.id}
                      className="rounded-lg border border-border bg-background p-5 transition-colors hover:border-primary/30"
                    >
                      <h3 className="text-sm font-semibold text-foreground">
                        Unit {unit.unitNumber}: {unit.unitTitle}
                      </h3>
                      {unit.description && (
                        <p className="mt-1 text-sm text-muted">{unit.description}</p>
                      )}
                      {unit.topics.length > 0 && (
                        <ul className="mt-3 flex flex-col gap-1.5">
                          {unit.topics.map((topic) => (
                            <li
                              key={topic.id}
                              className="flex items-center gap-2 text-sm text-foreground"
                            >
                              <span aria-hidden="true" className="h-1 w-1 shrink-0 rounded-full bg-primary/60" />
                              {topic.topicName}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              ))}

            {tab === "materials" &&
              (subject.documents.length === 0 ? (
                <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted">
                  No materials have been published for this subject yet.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border bg-background">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border text-xs uppercase text-muted">
                      <tr>
                        <th className="px-4 py-3">File</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Unit</th>
                        <th className="px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subject.documents.map((document) => (
                        <tr key={document.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 text-foreground">
                            {document.originalFileName}
                          </td>
                          <td className="px-4 py-3 text-muted">
                            {DOCUMENT_TYPE_LABELS[document.documentType]}
                          </td>
                          <td className="px-4 py-3 text-muted">
                            {document.unitId
                              ? subject.units.find((unit) => unit.id === document.unitId)
                                  ?.unitTitle ?? "-"
                              : "-"}
                          </td>
                          <td className="px-4 py-3">
                            <a
                              href={getDocumentDownloadUrl(document.id)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline"
                            >
                              Download
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

            {tab === "notes" && <NotesPanel subjectId={subjectId} units={subject.units} />}

            {tab === "questions" && (
              <ImportantQuestionsPanel subjectId={subjectId} units={subject.units} />
            )}

            {tab === "ask" && <AskPanel subjectId={subjectId} />}

            {tab === "quiz" && <QuizPanel subjectId={subjectId} />}

            {tab === "history" && <HistoryPanel subjectId={subjectId} />}
          </>
        )}
      </DashboardLayout>
    </RequireRole>
  );
}
